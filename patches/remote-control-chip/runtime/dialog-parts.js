/* Plain-DOM builders for the dialog. Plain DOM on purpose: the chip is
   rendered by a call inside the footer's render, not by a component of our own,
   so there are no hooks to hold "dialog is open" in. A transient overlay owns
   its own lifetime instead. The shapes mirror the app's confirm dialogs:
   h3 title, a description with an inline pill, then a numbered option list. */
function __ccRcEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
}

function __ccRcDesc(copy) {
    var p = __ccRcEl("p", "cc-rc-desc");
    p.appendChild(document.createTextNode(copy.lead));
    p.appendChild(__ccRcEl("code", "cc-rc-pill", "claude.ai/code"));
    p.appendChild(document.createTextNode(copy.tail));
    return p;
}

/* An option row. "open" is a real anchor rather than a button so the webview
   hands the url to the browser the same way the app's own links do. */
function __ccRcOption(option, index, url) {
    var isLink = option.kind === "open";
    var el = __ccRcEl(isLink ? "a" : "button", "cc-rc-option");
    if (isLink) {
        el.href = url;
        el.target = "_blank";
        el.rel = "noreferrer";
    } else {
        el.type = "button";
    }
    el.appendChild(__ccRcEl("span", "cc-rc-option-key", String(index + 1)));
    el.appendChild(__ccRcEl("span", "cc-rc-option-label", option.label));
    return el;
}

/* The app marks the first option primary and highlights whichever row is
   selected; the two classes together are what makes the primary row stand out. */
function __ccRcSelect(rows, index) {
    rows.forEach(function (row, i) {
        var cls = "cc-rc-option" + (i === 0 ? " cc-rc-option-primary" : "");
        row.className = i === index ? cls + " cc-rc-option-selected" : cls;
    });
}
