/* The chip itself, called from inside the input footer's render.
   h       - the bundle's jsx factory
   session - the session store (remoteControlState + toggleRemoteControl)
   css     - the input-footer CSS-module map; the chip wears the app's own
             footerButton / footerButtonPrimary / footerButtonInactive so it
             sits in the row as one of its buttons, not as a foreign badge. */
function __ccRcChipClass(css, status) {
    var cls = css.footerButton + " cc-rc-chip";
    if (status === "connected") return cls + " " + css.footerButtonPrimary;
    if (status === "connecting") return cls + " " + css.footerButtonInactive;
    return cls;
}

function __ccRcChip(h, session, css) {
    var state = session.remoteControlState.value;
    if (!state || state.status === "disconnected") return null;
    var copy = __ccRcCopyFor(state);
    return h("button", {
        type: "button",
        className: __ccRcChipClass(css, state.status),
        "data-rc-state": state.status,
        "data-cc-tip": copy.tip,
        "aria-label": copy.tip,
        onClick: function (event) {
            event.preventDefault();
            __ccRcDialog(state, function () {
                session.toggleRemoteControl();
            });
        },
        children: __ccRcIcon(h)
    });
}
