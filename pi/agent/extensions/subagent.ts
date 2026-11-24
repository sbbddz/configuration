/**
 * Background subagents.
 *
 * The orchestrator writes the whole task. This extension only opens a child Pi
 * (optionally in a worktree), streams its activity, and reports the final
 * message back to the parent.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Box, Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const MAX_JOBS = 3;
const MAX_ACTIVITY = 200;
const KILL_GRACE_MS = 3000;
const WIDGET = "subagents";
const WT_BIN =
	process.env.WT_BIN ||
	[join(homedir(), ".pi/agent/bin/wt"), join(homedir(), ".local/bin/wt")].find((path) => existsSync(path)) ||
	"wt";

type JobStatus = "running" | "done" | "failed" | "stopped";
type JobColor = "accent" | "warning" | "success" | "mdHeading" | "mdLink" | "mdCode" | "customMessageLabel";
type Worktree = { path: string; branch?: string };

const JOB_COLORS: JobColor[] = ["accent", "warning", "mdHeading", "mdLink", "mdCode", "customMessageLabel"];
let nextColor = 0;

interface Paths {
	prompt: string;
	report: string;
	activity: string;
	result: string;
	sessions: string;
}

interface Job {
	name: string;
	task: string;
	status: JobStatus;
	color: JobColor;
	branch?: string;
	cwd: string;
	sessionId: string;
	sessionFile?: string;
	startedAt: number;
	endedAt?: number;
	exitCode?: number;
	activity: string[];
	report: string;
	stopped?: boolean;
	child?: ChildProcess;
	killTimer?: NodeJS.Timeout;
	paths: Paths;
}

interface SubagentArgs {
	task: string;
	worktree?: boolean | string;
	name?: string;
}

interface StartDetails {
	name: string;
	branch?: string;
	cwd: string;
	sessionId: string;
	promptPath: string;
}

interface SubagentDetails {
	name: string;
	status: JobStatus;
	branch?: string;
	cwd: string;
	durationMs: number;
	report: string;
	activity: string[];
	task?: string;
	promptPath?: string;
	reportPath?: string;
	sessionFile?: string;
}

const jobs = new Map<string, Job>();
const pendingNames = new Set<string>();

let uiCtx: ExtensionContext | undefined;
let timer: NodeJS.Timeout | undefined;
let disposed = false;

function clip(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

function firstLine(text: string): string {
	return text.trim().split("\n").find(Boolean) ?? "";
}

function formatDuration(ms: number): string {
	const seconds = Math.max(0, Math.round(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function slug(task: string): string {
	const words = task
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.split(/\s+/)
		.slice(0, 4)
		.join("-");
	return (words || "agent").slice(0, 40);
}

function cleanName(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, "-")
			.replace(/^[-.]+|[-.]+$/g, "") || "agent"
	);
}

function uniqueName(base: string): string {
	let name = base;
	for (let i = 2; jobs.has(name) || pendingNames.has(name); i++) name = `${base}-${i}`;
	return name;
}

function repoKey(path: string): string {
	const name = basename(path).replace(/[^a-zA-Z0-9._-]+/g, "-") || "repo";
	return `${name}-${createHash("sha1").update(path).digest("hex").slice(0, 6)}`;
}

/** Resolve how to invoke Pi in a child process, whether launched as a script or a binary. */
function piInvocation(args: string[]): { command: string; args: string[] } {
	const script = process.argv[1];
	if (script && existsSync(script)) return { command: process.execPath, args: [script, ...args] };
	return { command: "pi", args };
}

/** Model and thinking level of the parent, so subagents behave the same. */
function parentModelArgs(ctx: ExtensionContext): string[] {
	const args: string[] = [];
	if (ctx.model) args.push("--model", `${ctx.model.provider}/${ctx.model.id}`);
	if (ctx.thinkingLevel) args.push("--thinking", ctx.thinkingLevel);
	return args;
}

