"use strict";

// Assembles the two payloads apply.ps1 injects: the renderer (prepended to the
// Code tab's preload) and the main-process one. Every piece is a real .js or
// .css file; this only orders them, turns each stylesheet into one
// __ccd.style() call, and fills the build-time tokens.
//
// A patch folder gives its pieces one of three ways:
//   renderer.json  - run a webview patch from the parent repo as is: its
//                    fragment list and stylesheet list are read from there,
//                    with named fragments swapped for desktop ones
//   renderer.order - an ordered list of this folder's own fragments
//   renderer.js    - a single file
// (main.order / main.js the same, for the main process.)

const fs = require("node:fs");
const path = require("node:path");

const DESK = path.join(__dirname, "..");
const REPO = path.join(DESK, "..");
const SEP = "\n;\n";

const read = p => fs.readFileSync(p, "utf8");
const fromRepo = rel => read(path.join(REPO, rel));
const listFile = p => read(p).split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));

// The runtime every patch stands on, in load order.
const RUNTIME = [
    "desktop/lib/js/boot.js",
    "lib/js/ccDom.js",
    "lib/js/ccWatch.js",
    "desktop/lib/js/ipc.js",
    "desktop/lib/js/rows.js",
    "desktop/lib/js/session.js",
];

function styleCall(rel) {
    const id = rel.replace(/^.*\//, "").replace(/\.css$/, "");
    return "window.__ccd.style(" + JSON.stringify(id) + ", " + JSON.stringify(fromRepo(rel)) + ");";
}

// A parent-repo patch, run here: its fragments with the swaps applied, after
// its stylesheets. A swap naming a fragment the list no longer has is a stale
// config, and it stops the build rather than ship the VS Code piece.
function sharedPatch(cfg) {
    const base = JSON.parse(fromRepo(cfg.fragments));
    for (const key of Object.keys(cfg.swap || {})) {
        if (!base.includes(key)) throw new Error("renderer.json swaps " + key + ", which " + cfg.fragments + " no longer lists");
    }
    const files = base.flatMap(f => (cfg.swap && cfg.swap[f]) || [f]);
    const styles = JSON.parse(fromRepo(cfg.styles)).map(s => s.path).concat(cfg.extraStyles || []);
    return styles.map(styleCall).concat(files.map(fromRepo));
}

function patchParts(dir, kind) {
    const json = path.join(dir, kind + ".json");
    const order = path.join(dir, kind + ".order");
    const single = path.join(dir, kind + ".js");
    if (fs.existsSync(json)) return sharedPatch(JSON.parse(read(json)));
    if (fs.existsSync(order)) return listFile(order).map(f => read(path.join(dir, f)));
    if (fs.existsSync(single)) return [read(single)];
    return [];
}

// The prefix the preload puts before every claude.web channel name. It carries
// a per-build uuid; exactly one distinct value must be there.
function webChannel(mainViewText) {
    const found = new Set();
    const rx = /"(\$eipc_message\$_[0-9a-f-]{36}_\$_claude\.web_\$_)"/g;
    let m;
    while ((m = rx.exec(mainViewText))) found.add(m[1]);
    return found.size === 1 ? [...found][0] : null;
}

function build({ mainViewText, skip = [], stamp }) {
    const names = JSON.parse(read(path.join(DESK, "patches", "order.json"))).filter(n => !skip.includes(n));
    const renderer = RUNTIME.map(fromRepo);
    const main = [];
    for (const name of names) {
        const dir = path.join(DESK, "patches", name);
        renderer.push(...patchParts(dir, "renderer"));
        main.push(...patchParts(dir, "main"));
    }
    const channel = webChannel(mainViewText || "");
    let rendererText = renderer.join(SEP).split("__CCD_VERSION__").join(stamp);
    if (channel) rendererText = rendererText.split("__CCD_WEB_CHANNEL__").join(channel);
    return { renderer: rendererText, main: main.join(SEP), patches: names, channel };
}

module.exports = { build, webChannel };
