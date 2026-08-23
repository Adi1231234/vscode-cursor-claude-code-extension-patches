/* The dialog the chip opens. It exists so that clicking a one-glyph status icon
   never silently drops the connection: what the icon means is stated, and every
   action is a named row. Keyboard behaviour is the app's: Escape backs out, the
   number keys pick a row, the arrows move the selection, Enter runs it. */
function __ccRcDialog(state, onDisconnect) {
    if (document.querySelector(".cc-rc-overlay")) return;
    var copy = __ccRcCopyFor(state);
    var options = copy.options.filter(function (o) {
        return o.kind !== "open" || state.sessionUrl;
    });

    var overlay = __ccRcEl("div", "cc-rc-overlay");
    var dialog = __ccRcEl("div", "cc-rc-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.appendChild(__ccRcEl("h3", "cc-rc-title", copy.title));
    dialog.appendChild(__ccRcDesc(copy));

    var list = __ccRcEl("div", "cc-rc-options");
    var selected = 0;
    var rows = options.map(function (option, index) {
        var row = __ccRcOption(option, index, state.sessionUrl);
        row.addEventListener("mousemove", function () {
            selected = index;
            __ccRcSelect(rows, selected);
        });
        row.addEventListener("click", function () {
            /* The "open" row is an anchor: let its own navigation run first,
               then tear the overlay down, so removing it cannot cancel the
               default action mid-dispatch. */
            if (option.kind === "open") return void setTimeout(close, 0);
            close();
            if (option.kind === "disconnect") onDisconnect();
        });
        list.appendChild(row);
        return row;
    });
    dialog.appendChild(list);

    function close() {
        document.removeEventListener("keydown", onKeyDown, true);
        overlay.remove();
    }

    function onKeyDown(event) {
        var digit = Number(event.key);
        if (event.key === "Escape") {
            close();
        } else if (event.key === "Enter") {
            rows[selected].click();
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            var step = event.key === "ArrowDown" ? 1 : rows.length - 1;
            selected = (selected + step) % rows.length;
            __ccRcSelect(rows, selected);
        } else if (digit >= 1 && digit <= rows.length) {
            rows[digit - 1].click();
        } else {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
    }

    dialog.addEventListener("click", function (event) { event.stopPropagation(); });
    overlay.addEventListener("click", close);
    document.addEventListener("keydown", onKeyDown, true);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    __ccRcSelect(rows, selected);
    rows[0].focus();
}