/** One-line description of a tool call for the activity log. */
function describeCall(toolName: string, args: Record<string, any> | undefined): string {
	const a = args ?? {};
	let detail: string;
	switch (toolName) {
		case "read":
		case "write":
		case "edit":
			detail = a.file_path ?? a.path ?? "";
			break;
		case "bash":
			detail = a.command ?? "";
			break;
		case "grep":
			detail = `/${a.pattern ?? ""}/ ${a.path ?? ""}`;
			break;
		case "find":
			detail = a.pattern ?? "";
			break;
		case "ls":
			detail = a.path ?? ".";
			break;
		default:
			detail = JSON.stringify(a);
	}
	return clip(`${toolName} ${detail}`.trim(), 100);
}

async function mainRoot(pi: ExtensionAPI, cwd: string): Promise<string> {
	const top = await pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd });
	if (top.code !== 0) throw new Error(top.stderr.trim() || "not a git repository");
	const common = await pi.exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd });
	return common.code === 0 ? dirname(common.stdout.trim()) : top.stdout.trim();
}

async function worktrees(pi: ExtensionAPI, root: string): Promise<Worktree[]> {
	const result = await pi.exec("git", ["worktree", "list", "--porcelain"], { cwd: root });
	if (result.code !== 0) throw new Error(result.stderr.trim() || "git worktree list failed");
	const found: Worktree[] = [];
	let current: Worktree | undefined;
	for (const line of result.stdout.split("\n")) {
		if (line.startsWith("worktree ")) {
			if (current) found.push(current);
			current = { path: line.slice("worktree ".length).trim(), branch: "" };
		} else if (current && line.startsWith("branch ")) {
			current.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "").trim();
		}
	}
	if (current) found.push(current);
	return found.filter((worktree) => worktree.path && worktree.branch);
}

async function currentBranch(pi: ExtensionAPI, cwd: string): Promise<string | undefined> {
	const result = await pi.exec("git", ["branch", "--show-current"], { cwd });
	return result.code === 0 ? result.stdout.trim() || undefined : undefined;
}

async function createWorktree(pi: ExtensionAPI, cwd: string, name: string): Promise<Worktree> {
	const result = await pi.exec(WT_BIN, ["new", name], { cwd });
	if (result.code !== 0) throw new Error(result.stderr.trim() || `wt new ${name} failed`);
	const path = result.stdout.trim().split("\n").pop() ?? "";
	if (!path || !existsSync(path)) throw new Error(`wt new ${name} returned no worktree path`);
	return { path, branch: (await currentBranch(pi, path)) ?? name };
}

async function reuseWorktree(pi: ExtensionAPI, root: string, target: string): Promise<Worktree> {
	const expanded = target.startsWith("~") ? join(homedir(), target.slice(1)) : target;
	if (isAbsolute(expanded) || target.startsWith(".")) {
		const path = isAbsolute(expanded) ? expanded : resolve(root, expanded);
		if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(`Not a directory: ${path}`);
		return { path, branch: await currentBranch(pi, path) };
	}

	const all = await worktrees(pi, root);
	const found = all.find((worktree) => worktree.branch === target);
	if (found) return found;
	const available = all.map((worktree) => worktree.branch).filter(Boolean);
	throw new Error(`No worktree for "${target}". Available: ${available.join(", ") || "none"}`);
}

function widgetActivity(line: string, theme: Theme, color: JobColor): string {
	if (line.startsWith("✗")) return theme.fg("error", clip(line, 50));
	const match = line.match(/^([→])\s+(\S+)(.*)$/);
	if (!match) return theme.fg("muted", clip(line, 50));
	return (
		theme.fg(color, match[1]) +
		" " +
		theme.fg(color, theme.bold(match[2])) +
		theme.fg("muted", clip(match[3], 45))
	);
}

function widgetText(theme: Theme): string {
	const running = [...jobs.values()]
		.filter((job) => job.status === "running")
		.sort((a, b) => a.startedAt - b.startedAt);
	return running
		.map((job) => {
			const last = job.activity[job.activity.length - 1] ?? "starting";
			const dot = theme.fg(job.color, "●");
			const name = theme.fg(job.color, theme.bold(clip(job.name, 16).padEnd(16)));
			const time = theme.fg("dim", formatDuration(Date.now() - job.startedAt).padStart(6));
			return `${dot} ${name} ${time}  ${widgetActivity(last, theme, job.color)}`;
		})
		.join("\n");
}

