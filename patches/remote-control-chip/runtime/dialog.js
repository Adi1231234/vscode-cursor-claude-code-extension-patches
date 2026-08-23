/* The dialog the chip opens. It exists so that clicking a one-glyph status icon
   never silently drops the connection: what the icon means is stated, and the
   destructive action is a named button next to a Close. */
function __ccRcDialog(state, onConfirm) {
    if (document.querySelector(".cc-rc-overlay")) return;
    var copy = __ccRcCopyFor(state);
    var overlay = __ccRcEl("div", "cc-rc-overlay");
    var dialog = __ccRcEl("div", "cc-rc-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.appendChild(__ccRcEl("h2", "cc-rc-dialog-title", copy.title));
    dialog.appendChild(__ccRcEl("p", "cc-rc-dialog-body", copy.body));
    if (state.sessionUrl) dialog.appendChild(__ccRcLink(state.sessionUrl));

    function close() {
        document.removeEventListener("keydown", onKeyDown, true);
        overlay.remove();
    }

    function onKeyDown(event) {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        close();
    }

    var actions = __ccRcActions(close, function () {
        close();
        onConfirm();
    }, copy.action);
    dialog.appendChild(actions.row);
    dialog.addEventListener("click", function (event) { event.stopPropagation(); });
    overlay.addEventListener("click", close);
    document.addEventListener("keydown", onKeyDown, true);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    actions.cancel.focus();
}
