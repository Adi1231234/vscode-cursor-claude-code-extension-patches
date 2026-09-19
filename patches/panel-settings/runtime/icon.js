/* The gear, drawn to the footer row's own signature rather than to taste.

   Measured off the row's existing glyphs in this bundle: every one of them is a
   20-unit viewBox holding a 10-11 unit glyph with 1.0-unit walls and round
   caps - the "+" is exactly 10.0 x 10.0 between x5 and x15, the "/" command
   menu exactly 11.0 x 11.0 between 4.5 and 15.5, both with a 1.0 wall. This
   gear spans 4.5 to 15.5 too: a body circle at r=4.0 (so its 1.0 stroke spans
   3.5-4.5), eight teeth reaching r=5.0 whose round caps end at 5.5, and a
   hub at r=1.7.

   The app converts its walls to filled outlines; this one is a real stroke of
   the same 1.0 width, which paints identically at the 26px the row renders it
   at and keeps the path readable. The bundle's own Heroicons are deliberately
   not reused: they are 24-unit boxes at stroke-width 1.5, and the app only
   ever puts them inside menus and dialogs, never in this row. */
var __ccSettingsGlyphPath = [
    "M14 10A4 4 0 1 0 6 10A4 4 0 1 0 14 10Z",
    "M11.7 10A1.7 1.7 0 1 0 8.3 10A1.7 1.7 0 1 0 11.7 10Z",
    "M14 10L15 10",
    "M12.83 12.83L13.54 13.54",
    "M10 14L10 15",
    "M7.17 12.83L6.46 13.54",
    "M6 10L5 10",
    "M7.17 7.17L6.46 6.46",
    "M10 6L10 5",
    "M12.83 7.17L13.54 6.46"
].join("");

function __ccSettingsIcon(h) {
    return h("svg", {
        width: "20",
        height: "20",
        viewBox: "0 0 20 20",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        style: { display: "block" },
        children: h("path", {
            d: __ccSettingsGlyphPath,
            stroke: "currentColor",
            strokeWidth: "1",
            strokeLinecap: "round",
            strokeLinejoin: "round"
        })
    });
}

/* The same glyph as markup, for the dialog head's medallion - which takes
   innerHTML, not a vnode. One path, declared once above, so the two can never
   drift apart. */
function __ccSettingsIconMarkup() {
    return '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="' + __ccSettingsGlyphPath + '" stroke="currentColor" stroke-width="1" ' +
        'stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
