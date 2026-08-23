/* The chip itself, called from inside the input footer's render.
   h       - the bundle's jsx factory
   session - the session store (remoteControlState + toggleRemoteControl)
   css     - the input-footer CSS-module map; the chip wears the app's own
             footerButton and nothing else, so it is the same size, colour and
             hover as the "+" and "/" beside it. Connected gets no emphasis on
             purpose: the chip only exists while Remote Control is on, so its
             presence is the signal. The connecting pulse and the error tint
             are the only deviations, and both live in the stylesheet. */
function __ccRcChip(h, session, css) {
    var state = session.remoteControlState.value;
    if (!state || state.status === "disconnected") return null;
    var copy = __ccRcCopyFor(state);
    return h("button", {
        type: "button",
        className: css.footerButton + " cc-rc-chip",
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
