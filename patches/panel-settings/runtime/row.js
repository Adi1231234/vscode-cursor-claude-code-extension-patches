/* One toggle row, and the rule that makes a row depend on another.

   Each row is a real <button role="switch" aria-checked>, which is the app's
   own accessible wrapper for its switch (it does the same on its plugin cards,
   because the switch itself is a pure visual with no semantics). A button also
   gets Enter, Space, focus and the shell's Tab trap for free, which is why
   there is no roving-focus code here.

   A row that declares `dependsOn` is only meaningful while that other setting
   is on, so when it is off the row is disabled outright rather than left
   looking live: a switch you can move that changes nothing is worse than one
   you cannot. Disabled is the native attribute, so the row also drops out of
   the shell's focusables() and out of the Tab order, and it wears the app's own
   locked look - opacity .5, default cursor - which is what upstream puts on its
   own locked toggle row. */
function __ccSettingsRow(option, value) {
    var row = document.createElement("button");
    row.type = "button";
    row.className = "__ccSetRow";
    row.setAttribute("role", "switch");
    row.setAttribute("aria-checked", value ? "true" : "false");
    row.setAttribute("data-setting", option.name);
    if (option.dependsOn) row.setAttribute("data-depends-on", option.dependsOn);

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
        __ccSettingsPaintRow(row, next);
        if (!__ccSettingsSet(option.name, next)) __ccSettingsPaintRow(row, !next);
        __ccSettingsSyncDependents(row.parentNode);
    });
    return row;
}

function __ccSettingsPaintRow(row, on) {
    var track = row.querySelector(".__ccSw");
    row.setAttribute("aria-checked", on ? "true" : "false");
    if (track) track.className = "__ccSw" + (on ? " __ccSwOn" : "");
}

/* Run after any toggle, and once when the dialog opens. */
function __ccSettingsSyncDependents(group) {
    if (!group || !group.querySelectorAll) return;
    var rows = group.querySelectorAll("[data-depends-on]");
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var parent = group.querySelector('[data-setting="' + row.getAttribute("data-depends-on") + '"]');
        var live = !parent || parent.getAttribute("aria-checked") === "true";
        row.disabled = !live;
        row.className = "__ccSetRow" + (live ? "" : " __ccSetRowOff");
    }
}
