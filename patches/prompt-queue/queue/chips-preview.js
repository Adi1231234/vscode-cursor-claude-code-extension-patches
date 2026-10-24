  /* ---------- Composer chips (live attachments in the box) ---------- */
  function chipEls() {
    var c = chipBox();   /* env-*.js: where this surface draws its chips */
    return c ? [].slice.call(c.children) : [];
  }

  function readChips() {
    return chipEls().map(function (chip) {
      var name = chipName(chip);
      var st = fileStore[name];
      var img = chip.querySelector("img");
      var du = img ? img.getAttribute("src") : null;
      if (du && du.indexOf("data:") !== 0) du = null;
      return { name: name, dataUrl: (st && st.dataUrl) || du, file: st ? st.file : null };
    }).filter(function (x) { return x.file || x.dataUrl; });
  }

  function hasUnmanagedChips() {
    return chipEls().some(function (chip) { return !fileStore[chipName(chip)]; });
  }

  async function clearChips() {
    var g = 0;
    while (g < 25) {
      var b = chipRemoveButton();
      if (!b) break;
      b.click();
      await delay(20);
      g++;
    }
  }

  /* ---------- Image preview overlay (in the surface's preview styles) ---------- */
  var pvClose = null;

  function openPreview(url, name) {
    if (pvClose) { pvClose(); pvClose = null; }
    var ov = el("div", PREVIEW.overlay);   /* env-*.js: this surface's preview classes */
    var cont = el("div", PREVIEW.box);
    var img = el("img", PREVIEW.image);
    img.src = url;
    img.alt = name || "";
    var x = btn(PREVIEW.close, "Close preview (Esc)");
    x.textContent = "\u2715";
    function close() {
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      document.removeEventListener("keydown", esc, true);
      pvClose = null;
    }
    function esc(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        close();
      }
    }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    x.addEventListener("click", function (e) { e.stopPropagation(); close(); });
    document.addEventListener("keydown", esc, true);
    cont.appendChild(img);
    cont.appendChild(x);
    ov.appendChild(cont);
    window.__ccDom.own(ov);   /* body-mounted UI of ours: wakes no observer */
    document.body.appendChild(ov);
    pvClose = close;
  }