function updateUI(): void {
	if (disposed || !uiCtx) return;
	const running = [...jobs.values()].filter((job) => job.status === "running");
	if (running.length === 0) {
		try {
			uiCtx.ui.setWidget(WIDGET, undefined);
		} catch {
			// The session may be gone.
		}
		stopTimer();
		return;
	}

	try {
		uiCtx.ui.setWidget(WIDGET, (_tui, theme) => new Text(widgetText(theme), 1, 0), {
			placement: "aboveEditor",
		});
	} catch {
		// The session may be gone.
	}
	ensureTimer();
}

function ensureTimer(): void {
	if (timer) return;
	timer = setInterval(updateUI, 5000);
	timer.unref();
}

function stopTimer(): void {
	if (!timer) return;
	clearInterval(timer);
	timer = undefined;
}

function record(job: Job, line: string): void {
	job.activity.push(line);
	if (job.activity.length > MAX_ACTIVITY) job.activity.shift();
	try {
		appendFileSync(job.paths.activity, `${line}\n`);
	} catch {
		// The audit log is best effort.
	}
	updateUI();
}

function handleLine(job: Job, line: string): void {
	if (!line.trim()) return;
	let event: any;
	try {
		event = JSON.parse(line);
	} catch {
		return;
	}
	if (event.type === "tool_execution_start") {
		record(job, `→ ${describeCall(event.toolName, event.args)}`);
	} else if (event.type === "tool_execution_end" && event.isError) {
		record(job, `✗ ${event.toolName} failed`);
	} else if (event.type === "message_end" && event.message?.role === "assistant") {
		const text = (event.message.content ?? [])
			.filter((part: any) => part.type === "text")
			.map((part: any) => part.text)
			.join("")
			.trim();
		if (text) job.report = text;
	}
}

function findSessionFile(dir: string, id: string): string | undefined {
	try {
		const file = readdirSync(dir).find((name) => name.endsWith(".jsonl") && name.includes(id));
		return file ? join(dir, file) : undefined;
	} catch {
		return undefined;
	}
}

async function startJob(pi: ExtensionAPI, ctx: ExtensionContext, args: SubagentArgs): Promise<Job> {
	const task = args.task.trim();
	if (!task) throw new Error("task is empty");
	const running = [...jobs.values()].filter((job) => job.status === "running").length + pendingNames.size;
	if (running >= MAX_JOBS) {
		throw new Error(`Already ${MAX_JOBS} subagents running.`);
	}
	const base = args.name ? cleanName(args.name) : slug(task);
	if (args.name && (jobs.has(base) || pendingNames.has(base))) {
		throw new Error(`A subagent named "${base}" already exists in this session.`);
	}
	const name = args.name ? base : uniqueName(base);
	pendingNames.add(name);
	let cwd = ctx.cwd;
	let branch: string | undefined;
	let root: string | undefined;
	try {
		const mode = args.worktree ?? false;
		root = await mainRoot(pi, ctx.cwd).catch(() => undefined);
		if (mode === true) {
			const worktree = await createWorktree(pi, ctx.cwd, name);
			cwd = worktree.path;
			branch = worktree.branch;
		} else if (typeof mode === "string") {
			if (!root) throw new Error("Reusing a worktree needs a git repository");
			const worktree = await reuseWorktree(pi, root, mode);
			cwd = worktree.path;
			branch = worktree.branch;
		} else if (mode !== false) {
			throw new Error("worktree must be true, false, or a branch/path");
		}
		cwd = resolve(cwd);
	} catch (error) {
		pendingNames.delete(name);
		throw error;
	}

	const key = repoKey(root ?? ctx.cwd);
	const stamp = Date.now().toString(36);
	const crew = join(homedir(), ".pi", "agent", "crew", key);
	const dir = join(crew, `${name}-${stamp}`);
	const sessions = join(crew, "sessions");
	let paths: Paths;
	try {
		mkdirSync(dir, { recursive: true });
		mkdirSync(sessions, { recursive: true });
		paths = {
			prompt: join(dir, "prompt.md"),
			report: join(dir, "report.md"),
			activity: join(dir, "activity.log"),
			result: join(dir, "result.json"),
			sessions,
		};
		writeFileSync(paths.prompt, `${task}\n`);
		writeFileSync(paths.activity, "");
	} catch (error) {
		pendingNames.delete(name);
		throw error;
	}

	const job: Job = {
		name,
		task,
		status: "running",
		color: JOB_COLORS[nextColor++ % JOB_COLORS.length],
		branch,
		cwd,
		sessionId: `agent-${name}-${stamp}`,
		startedAt: Date.now(),
		activity: [],
		report: "",
		paths,
	};
	jobs.set(name, job);
	pendingNames.delete(name);
	try {
		watchChild(pi, ctx, job);
	} catch (error) {
		jobs.delete(name);
		throw error;
	}
	updateUI();
	return job;
}

