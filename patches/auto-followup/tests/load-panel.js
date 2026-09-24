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
const LIB = path.resolve(__dirname, '..', '..', '..', 'lib', 'js') + '/';
const ROW = LIB + 'ccRow.js';
/* The shared compare-first writer every paint goes through. ccWatch, ccSession
   and ccClock are left out on purpose: the panel wires to them only when they
   exist, and a test drives the pass itself (see the splice below). */
const DOM = LIB + 'ccDom.js';
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
   spliced in at the one point the panel is fully built and has not been wired
   to anything yet - the Wiring section of runtime.js.

   A test drives the pass by hand with __tick(), the way it always has, so the
   splice also takes the scheduler and the one-shot wake-up out: the stubbed
   setTimeout runs its callback synchronously, and a scheduled pass would
   otherwise run in the middle of the step the test is making. What is tested is the pass; when it runs is the
   product's business (runtime.js, and the lab for the real thing). */
function loadPanel(expose) {
  eval(fs.readFileSync(ROW, 'utf8'));
  eval(fs.readFileSync(DOM, 'utf8'));
  /* The one clock (lib/js/ccClock.js) re-arms itself through setTimeout, which
     the stubs run synchronously - loading the real one would recurse. A clock
     that never ticks is what a test wants anyway: time moves when it says so. */
  window.__ccClock = window.__ccClock || { every: function () { return function () {}; } };
  const WIRE = '  /* ---------- Wiring ---------- */';
  const src = panelSource().replace(WIRE,
    '  globalThis.__t=' + expose + ';' + NL +
    '  globalThis.__tick=function(){ try { tick(); } catch (e) {} };' + NL +
    '  schedulePass=function(){}; wakeAt=function(){};' + NL + WIRE);
  if (src.indexOf('globalThis.__t=') < 0)
    throw new Error('load-panel: the splice point in runtime.js moved');
  eval(src);
  return globalThis.__t;
}

module.exports = { panelSource, loadPanel, AF };
