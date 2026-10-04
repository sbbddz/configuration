/**
 * Git worktrees for Pi.
 *
 * `/worktree <branch>` creates (or reuses) a worktree next to the main repository and
 * switches Pi into it. `/spawn` runs a command there without blocking, `/log` shows its
 * output and `/kill` stops it.
 *
 * Pi has no runtime cwd setter, so the switch uses the supported path: fork the session
 * to a file whose header points at the worktree, then resume it.
 */

import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, SessionInfo } from "@earendil-works/pi-coding-agent";
import { CURRENT_SESSION_VERSION, SessionManager, SessionSelectorComponent } from "@earendil-works/pi-coding-agent";

/** Where worktrees are created: relative paths resolve next to the main repository. */
const WORKTREES_DIR = ".worktrees";
/** Spawn logs, one directory per worktree, outside the checkout so `git status` stays clean. */
const SPAWN_LOG_DIR = join(homedir(), ".pi", "worktrees");
/** `/log` shows at most this many characters from the end of a log. */
const LOG_TAIL = 64 * 1024;

type Spawned = {
	pid: number;
	command: string;
	child: ChildProcess;
	logPath: string;
	startedAt: number;
	exited: boolean;
};

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** The meaningful line from a git failure, ignoring progress chatter and hints. */
function gitError(stderr: string, code: number): string {
	const lines = stderr.trim().split("\n").filter(Boolean);
	return lines.find((line) => /^(fatal|error):/i.test(line)) ?? lines.at(-1) ?? `git exited with code ${code}`;
}

function notify(ctx: ExtensionCommandContext, message: string, type: "info" | "warning" | "error"): void {
	try {
		ctx.ui.notify(message, type);
	} catch {
		// The runtime was replaced (session switch); there is no UI left to notify.
	}
}

/** Name the tmux window hosting this Pi pane after the worktree branch. Cosmetic. */
function renameTmuxWindow(branch: string): void {
	const pane = process.env.TMUX_PANE;
	if (!process.env.TMUX || !pane) return;
	execFile("tmux", ["rename-window", "-t", pane, branch], () => {});
}

function sanitize(branch: string): string {
	return branch.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "") || "worktree";
}

/** The main repository root, even when invoked from inside a linked worktree. */
async function repoRoot(pi: ExtensionAPI, cwd: string): Promise<string> {
	const top = await pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd });
	if (top.code !== 0) throw new Error(top.stderr.trim() || "not a git repository");
	const common = await pi.exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd });
	return common.code === 0 ? dirname(common.stdout.trim()) : top.stdout.trim();
}

function worktreePath(mainRoot: string, branch: string): string {
	const key = `${basename(mainRoot)}-${createHash("sha1").update(resolve(mainRoot)).digest("hex").slice(0, 6)}`;
	const base = isAbsolute(WORKTREES_DIR) ? WORKTREES_DIR : resolve(dirname(mainRoot), WORKTREES_DIR);
	return join(base, `${key}-${sanitize(branch)}`);
}

