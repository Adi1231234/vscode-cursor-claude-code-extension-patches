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