function finishJob(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	job: Job,
	code: number,
	stderr: string,
): void {
	if (job.endedAt) return;
	job.endedAt = Date.now();
	job.exitCode = code;
	job.status = job.stopped ? "stopped" : code === 0 ? "done" : "failed";
	if (!job.report.trim()) {
		job.report = job.stopped ? "(stopped)" : code === 0 ? "(no output)" : stderr.trim() || `Exited with code ${code}`;
	}
	if (job.status === "failed" && stderr.trim() && !job.report.includes(stderr.trim())) {
		job.report = `${job.report}\n\nstderr:\n${stderr.trim()}`;
	}
	job.sessionFile = findSessionFile(job.paths.sessions, job.sessionId);
	if (job.killTimer) {
		clearTimeout(job.killTimer);
		job.killTimer = undefined;
	}

	try {
		writeFileSync(job.paths.report, `${job.report}\n`);
		writeFileSync(
			job.paths.result,
			JSON.stringify(
				{
					name: job.name,
					status: job.status,
					branch: job.branch,
					cwd: job.cwd,
					sessionId: job.sessionId,
					sessionFile: job.sessionFile,
					startedAt: new Date(job.startedAt).toISOString(),
					endedAt: new Date(job.endedAt).toISOString(),
					exitCode: job.exitCode,
				},
				null,
				2,
			),
		);
	} catch {
		// The audit files are best effort.
	}

	updateUI();
	if (disposed) return;

	const preview = clip(firstLine(job.report), 300);
	const meta = [
		`Subagent "${job.name}" ${job.status}.`,
		job.branch ? `Branch: ${job.branch}` : "",
		`Report: ${job.paths.report}`,
	].filter(Boolean).join("\n");
	const content = [
		meta,
		preview,
		"Read the report file for details; keep your reply brief and do not paste the full report into the chat.",
	].filter(Boolean).join("\n\n");

	const details = detailsOf(job);
	const options = ctx.isIdle() ? { triggerTurn: true } : { deliverAs: "followUp" as const };
	try {
		pi.appendEntry("subagent_result", details);
	} catch {
		// The session may be gone.
	}
	try {
		pi.sendMessage<SubagentDetails>(
			{
				customType: "subagent",
				content,
				display: false,
				details,
			},
			options,
		);
	} catch {
		// The session may be gone.
	}
}

