/* The gear, rendered from inside the input footer's own render.

   h       - the bundle's jsx factory
   session - the session store, handed straight to the run-finished watcher
   css     - the input-footer CSS-module map

   The button wears the app's own footerButton + footerButtonPrimary and
   nothing else, which is what every icon in that row already is: 26px tall,
   5px radius, the svg forced to 26x26, hover from the app's ghost background,
   and the full primary foreground rather than the row's dimmer label colour.
   The single declaration of ours zeroes `padding: 0 8px 0 0` - the gap that
   rule reserves between an icon and its text label, which on a button with no
   label is dead space that widens it and pushes the glyph off centre.

   Note what is deliberately NOT copied from patches/remote-control-chip: it
   reaches for css.footerButtonInactive, and that key does not exist in this
   bundle's module map, so it renders the literal string "undefined" as a class
   name. Every class named here was read back off the live map first.

   Wiring the watcher from a render looks odd, and is the point: the store is
   replaced whenever the conversation changes, and this render is the event
   that fires when it does. __ccSettingsWatch is a no-op on a store it has
   already seen, and defers its own subscription off the render pass. */
function __ccSettingsGear(h, session, css) {
    __ccSettingsWatch(session);
    return h("button", {
        type: "button",
        className: css.footerButton + " " + css.footerButtonPrimary + " cc-settings-gear",
        title: "Settings",
        "aria-label": "Settings",
        onClick: function (event) {
            event.preventDefault();
            __ccSettingsDialog();
        },
        children: __ccSettingsIcon(h)
    });
}
