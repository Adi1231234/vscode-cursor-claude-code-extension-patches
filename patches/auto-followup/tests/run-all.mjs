/* Every check for this patch, in one command:
 *     node patches/auto-followup/tests/run-all.mjs
 * Non-zero exit if anything fails, so it works as a pre-commit gate. */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const jobs = [
  ["host.test.js", [path.join(here, "host.test.js")]],
  ["loop.test.js", [path.join(here, "loop.test.js")]],
  ["ui.test.js", [path.join(here, "ui.test.js")]],
  ["host-run.test.js", [path.join(here, "host-run.test.js")]],
  ["check-injected", [path.join(root, "tools", "check-injected.mjs"), "auto-followup"]]
];

const NL = String.fromCharCode(10);
let bad = 0;
for (const [name, args] of jobs) {
  try {
    const out = execFileSync(process.execPath, args, { encoding: "utf8", cwd: root });
    const last = out.trim().split(NL).pop().trim();
    /* A suite that dies quietly still exits 0. One of them threw inside a
       setTimeout, which took its own summary line down with it: no output at
       all, exit code 0, and reported here as passing. A suite has to say how
       many assertions it ran before it is believed. */
    if (!/passed|\bok\b/.test(last)) {
      bad++;
      console.log(`  ${name.padEnd(18)} NO RESULT - the suite printed no summary`);
      console.log(out);
      continue;
    }
    console.log(`  ${name.padEnd(18)} ${last}`);
  } catch (e) {
    bad++;
    console.log(`  ${name.padEnd(18)} FAILED`);
    console.log((e.stdout || "") + (e.stderr || ""));
  }
}
console.log(bad ? `\n  ${bad} suite(s) failed` : "\n  all suites passed");
process.exit(bad ? 1 : 0);
