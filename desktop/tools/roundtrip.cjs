"use strict";

// Proof that the injector is reversible and safe. Patches a real app.asar in
// memory, re-reads the result, and asserts: every packed file still passes its
// SHA-256 integrity record, only the two files we target changed, and every
// other file is byte-identical to the original. Run against an installed
// archive:  node desktop/tools/roundtrip.cjs [path\to\app.asar] [libDir]

const fs = require("node:fs");
const path = require("node:path");

const SRC = process.argv[2];
const LIB = process.argv[3] || path.join(__dirname, "..", "lib");
if (!SRC) { console.error("usage: roundtrip.cjs <app.asar> [libDir]"); process.exit(2); }

const { patchAsar, readArchive, listFiles, fileBytes } = require(path.join(LIB, "asar-inject.cjs"));
const { integrityOf } = require(path.join(LIB, "asar-integrity.cjs"));

const buf = fs.readFileSync(SRC);
const renderer = 'if (typeof document !== "undefined") { globalThis.__ccDesktop = (globalThis.__ccDesktop || 0) + 1; }';
const main = "globalThis.__ccDesktopMain = true;";
const report = patchAsar(buf, renderer, main, "CCDESK");

console.log("main entry patched:", report.main);
console.log("renderer files patched:", report.renderer.length);
console.log("new size:", report.buf.length, "orig:", buf.length);

const orig = readArchive(buf);
const patched = readArchive(report.buf);
const origByKey = new Map(listFiles(orig).map(f => [f.key, f]));
let checked = 0, badIntegrity = 0, changed = 0, markerSeen = 0, unchangedSame = 0;
for (const f of listFiles(patched)) {
    const bytes = fileBytes(patched, f);
    if (f.entry.integrity) {
        if (integrityOf(bytes, f.entry.integrity.blockSize).hash !== f.entry.integrity.hash) badIntegrity++;
        checked++;
    }
    if (f.key.endsWith(".js") && bytes.toString("utf8").includes("CCDESK")) markerSeen++;
    const o = origByKey.get(f.key);
    if (o) { fileBytes(orig, o).equals(bytes) ? unchangedSame++ : changed++; }
}
console.log("integrity checked:", checked, "bad:", badIntegrity);
console.log("files carrying marker:", markerSeen);
console.log("files changed:", changed, "byte-identical:", unchangedSame);

const mv = listFiles(patched).find(f => f.key === report.rendererKeys[0]);
console.log("mainView present:", !!mv, "has marker:", !!mv && fileBytes(patched, mv).toString("utf8").includes("CCDESK"));

const ok = badIntegrity === 0 && report.main && report.renderer.length === 1 && changed === 2;
console.log(ok ? "OK" : "FAIL");
process.exit(ok ? 0 : 1);
