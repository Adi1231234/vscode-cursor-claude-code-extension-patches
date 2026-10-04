/* Every check for this patch, in one command:
 *     node patches/phone-queue/tests/run-all.mjs
 * Non-zero exit if anything fails. The queue's own half (remote-api.js,
 * remote-item.js, the park on a stop) lives with the queue and its tests are
 * run here too: patches/prompt-queue/tests/remote*.test.js, stops.test.js.
 *
 * `claude plugin validate patches/phone-queue/mod` is the mod's static check
 * (events, calls, imports); it needs a Claude Code 2.1.287+ binary, so it is
 * run by hand rather than from here. */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const jobs = [
  ["parse.test.mjs", [path.join(here, "parse.test.mjs")]],
  ["format.test.mjs", [path.join(here, "format.test.mjs")]],
  ["help.test.mjs", [path.join(here, "help.test.mjs")]],
  ["menu.test.mjs", [path.join(here, "menu.test.mjs")]],
  ["register.test.mjs", [path.join(here, "register.test.mjs")]],
  ["reply.test.js", [path.join(root, "patches", "prompt-queue", "tests", "reply.test.js")]],
  ["server.test.js", [path.join(here, "server.test.js")]],
  ["remote.test.js", [path.join(root, "patches", "prompt-queue", "tests", "remote.test.js")]],
  ["remote-item.test.js", [path.join(root, "patches", "prompt-queue", "tests", "remote-item.test.js")]],
  ["stops.test.js", [path.join(root, "patches", "prompt-queue", "tests", "stops.test.js")]],
  ["check-injected", [path.join(root, "tools", "check-injected.mjs"), "phone-queue"]],
  ["check-ps1", [path.join(root, "tools", "check-ps1.mjs")]],
  ["check-runtime", [path.join(root, "tools", "check-webview-runtime.mjs")]]
];

const NL = String.fromCharCode(10);
let bad = 0;
for (const [name, args] of jobs) {
  try {
    const out = execFileSync(process.execPath, args, { encoding: "utf8", cwd: root });
    const last = out.trim().split(NL).pop().trim();
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
