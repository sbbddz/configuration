/**
 * Fuzzy `@`-file completion backed by `rg --files`.
 *
 * `rg --files` runs lazily once per session, the listing is fuzzy-matched in
 * memory on each keystroke, and it is invalidated after filesystem-changing tools.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { fuzzyFilter, type AutocompleteItem, type AutocompleteProvider } from "@earendil-works/pi-tui";

const MAX_RESULTS = 20;
const RG_TIMEOUT_MS = 10_000;
const RG_ARGS = ["--files", "--hidden", "--glob", "!.git"];
const INVALIDATING_TOOLS = new Set(["write", "edit", "bash"]);
const DELIMITERS = /[\s"'=]/u;
const WRAPPERS = new Set(["(", "[", "{", "<", "`"]);

type FileCache = {
	cwd: string;
	files?: string[];
	loading?: Promise<string[] | undefined>;
	warned: boolean;
};

type AtToken = { raw: string; query: string; quoted: boolean };

function isBoundary(text: string, index: number): boolean {
	if (index === 0) return true;
	const previous = text[index - 1]!;
	return DELIMITERS.test(previous) || WRAPPERS.has(previous);
}

function lastUnclosedQuote(text: string): number {
	let open = -1;
	for (let index = 0; index < text.length; index += 1) {
		if (text[index] !== '"') continue;
		open = open === -1 ? index : -1;
	}
	return open;
}

/** The `@` token the cursor sits in: `@src/ma` or `@"path with spaces`. */
function extractAtToken(text: string): AtToken | undefined {
	const quote = lastUnclosedQuote(text);
	if (quote > 0 && text[quote - 1] === "@" && isBoundary(text, quote - 1)) {
		return { raw: text.slice(quote - 1), query: text.slice(quote + 1), quoted: true };
	}

	let start = text.length;
	while (start > 0 && !DELIMITERS.test(text[start - 1]!)) start -= 1;
	let token = text.slice(start);
	while (token.length > 0 && WRAPPERS.has(token[0]!)) token = token.slice(1);
	if (!token.startsWith("@")) return undefined;
	return { raw: token, query: token.slice(1), quoted: false };
}

function toItem(file: string, quoted: boolean): AutocompleteItem {
	const value = quoted || /\s/u.test(file) ? `@"${file}"` : `@${file}`;
	return { value, label: file.slice(file.lastIndexOf("/") + 1), description: file };
}

function warnOnce(cache: FileCache, ctx: ExtensionContext, details: string): void {
	if (cache.warned) return;
	cache.warned = true;
	ctx.ui.notify(`rg-mentions: \`rg --files\` failed (${details}); falling back to built-in completion`, "error");
}

function loadFiles(cache: FileCache, pi: ExtensionAPI, ctx: ExtensionContext): Promise<string[] | undefined> {
	cache.loading ??= pi.exec("rg", RG_ARGS, { cwd: cache.cwd, timeout: RG_TIMEOUT_MS }).then(
		(result) => {
			if (result.code !== 0) {
				warnOnce(cache, ctx, result.stderr.trim() || `exit code ${result.code}`);
				return undefined;
			}
			cache.files = result.stdout.split("\n").filter(Boolean).sort();
			return cache.files;
		},
		(error: unknown) => {
			warnOnce(cache, ctx, error instanceof Error ? error.message : String(error));
			return undefined;
		},
	);
	return cache.loading;
}

function createProvider(
	current: AutocompleteProvider,
	cache: FileCache,
	pi: ExtensionAPI,
	ctx: ExtensionContext,
): AutocompleteProvider {
	return {
		async getSuggestions(lines, cursorLine, cursorCol, options) {
			const delegate = () => current.getSuggestions(lines, cursorLine, cursorCol, options);
			const token = extractAtToken((lines[cursorLine] ?? "").slice(0, cursorCol));
			// Empty, absolute, and home paths stay with the built-in provider.
			if (!token || token.query === "" || token.query.startsWith("/") || token.query.startsWith("~")) {
				return delegate();
			}

			const files = await loadFiles(cache, pi, ctx);
			if (!files || options.signal.aborted) return delegate();

			const matches = fuzzyFilter(files, token.query, (file) => file).slice(0, MAX_RESULTS);
			if (matches.length === 0) return delegate();
			return { items: matches.map((file) => toItem(file, token.quoted)), prefix: token.raw };
		},
		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
		},
		shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
			return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
		},
	};
}

export default function (pi: ExtensionAPI): void {
	let cache: FileCache = { cwd: "", warned: false };

	pi.on("session_start", (_event, ctx) => {
		cache = { cwd: ctx.cwd, warned: false };
		ctx.ui.addAutocompleteProvider((current) => createProvider(current, cache, pi, ctx));
	});

	pi.on("tool_execution_end", (event) => {
		if (!INVALIDATING_TOOLS.has(event.toolName)) return;
		cache.files = undefined;
		cache.loading = undefined;
	});
}
