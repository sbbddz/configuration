/**
 * External editor command.
 *
 * `/editor [path]` opens the configured editor at `path` (default: the session
 * directory), so main repos and worktrees open the checkout you are actually in.
 * The TUI suspends while the editor runs, which gives terminal editors (vim, nvim,
 * helix) the terminal.
 */

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Expand a leading ~ and resolve relative arguments against the session directory. */
function targetPath(args: string, cwd: string): string {
	const path = args.trim() || ".";
	const expanded = path === "~" ? homedir() : path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
	return resolve(cwd, expanded);
}

/** Mirrors Pi's own resolution: externalEditor setting, then $VISUAL/$EDITOR, then a platform default. */
function editorCommand(pi: ExtensionAPI): string {
	const configured = pi.getSettings().externalEditor;
	if (configured?.trim()) return configured.trim();
	return process.env.VISUAL || process.env.EDITOR || (process.platform === "win32" ? "notepad" : "nano");
}

export default function (pi: ExtensionAPI): void {
	pi.registerCommand("editor", {
		description: "Open the external editor at a path (defaults to the session directory)",
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("editor requires interactive mode", "error");
				return;
			}
			const command = editorCommand(pi);
			const [editor, ...editorArgs] = command.split(/\s+/);
			const target = targetPath(args, ctx.cwd);
			const exit = await ctx.ui.custom<number | null>((tui, _theme, _keybindings, done) => {
				void (async () => {
					tui.stop();
					const code = await new Promise<number | null>((resolve) => {
						const child = spawn(editor, [...editorArgs, target], {
							cwd: ctx.cwd,
							stdio: "inherit",
							shell: process.platform === "win32",
						});
						child.once("error", () => resolve(null));
						child.once("close", resolve);
					}).catch(() => null);
					tui.start();
					tui.requestRender(true);
					done(code);
				})();
				return { render: () => [], invalidate: () => {} };
			});
			if (exit === null) ctx.ui.notify(`editor: could not launch ${command}`, "error");
			else if (exit !== 0) ctx.ui.notify(`editor: ${command} exited with code ${exit}`, "warning");
		},
	});
}
