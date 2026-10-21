/**
 * Subagent tool and command.
 *
 * Runs one isolated `pi` process per invocation, giving the task a fresh context
 * window. The child inherits the parent's model, thinking level, and working
 * directory, and cannot invoke `subagent` itself. Only for work the user
 * explicitly delegates.
 *
 * The child streams JSON events, reduced here to an activity log and the final
 * report. `/subagent` renders both a live `!!`-style block and a permanent one.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Container, Loader, Markdown, Spacer, Text, type TUI } from "@earendil-works/pi-tui";
import { Type } from "typebox";

/** Model-facing output cap; larger results are truncated with a note. */
const MAX_OUTPUT = 50 * 1024;
/** Grace period between SIGTERM and SIGKILL when a subagent is aborted. */
const KILL_GRACE_MS = 3000;
/** Activity lines shown when the block is collapsed. */
const PREVIEW_LINES = 8;

function truncate(text: string): string {
	if (Buffer.byteLength(text) <= MAX_OUTPUT) return text;
	let cut = text.slice(0, MAX_OUTPUT);
	while (Buffer.byteLength(cut) > MAX_OUTPUT) cut = cut.slice(0, -1);
	return `${cut}\n\n[truncated ${Buffer.byteLength(text) - Buffer.byteLength(cut)} bytes]`;
}

function clip(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Resolve how to invoke Pi in a child process, whether launched as a script or a binary. */
function piInvocation(args: string[]): { command: string; args: string[] } {
	const script = process.argv[1];
	if (script && existsSync(script)) return { command: process.execPath, args: [script, ...args] };
	return { command: "pi", args };
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

type SubagentResult = {
	report: string;
	activity: string[];
	stderr: string;
	exitCode: number;
	error?: string;
};

/**
 * The async door: process and result are decoupled, so a future background mode can
 * keep the returned promise instead of awaiting it.
 */
function launch(
	task: string,
	cwd: string,
	modelArgs: string[],
	signal: AbortSignal | undefined,
	onActivity?: (line: string) => void,
) {
	const { command, args } = piInvocation([
		"--mode",
		"json",
		"-p",
		"--no-session",
		"--exclude-tools",
		"subagent",
		...modelArgs,
		`Task: ${task}`,
	]);
	const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
	const activity: string[] = [];
	let report = "";
	let stderr = "";
	let buffer = "";

	const emit = (line: string) => {
		activity.push(line);
		onActivity?.(line);
	};
	const handleLine = (line: string) => {
		let event: any;
		try {
			event = JSON.parse(line);
		} catch {
			return;
		}
		if (event.type === "tool_execution_start") {
			emit(`→ ${describeCall(event.toolName, event.args)}`);
		} else if (event.type === "tool_execution_end" && event.isError) {
			emit(`✗ ${event.toolName} failed`);
		} else if (event.type === "message_end" && event.message?.role === "assistant") {
			const text = (event.message.content ?? [])
				.filter((part: any) => part.type === "text")
				.map((part: any) => part.text)
				.join("")
				.trim();
			if (text) report = text;
		}
	};

	child.stdout.on("data", (data) => {
		buffer += data;
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) if (line.trim()) handleLine(line);
	});
	child.stderr.on("data", (data) => (stderr += data));

	const kill = () => {
		child.kill("SIGTERM");
		const timer = setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS);
		timer.unref();
	};
	signal?.addEventListener("abort", kill, { once: true });

	const result = new Promise<SubagentResult>((resolve) => {
		child.on("error", (error) => resolve({ report, activity, stderr, exitCode: 1, error: error.message }));
		child.on("close", (code) => {
			if (buffer.trim()) handleLine(buffer);
			signal?.removeEventListener("abort", kill);
			resolve({ report, activity, stderr, exitCode: code ?? 1 });
		});
	});
	return { child, result };
}

/** Model and thinking level of the parent, so subagents behave the same. */
function parentModelArgs(ctx: ExtensionContext): string[] {
	const args: string[] = [];
	if (ctx.model) args.push("--model", `${ctx.model.provider}/${ctx.model.id}`);
	if (ctx.thinkingLevel) args.push("--thinking", ctx.thinkingLevel);
	return args;
}

interface RunResult {
	report: string;
	activity: string[];
	exitCode: number;
	durationMs: number;
}

/** Run one subagent to completion. Shared by the tool and the /subagent command. */
async function run(
	task: string,
	ctx: ExtensionContext,
	signal: AbortSignal | undefined,
	onActivity?: (line: string) => void,
): Promise<RunResult> {
	if (signal?.aborted) throw new Error("Subagent aborted");
	const started = Date.now();
	const { result } = launch(task, ctx.cwd, parentModelArgs(ctx), signal, onActivity);
	const { report, activity, stderr, exitCode, error } = await result;
	if (signal?.aborted) throw new Error("Subagent aborted");
	if (error) throw new Error(`Subagent failed to start: ${error}`);
	if (exitCode !== 0) throw new Error(`Subagent failed (exit ${exitCode}):\n${truncate(stderr.trim() || report.trim() || "(no output)")}`);
	return { report: truncate(report.trim() || "(no output)"), activity, exitCode, durationMs: Date.now() - started };
}

