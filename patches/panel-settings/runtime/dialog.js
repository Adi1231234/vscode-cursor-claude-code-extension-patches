/* The settings dialog: the shared modal chrome from lib/js/ccModal.js with one
   group of toggle rows in it.

   The group is the app's own, measured off its Memory/Instructions dialog - the
   only place upstream puts preferences behind a dialog rather than in the
   command menu. One hairline group at radius 4, rows at 8px/12px divided by a
   1px --app-widget-border with none after the last, a 12px gap, the label at
   13px primary taking the width, an 11px secondary description under it, then
   the switch at the trailing edge. A row is built by runtime/row.js. */
var __ccSettingsOptions = [
    {
        name: "notifyOnFinish",
        label: "Notify when a run finishes",
        detail: "A Windows notification when Claude stops working. Stopping a run yourself never notifies."
    },
    {
        name: "skipWhenFocused",
        dependsOn: "notifyOnFinish",
        label: "Stay quiet while this window is focused",
        detail: "If the window Claude is running in is the focused one when a run ends, skip the notification."
    },
    {
        name: "waitForQueue",
        dependsOn: "notifyOnFinish",
        label: "Wait for the whole queue",
        detail: "With prompts still queued, stay quiet until the last one has run, rather than after each."
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
    __ccSettingsSyncDependents(group);
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

function __ccSettingsKbd(text) {
    var kbd = document.createElement("kbd");
    kbd.textContent = text;
    return kbd;
}
