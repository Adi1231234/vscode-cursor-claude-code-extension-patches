/* BIDIMARKS */
// ALM / LRM / RLM - implicit marks: they only resolve the direction of the
// neutrals next to them and cannot reorder a run, so drop them instead of
// printing them. Built from code points so this file stays pure ASCII.
var __ccBidiMarks = new RegExp("[" + String.fromCharCode(0x61C, 0x200E, 0x200F) + "]", "g");
// The app's own class (overrides, embeddings, isolates) still gets escaped.
//
// The last line re-emits verbatim whatever the app puts between that class and
// the .replace() which consumes it - a recursive function body up to 2.1.268, a
// deep-map callback from 2.1.269 on - and only slips the strip in front of the
// receiver. The two have to stay on ONE line: the 2.1.268 shape ends in a bare
// `return`, and a line break after it would be closed by ASI.
var __RPT__ = __CLASS__;__MID____RECV__.replace(__ccBidiMarks, "").replace(__RPT__,