interface SubagentDetails {
	task: string;
	activity: string[];
	exitCode: number;
	durationMs: number;
	report: string;
}

/** Bordered block in the style of a `!!` execution, used live and in the transcript. */
class SubagentView extends Container {
	private readonly theme: Theme;
	private readonly lines: string[];
	private readonly expanded: boolean;
	private readonly activityText: Text;
	private readonly statusText = new Text("");
	private readonly loader?: Loader;

	constructor(details: SubagentDetails, theme: Theme, tui?: TUI, expanded = false) {
		super();
		this.theme = theme;
		this.lines = details.activity;
		this.expanded = expanded;
		const border = (str: string) => theme.fg("dim", str);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder(border));
		this.addChild(new Text(theme.fg("dim", theme.bold(`$ /subagent ${clip(details.task, 80)}`)), 1, 0));
		this.activityText = new Text("", 1, 0);
		this.addChild(this.activityText);
		if (details.report) this.addChild(new Markdown(details.report, 1, 0, getMarkdownTheme()));
		this.addChild(this.statusText);
		if (tui) {
			this.loader = new Loader(tui, (s) => theme.fg("dim", s), (s) => theme.fg("muted", s), "Subagent running…");
			this.addChild(this.loader);
		}
		this.addChild(new DynamicBorder(border));
		this.refresh();
	}

	add(line: string): void {
		this.lines.push(line);
		this.refresh();
	}

	finish(exitCode: number, durationMs: number): void {
		this.loader?.stop();
		const mark = exitCode === 0 ? "✓" : "✗";
		const color = exitCode === 0 ? "success" : "error";
		this.statusText.setText(this.theme.fg(color, ` ${mark} exit ${exitCode} · ${(durationMs / 1000).toFixed(1)}s`));
	}

	private refresh(): void {
		const shown = this.expanded ? this.lines : this.lines.slice(-PREVIEW_LINES);
		this.activityText.setText(shown.length ? this.theme.fg("muted", shown.join("\n")) : "");
	}
}

export default function (pi: ExtensionAPI): void {
	pi.registerMessageRenderer<SubagentDetails>("subagent", (message, { expanded }, theme) => {
		const details = message.details;
		if (!details) return undefined;
		const view = new SubagentView(details, theme, undefined, expanded);
		view.finish(details.exitCode, details.durationMs);
		return view;
	});

	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		description: [
			"Run one isolated Pi agent on a self-contained task and return its final report.",
			"The subagent starts with an empty context: include every path, constraint, and expected output in the task.",
			"ONLY call this when the user explicitly asks for a subagent, delegation, or work in a separate agent.",
			"Never call it proactively, speculatively, or to verify your own work.",
		].join(" "),
		promptSnippet: "subagent — run an isolated agent on one task (explicit user requests only)",
		promptGuidelines: [
			"Call `subagent` only when the user explicitly asks for a subagent, delegation, or a separate agent. Never call it proactively or speculatively.",
		],
		parameters: Type.Object({
			task: Type.String({
				description: "Self-contained task for the subagent, including paths and the expected output.",
			}),
		}),
		async execute(_toolCallId, { task }, signal, onUpdate, ctx) {
			const seen: string[] = [];
			const result = await run(task, ctx, signal, (line) => {
				seen.push(line);
				onUpdate?.({ content: [{ type: "text", text: seen.slice(-PREVIEW_LINES).join("\n") }] });
			});
			return { content: [{ type: "text", text: result.report }], details: undefined };
		},
	});

	pi.registerCommand("subagent", {
		description: "Run an isolated subagent and hand its report to the model",
		handler: async (task, ctx) => {
			if (!task.trim()) {
				ctx.ui.notify("Usage: /subagent <task>", "warning");
				return;
			}
			let view: SubagentView | undefined;
			ctx.ui.setWidget(
				"subagent",
				(tui, theme) => {
					view = new SubagentView({ task, activity: [], exitCode: 0, durationMs: 0, report: "" }, theme, tui);
					return view;
				},
				{ placement: "aboveEditor" },
			);

			let result: RunResult | undefined;
			try {
				result = await run(task, ctx, ctx.signal, (line) => view?.add(line));
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			} finally {
				ctx.ui.setWidget("subagent", undefined);
			}

			if (result) {
				pi.sendMessage<SubagentDetails>(
					{
						customType: "subagent",
						content: `Subagent report:\n\n${result.report}`,
						display: true,
						details: { task, ...result },
					},
					{ triggerTurn: true },
				);
			}
		},
	});
}
