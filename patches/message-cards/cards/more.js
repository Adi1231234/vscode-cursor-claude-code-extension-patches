
  /* ---------- "Show all": only where a clamp really hides something ---------- */

  /* Which of the row's IN / OUT blocks their clamp cuts - reads only. The
     pass reads every row before it writes to any (observe.js): a write between
     two of these reads makes the second one lay the whole panel out again,
     which on a long conversation was one ~8ms style pass per command row. */
  function cuts(row) {
    var open = row.hasAttribute("data-cc-open");
    return Array.from(row.querySelectorAll(CONTENT)).map(function (c) {
      return { el: c, cut: !open && c.scrollHeight > c.clientHeight + 1 };
    });
  }

  /* ...and the marks that say so - writes only, and only on a real change. */
  function mark(row, list) {
    var any = false;
    list.forEach(function (x) {
      window.__ccDom.setAttr(x.el, "data-cc-clip", x.cut);
      any = any || x.cut;
    });
    window.__ccDom.setAttr(row, "data-cc-clipped", any);
  }

  function label(row, b) {
    var out = row.querySelector(OUT_CONTENT);
    var n = out ? (out.textContent || "").split(NL).length : 0;
    window.__ccDom.setText(b, row.hasAttribute("data-cc-open") ? "Show less"
      : "Show all" + (n > 4 ? " · " + n + " lines" : ""));
  }

  /* The button is made only for a row whose clamp really cuts something:
     every node put into a row makes Blink re-check the app's :has() rules on
     it, and most commands print a few lines that fit. */
  function ensureMore(row, list) {
    var b = row.querySelector(":scope > .__ccMore");
    if (!b && !list.some(function (x) { return x.cut; })) return;
    if (!b) {
      b = document.createElement("button");
      b.type = "button";
      b.className = "__ccMore";
      window.__ccDom.own(b);
      /* A click the person makes: the height it changes is theirs to change,
         and one row read once costs one layout. */
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        window.__ccDom.setAttr(row, "data-cc-open", !row.hasAttribute("data-cc-open"));
        mark(row, cuts(row));
        label(row, b);
      });
      row.appendChild(b);
    }
    mark(row, list);
    label(row, b);
  }
