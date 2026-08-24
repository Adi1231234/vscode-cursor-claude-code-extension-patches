/* The chip itself, called from inside the input footer's render.
   h       - the bundle's jsx factory
   session - the session store (remoteControlState + toggleRemoteControl)
   css     - the input-footer CSS-module map; the chip wears the app's own
             footerButton and nothing else, so it is the same size, colour and
             hover as the "+" and "/" beside it. Only the colour differs, and
             only by state - green connected, pulsing while connecting, red on
             error - which is `data-rc-state` plus three rules in the
             stylesheet, never a class the app does not have.

   The chip is permanent. With Remote Control off it stays in the row wearing
   the app's own footerButtonInactive (opacity .5, full on hover) - the same
   class the file-selection button wears when nothing is attached - and one
   click turns Remote Control on, the way that button attaches on one click.
   Only the destructive direction goes through the dialog. */
function __ccRcChip(h, session, css) {
    var state = session.remoteControlState.value || { status: "disconnected" };
    var off = state.status === "disconnected";
    var copy = __ccRcCopyFor(state);
    return h("button", {
        type: "button",
        className: css.footerButton + (off ? " " + css.footerButtonInactive : "") + " cc-rc-chip",
        "data-rc-state": state.status,
        "data-cc-tip": copy.tip,
        "aria-label": copy.tip,
        onClick: function (event) {
            event.preventDefault();
            if (off) return void session.toggleRemoteControl();
            __ccRcDialog(state, function () {
                session.toggleRemoteControl();
            });
        },
        children: __ccRcIcon(h)
    });
}
