
  /* ---------- "Show all": only where a clamp really hides something ---------- */

  /* Which of the row's IN / OUT blocks are cut by their clamp. Read in the
     pass (one layout read per changed row), written only on a real change. */
  function measure(row) {
    var any = false, open = row.hasAttribute("data-cc-open");
    row.querySelectorAll(CONTENT).forEach(function (c) {
      var cut = !open && c.scrollHeight > c.clientHeight + 1;
      window.__ccDom.setAttr(c, "data-cc-clip", cut);
      any = any || cut;
    });
    window.__ccDom.setAttr(row, "data-cc-clipped", any);
  }

  function label(row, b) {
    var out = row.querySelector(OUT_CONTENT);
    var n = out ? (out.textContent || "").split(NL).length : 0;
    window.__ccDom.setText(b, row.hasAttribute("data-cc-open") ? "Show less"
      : "Show all" + (n > 4 ? " · " + n + " lines" : ""));
  }

  function ensureMore(row) {
    if (!row.querySelector(CONTENT)) return;
    var b = row.querySelector(":scope > .__ccMore");
    if (!b) {
      b = document.createElement("button");
      b.type = "button";
      b.className = "__ccMore";
      window.__ccDom.own(b);
      /* A click the person makes: the height it changes is theirs to change. */
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        window.__ccDom.setAttr(row, "data-cc-open", !row.hasAttribute("data-cc-open"));
        measure(row);
        label(row, b);
      });
      row.appendChild(b);
    }
    measure(row);
    label(row, b);
  }