function watchChild(pi: ExtensionAPI, ctx: ExtensionContext, job: Job): void {
	const { command, args } = piInvocation([
		"--mode",
		"json",
		"-p",
		"--session-id",
		job.sessionId,
		"--session-dir",
		job.paths.sessions,
		"--append-system-prompt",
		"You are a subagent spawned by another session.",
		"--exclude-tools",
		"subagent",
		...parentModelArgs(ctx),
		"--",
		job.task,
	]);

	const child = spawn(command, args, { cwd: job.cwd, stdio: ["ignore", "pipe", "pipe"] });
	job.child = child;
	let buffer = "";
	let stderr = "";

	child.stdout.setEncoding("utf8");
	child.stdout.on("data", (data: string) => {
		buffer += data;
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) handleLine(job, line);
	});
	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (data: string) => {
		stderr = `${stderr}${data}`.slice(-8000);
	});
	child.on("error", (error) => finishJob(pi, ctx, job, 1, `${stderr}${error.message}\n`));
	child.on("close", (code) => {
		if (buffer.trim()) handleLine(job, buffer);
		finishJob(pi, ctx, job, code ?? 1, stderr);
	});
}

function stopJob(job: Job): boolean {
	if (job.status !== "running" || !job.child) return false;
	job.stopped = true;
	job.child.kill("SIGTERM");
	job.killTimer = setTimeout(() => job.child?.kill("SIGKILL"), KILL_GRACE_MS);
	job.killTimer.unref();
	return true;
}

function detailsOf(job: Job, withTask = false): SubagentDetails {
	return {
		name: job.name,
		status: job.status,
		branch: job.branch,
		cwd: job.cwd,
		durationMs: (job.endedAt ?? Date.now()) - job.startedAt,
		report: job.report,
		activity: job.activity.slice(-50),
		...(withTask ? { task: job.task } : {}),
		promptPath: job.paths.prompt,
		reportPath: job.paths.report,
		sessionFile: job.sessionFile ?? findSessionFile(job.paths.sessions, job.sessionId),
	};
}

function jobLabel(job: Job): string {
	const mark =
		job.status === "running" ? "●" : job.status === "done" ? "✓" : job.status === "failed" ? "✗" : "■";
	const duration = formatDuration((job.endedAt ?? Date.now()) - job.startedAt);
	return `${mark} ${job.name} · ${job.status} ${duration}${job.branch ? ` · ${job.branch}` : ""}`;
}

function header(data: SubagentDetails, theme: Theme): string {
	const mark = data.status === "running" ? "●" : data.status === "done" ? "✓" : data.status === "failed" ? "✗" : "■";
	const color = data.status === "done" ? "success" : data.status === "failed" ? "error" : "dim";
	const where = data.branch ? ` · ${data.branch}` : "";
	return (
		theme.fg(color, theme.bold(`${mark} subagent ${data.name}`)) +
		theme.fg("dim", ` · ${data.status} · ${formatDuration(data.durationMs)}${where}`)
	);
}

function resultHeader(data: SubagentDetails, theme: Theme): string {
	const mark = data.status === "running" ? "●" : data.status === "done" ? "✓" : data.status === "failed" ? "✗" : "■";
	const where = data.branch ? ` · ${data.branch}` : "";
	return (
		theme.fg("toolTitle", theme.bold(`${mark} subagent ${data.name}`)) +
		theme.fg("dim", ` · ${data.status} · ${formatDuration(data.durationMs)}${where}`)
	);
}

function resultEntry(data: SubagentDetails, theme: Theme, expanded: boolean, hint: string): Container {
	const view = new Container();
	const background =
		data.status === "done" ? "toolSuccessBg" : data.status === "failed" ? "toolErrorBg" : "toolPendingBg";
	const box = new Box(1, 1, (text) => theme.bg(background, text));
	box.addChild(new Text(resultHeader(data, theme), 0, 0));
	if (expanded) {
		if (data.report) box.addChild(new Markdown(data.report, 0, 0, getMarkdownTheme()));
	} else {
		const text = data.report.trim();
		const preview = clip(firstLine(text) || "(no output)", 100) + (text.includes("\n") ? "…" : "");
		const more = [`/agents show ${data.name}`, hint].filter(Boolean).join("  ·  ");
		box.addChild(new Text(theme.fg("muted", preview) + theme.fg("dim", `  ·  ${more}`), 0, 0));
	}
	view.addChild(new Spacer(1));
	view.addChild(box);
	return view;
}

