/* The ladder's decisions, the cut measure and the row's tail, without a browser.
 *     node patches/footer-fit/tests/fold.test.js
 * The layout itself is checked in tools/lab (see the README's Verified section);
 * this pins the logic that drives it. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const here = __dirname;
const root = path.resolve(here, "..", "..", "..");
let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) passed++;
  else { failed++; console.log("  FAIL " + msg); }
}

class HTMLElement {
  constructor(o) { Object.assign(this, { style: {}, children: [], attrs: {}, sw: 0, cw: 0 }, o); }
  get scrollWidth() { return this.sw; }
  get clientWidth() { return this.cw; }
  getAttribute(k) { return this.attrs[k]; }
  hasAttribute(k) { return k in this.attrs; }
  querySelector() { return null; }
  querySelectorAll() { return this.all || []; }
  getClientRects() { return this.shown === false ? [] : [{}]; }
  matches(sel) { return !!this.cls && sel === "." + this.cls; }
}

function load(files, extra) {
  const ctx = Object.assign({ HTMLElement, document: { querySelectorAll: () => [] } }, extra);
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  return ctx;
}

/* ---- the ladder ---- */
const rt = "patches/footer-fit/runtime/";
const L = load([rt + "cut.js", rt + "fold.js"]);
const F = L.__ccFold;
/* Our buttons carry data-cc-fold; the app's items are named by class (the
   placeholders patch.ps1 fills, left as they are here). */
let orders = [], app = [], isCut = true;
L.document.querySelectorAll = () => [{ children:
  orders.map((n) => new HTMLElement({ attrs: { "data-cc-fold": String(n) } }))
    .concat(app.map((c) => new HTMLElement({ cls: c }))) }];
L.__ccFoldCut = () => isCut;

ok(F.stage(0) === 0 && F.stage(2) === 2 && F.stage(9) === 2, "the app never sees a stage past 2");
ok(F.rungs(2) === undefined, "no rung at the app's own top: the attribute is left off");
ok(F.next(2) === 3, "compact is the first rung");
isCut = false;
ok(F.next(2) === 3, "compact is taken on the app's word alone, cut or not");
ok(F.next(3) === 3, "past compact, an ellipsis alone stops the climb");
isCut = true;
orders = [2, 3, 4, 5];
ok(F.next(3) === 5, "the next rung skips a fold order nobody has (no log button) - got " + F.next(3));
ok(F.rungs(5) === "compact fold-1 fold-2", "a rung folds every order up to it - got " + F.rungs(5));
ok(F.next(5) === 6 && F.next(6) === 7 && F.next(7) === 8, "one order per rung after that");
ok(F.next(8) === 13 && /^compact fold-1 .* fold-9 wrap$/.test(F.rungs(13)),
  "with none of the app's items showing, then the row wraps - got " + F.next(8));
ok(F.next(13) === 13, "wrap is the top: nothing left to try");
app = ["__CACHE__", "__PILL__", "__SLASH__"];
ok(F.next(8) === 9, "the app's items fold after ours: the cache clock first - got " + F.next(8));
ok(F.next(9) === 11, "an absent agents pill is skipped - got " + F.next(9));
ok(F.next(11) === 12 && F.rungs(12).indexOf("fold-9") > 0, "the \"/\" button folds last");
ok(F.next(12) === 13, "and only then does the row wrap");
orders = []; app = [];
ok(F.next(3) === 13, "with nothing to fold, straight to wrap");

/* ---- the cut measure ---- */
const C = load([rt + "cut.js"]);
const styles = new Map();
const win = { HTMLElement, getComputedStyle: (el) => styles.get(el) || { position: "static", textOverflow: "clip", fontSize: "12px" } };
const row = (all, sw, cw) => new HTMLElement({ all, sw: sw || 300, cw: cw || 300, ownerDocument: { defaultView: win } });
const el = (o, st) => { const e = new HTMLElement(o); e.parentElement = null; if (st) styles.set(e, Object.assign({ position: "static", fontSize: "12px" }, st)); return e; };

ok(!C.__ccFoldCut(row([el({ sw: 26, cw: 26 })])), "nothing overflowing is no cut");
ok(C.__ccFoldCut(row([], 320, 300)), "the row running past its own box is a cut");
ok(C.__ccFoldCut(row([el({ sw: 26, cw: 9 })])), "a glyph pushed out of a squeezed button is a cut");
ok(!C.__ccFoldCut(row([el({ sw: 141, cw: 60 }, { textOverflow: "ellipsis" })])), "a label ellipsised above 4em is not");
ok(C.__ccFoldCut(row([el({ sw: 141, cw: 40 }, { textOverflow: "ellipsis" })])), "a label squeezed under 4em is");
ok(!C.__ccFoldCut(row([el({ sw: 260, cw: 26 }, { position: "absolute" })])), "an absolute box (a popup) is not measured");
const host = el({ sw: 90, cw: 26 });
host.querySelector = (s) => s.indexOf("data-footer-overlay") >= 0 ? {} : null;
ok(!C.__ccFoldCut(row([host])), "a box carrying its own tooltip overlay is left out, as the app does");

/* ---- ccRow: the order ends in front of the tail group ---- */
function node(cls, attrs) {
  return { className: cls, attrs: attrs || {}, parentNode: null,
    hasAttribute(k) { return k in this.attrs; },
    get previousElementSibling() { const k = this.parentNode.children; const i = k.indexOf(this); return i > 0 ? k[i - 1] : null; } };
}
const R = load(["lib/js/ccRow.js"]).__ccRow;
R.rank("__afBtn", 10); R.rank("__qAdd", 40);
const parent = { children: [], insertBefore(n, ref) {
  const k = this.children.filter((x) => x !== n); k.splice(k.indexOf(ref), 0, n); this.children = k; n.parentNode = this; } };
const send = node("sendButton"), more = node("cc-more", { "data-cc-tail": "" });
const qAdd = node("__qAdd"), af = node("__afBtn");
for (const n of [qAdd, more, af, send]) { n.parentNode = parent; parent.children.push(n); }
R.place(parent, send);
ok(parent.children.map((n) => n.className).join(" ") === "__afBtn __qAdd cc-more sendButton",
  "ranked buttons land before the overflow button, not between it and send - got " + parent.children.map((n) => n.className).join(" "));

/* ---- the stand-in for a folded button's own popup ---- */
const M = load([rt + "cut.js", rt + "fold.js", rt + "menu-items.js", rt + "menu.js", rt + "more.js"]).__ccFold;
const moreBtn = new HTMLElement({});
const folded = new HTMLElement({ shown: false, closest: () => ({ querySelector: () => moreBtn }) });
const shown = new HTMLElement({});
ok(M.standIn(folded) === moreBtn, "a folded button's popup hangs from the overflow button");
ok(M.standIn(shown) === shown, "a button on screen keeps its own anchor");

console.log(failed ? failed + " failed, " + passed + " passed" : passed + " passed");
process.exit(failed ? 1 : 0);
