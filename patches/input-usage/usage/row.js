  var D = window.__ccDom;
  var box = null, line = null;

  /* The composer box: the bordered fieldset around the input and its footer.
     Cached while it is in the document; a conversation switch remounts it. */
  function composer() {
    if (box && box.isConnected) return box;
    var inp = globalThis.__ccInput ? globalThis.__ccInput() : null;
    box = inp ? inp.closest("fieldset") : null;
    return box;
  }

  function makeLine() {
    var el = document.createElement("div");
    el.className = "cc-usage-line";
    D.own(el);
    el.appendChild(document.createElement("span"));
    return el;
  }

  /* The line as the box's last child, below the footer row. React appends a
     node it mounts later after ours, so the line is moved back only when that
     actually happened - an append of a node already last is still a mutation. */
  function placeLine() {
    var b = composer();
    if (!b) return null;
    if (!line) line = makeLine();
    if (b.lastElementChild !== line) b.appendChild(line);
    return line;
  }

  function showLine(text) {
    if (text === null) {
      if (line) D.setAttr(line, "hidden", true);
      return;
    }
    var el = placeLine();
    if (!el) return;
    D.setText(el.firstChild, text);
    D.setAttr(el, "hidden", false);
  }
