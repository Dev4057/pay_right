/**
 * Read-only, sandboxed filesystem tools for the Analyzer Agent.
 *
 * Security properties (the trust story: the agent that reads your code
 * physically cannot spend money or write anything):
 *  - all paths resolved inside the repo root; traversal escapes rejected
 *  - read-only: no write/exec capability exists here at all
 *  - bounded output: file size, match count, and file count caps so a huge
 *    repo can't blow up the context window
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".cache",
  "out",
]);
const MAX_FILE_BYTES = 64 * 1024;
const MAX_FILES_LISTED = 500;
const MAX_MATCHES = 40;
const TEXT_EXTENSIONS = new Set([
  ".js", ".mjs", ".cjs", ".ts", ".mts", ".jsx", ".tsx", ".json", ".sql",
  ".md", ".yml", ".yaml", ".env", ".example", ".txt", ".prisma", ".toml",
  ".html", ".css", ".sh", ".dockerfile", "",
]);

function extOf(name: string): string {
  const base = name.toLowerCase();
  if (base === "dockerfile" || base === "procfile" || base === ".env.example") return "";
  const i = base.lastIndexOf(".");
  return i === -1 ? "" : base.slice(i);
}

export class RepoTools {
  private readonly root: string;

  constructor(repoRoot: string) {
    this.root = resolve(repoRoot);
    const st = statSync(this.root, { throwIfNoEntry: false });
    if (!st?.isDirectory()) throw new Error(`Not a directory: ${this.root}`);
  }

  /** Resolve a repo-relative path, rejecting escapes ("../", absolute paths). */
  private resolveSafe(relPath: string): string {
    const abs = resolve(this.root, relPath);
    if (abs !== this.root && !abs.startsWith(this.root + sep)) {
      throw new Error(`Path escapes repository root: ${relPath}`);
    }
    return abs;
  }

  /** Recursively yields every file path, skipping node_modules/.git/etc. */
  private *walk(dir: string): Generator<string> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          yield* this.walk(join(dir, entry.name));
        }
      } else if (entry.isFile()) {
        yield join(dir, entry.name);
      }
    }
  }

  /** All file paths (repo-relative, forward slashes), capped. */
  listFiles(): { files: string[]; truncated: boolean } {
    const files: string[] = [];
    for (const abs of this.walk(this.root)) {
      files.push(relative(this.root, abs).split(sep).join("/"));
      if (files.length >= MAX_FILES_LISTED) return { files, truncated: true };
    }
    return { files, truncated: false };
  }

  /** File content with 1-based line numbers, truncated at MAX_FILE_BYTES. */
  readFile(relPath: string): string {
    const abs = this.resolveSafe(relPath);
    const st = statSync(abs, { throwIfNoEntry: false });
    if (!st?.isFile()) return `ERROR: no such file: ${relPath}`;
    const truncated = st.size > MAX_FILE_BYTES;
    const buf = readFileSync(abs);
    const text = buf.subarray(0, MAX_FILE_BYTES).toString("utf-8");
    const numbered = text
      .split("\n")
      .map((line, i) => `${i + 1}\t${line}`)
      .join("\n");
    return truncated ? `${numbered}\n... [truncated at 64KB]` : numbered;
  }

  /**
   * Regex (falls back to literal) search across text files.
   * Returns "file:line: text" matches, capped.
   */
  searchCode(pattern: string): { matches: string[]; truncated: boolean } {
    let re: RegExp;
    try {
      re = new RegExp(pattern, "i");
    } catch {
      re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }
    const matches: string[] = [];
    for (const abs of this.walk(this.root)) {
      if (!TEXT_EXTENSIONS.has(extOf(abs.split(sep).pop()!))) continue;
      const st = statSync(abs);
      if (st.size > MAX_FILE_BYTES) continue;
      const rel = relative(this.root, abs).split(sep).join("/");
      const lines = readFileSync(abs, "utf-8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i]!)) {
          matches.push(`${rel}:${i + 1}: ${lines[i]!.trim().slice(0, 200)}`);
          if (matches.length >= MAX_MATCHES) return { matches, truncated: true };
        }
      }
    }
    return { matches, truncated: false };
  }
}
