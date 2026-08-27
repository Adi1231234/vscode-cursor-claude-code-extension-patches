#!/usr/bin/env node
/* Build a page that loads the REAL injected script into a REAL browser.
 *
 *   node patches/auto-followup/tests/browser/build.mjs
 *   npx http-server -p 8791   (or any static server on this folder)
 *   open http://127.0.0.1:8791/harness.html
 *
 * Why this exists. Every other test here drives the script against stubs written
 * alongside it, and a stub that models the assumption rather than the app proves
 * nothing - that is exactly how a dead lastAssistant() passed 120 checks. This
 * builds the script the way patch.ps1 does, with the class hashes taken from a
 * live panel, drops it into a DOM shaped like the real transcript, and lets a
 * browser decide.
 *
 * It must be served over http, not opened as a file: file: URLs are unique
 * origins and the postMessage the host bridge uses is dropped there, so the
 * responder list never arrives and the menu comes up empty.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const patch = join(here, '..', '..');
const repo = join(patch, '..', '..');

/* The same order patch.ps1 concatenates, and the same substitutions - with the
   hashes read out of a live panel over CDP rather than invented. */
const ORDER = ['config','bridge','claims','button','menu','lane','transcript','dialog',
               'dialog-form','dialog-foot','loop','runtime'];
const SUBS = {
  __NONCE__: 'testnonce',
  __MSG__: 'message_07S1Yg',
  __USERMSG__: 'userMessage_07S1Yg',
  __THINK__: 'thinking_aHyQPQ',
  __TOOLUSE__: 'toolUse_uq5aLg',
  __TOOLRES__: 'toolResult_uq5aLg',
};

let script = ORDER.map((f) => readFileSync(join(patch, 'af', `${f}.js`), 'utf8')).join('');
for (const [k, v] of Object.entries(SUBS)) script = script.split(k).join(v);
script = script.split('${testnonce}').join('testnonce');   /* the literal, evaluated */

const css = readFileSync(join(repo, 'patches', 'prompt-queue', 'queue.css'), 'utf8')
          + readFileSync(join(patch, 'followup.css'), 'utf8');

const page = readFileSync(join(here, 'harness.tmpl.html'), 'utf8')
  .replace('/*CSS*/', css)
  .replace('<!--SCRIPT-->', script);

writeFileSync(join(here, 'harness.html'), page);
console.log(`harness.html written: ${page.length} bytes (${ORDER.length} fragments)`);
