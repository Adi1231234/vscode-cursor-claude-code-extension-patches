"use strict";

// Reads an ASAR archive buffer: the JSON header and where each packed file's
// bytes live. Pure reader - it never mutates. The injector (asar-inject.cjs)
// rebuilds a new buffer from what this exposes.
//
// Layout (all little-endian): a Pickle wrapping a second Pickle that wraps the
// JSON header, then the file data region.
//   [0..3]  = 4            (size of the next UInt32 field)
//   [4..7]  = headerSize   (= 8 + align4(jsonSize))
//   [8..11] = headerSize-4 (the inner Pickle's payload size)
//   [12..15]= jsonSize     (actual JSON byte length)
//   [16..]  = JSON header, padded to a 4-byte boundary
//   data region starts at 8 + headerSize; each entry.offset is relative to it.

const align4 = n => Math.ceil(n / 4) * 4;

function readArchive(buf) {
    if (buf.length < 16) throw new Error("not an ASAR archive (too small)");
    if (buf.readUInt32LE(0) !== 4) throw new Error("bad ASAR pickle prefix");
    const headerSize = buf.readUInt32LE(4);
    const jsonSize = buf.readUInt32LE(12);
    if (buf.readUInt32LE(8) !== headerSize - 4) throw new Error("bad ASAR header length");
    if (headerSize !== 8 + align4(jsonSize)) throw new Error("bad ASAR header size");
    const header = JSON.parse(buf.subarray(16, 16 + jsonSize).toString("utf8"));
    return { buf, header, jsonSize, headerSize, dataStart: 8 + headerSize };
}

// Every packed file (has real bytes in the data region), depth-first. Skips
// directories, unpacked externals (bytes live outside the archive) and links.
function listFiles(arch) {
    const out = [];
    (function walk(node, prefix) {
        if (!node || typeof node.files !== "object") return;
        for (const name of Object.keys(node.files)) {
            const entry = node.files[name];
            const key = prefix + name;
            if (entry.files) walk(entry, key + "/");
            else if (!entry.unpacked && entry.link === undefined && entry.offset !== undefined) {
                out.push({ key, entry });
            }
        }
    })(arch.header, "");
    return out;
}

function fileBytes(arch, file) {
    const at = arch.dataStart + Number(file.entry.offset);
    return arch.buf.subarray(at, at + file.entry.size);
}

function mainEntryKey(arch) {
    try {
        const pkg = listFiles(arch).find(f => f.key === "package.json");
        if (pkg) {
            const main = JSON.parse(fileBytes(arch, pkg).toString("utf8")).main;
            if (typeof main === "string" && main) return main.replace(/\\/g, "/");
        }
    } catch { /* fall through to the known default */ }
    return ".vite/build/index.pre.js";
}

module.exports = { readArchive, listFiles, fileBytes, mainEntryKey, align4 };
