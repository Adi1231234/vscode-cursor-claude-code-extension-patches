/* Every check for this patch, in one command:
 *     node patches/prompt-queue/tests/run-all.mjs
 * Non-zero exit if anything fails, so it works as a pre-commit gate.
 *
 * check-injected is in here rather than left to the lab because it is the one
 * that reads patches/prompt-queue/order.json - the same list patch.ps1 builds
 * the bundle from. When those two were separate lists the checker went stale
 * and passed for a bundle the product never shipped. */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const jobs = [
  ["saved.test.js", [path.join(here, "saved.test.js")]],
  ["check-injected", [path.join(root, "tools", "check-injected.mjs"), "prompt-queue"]],
  ["check-ps1", [path.join(root, "tools", "check-ps1.mjs")]]
];

const NL = String.fromCharCode(10);
let bad = 0;
for (const [name, args] of jobs) {
  try {
    const out = execFileSync(process.execPath, args, { encoding: "utf8", cwd: root });
    const last = out.trim().split(NL).pop().trim();
    /* A suite that dies quietly still exits 0 - so it has to say how many
       assertions it ran before it is believed. */
    if (!/passed|\bok\b/.test(last)) {
      bad++;
      console.log(`  ${name.padEnd(16)} NO RESULT - the suite printed no summary`);
      console.log(out);
      continue;
    }
    console.log(`  ${name.padEnd(16)} ${last}`);
  } catch (e) {
    bad++;
    console.log(`  ${name.padEnd(16)} FAILED`);
    console.log((e.stdout || "") + (e.stderr || ""));
  }
}
console.log(bad ? NL + `  ${bad} suite(s) failed` : NL + "  all suites passed");
process.exit(bad ? 1 : 0);
