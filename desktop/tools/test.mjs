/* Every offline check of the desktop tree, in one command:
 *     node desktop/tools/test.mjs
 * The live checks on claude.ai/code are tools/chrome-live (they need Adi's
 * Chrome); these need nothing but Node. Non-zero exit if anything fails. */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desk = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jobs = ["lib/tests/build.test.js", "lib/tests/rows.test.js", "patches/phone-queue/tests/main.test.js"];
let bad = 0;
for (const j of jobs) {
    try {
        const out = execFileSync(process.execPath, [path.join(desk, j)], { encoding: "utf8" });
        console.log("  " + j.padEnd(44) + out.trim().split(/\r?\n/).pop());
    } catch (e) {
        bad++;
        console.log("  " + j.padEnd(44) + "FAILED");
        console.log(String(e.stdout || "") + String(e.stderr || ""));
    }
}
console.log(bad ? "\n" + bad + " failed" : "\n  all desktop checks passed");
process.exit(bad ? 1 : 0);
