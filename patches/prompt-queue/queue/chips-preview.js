  /* ---------- Composer chips (live attachments in the box) ---------- */
  function chipEls() {
    var c = qs('[class*="attachedFilesContainer"]');
    return c ? [].slice.call(c.children) : [];
  }

  function chipName(chip) {
    var lbl = chip.querySelector('[class*="label"]');
    return (lbl && (lbl.getAttribute("title") || lbl.textContent)) || "file";
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
      var b = qs('[class*="attachedFilesContainer"] [class*="removeButton"]');
      if (!b) break;
      b.click();
      await delay(20);
      g++;
    }
  }

  /* ---------- Image preview overlay (reuses the app's preview styles) ---------- */
  var pvClose = null;

  function openPreview(url, name) {
    if (pvClose) { pvClose(); pvClose = null; }
    var ov = el("div", "previewOverlay_" + PVH);
    var cont = el("div", "previewContainer_" + PVH);
    var img = el("img", "previewImage_" + PVH);
    img.src = url;
    img.alt = name || "";
    var x = btn("previewCloseButton_" + PVH, "Close preview (Esc)");
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
    document.body.appendChild(ov);
    pvClose = close;
  }

