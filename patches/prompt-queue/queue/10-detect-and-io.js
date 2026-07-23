  /* ---------- Busy detection (signal first, placeholder fallback) ---------- */
  function isBusy() {
    var s = getSession();
    if (s && s.busy && typeof s.busy.value === "boolean") return s.busy.value;
    var e = inp();
    if (!e) return false;
    return (e.getAttribute("data-placeholder") || "").indexOf(BUSY) === 0;
  }

  /* ---------- File attachments ---------- */
  var fileStore = {};

  function hookFileReader() {
    try {
      var FR = window.FileReader;
      if (!FR || !FR.prototype || FR.prototype.__qHook) return;
      var orig = FR.prototype.readAsDataURL;
      FR.prototype.readAsDataURL = function (blob) {
        try {
          if (blob && blob.name) {
            var self = this;
            this.addEventListener("load", function () {
              try { fileStore[blob.name] = { file: blob, dataUrl: self.result }; } catch (e) {}
            }, { once: true });
          }
        } catch (e) {}
        return orig.apply(this, arguments);
      };
      FR.prototype.__qHook = 1;
    } catch (e) {}
  }

  function fileToDataUrl(f) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = rej;
      r.readAsDataURL(f);
    });
  }

  async function buildFiles(items) {
    var out = [];
    for (var i = 0; i < (items || []).length; i++) {
      var it = items[i], du = it.dataUrl, file = it.file;
      if (!du && file) {
        try { du = await fileToDataUrl(file); } catch (e) {}
      }
      if (du && !file) {
        try {
          var bl = await (await fetch(du)).blob();
          file = new File([bl], it.name || "file", { type: bl.type });
        } catch (e) {}
      }
      if (du && file) out.push({ file: file, dataUrl: du });
    }
    return out;
  }

  async function reattachToComposer(files) {
    var e = inp();
    if (!e || !files.length) return;
    var dt = new DataTransfer();
    files.forEach(function (f) { dt.items.add(f.file); });
    e.focus();
    e.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }));
    var g = 0;
    while (g < 50) {
      var c = qs('[class*="attachedFilesContainer"]');
      if (c && c.children.length >= files.length) break;
      await delay(15);
      g++;
    }
  }

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

