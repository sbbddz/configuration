/**
 * Git worktrees for Pi.
 *
 * `/worktree <branch>` delegates creation to the `wt` CLI, then switches Pi into the
 * root worktree. The CLI also supports multi-repo "home" roots.
 *
 * Pi has no runtime cwd setter, so the switch uses the supported path: fork the session
 * to a file whose header points at the worktree, then resume it.
 */

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, SessionInfo } from "@earendil-works/pi-coding-agent";
import { CURRENT_SESSION_VERSION, SessionManager, SessionSelectorComponent } from "@earendil-works/pi-coding-agent";

/** Prefer an absolute install: Pi may be launched with a minimal PATH. */
const WT_BIN =
	process.env.WT_BIN ||
	[join(homedir(), ".pi/agent/bin/wt"), join(homedir(), ".local/bin/wt")].find((path) => existsSync(path)) ||
	"wt";

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Name the tmux window and Rex tab hosting this Pi pane. Cosmetic. */
function renameCurrentTab(name: string): void {
	const pane = process.env.TMUX_PANE;
	if (process.env.TMUX && pane) {
		execFile("tmux", ["rename-window", "-t", pane, name], () => {});
	}
	if (process.env.REX_SESSION && process.env.REX_BLOCK) {
		const rex = process.env.REX_BIN_DIR ? join(process.env.REX_BIN_DIR, "rex") : "rex";
		execFile(rex, ["window", "rename", name], () => {});
	}
}

/** The main repository root, even when invoked from inside a linked worktree. */
async function repoRoot(pi: ExtensionAPI, cwd: string): Promise<string> {
	const top = await pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd });
	if (top.code !== 0) throw new Error(top.stderr.trim() || "not a git repository");
	const common = await pi.exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd });
	return common.code === 0 ? dirname(common.stdout.trim()) : top.stdout.trim();
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
	tabName: string,
): Promise<void> {
	const result = await ctx.switchSession(target, {
		withSession: async (replaced) => {
			renameCurrentTab(tabName);
			replaced.ui.notify(notice, "info");
		},
	});
	if (result.cancelled) ctx.ui.notify("Switch cancelled", "warning");
}

async function switchToWorktree(ctx: ExtensionCommandContext, path: string, branch: string): Promise<void> {
	await waitForIdle(ctx);
	const source = ctx.sessionManager.getSessionFile();
	const target =
		source && existsSync(source) && hasConversation(ctx.sessionManager)
			? SessionManager.forkFrom(source, path).getSessionFile()!
			: createEmptySession(path);
	await replaceSession(ctx, target, `✓ Worktree ready\n  branch: ${branch}\n  path: ${path}`, branch);
}

type Worktree = { path: string; branch: string };

/** Linked worktrees of the main repository, excluding the main checkout and stale paths. */
async function listWorktrees(pi: ExtensionAPI, mainRoot: string): Promise<Worktree[]> {
	const result = await pi.exec("git", ["worktree", "list", "--porcelain"], { cwd: mainRoot });
	if (result.code !== 0) throw new Error(result.stderr.trim() || `git worktree list exited with code ${result.code}`);
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

export default function (pi: ExtensionAPI): void {
	const worktree = {
		description: "Create or reuse worktree(s) and switch Pi into the root worktree",
		handler: async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
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
				const result = await pi.exec(WT_BIN, ["new", branch], { cwd: ctx.cwd });
				if (result.code !== 0) {
					throw new Error(result.stderr.trim() || `${WT_BIN} exited with code ${result.code}`);
				}
				const path = result.stdout.trim().split("\n").pop() ?? "";
				if (!path) throw new Error(`${WT_BIN} returned no worktree path`);
				if (!existsSync(path)) throw new Error(`worktree path does not exist: ${path}`);
				if (resolve(ctx.cwd) === resolve(path)) {
					renameCurrentTab(branch);
					ctx.ui.notify(`Already in worktree\n  branch: ${branch}\n  path: ${path}`, "info");
					return;
				}
				await switchToWorktree(ctx, path, branch);
			} catch (error) {
				ctx.ui.notify(`worktree: ${errorText(error)}`, "error");
			}
		},
	};
	pi.registerCommand("worktree", worktree);
	pi.registerCommand("wt", worktree);

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

	pi.on("session_shutdown", (event, ctx) => {
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
