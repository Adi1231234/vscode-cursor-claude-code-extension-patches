/* The settings dialog: the shared modal chrome from lib/js/ccModal.js with one
   group of toggle rows in it.

   The group is the app's own, measured off its Memory/Instructions dialog - the
   only place upstream puts preferences behind a dialog rather than in the
   command menu. One hairline group at radius 4, rows at 8px/12px divided by a
   1px --app-widget-border with none after the last, a 12px gap, the label at
   13px primary taking the width, an 11px secondary detail, then the switch at
   the trailing edge.

   Each row is a real <button role="switch" aria-checked>, which is the app's
   own accessible wrapper for that switch (it does the same on its plugin
   cards, because the switch itself is a pure visual with no semantics). A
   button also gets Enter, Space, focus and the shell's Tab trap for free,
   which is why there is no roving-focus code here. */
var __ccSettingsOptions = [
    {
        name: "notifyOnFinish",
        label: "Notify when a run finishes",
        detail: "A Windows notification when Claude stops working. Stopping a run yourself never notifies."
    }
];

function __ccSettingsDialog() {
    var shell = window.__ccModal({
        title: "Settings",
        sub: "Shared by every Claude panel in this window",
        label: "Settings",
        icon: __ccSettingsIconMarkup()
    });

    var group = document.createElement("div");
    group.className = "__ccSetGroup";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Settings");

    var values = __ccSettingsRead();
    __ccSettingsOptions.forEach(function (option) {
        group.appendChild(__ccSettingsRow(option, values[option.name]));
    });
    shell.box.appendChild(group);

    var keys = document.createElement("p");
    keys.className = "__ccSetKeys";
    keys.appendChild(__ccSettingsKbd("Space"));
    keys.appendChild(document.createTextNode(" to toggle · "));
    keys.appendChild(__ccSettingsKbd("Esc"));
    keys.appendChild(document.createTextNode(" to close"));
    shell.box.appendChild(keys);

    var close = document.createElement("button");
    close.type = "button";
    close.className = "__qBtnGhost";
    close.textContent = "Close";
    close.addEventListener("click", function () { shell.close(); });
    shell.foot.appendChild(close);

    shell.mount();
    var first = shell.box.querySelector(".__ccSetRow");
    if (first) first.focus();
}

function __ccSettingsRow(option, value) {
    var row = document.createElement("button");
    row.type = "button";
    row.className = "__ccSetRow";
    row.setAttribute("role", "switch");
    row.setAttribute("aria-checked", value ? "true" : "false");

    /* Label above description, stacked, rather than a short detail at the
       trailing edge. Both shapes exist in the app - the Memory dialog puts a
       one-word status after the label, the command menu stacks a sentence under
       it - and the second is the one upstream uses for its *own* settings
       toggles ("Focus view", "Thinking"). It is also the only one that holds up
       in a narrow panel: measured at 300px, a nowrap detail beside the label
       left it about 40px and wrapped it to three lines, 93px tall. */
    var text = document.createElement("span");
    text.className = "__ccSetText";

    var label = document.createElement("span");
    label.className = "__ccSetLabel";
    label.textContent = option.label;
    text.appendChild(label);

    if (option.detail) {
        var detail = document.createElement("span");
        detail.className = "__ccSetDetail";
        detail.textContent = option.detail;
        text.appendChild(detail);
    }
    row.appendChild(text);

    var track = document.createElement("span");
    track.className = "__ccSw" + (value ? " __ccSwOn" : "");
    var thumb = document.createElement("span");
    thumb.className = "__ccSwThumb";
    track.appendChild(thumb);
    row.appendChild(track);

    row.addEventListener("click", function () {
        var next = row.getAttribute("aria-checked") !== "true";
        /* Paint first, then store: the switch has a 150ms transition and
           waiting on localStorage before moving it makes the row feel like it
           did not take the click. A write that fails puts it straight back,
           which is the only honest thing to show. */
        __ccSettingsPaintRow(row, track, next);
        if (!__ccSettingsSet(option.name, next)) __ccSettingsPaintRow(row, track, !next);
    });
    return row;
}

function __ccSettingsPaintRow(row, track, on) {
    row.setAttribute("aria-checked", on ? "true" : "false");
    track.className = "__ccSw" + (on ? " __ccSwOn" : "");
}

function __ccSettingsKbd(text) {
    var kbd = document.createElement("kbd");
    kbd.textContent = text;
    return kbd;
}
