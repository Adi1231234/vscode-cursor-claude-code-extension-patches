/* PANELRESTARTBTN */
/*
 * "Restart Claude" in the panel header, immediately left of Session history.
 *
 * It is the app's own header icon button (__BUTTON__ = the component the two
 * neighbours use), at the same iconSize, so size, hover, focus ring and the
 * title/aria wiring come from upstream rather than from us.
 *
 * The glyph is drawn on the clock icon's geometry: centre 10,10, a filled
 * annulus between r=6.5 and r=7.5 - a 1px ring, identical in weight to the
 * neighbouring Session history icon - swept 293 degrees clockwise from 65 to
 * 132 degrees, closed by an arrowhead whose base sits across that same ring
 * end and whose tip runs on to 108 degrees, leaving the gap at the top.
 *
 * The click posts straight down the existing webview -> host channel; the host
 * side (see js/host-reload.js) re-renders this panel's html.
 */
__FACTORY__(__BUTTON__, {
    ariaLabel: "Restart Claude",
    iconSize: 20,
    onClick: () => {
        const connection = __CONTEXT__.comms.connection.value;
        if (connection) connection.send({
            type: "ccReloadPanel",
            sessionId: __STORE__.activeSession.value?.sessionId.value
        });
    },
    children: __FACTORY__("svg", {
        width: "20",
        height: "20",
        viewBox: "0 0 20 20",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        style: { display: "block" },
        "aria-hidden": "true",
        children: __FACTORY__("path", {
            d: "M13.1696 3.2027A7.5 7.5 0 1 1 4.9815 4.4264L5.6506 5.1696A6.5 6.5 0 1 0 12.747 4.109ZM3.576 2.866L7.837 3.343L7.056 6.73Z",
            fill: "currentColor"
        })
    })
}),
