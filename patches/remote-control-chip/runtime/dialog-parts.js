/* Plain-DOM builders for the confirm dialog. Plain DOM on purpose: the chip is
   rendered by a call inside the footer's render, not by a component of our own,
   so there are no hooks to hold "dialog is open" in. A transient overlay owns
   its own lifetime instead. */
function __ccRcEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
}

function __ccRcLink(url) {
    var link = __ccRcEl("a", "cc-rc-dialog-link", "claude.ai/code");
    link.href = url;
    link.target = "_blank";
    link.rel = "noreferrer";
    return link;
}

function __ccRcActions(onCancel, onConfirm, confirmLabel) {
    var row = __ccRcEl("div", "cc-rc-dialog-actions");
    var cancel = __ccRcEl("button", "cc-rc-cancel", "Close");
    var confirm = __ccRcEl("button", "cc-rc-confirm", confirmLabel);
    cancel.type = "button";
    confirm.type = "button";
    cancel.addEventListener("click", onCancel);
    confirm.addEventListener("click", onConfirm);
    row.appendChild(cancel);
    row.appendChild(confirm);
    return { row: row, cancel: cancel };
}
