/* The webview runtime rules, checked on the sources.
 *
 * Every Claude panel in every editor window runs every injected script, and all
 * of them share ONE renderer thread (the panels are same-origin iframes, so
 * Chromium gives them one process). Measured on 2026-09-24 with 16 panels open,
 * that thread sat at 98% busy and every panel froze together; 67% of it was
 * work the patches started - a 300 ms and a 150 ms timer in every panel, and
 * four MutationObservers over the whole document waking each other.
 *
 * The fix is lib/js: state arrives as pushes (ccSession), DOM changes arrive
 * through one shared observer that drops what the patches did themselves
 * (ccWatch), writes land only on a real change (ccDom), and a clock on screen
 * gets the one clock (ccClock). This keeps it that way:
 *
 *   - no setInterval in webview code - periodic work is __ccClock.every, which
 *     runs only while something is subscribed and the panel is visible;
 *   - no MutationObserver outside lib/js/ccWatch.js - subscribe with
 *     __ccWatch.on instead.
 *
 * Webview code is every .js under lib/js and patches/, except host/ and tests/
 * folders. Host code runs in the extension host, not on the panels' thread.
 *
 * Usage: node tools/check-webview-runtime.mjs   (non-zero exit on a violation)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OBSERVER_HOME = "lib/js/ccWatch.js";

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "host" || e.name === "tests" || e.name === "node_modules") continue;
      walk(p, out);
    } else if (e.name.endsWith(".js")) {
      out.push(p);
    }
  }
  return out;
}

/* Code only: a rule stated in a comment ("it used to be a setInterval") is not
   a use of it. Strips block and line comments; strings are left alone, which is
   fine for these two patterns. */
function code(text) {
  const SLASH = String.fromCharCode(47);
  const block = new RegExp(SLASH + "[*][\\s\\S]*?[*]" + SLASH, "g");
  const line = new RegExp("(^|[^:])" + SLASH + SLASH + ".*$", "gm");
  return text.replace(block, "").replace(line, "$1");
}

export function webviewRuntimeViolations() {
  const files = [...walk(path.join(REPO, "lib", "js")), ...walk(path.join(REPO, "patches"))];
  const bad = [];
  for (const f of files) {
    const rel = path.relative(REPO, f).split(path.sep).join("/");
    const src = code(fs.readFileSync(f, "utf8"));
    src.split("\n").forEach((l, i) => {
      if (/\bsetInterval\s*\(/.test(l)) bad.push(`${rel}:${i + 1} setInterval - use __ccClock.every (lib/js/ccClock.js)`);
      if (/new\s+MutationObserver\b/.test(l) && rel !== OBSERVER_HOME) {
        bad.push(`${rel}:${i + 1} MutationObserver - subscribe with __ccWatch.on (lib/js/ccWatch.js)`);
      }
    });
  }
  return { files: files.length, bad };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { files, bad } = webviewRuntimeViolations();
  if (bad.length) {
    console.log(`  webview runtime: ${bad.length} violation(s) in ${files} files`);
    for (const b of bad) console.log(`    ${b}`);
    process.exit(1);
  }
  console.log(`  webview runtime: ok (${files} files, no setInterval, one MutationObserver)`);
}