/** Creates the worktree, or validates an existing one. Returns whether it was created. */
async function createWorktree(pi: ExtensionAPI, mainRoot: string, path: string, branch: string): Promise<boolean> {
	if (existsSync(path)) {
		const check = await pi.exec("git", ["rev-parse", "--git-dir"], { cwd: path });
		if (check.code !== 0) throw new Error(`path exists and is not a git worktree: ${path}`);
		return false;
	}
	mkdirSync(dirname(path), { recursive: true });
	// Attaching lets git resolve a local branch or create one from a remote-tracking
	// branch (DWIM), setting the remote as upstream in the latter case.
	const attach = await pi.exec("git", ["worktree", "add", path, branch], { cwd: mainRoot });
	if (attach.code !== 0) {
		const local = await pi.exec("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: mainRoot });
		if (local.code === 0) throw new Error(gitError(attach.stderr, attach.code));
		const create = await pi.exec("git", ["worktree", "add", "-b", branch, path], { cwd: mainRoot });
		if (create.code !== 0) throw new Error(gitError(create.stderr, create.code));
	}
	const env = join(mainRoot, ".env");
	if (existsSync(env)) copyFileSync(env, join(path, ".env"));
	return true;
}

/** Marks a session file this extension created only to switch cwd; disposable until it gets a conversation. */
const EPHEMERAL_MARKER = "worktree:ephemeral";

function createEmptySession(path: string): string {
	const manager = SessionManager.create(path);
	const file = manager.getSessionFile()!;
	const timestamp = new Date().toISOString();
	const header = {
		type: "session",
		version: CURRENT_SESSION_VERSION,
		id: manager.getSessionId(),
		timestamp,
		cwd: path,
	};
	const marker = {
		type: "custom",
		id: randomUUID(),
		parentId: null,
		timestamp,
		customType: EPHEMERAL_MARKER,
	};
	writeFileSync(file, `${JSON.stringify(header)}\n${JSON.stringify(marker)}\n`, { flag: "wx" });
	return file;
}

/** True once the session holds a user or assistant message; mirrors pi's own persistence rule. */
function hasConversation(manager: ExtensionCommandContext["sessionManager"]): boolean {
	return manager.getEntries().some(
		(entry) => entry.type === "message" && (entry.message.role === "user" || entry.message.role === "assistant"),
	);
}

/** True for a session file this extension created just to switch cwd. */
function isEphemeral(manager: ExtensionCommandContext["sessionManager"]): boolean {
	return manager.getEntries().some((entry) => entry.type === "custom" && entry.customType === EPHEMERAL_MARKER);
}

async function waitForIdle(ctx: ExtensionCommandContext): Promise<void> {
	if (!ctx.isIdle()) ctx.ui.notify("Waiting for the agent to finish…", "info");
	await ctx.waitForIdle();
}

async function replaceSession(
	ctx: ExtensionCommandContext,
	target: string,
	notice: string,
	tmuxName: string,
): Promise<void> {
	const result = await ctx.switchSession(target, {
		withSession: async (replaced) => {
			renameTmuxWindow(tmuxName);
			replaced.ui.notify(notice, "info");
		},
	});
	if (result.cancelled) ctx.ui.notify("Switch cancelled", "warning");
}

async function switchToWorktree(
	ctx: ExtensionCommandContext,
	path: string,
	branch: string,
	created: boolean,
): Promise<void> {
	await waitForIdle(ctx);
	const source = ctx.sessionManager.getSessionFile();
	const target =
		source && existsSync(source) && hasConversation(ctx.sessionManager)
			? SessionManager.forkFrom(source, path).getSessionFile()!
			: createEmptySession(path);
	await replaceSession(
		ctx,
		target,
		`✓ Worktree ${created ? "created" : "ready"}\n  branch: ${branch}\n  path: ${path}`,
		branch,
	);
}

type Worktree = { path: string; branch: string };

/** Linked worktrees of the main repository, excluding the main checkout and stale paths. */
async function listWorktrees(pi: ExtensionAPI, mainRoot: string): Promise<Worktree[]> {
	const result = await pi.exec("git", ["worktree", "list", "--porcelain"], { cwd: mainRoot });
	if (result.code !== 0) throw new Error(gitError(result.stderr, result.code));
	const worktrees: Worktree[] = [];
	let current: Worktree | undefined;
	for (const line of result.stdout.split("\n")) {
		if (line.startsWith("worktree ")) {
			if (current) worktrees.push(current);
			current = { path: line.slice("worktree ".length).trim(), branch: "" };
		} else if (current && line.startsWith("branch ")) {
			current.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "").trim();
		}
	}
	if (current) worktrees.push(current);
	return worktrees
		.filter((worktree) => resolve(worktree.path) !== resolve(mainRoot) && existsSync(worktree.path))
		.map((worktree) => ({ ...worktree, branch: worktree.branch || basename(worktree.path) }));
}

/** Sessions with a conversation across the given worktrees; cwd carries the branch for display. */
async function worktreeSessions(
	worktrees: Worktree[],
): Promise<{ sessions: SessionInfo[]; worktreeByPath: Map<string, Worktree> }> {
	const worktreeByPath = new Map<string, Worktree>();
	const lists = await Promise.all(
		worktrees.map(async (worktree) => {
			const sessions = (await SessionManager.list(worktree.path)).filter(
				(session) => session.messageCount > 0 && session.firstMessage !== "(no messages)",
			);
			for (const session of sessions) worktreeByPath.set(session.path, worktree);
			return sessions.map((session) => ({ ...session, cwd: worktree.branch }));
		}),
	);
	return {
		sessions: lists.flat().sort((a, b) => b.modified.getTime() - a.modified.getTime()),
		worktreeByPath,
	};
}

