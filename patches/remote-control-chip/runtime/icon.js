/* A phone with signal waves, drawn to the app's own footer-icon metrics:
   an 11-unit glyph in a 20-unit box with 1.0-unit strokes, the same as the
   bundle's "/" command-menu icon. Anything heavier reads as a foreign icon. */
function __ccRcIcon(h) {
    return h("svg", {
        width: "20",
        height: "20",
        viewBox: "0 0 20 20",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        "aria-hidden": "true",
        style: { display: "block" },
        children: [
            h("path", {
                "fill-rule": "evenodd",
                "clip-rule": "evenodd",
                fill: "currentColor",
                d: "M5 4.5h4A1.5 1.5 0 0 1 10.5 6v8A1.5 1.5 0 0 1 9 15.5H5A1.5 1.5 0 0 1 3.5 14V6A1.5 1.5 0 0 1 5 4.5Z" +
                    "M5 5.5a.5.5 0 0 0-.5.5v8c0 .276.224.5.5.5h4a.5.5 0 0 0 .5-.5V6a.5.5 0 0 0-.5-.5H5Z" +
                    "M5.9 6.8h2.2a.5.5 0 0 1 0 1H5.9a.5.5 0 0 1 0-1Z"
            }, "body"),
            h("path", {
                stroke: "currentColor",
                "stroke-width": "1",
                "stroke-linecap": "round",
                fill: "none",
                d: "M12.2 7.7a3.2 3.2 0 0 1 0 4.6M13.9 6.6a5 5 0 0 1 0 6.8"
            }, "waves")
        ]
    });
}
