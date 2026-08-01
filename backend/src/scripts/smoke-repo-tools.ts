/** No-LLM smoke test: exercise the read-only tools against demo-repo. */
import { join } from "node:path";
import { RepoTools } from "../agents/repo-tools.js";

const tools = new RepoTools(join(process.cwd(), "..", "demo-repo"));

const { files } = tools.listFiles();
console.log(`list_files: ${files.length} files ->`, files.join(", "));

const pkg = tools.readFile("package.json");
console.log(`\nread_file package.json: ${pkg.split("\n").length} lines OK`);

const ws = tools.searchCode("socket\\.io");
console.log(`\nsearch_code "socket.io": ${ws.matches.length} matches`);
ws.matches.slice(0, 3).forEach((m) => console.log("  " + m));

const up = tools.searchCode("multer");
console.log(`search_code "multer": ${up.matches.length} matches`);

// sandbox escape must fail
try {
  tools.readFile("../backend/.env");
  console.error("❌ SANDBOX BREACH: escape was allowed!");
  process.exit(1);
} catch {
  console.log('\n✅ sandbox: "../backend/.env" correctly rejected');
}