/** The /resume picker in TUI mode, a plain select elsewhere. Resolves to a session path. */
async function pickSession(ctx: ExtensionCommandContext, sessions: SessionInfo[]): Promise<string | undefined> {
	if (ctx.mode !== "tui") {
		const byLabel = new Map<string, string>();
		const labels = sessions.map((session) => {
			const title = (session.name ?? session.firstMessage).replace(/\s+/g, " ").trim();
			const base = `${session.cwd} · ${title.length > 80 ? `${title.slice(0, 79)}…` : title}`;
			let label = base;
			for (let n = 2; byLabel.has(label); n++) label = `${base} (${n})`;
			byLabel.set(label, session.path);
			return label;
		});
		const choice = await ctx.ui.select(`Worktree sessions (${sessions.length})`, labels);
		return choice ? byLabel.get(choice) : undefined;
	}
	return ctx.ui.custom<string | undefined>((tui, _theme, keybindings, done) => {
		const selector = new SessionSelectorComponent(
			(onProgress, signal) => SessionManager.list(ctx.cwd, undefined, onProgress, signal),
			() => Promise.resolve(sessions),
			(path) => done(path),
			() => done(undefined),
			() => done(undefined),
			() => tui.requestRender(),
			{
				keybindings,
				showRenameHint: true,
				renameSession: async (path, name) => {
					const next = (name ?? "").trim();
					if (next) SessionManager.open(path).appendSessionInfo(next);
				},
			},
			ctx.sessionManager.getSessionFile(),
		);
		// Private hook: start on the worktree list, where the branch column is visible.
		(selector as unknown as { toggleScope(): void }).toggleScope();
		return selector;
	});
}

function pickProcess(pidArg: string, processes: Map<number, Spawned>): Spawned | undefined {
	if (pidArg) return processes.get(Number(pidArg));
	return [...processes.values()].sort((a, b) => b.startedAt - a.startedAt)[0];
}

function killProcess(proc: Spawned): void {
	if (proc.exited) return;
	try {
		if (process.platform === "win32") proc.child.kill("SIGTERM");
		else process.kill(-proc.pid, "SIGTERM"); // detached child: kill its whole process group
	} catch {
		try {
			proc.child.kill("SIGTERM");
		} catch {
			// Already gone.
		}
	}
}

function readTail(path: string): string {
	try {
		const text = readFileSync(path, "utf8");
		return text.length <= LOG_TAIL ? text : `… (truncated)\n${text.slice(text.length - LOG_TAIL)}`;
	} catch {
		return "(no output yet)";
	}
}

