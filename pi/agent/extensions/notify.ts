/**
 * Desktop notification when Pi settles and is waiting for input.
 *
 * Only macOS is wired up: `osascript` talks to Notification Center directly, so tmux
 * and terminal escape sequences are never involved. Other platforms no-op until a
 * backend (Windows toast, `notify-send` on Linux) is added to `notify`.
 */

import { execFile } from "node:child_process";
import { basename } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Args travel via argv, so titles with quotes or backslashes cannot break the script. */
const APPLESCRIPT = [
	"on run argv",
	"\tdisplay notification (item 3 of argv) with title (item 1 of argv) subtitle (item 2 of argv)",
	"end run",
].join("\n");

/** Fire-and-forget; a missing or denied notifier must never affect the agent run. */
function notify(title: string, subtitle: string, body: string): void {
	if (process.platform !== "darwin") return;
	execFile("osascript", ["-e", APPLESCRIPT, "--", title, subtitle, body], () => {});
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
