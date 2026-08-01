/**
 * Run the Analyzer Agent against a repository from the terminal.
 *
 *   npx tsx src/scripts/run-analyzer.ts [path-to-repo]
 *
 * Defaults to ../demo-repo. The Load Interview happens right here in the
 * terminal; the finished report is saved to out/report.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { runAnalyzer, type AskUser } from "../agents/analyzer.js";

const repoPath = resolve(process.argv[2] ?? join(process.cwd(), "..", "demo-repo"));
const repoName = basename(repoPath);

const askUserInTerminal: AskUser = async (questions) => {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answers: Record<string, string> = {};
  console.log("\n--- Load Interview (answer with the option number) ---\n");
  for (const q of questions) {
    console.log(q.question);
    q.options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt}`));
    let choice: number = NaN;
    while (!(choice >= 1 && choice <= q.options.length)) {
      const raw = await rl.question("> ");
      choice = Number.parseInt(raw.trim(), 10);
    }
    answers[q.q_id] = q.options[choice - 1]!;
    console.log();
  }
  rl.close();
  return answers;
};

console.log(`Analyzing: ${repoPath}\n`);
const { report, iterations } = await runAnalyzer(repoPath, repoName, askUserInTerminal);

const outDir = join(process.cwd(), "out");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "report.json");
writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");

console.log(`\n✅ Report valid (${iterations} agent iterations). Saved to out/report.json\n`);
console.log(JSON.stringify(report, null, 2));