function entryView(data: SubagentDetails, theme: Theme, expanded: boolean): Container {
	const view = new Container();
	const border = (text: string) => theme.fg("dim", text);
	view.addChild(new Spacer(1));
	view.addChild(new DynamicBorder(border));
	view.addChild(new Text(header(data, theme), 1, 0));
	if (data.task) {
		view.addChild(new Text(theme.fg("accent", "Prompt"), 1, 0));
		view.addChild(new Text(theme.fg("muted", data.task), 1, 0));
	}
	if (data.report) {
		view.addChild(new Text(theme.fg("accent", "Report"), 1, 0));
		view.addChild(new Markdown(data.report, 1, 0, getMarkdownTheme()));
	}
	if (expanded && data.activity.length) {
		view.addChild(new Text(theme.fg("accent", "Activity"), 1, 0));
		view.addChild(new Text(theme.fg("muted", data.activity.join("\n")), 1, 0));
	}
	const paths = [
		data.cwd,
		data.promptPath && `prompt ${data.promptPath}`,
		data.reportPath && `report ${data.reportPath}`,
		data.sessionFile && `session ${data.sessionFile}`,
	]
		.filter(Boolean)
		.join("\n");
	if (paths) view.addChild(new Text(theme.fg("dim", paths), 1, 0));
	view.addChild(new DynamicBorder(border));
	return view;
}

