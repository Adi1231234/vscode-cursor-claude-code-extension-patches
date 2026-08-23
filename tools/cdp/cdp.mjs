#!/usr/bin/env node
/* CLI over the CDP port an editor was started with (see the root CLAUDE.md for
   how to open one).

     node tools/cdp/cdp.mjs list
     node tools/cdp/cdp.mjs eval <window-substring> <script.js>
     node tools/cdp/cdp.mjs reload <window-substring>
     node tools/cdp/cdp.mjs command <window-substring> "<palette title>" [--dry]

   `eval` runs the file in the Claude panel of the matching window, as if the
   code were written in the panel itself. The file is one expression - wrap
   anything longer in (async () => { ... })(). Whatever it returns is printed
   as JSON.

   `reload` is a real `Developer: Reload Window` (not a renderer reload - see
   palette.mjs), then waits for the panel to come back. Run it after patching a
   bundle under a running editor. */

import { readFileSync } from 'node:fs';
import { targets } from './client.mjs';
import { claudePanels, evalInPanel, waitForPanel } from './panels.mjs';
import { runCommand } from './palette.mjs';

const argv = process.argv.slice(2);
const portArg = argv.indexOf('--port');
const PORT = portArg >= 0 ? argv.splice(portArg, 2)[1] : process.env.CDP_PORT || 9333;
const dry = argv.includes('--dry');
const [cmd, ...rest] = argv.filter((a) => a !== '--dry');

function usage(msg) {
  if (msg) console.error(msg);
  console.error('usage: cdp.mjs list [--port N]');
  console.error('       cdp.mjs eval <window-substring> <script.js> [--port N]');
  console.error('       cdp.mjs reload <window-substring> [--port N]');
  console.error('       cdp.mjs command <window-substring> "<palette title>" [--dry] [--port N]');
  process.exit(msg ? 1 : 0);
}

/* One entry per candidate, or a refusal that lists them - the same rule for
   windows and for panels, so an ambiguous substring never picks for you. */
function pick(candidates, needle, what) {
  if (!needle) usage(`${what} needs a window substring`);
  const hits = candidates.filter((c) => c.key === needle || c.label.toLowerCase().includes(needle.toLowerCase()));
  if (!hits.length) usage(`no ${what} matching "${needle}"`);
  if (hits.length > 1) {
    usage(`"${needle}" matches ${hits.length}:\n  ` +
      hits.map((h) => `${h.label}\t${h.key}`).join('\n  ') + '\npass one of the ids instead');
  }
  return hits[0].value;
}

const reachable = (e) => usage(`cannot reach a CDP port on ${PORT}: ${e.message}`);

if (cmd === 'reload' || cmd === 'command') {
  const all = await targets(PORT).catch(reachable);
  const pages = all.filter((t) => t.type === 'page' && t.title)
    .map((t) => ({ key: t.id, label: t.title, value: t }));
  const page = pick(pages, rest[0], 'window');
  const title = cmd === 'reload' ? 'Developer: Reload Window' : rest[1];
  if (!title) usage('command needs a palette title');

  const r = await runCommand(page, title, { commit: !dry });
  console.log(JSON.stringify(r, null, 1));
  if (!r.ok) process.exit(1);
  if (cmd === 'reload' && r.ran) {
    const back = await waitForPanel(PORT, page.title);
    console.log(back ? `panel back: ${page.title}\t${back.target.id}` : 'panel did not come back in time');
    process.exit(back ? 0 : 1);
  }
  process.exit(0);
}

const panels = await claudePanels(PORT).catch(reachable);

if (cmd === 'list') {
  if (!panels.length) console.log('no Claude panels found (open one, or check the port)');
  for (const p of panels) console.log(`${p.window}\t${p.target.id}`);
  process.exit(0);
}

if (cmd !== 'eval') usage(cmd ? `unknown command: ${cmd}` : null);

const [needle, file] = rest;
if (!file) usage('eval needs a window substring and a script file');
const target = pick(panels.map((p) => ({ key: p.target.id, label: p.window, value: p.target })), needle, 'Claude panel');

const result = await evalInPanel(target, readFileSync(file, 'utf8'));
console.log(JSON.stringify(result, null, 1));
process.exit(result && result.__error ? 1 : 0);