export default function (pi: ExtensionAPI): void {
	const processes = new Map<number, Spawned>();

	pi.registerCommand("worktree", {
		description: "Create or reuse a git worktree and switch Pi into it",
		handler: async (args, ctx) => {
			if (ctx.mode === "json" || ctx.mode === "print") {
				ctx.ui.notify("worktree requires interactive or RPC mode", "error");
				return;
			}
			const branch = args.trim();
			if (!branch) {
				ctx.ui.notify("Usage: /worktree <branch>", "error");
				return;
			}
			if (branch.startsWith("-")) {
				ctx.ui.notify("Branch name cannot start with '-'", "error");
				return;
			}
			try {
				const mainRoot = await repoRoot(pi, ctx.cwd);
				const path = worktreePath(mainRoot, branch);
				const created = await createWorktree(pi, mainRoot, path, branch);
				if (resolve(ctx.cwd) === resolve(path)) {
					renameTmuxWindow(branch);
					ctx.ui.notify(`Already in worktree\n  branch: ${branch}\n  path: ${path}`, "info");
					return;
				}
				await switchToWorktree(ctx, path, branch, created);
			} catch (error) {
				ctx.ui.notify(`worktree: ${errorText(error)}`, "error");
			}
		},
	});

	pi.registerCommand("root", {
		description: "Open a new session at the main repository root",
		handler: async (_args, ctx) => {
			if (ctx.mode === "json" || ctx.mode === "print") {
				ctx.ui.notify("root requires interactive or RPC mode", "error");
				return;
			}
			try {
				const mainRoot = await repoRoot(pi, ctx.cwd);
				if (resolve(ctx.cwd) === resolve(mainRoot)) {
					ctx.ui.notify(`Already at repository root\n  path: ${mainRoot}`, "info");
					return;
				}
				await waitForIdle(ctx);
				await replaceSession(
					ctx,
					createEmptySession(mainRoot),
					`✓ Repository root\n  path: ${mainRoot}`,
					basename(mainRoot),
				);
			} catch (error) {
				ctx.ui.notify(`root: ${errorText(error)}`, "error");
			}
		},
	});

	pi.registerCommand("wtresume", {
		description: "Resume a session from a worktree of this repository",
		handler: async (_args, ctx) => {
			if (ctx.mode === "json" || ctx.mode === "print") {
				ctx.ui.notify("wtresume requires interactive or RPC mode", "error");
				return;
			}
			try {
				const mainRoot = await repoRoot(pi, ctx.cwd);
				const worktrees = await listWorktrees(pi, mainRoot);
				const { sessions, worktreeByPath } = await worktreeSessions(worktrees);
				if (sessions.length === 0) {
					ctx.ui.notify(`No worktree sessions for ${mainRoot}`, "info");
					return;
				}
				const selected = await pickSession(ctx, sessions);
				if (!selected) return;
				const worktree = worktreeByPath.get(selected);
				if (!worktree) return;
				await waitForIdle(ctx);
				await replaceSession(
					ctx,
					selected,
					`✓ Worktree session\n  branch: ${worktree.branch}\n  path: ${worktree.path}`,
					worktree.branch,
				);
			} catch (error) {
				ctx.ui.notify(`wtresume: ${errorText(error)}`, "error");
			}
		},
	});

	pi.registerCommand("spawn", {
		description: "Run a command in the current worktree without blocking",
		handler: (args, ctx) => {
			const command = args.trim();
			if (!command) {
				ctx.ui.notify("Usage: /spawn <command>", "error");
				return;
			}
			const dir = join(SPAWN_LOG_DIR, basename(ctx.cwd), ".spawn");
			mkdirSync(dir, { recursive: true });
			const child = spawn(command, {
				shell: true,
				cwd: ctx.cwd,
				detached: process.platform !== "win32",
				stdio: ["ignore", "pipe", "pipe"],
			});
			child.once("error", (error) => notify(ctx, `⚠ spawn failed: ${error.message}`, "error"));
			if (!child.pid) return;
			const proc: Spawned = {
				pid: child.pid,
				command,
				child,
				logPath: join(dir, `${child.pid}.log`),
				startedAt: Date.now(),
				exited: false,
			};
			processes.set(proc.pid, proc);
			const log = createWriteStream(proc.logPath);
			child.stdout?.pipe(log);
			child.stderr?.pipe(log);
			child.once("exit", (code, signal) => {
				if (proc.exited) return;
				proc.exited = true;
				notify(ctx, `⚠ process ${proc.pid} exited with ${signal ? `signal ${signal}` : `code ${code}`}`, "warning");
			});
			child.once("close", () => log.end());
			ctx.ui.notify(`✓ spawned\n  ${command}\n  pid: ${proc.pid}`, "info");
		},
	});

	pi.registerCommand("log", {
		description: "Show output from a spawned process",
		handler: async (args, ctx) => {
			const pidArg = args.trim();
			const proc = pickProcess(pidArg, processes);
			if (!proc) {
				ctx.ui.notify(pidArg ? `No spawned process with pid ${pidArg}` : "No spawned process tracked", "info");
				return;
			}
			const status = proc.exited ? "exited" : "running";
			await ctx.ui.editor(`${proc.command} — PID ${proc.pid} (${status})`, readTail(proc.logPath));
		},
	});

	pi.registerCommand("kill", {
		description: "Kill a spawned process (latest by default)",
		handler: (args, ctx) => {
			const pidArg = args.trim();
			const proc = pickProcess(pidArg, processes);
			if (!proc) {
				ctx.ui.notify(pidArg ? `No spawned process with pid ${pidArg}` : "No spawned process tracked", "info");
				return;
			}
			if (proc.exited) {
				ctx.ui.notify(`Process ${proc.pid} already exited`, "info");
				return;
			}
			killProcess(proc);
			ctx.ui.notify(`✓ killed\n  ${proc.command}\n  pid: ${proc.pid}`, "info");
		},
	});

	pi.on("session_shutdown", (event, ctx) => {
		for (const proc of processes.values()) killProcess(proc);
		processes.clear();
		if (event.reason === "reload") return; // The session survives a reload.
		const file = ctx.sessionManager.getSessionFile();
		if (file && isEphemeral(ctx.sessionManager) && !hasConversation(ctx.sessionManager)) {
			try {
				unlinkSync(file);
			} catch {
				// Already gone.
			}
		}
	});
}
