"use strict";

// Builds the payloads for one install and writes them to a folder.
//
//   node build.cjs <app.asar> <out-dir> [skip,list]
//
// Reads the preload out of the pristine archive (the .ccorig backup once
// inject-cli has made one), so the channel prefix is the shipped one. Writes
// renderer.js, and main.js when any patch has a main-process part.

const fs = require("node:fs");
const path = require("node:path");
const A = require(path.join(__dirname, "..", "lib", "asar-container.cjs"));
const { build } = require(path.join(__dirname, "..", "lib", "build.cjs"));

const [asarPath, outDir, skipCsv] = process.argv.slice(2);
if (!asarPath || !outDir) {
    console.error("usage: build.cjs <app.asar> <out-dir> [skip,list]");
    process.exit(2);
}

const source = fs.existsSync(asarPath + ".ccorig") ? asarPath + ".ccorig" : asarPath;
const arch = A.readArchive(fs.readFileSync(source));
const preload = A.listFiles(arch).find(f => f.key === ".vite/build/mainView.js");
const mainViewText = preload ? A.fileBytes(arch, preload).toString("utf8") : "";

const stamp = new Date().toISOString().slice(0, 16) + "Z";
const out = build({ mainViewText, skip: (skipCsv || "").split(",").filter(Boolean), stamp });

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "renderer.js"), out.renderer);
const mainFile = path.join(outDir, "main.js");
if (out.main.trim()) fs.writeFileSync(mainFile, out.main);
else if (fs.existsSync(mainFile)) fs.unlinkSync(mainFile);

console.log(JSON.stringify({ patches: out.patches, channel: !!out.channel, rendererBytes: out.renderer.length, mainBytes: out.main.length }));
if (!out.channel) console.error("warning: the preload's claude.web channel prefix was not found; the event stream stays unwired (DOM-only)");
