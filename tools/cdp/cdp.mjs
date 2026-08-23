#!/usr/bin/env node
/* CLI over the CDP port an editor was started with (see the root CLAUDE.md for
   how to open one).

     node tools/cdp/cdp.mjs list
     node tools/cdp/cdp.mjs eval <window-substring> <script.js>

   `eval` runs the file in the Claude panel of the matching window, as if the
   code were written in the panel itself. The file is one expression - wrap
   anything longer in (async () => { ... })(). Whatever it returns is printed
   as JSON. */

import { readFileSync } from 'node:fs';
import { claudePanels, evalInPanel } from './panels.mjs';

const argv = process.argv.slice(2);
const portArg = argv.indexOf('--port');
const PORT = portArg >= 0 ? argv.splice(portArg, 2)[1] : process.env.CDP_PORT || 9333;
const [cmd, ...rest] = argv;

function usage(msg) {
  if (msg) console.error(msg);
  console.error('usage: cdp.mjs list [--port N]');
  console.error('       cdp.mjs eval <window-substring> <script.js> [--port N]');
  process.exit(msg ? 1 : 0);
}

const panels = await claudePanels(PORT).catch((e) => {
  usage(`cannot reach a CDP port on ${PORT}: ${e.message}`);
});

if (cmd === 'list') {
  if (!panels.length) console.log('no Claude panels found (open one, or check the port)');
  for (const p of panels) console.log(`${p.window}\t${p.target.id}`);
  process.exit(0);
}

if (cmd !== 'eval') usage(cmd ? `unknown command: ${cmd}` : null);

const [needle, file] = rest;
if (!needle || !file) usage('eval needs a window substring and a script file');

const hits = panels.filter(
  (p) => p.target.id === needle || p.window.toLowerCase().includes(needle.toLowerCase()),
);
if (!hits.length) usage(`no Claude panel in a window matching "${needle}"`);
if (hits.length > 1) {
  usage(`"${needle}" matches ${hits.length} panels:\n  ` +
    hits.map((h) => `${h.window}\t${h.target.id}`).join('\n  ') +
    '\npass one of the target ids instead');
}

const result = await evalInPanel(hits[0].target, readFileSync(file, 'utf8'));
console.log(JSON.stringify(result, null, 1));
process.exit(result && result.__error ? 1 : 0);
