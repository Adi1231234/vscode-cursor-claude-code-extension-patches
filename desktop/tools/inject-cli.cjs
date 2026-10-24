"use strict";

// Writes our payloads into an installed app.asar, in place. Always injects from
// the pristine archive: the first run backs it up to <app.asar>.ccorig, and
// every run reads that backup as the source, so changing a payload and
// re-applying replaces the old injection instead of stacking on it.
//
//   node inject-cli.cjs <app.asar> <renderer.js|-> <main.js|-> <marker>

const fs = require("node:fs");
const path = require("node:path");
const { patchAsar } = require(path.join(__dirname, "..", "lib", "asar-inject.cjs"));

const [asarPath, rendererPath, mainPath, marker] = process.argv.slice(2);
if (!asarPath || !marker) {
    console.error("usage: inject-cli.cjs <app.asar> <renderer.js|-> <main.js|-> <marker>");
    process.exit(2);
}

const readText = p => (p && p !== "-" && fs.existsSync(p)) ? fs.readFileSync(p, "utf8") : "";
const renderer = readText(rendererPath);
const main = readText(mainPath);

const bak = asarPath + ".ccorig";
let source;
if (fs.existsSync(bak)) {
    source = fs.readFileSync(bak);
} else {
    source = fs.readFileSync(asarPath);
    fs.writeFileSync(bak, source);
}

const report = patchAsar(source, renderer, main, marker);
fs.writeFileSync(asarPath, report.buf);
console.log(JSON.stringify({
    main: report.main,
    renderer: report.renderer,
    mainKey: report.mainKey,
    size: report.buf.length,
    pristineSize: source.length,
}));
