/**
 * Desktop notification when Pi settles and is waiting for input.
 *
 * macOS prefers `terminal-notifier` (brew): its `-execute` hook makes a click raise
 * the terminal and focus Pi's tmux session, window and pane. Without it we fall back
 * to `osascript`, which shows the same banner but opens Script Editor on click,
 * because `display notification` has no click action.
 *
 * Other platforms no-op until a backend (Windows toast, `notify-send` on Linux)
 * is added to `notify`.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Args travel via argv, so titles with quotes or backslashes cannot break the script. */
const APPLESCRIPT = [
	"on run argv",
	"\tdisplay notification (item 3 of argv) with title (item 1 of argv) subtitle (item 2 of argv)",
	"end run",
].join("\n");

/** π badge shown inside the banner. */
const LOGO = join(homedir(), ".pi", "agent", "extensions", "pi-logo.png");

/** Shell script terminal-notifier runs on click: raise the terminal, then Pi's pane. */
function focusCommand(): string | undefined {
	const socket = (process.env.TMUX ?? "").split(",")[0];
	const pane = process.env.TMUX_PANE;
	if (!socket || !pane) return undefined;
	const tmux = `/opt/homebrew/bin/tmux -S ${socket}`;
	return [
		"/usr/bin/open -a Ghostty",
		`w=$(${tmux} display-message -p -t ${pane} '#{session_name}:#{window_index}')`,
		`tty=$(${tmux} list-clients -F '#{client_tty}' | head -1)`,
		`[ -n "$tty" ] && ${tmux} switch-client -c "$tty" -t "\${w%%:*}"`,
		`${tmux} select-window -t "$w"`,
		`${tmux} select-pane -t ${pane}`,
	].join("; ");
}

/** Fire-and-forget; a missing or denied notifier must never affect the agent run. */
function notify(title: string, subtitle: string, body: string): void {
	// Rex surfaces agent state itself; banners are for tmux and raw terminals.
	if (process.env.REX_SESSION) return;
	if (process.platform !== "darwin") return;
	const pane = process.env.TMUX_PANE ?? "";
	const args = ["-title", title, "-subtitle", subtitle, "-message", body, "-group", `pi-${pane || "local"}`];
	if (existsSync(LOGO)) args.push("-contentImage", LOGO);
	const focus = focusCommand();
	if (focus) args.push("-execute", focus);
	execFile("terminal-notifier", args, (error) => {
		if (error?.code !== "ENOENT") return;
		execFile("osascript", ["-e", APPLESCRIPT, "--", title, subtitle, body], () => {});
	});
}

/** First words of the assistant's reply, for a one-glance banner body. */
function preview(text: string): string {
	const words = text.replace(/\s+/gu, " ").trim().split(" ");
	return words.length > 6 ? `${words.slice(0, 6).join(" ")}…` : words.join(" ");
}

/** Newest assistant text in the active branch; empty when the run produced no reply. */
function lastAnswer(ctx: ExtensionContext): string {
	const entries = ctx.sessionManager.getBranch();
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index]!;
		if (entry.type !== "message" || entry.message.role !== "assistant") continue;
		const part = entry.message.content.find((item) => item.type === "text");
		if (part?.type === "text") return part.text;
	}
	return "";
}

export default function (pi: ExtensionAPI) {
	// `agent_end` fires after each low-level run, before retries, compaction, or queued
	// follow-ups. Only `agent_settled` means Pi will not continue on its own.
	pi.on("agent_settled", (_event, ctx) => {
		notify("Pi", basename(ctx.cwd), preview(lastAnswer(ctx)) || "Ready for input");
	});
}
