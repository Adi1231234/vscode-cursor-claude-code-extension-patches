/* The queue panel's styling, injected once as an owned <style>. Colours are all
   color-mix over currentColor and the app's own radius token, so it follows the
   theme and never hardcodes a value. */
(function () {
    var ID = "ccd-queue-style";
    if (document.getElementById(ID)) return;
    var css =
        ".ccd-q{margin:0 0 6px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);" +
        "border-radius:var(--cds-radius,8px);font:400 12px/1.4 inherit;overflow:hidden}" +
        ".ccd-q[hidden]{display:none}" +
        ".ccd-q-head{display:flex;align-items:center;gap:8px;padding:4px 8px;" +
        "color:color-mix(in srgb,currentColor 60%,transparent)}" +
        ".ccd-q-title{flex:1;font-weight:500}" +
        ".ccd-q-rows{display:flex;flex-direction:column;max-height:40vh;overflow-y:auto}" +
        ".ccd-q-row{display:flex;align-items:center;gap:6px;padding:3px 8px;" +
        "border-top:1px solid color-mix(in srgb,currentColor 8%,transparent)}" +
        ".ccd-q-row:hover{background:color-mix(in srgb,currentColor 7%,transparent)}" +
        ".ccd-q-num{flex:0 0 auto;font-variant-numeric:tabular-nums;" +
        "color:color-mix(in srgb,currentColor 45%,transparent)}" +
        ".ccd-q-text{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
        ".ccd-q-btn{flex:0 0 auto;cursor:pointer;border:0;background:none;padding:2px 5px;" +
        "border-radius:4px;font:inherit;line-height:1;color:color-mix(in srgb,currentColor 55%,transparent)}" +
        ".ccd-q-btn:hover{background:color-mix(in srgb,currentColor 12%,transparent);" +
        "color:color-mix(in srgb,currentColor 85%,transparent)}" +
        ".ccd-q.paused .ccd-q-title::after{content:' (paused)';opacity:.7}";
    var st = document.createElement("style");
    st.id = ID;
    st.textContent = css;
    __ccDom.own(st);
    (document.head || document.documentElement).appendChild(st);
})();
