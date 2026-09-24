  /* ---------- DOM utilities ---------- */
  function el(tag, cls) {
    var x = document.createElement(tag);
    if (cls) x.className = cls;
    return x;
  }

  /* Compare-first, through lib/js/ccDom.js: a write of the same text is still a
     mutation, and it wakes every observer in the panel - see that file. */
  function txt(node, s) {
    window.__ccDom.setText(node, s);
    return node;
  }

  function on(node, ev, fn) {
    node.addEventListener(ev, function (e) {
      e.preventDefault();
      e.stopPropagation();
      fn(e);
    });
    return node;
  }


  /* A div with a click handler is invisible to a keyboard and to a screen reader.
     Every control in the dialog was one: the settings were spans, the responders
     in the rail were divs, and the close was a span - so the whole dialog could
     be opened and then not used without a mouse.

     press() is the one place that fixes it: the same handler on click and on
     Enter or Space, plus the role and the tab stop that make it announce itself.
     Space is preventDefault-ed because on a focused element it scrolls. */
  function press(node, fn, role) {
    node.setAttribute("role", role || "button");
    node.setAttribute("tabindex", "0");
    on(node, "click", fn);
    node.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
      e.preventDefault();
      e.stopPropagation();
      fn(e);
    });
    return node;
  }

  function icon(name) {
    var s = {
      loop: '<path d="M8 2.2a5.8 5.8 0 1 1-5.1 3"/><path d="M2.4 1.9v3.4h3.4"/><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/>',
      pencil: '<path d="M11.2 2.6 13.4 4.8 5.6 12.6 2.6 13.4 3.4 10.4z"/>',
      dot: '<circle cx="8" cy="8" r="3" fill="currentColor" stroke="none"/>'
    }[name] || "";
    return '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
           'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' + s + '</svg>';
  }

