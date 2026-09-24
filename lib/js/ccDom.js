/* Shared webview runtime: DOM writes that land only when something changed.

   Every chat panel runs every injected script, and every panel in every editor
   window shares ONE renderer thread - the panels are same-origin iframes, so
   Chromium puts them in one process. Measured on 2026-09-24 with 16 panels
   open: a 2 s busy-loop in a panel of one window held a panel of another window
   for 2,058 ms. So per-panel work is multiplied by the number of panels, on the
   one thread they all type into.

   A write is a mutation even when it writes the value that is already there.
   It wakes every MutationObserver in that panel - the app's footer fitter
   among them, which answers a change in its row by re-measuring every
   descendant synchronously and moving the model pill twice - and a patch's own
   observers wake the next patch's. auto-followup rewrote its tooltip every
   300 ms whether it had changed or not, and that alone was 47% of the shared
   thread; removing only that write took the footer from 78 re-fits a second to
   one (A/B/A, live panels).

   So every write on a path that runs more than once goes through here and
   compares first.

   setText keeps the existing text node and changes its .data. That is a
   characterData record rather than a childList one, and the app's footer
   ignores characterData inside [data-footer-fixed-width] - which is exactly how
   its own countdown label updates without re-fitting the row. */
window.__ccDom = window.__ccDom || (function () {
  function setText(node, s) {
    if (!node) return node;
    var v = s == null ? "" : String(s);
    var f = node.firstChild;
    if (f && f === node.lastChild && f.nodeType === 3) {
      if (f.data !== v) f.data = v;
      return node;
    }
    if (node.textContent !== v) node.textContent = v;
    return node;
  }

  /* HTML elements only: on an SVG element className is an object, so the
     comparison never holds and the assignment does nothing. */
  function setClass(node, cls) {
    if (node && node.className !== cls) node.className = cls;
    return node;
  }

  /* classList.add / remove re-set the class attribute even when the token is
     already in the state asked for - per the DOM spec they always run their
     update steps - so the comparison has to happen here. */
  function toggle(node, cls, on) {
    if (!node || !node.classList) return node;
    var want = !!on;
    if (node.classList.contains(cls) !== want) node.classList.toggle(cls, want);
    return node;
  }

  /* null / false remove the attribute, true sets it empty. */
  function setAttr(node, name, v) {
    if (!node) return node;
    if (v == null || v === false) {
      if (node.hasAttribute(name)) node.removeAttribute(name);
      return node;
    }
    var s = v === true ? "" : String(v);
    if (node.getAttribute(name) !== s) node.setAttribute(name, s);
    return node;
  }

  /* prop is the dashed CSS name ("--p", "max-height", not "maxHeight"), and v
     should be written the way the browser stores it - a custom property, or a
     length with its unit. A value the browser rewrites ("#fff" becomes
     "rgb(255, 255, 255)") never compares equal, so every call would write. */
  function setStyle(node, prop, v) {
    if (!node || !node.style) return node;
    var s = v == null ? "" : String(v);
    if (node.style.getPropertyValue(prop) === s) return node;
    if (s) node.style.setProperty(prop, s);
    else node.style.removeProperty(prop);
    return node;
  }

  /* Ours, for the shared observer: lib/js/ccWatch.js drops every record that
     happens inside a node carrying this, and every record that only adds or
     removes such nodes. Put it on the root of whatever a patch injects. */
  function own(node) {
    return setAttr(node, "data-cc", true);
  }

  /* The app's own footer contract (read off its fitter, nW0 in 2.1.280):
       [data-footer-overlay]      nothing inside it counts as a change to the
                                  row - its own hover popup carries it.
       [data-footer-fixed-width]  a text change inside it does not count - its
                                  own countdown label carries it, and remounts
                                  the label when the text changes length. Only
                                  for a box whose width is really fixed.
     Anything else that changes inside the footer makes the app re-fit the row. */
  function overlay(node) {
    return setAttr(node, "data-footer-overlay", true);
  }

  function fixedWidth(node) {
    return setAttr(node, "data-footer-fixed-width", true);
  }

  return {
    setText: setText, setClass: setClass, toggle: toggle, setAttr: setAttr,
    setStyle: setStyle, own: own, overlay: overlay, fixedWidth: fixedWidth
  };
})();
