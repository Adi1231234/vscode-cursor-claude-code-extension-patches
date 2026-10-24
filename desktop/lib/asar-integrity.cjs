"use strict";

// SHA-256 block integrity for ASAR entries, in Electron's own format:
// a whole-file hash plus one hash per `blockSize` chunk. Electron recomputes
// this on load and refuses a file whose record does not match, so a patched
// file must carry a freshly computed record (see asar-inject.cjs).

const crypto = require("node:crypto");

const sha256 = buf => crypto.createHash("sha256").update(buf).digest("hex");

// Electron's default when it writes integrity; we reuse an entry's own
// blockSize when it has one, and fall back to this for anything new.
const DEFAULT_BLOCK_SIZE = 4 * 1024 * 1024;

function blocksOf(buf, blockSize) {
    const blocks = [];
    for (let at = 0; at < buf.length; at += blockSize) {
        blocks.push(sha256(buf.subarray(at, Math.min(at + blockSize, buf.length))));
    }
    return blocks;
}

function integrityOf(buf, blockSize = DEFAULT_BLOCK_SIZE) {
    return {
        algorithm: "SHA256",
        hash: sha256(buf),
        blockSize,
        blocks: blocksOf(buf, blockSize),
    };
}

module.exports = { integrityOf, sha256, DEFAULT_BLOCK_SIZE };
