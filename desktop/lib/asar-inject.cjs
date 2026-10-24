"use strict";

// In-place ASAR patcher: prepends our renderer payload to the Code-tab preload
// and our main payload to the main entry, then rebuilds the archive with fresh
// offsets and integrity. Only the two changed files move; every other packed
// file is streamed across byte-identical and unpacked externals keep their
// header records, so native modules stay out of the archive.

const { readArchive, listFiles, fileBytes, mainEntryKey, align4 } = require("./asar-container.cjs");
const { integrityOf } = require("./asar-integrity.cjs");

const STRICT_RE = /^\s*("use strict"|'use strict')\s*;/;
const NL = String.fromCharCode(10);

// The preload that runs inside the claude.ai Code-tab page (DOM access), and
// the main-process entry. Defaults; a caller may override via opts.
const PRELOAD_KEY = ".vite/build/mainView.js";

function prepend(text, payload, marker) {
    if (text.indexOf("/* " + marker + " */") !== -1) return { text, injected: false };
    const block = "/* " + marker + " */" + NL + payload + NL + "/* " + marker + " END */" + NL;
    const m = STRICT_RE.exec(text);
    const out = m
        ? text.slice(0, m[0].length) + NL + block + text.slice(m[0].length)
        : block + text;
    return { text: out, injected: true };
}

function patchAsar(buf, rendererPayload, mainPayload, marker, opts = {}) {
    const src = readArchive(buf);
    const clone = { ...src, header: JSON.parse(JSON.stringify(src.header)) };
    const mainKey = opts.mainKey || mainEntryKey(src);
    const rendererKeys = new Set(opts.rendererKeys || [PRELOAD_KEY]);
    const report = { main: false, renderer: [], mainKey, rendererKeys: [...rendererKeys] };

    // Identical files share one data-region offset in the archive (asar dedups
    // them). Group by original offset so each shared blob is emitted once and
    // all its entries point back at it - otherwise every patch re-duplicates
    // megabytes of shared assets. Our two targets are unique files, never shared.
    const groups = new Map();
    for (const f of listFiles(clone)) {
        const off = String(f.entry.offset);
        (groups.get(off) || groups.set(off, []).get(off)).push(f);
    }
    const offsets = [...groups.keys()].sort((a, b) => Number(a) - Number(b));

    const chunks = [];
    let cursor = 0;
    for (const off of offsets) {
        const group = groups.get(off);
        let bytes = fileBytes(src, group[0]);
        if (group.length === 1) {
            const f = group[0];
            if (f.key === mainKey && mainPayload) {
                const r = prepend(bytes.toString("utf8"), mainPayload, marker);
                if (r.injected) { bytes = Buffer.from(r.text, "utf8"); report.main = true; }
            } else if (rendererKeys.has(f.key) && rendererPayload) {
                const r = prepend(bytes.toString("utf8"), rendererPayload, marker);
                if (r.injected) { bytes = Buffer.from(r.text, "utf8"); report.renderer.push(f.key); }
            }
        }
        for (const f of group) {
            f.entry.offset = String(cursor);
            f.entry.size = bytes.length;
            if (f.entry.integrity) f.entry.integrity = integrityOf(bytes, f.entry.integrity.blockSize);
        }
        chunks.push(bytes);
        cursor += bytes.length;
    }

    const json = Buffer.from(JSON.stringify(clone.header), "utf8");
    const padded = align4(json.length);
    const head = Buffer.alloc(16 + padded);
    head.writeUInt32LE(4, 0);
    head.writeUInt32LE(8 + padded, 4);
    head.writeUInt32LE(4 + padded, 8);
    head.writeUInt32LE(json.length, 12);
    json.copy(head, 16);
    report.buf = Buffer.concat([head, ...chunks]);
    return report;
}

module.exports = { patchAsar, readArchive, listFiles, fileBytes, mainEntryKey, PRELOAD_KEY };
