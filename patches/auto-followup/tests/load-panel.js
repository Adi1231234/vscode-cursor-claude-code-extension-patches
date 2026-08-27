/* Assembles the injected panel script the way patch.ps1 does, and evaluates it.
 *
 * This existed three times, character for character, in loop.test.js, in
 * ui.test.js and in the end-to-end run. Three copies of an assembly step means
 * three chances for a test to be measuring a bundle the product never ships.
 *
 * Not shared with browser/build.mjs on purpose: that one substitutes the real
 * webview hashes, keeps the IIFE wrapper and emits a page. This one substitutes
 * stable stand-ins and evaluates in this process.
 *
 * Requires dom-stubs.js to have been loaded first.
 */
const fs = require('fs'), path = require('path');

const AF = path.resolve(__dirname, '..', 'af') + '/';
const ROW = path.resolve(__dirname, '..', '..', '..', 'lib', 'js', 'ccRow.js');
const NL = String.fromCharCode(10);
const CR = String.fromCharCode(13);

function panelSource() {
  const order = JSON.parse(fs.readFileSync(AF + 'order.json', 'utf8'));
  let src = order.map((f) => fs.readFileSync(AF + f + '.js', 'utf8')).join('')
    .split(CR + NL).join(NL);
  src = src.split('/* AUTOFOLLOWUP */').join('').split('</scr' + 'ipt>').join('');
  src = src.replace(/^[\s\S]*?\(function\(\)\{/, '(function(){');
  return src.split('__MSG__').join('message_X')
            .split('__USERMSG__').join('userMessage_X')
            .split('__THINK__').join('thinking_X')
            .split('__TOOLUSE__').join('toolUse_X')
            .split('__TOOLRES__').join('toolResult_X');
}

/* expose: the source of an object literal of internals the caller needs. It is
   spliced in at the one point the panel is fully built and has not started
   ticking yet, which is the line that asks the host for the list. */
function loadPanel(expose) {
  eval(fs.readFileSync(ROW, 'utf8'));
  const src = panelSource().replace(
    '  setInterval(',
    '  globalThis.__t=' + expose + ';' + NL + '  setInterval(');
  if (src.indexOf('globalThis.__t=') < 0)
    throw new Error('load-panel: the splice point in runtime.js moved');
  eval(src);
  return globalThis.__t;
}

module.exports = { panelSource, loadPanel, AF };