export default function (pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		disposed = false;
		uiCtx = ctx;
		updateUI();
	});

	pi.on("session_shutdown", () => {
		disposed = true;
		for (const job of jobs.values()) {
			if (job.status === "running") stopJob(job);
		}
		jobs.clear();
		pendingNames.clear();
		stopTimer();
		uiCtx = undefined;
	});

	pi.registerMessageRenderer<SubagentDetails>("subagent", (message, options, theme) => {
		const data = message.details;
		return data ? resultEntry(data, theme, options.expanded, options.keyHint("app.tools.expand", "report")) : undefined;
	});

	pi.registerEntryRenderer("subagent_result", (entry, options, theme) => {
		return resultEntry(
			entry.data as SubagentDetails,
			theme,
			options.expanded,
			options.keyHint("app.tools.expand", "report"),
		);
	});

	pi.registerEntryRenderer("subagent_details", (entry, { expanded }, theme) => {
		return entryView(entry.data as SubagentDetails, theme, expanded);
	});

	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		description: [
			"Run a Pi subagent in the background on one self-contained task. The subagent receives `task` as its entire prompt and reports back when done.",
			"`worktree` chooses where it runs: false (default) runs in the current directory; true creates or reuses a worktree with `wt new <name>` and runs there; a branch name reuses that existing worktree; a path runs in that directory.",
			'Examples: worktree:false is the current checkout; worktree:true with name "studio" creates or reuses the studio worktree; worktree:"studio" reuses it; worktree:"/path/to/tree" runs there.',
			"The subagent sees nothing else, so write a complete brief.",
		].join(" "),
		promptSnippet: "subagent — run a background Pi agent on one self-contained task",
		promptGuidelines: [
			"The subagent sees only `task`; include all context, constraints, and the expected final report.",
			"Do not poll for it; its report arrives as a message. Keep working on independent tasks or end your turn.",
			"When a report arrives, read its report file before deciding what to do, and keep the chat reply brief.",
			"Use `worktree: true` with a distinct name for isolated implementation work; use `worktree: false` for read-only research in the current checkout.",
			"Parallel implementation jobs in the same directory share files; give each one its own worktree.",
		],
		parameters: Type.Object({
			task: Type.String({ description: "The complete prompt for the subagent. It sees nothing else." }),
			worktree: Type.Optional(
				Type.Union([Type.Boolean(), Type.String()], {
					description:
						"false (default) runs in the current directory. true creates or reuses a worktree with `wt new <name>` and runs there. A branch name reuses that existing worktree. A path runs in that directory.",
				}),
			),
			name: Type.Optional(
				Type.String({
					description:
						"Optional job name; with `worktree: true`, also the new worktree branch. Generated from the task otherwise.",
				}),
			),
		}),
		async execute(_toolCallId, args, _signal, _onUpdate, ctx) {
			if (ctx.mode === "print" || ctx.mode === "json") {
				throw new Error("Background subagents need an interactive or RPC session.");
			}
			uiCtx = ctx;
			const job = await startJob(pi, ctx, args);
			const where = job.branch ? `branch ${job.branch} in ${job.cwd}` : job.cwd;
			return {
				content: [
					{
						type: "text" as const,
						text: `Started subagent "${job.name}" (${where}). Its report will arrive as a message. Use /agents to watch or stop it. Prompt: ${job.paths.prompt}`,
					},
				],
				details: { name: job.name, branch: job.branch, cwd: job.cwd, sessionId: job.sessionId, promptPath: job.paths.prompt } satisfies StartDetails,
			};
		},
		renderCall(args, theme, context) {
			const title = `subagent ${args.name ?? ""}`.trim();
			const where =
				typeof args.worktree === "string" ? ` · ${args.worktree}` : args.worktree === true ? " · worktree" : "";
			let text = theme.fg("toolTitle", theme.bold(title)) + theme.fg("dim", where);
			const lines = String(args.task ?? "").split("\n");
			const shown = context.expanded ? lines : lines.slice(0, 8);
			if (shown.length) text += `\n${theme.fg("muted", shown.join("\n"))}`;
			if (!context.expanded && lines.length > shown.length) {
				text += `\n${theme.fg("dim", `… ${lines.length - shown.length} more lines`)} ${context.keyHint("app.tools.expand", "expand")}`;
			}
			return new Text(text, 0, 0);
		},
		renderResult(result, options, theme, context) {
			if (context.isError) {
				const text = (result.content ?? [])
					.map((part) => (part.type === "text" ? part.text : ""))
					.join("\n");
				return new Text(theme.fg("text", clip(text || "Failed to start subagent", 300)), 0, 0);
			}
			const details = result.details as StartDetails | undefined;
			if (options.isPartial || !details?.name) return new Text(theme.fg("muted", "Starting…"), 0, 0);
			return new Text(theme.fg("dim", `● ${details.name} started · ${details.branch ?? details.cwd}`), 0, 0);
		},
	});

	pi.registerCommand("agents", {
		description: "List, show, or stop background subagents",
		handler: async (args, ctx) => {
			uiCtx = ctx;
			const parts = args.trim().split(/\s+/).filter(Boolean);
			let action = parts[0] ?? "list";
			let name = parts[1];
			if (action !== "list" && action !== "show" && action !== "stop") {
				name = action;
				action = "show";
			}

			if (action === "stop") {
				const targets =
					!name || name === "all"
						? [...jobs.values()].filter((job) => job.status === "running")
						: [jobs.get(name)].filter((job): job is Job => job !== undefined);
				if (targets.length === 0) return ctx.ui.notify("No running subagents.", "info");
				for (const job of targets) stopJob(job);
				return ctx.ui.notify(`Stopping ${targets.length} subagent${targets.length === 1 ? "" : "s"}.`, "info");
			}

			if (action === "show") {
				if (!name) return ctx.ui.notify("Usage: /agents show <name>", "warning");
				const job = jobs.get(name);
				if (!job) return ctx.ui.notify(`No subagent "${name}".`, "error");
				pi.appendEntry("subagent_details", detailsOf(job, true));
				return;
			}

			const list = [...jobs.values()].sort((a, b) => b.startedAt - a.startedAt);
			if (list.length === 0) return ctx.ui.notify("No subagents in this session.", "info");
			if (!ctx.hasUI) return ctx.ui.notify(list.map(jobLabel).join("\n"), "info");
			const labels = list.map(jobLabel);
			const choice = await ctx.ui.select("Subagents", labels);
			if (!choice) return;
			const job = list[labels.indexOf(choice)];
			if (job) pi.appendEntry("subagent_details", detailsOf(job, true));
		},
	});
}
