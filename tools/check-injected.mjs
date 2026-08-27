/* Check an injected webview script the way the browser will actually receive it.
 *
 * Every webview <script> in this repo is written into the bundle inside a
 * template literal, so the literal is evaluated before the browser parses the
 * script: a "\n" written in a fragment arrives as a real newline and breaks the
 * string it sits in, and a regex escape like \d silently loses its backslash and
 * changes what the pattern matches.
 *
 * Neither is visible to `node --check` of the fragment or of the patched
 * extension.js - both still hold the two-character \n. Only evaluating the
 * template literal first shows it. CLAUDE.md states the rule; this runs it.
 *
 * Usage:
 *   node tools/check-injected.mjs <patch-name>
 *   node tools/check-injected.mjs --all
 *
 * Exit code is non-zero when any fragment loses an escape or fails to parse.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* The ordered fragment lists, mirroring what each patch.ps1 concatenates. A
   patch whose script is a single file needs no entry. */
const SCRIPTS = {
  "prompt-queue": {
    dir: "patches/prompt-queue/queue/",
    order: ["config-dom", "log", "session", "busy-files", "chips-preview", "persist",
            "debug", "model", "schedule-lib", "schedule-clock", "add-button",
            "schedule-modal", "render-panel", "row-menu", "render-rows",
            "resize-input", "stop-pause", "flush-init"]
  },
  "auto-followup": {
    dir: "patches/auto-followup/af/",
    order: ["config", "bridge", "claims", "button", "menu", "lane", "dialog",
            "dialog-form", "dialog-foot", "loop", "runtime"]
  }
};

const BS = String.fromCharCode(92);

/* Every backslash that is not a \u escape. Written with charCodeAt rather than a
   regex so this checker is not itself an example of the problem it looks for. */
function offenders(text, file) {
  const out = [];
  const lines = text.split(String.fromCharCode(10));
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    for (let i = 0; i < line.length - 1; i++) {
      if (line[i] !== BS) continue;
      if (line[i + 1] === "u") { i++; continue; }
      out.push({ file, line: n + 1, esc: BS + line[i + 1], text: line.trim().slice(0, 90) });
      i++;
    }
  }
  return out;
}

function check(name) {
  const spec = SCRIPTS[name];
  if (!spec) { console.log(`  ${name}: no fragment list registered, skipped`); return true; }

  let bad = [];
  let src = "";
  for (const f of spec.order) {
    const p = path.join(root, spec.dir, f + ".js");
    const text = fs.readFileSync(p, "utf8");
    bad = bad.concat(offenders(text, f + ".js"));
    src += text;
  }

  /* Placeholders stand in for the values patch.ps1 substitutes; the value does
     not matter, only that the literal parses. A placeholder inside ${...} has to
     lose the braces too, or evaluating the literal interpolates an undefined
     name instead of testing the escapes. Substituting a same-length token keeps
     the character count honest, since that count is the actual test. */
  const filled = src.replace(/\$\{(__[A-Z]+__)\}/g, (m, t) => "x".repeat(m.length))
                    .replace(/__[A-Z]+__/g, (m) => "x".repeat(m.length));
  let evaluated;
  try {
    evaluated = eval("`" + filled.split("`").join(BS + "`") + "`");
  } catch (e) {
    console.log(`  ${name}: the template literal itself does not parse - ${e.message}`);
    return false;
  }

  const eaten = filled.length - evaluated.length;
  const body = evaluated.slice(evaluated.indexOf(">") + 1)
                        .split("</" + "script>").join("");
  let parses = true;
  try {
    new Function(body);
  } catch (e) {
    parses = false;
    console.log(`  ${name}: the evaluated script does not parse - ${e.message}`);
  }

  for (const b of bad) {
    console.log(`  ${name}: ${b.file}:${b.line} uses ${b.esc} - ${b.text}`);
  }
  /* Characters legitimately disappear here: a unicode escape is the one form the
     rule allows and it collapses to a single glyph, so prompt-queue loses over a
     thousand of them to its icons. The count is reported and never failed on -
     the offender scan above is the actual test. */
  const ok = parses && bad.length === 0;
  const note = eaten ? `, ${eaten} ch to unicode escapes` : "";
  console.log(`  ${name}: ${ok ? "ok" : "FAILED"} (${spec.order.length} fragments, ${src.length} bytes${note})`);
  return ok;
}

const args = process.argv.slice(2);
const names = args.length && args[0] !== "--all" ? args : Object.keys(SCRIPTS);
let allOk = true;
for (const n of names) allOk = check(n) && allOk;
process.exit(allOk ? 0 : 1);
