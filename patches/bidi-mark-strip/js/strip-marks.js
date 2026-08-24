/* BIDIMARKS */
// ALM / LRM / RLM - implicit marks: they only resolve the direction of the
// neutrals next to them and cannot reorder a run, so drop them instead of
// printing them. Built from code points so this file stays pure ASCII.
var __ccBidiMarks = new RegExp("[" + String.fromCharCode(0x61C, 0x200E, 0x200F) + "]", "g");
// The app's own class (overrides, embeddings, isolates) still gets escaped.
var __RPT__ = __CLASS__;
function __UC__(__E__) {
    if (typeof __E__ === "string")
        return __E__.replace(__ccBidiMarks, "").replace(__RPT__,
