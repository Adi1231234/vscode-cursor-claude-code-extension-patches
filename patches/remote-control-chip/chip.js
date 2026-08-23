function __ccRcIcon(h) {
    return h("svg", {
        width: "20",
        height: "20",
        viewBox: "0 0 20 20",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        "aria-hidden": "true",
        children: [
            h("path", {
                "fill-rule": "evenodd",
                "clip-rule": "evenodd",
                fill: "currentColor",
                d: "M4.6 3.4h4.4A1.6 1.6 0 0 1 10.6 5v10A1.6 1.6 0 0 1 9 16.6H4.6A1.6 1.6 0 0 1 3 15V5a1.6 1.6 0 0 1 1.6-1.6Z" +
                    "M4.6 4.6a.4.4 0 0 0-.4.4v10c0 .22.18.4.4.4H9a.4.4 0 0 0 .4-.4V5a.4.4 0 0 0-.4-.4H4.6Z" +
                    "M5.7 5.8h2.2a.55.55 0 0 1 0 1.1H5.7a.55.55 0 0 1 0-1.1Z"
            }, "body"),
            h("path", {
                stroke: "currentColor",
                "stroke-width": "1.4",
                "stroke-linecap": "round",
                fill: "none",
                d: "M12.6 7.4a4.2 4.2 0 0 1 0 5.2M15 5.6a7 7 0 0 1 0 8.8"
            }, "waves")
        ]
    });
}

function __ccRcTitle(state) {
    if (state.status === "connecting") return "Connecting to claude.ai/code…";
    if (state.status === "error") return "Remote Control error: " + state.error + " · click to disconnect";
    return "Remote Control is active · continue here, on your phone, or at claude.ai/code · click to disconnect";
}

function __ccRcChip(h, session, css) {
    var state = session.remoteControlState.value;
    if (!state || state.status === "disconnected") return null;
    var title = __ccRcTitle(state);
    return h("button", {
        type: "button",
        className: css.footerButton + " cc-rc-chip",
        "data-rc-state": state.status,
        title: title,
        "aria-label": title,
        onClick: function (event) {
            event.preventDefault();
            session.toggleRemoteControl();
        },
        children: __ccRcIcon(h)
    });
}
