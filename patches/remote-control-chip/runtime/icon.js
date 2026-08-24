/* A phone with one signal arc, drawn to the metrics the bundle's own footer
   icons use: a ~10-unit glyph centred in the 20-unit box with 1.0-unit strokes
   (the "/" command-menu icon is 11x11, the "+" is 10x10, the permission bolt is
   8x10). Anything bigger crowds the 26px hover square and reads as a foreign
   badge rather than one of the row's buttons. */
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
                d: "M6.5 5h4A1.4 1.4 0 0 1 11.9 6.4v7.2A1.4 1.4 0 0 1 10.5 15h-4A1.4 1.4 0 0 1 5.1 13.6V6.4A1.4 1.4 0 0 1 6.5 5Z" +
                    "M6.5 6a.4.4 0 0 0-.4.4v7.2c0 .22.18.4.4.4h4a.4.4 0 0 0 .4-.4V6.4a.4.4 0 0 0-.4-.4h-4Z" +
                    "M7.5 7h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1Z"
            }, "body"),
            h("path", {
                stroke: "currentColor",
                "stroke-width": "1",
                "stroke-linecap": "round",
                fill: "none",
                d: "M13.6 7.9a3.2 3.2 0 0 1 0 4.2"
            }, "wave")
        ]
    });
}
