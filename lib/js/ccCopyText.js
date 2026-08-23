  /* ---------- Shared clipboard helper (lib/js/ccCopyText.js) ----------
     window.__ccCopyText(text) -> Promise. Defined once, then reused by every
     injected webview script that copies something; pulled into a patch's
     fragment list with Get-LibJsPath (see lib/Patch.ps1).
     clipboard.writeText is granted in the webview, but it rejects when the
     document is not focused - hence the execCommand fallback. */
  if (!window.__ccCopyText) {
    window.__ccCopyText = function (text) {
      function legacy() {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } finally { document.body.removeChild(ta); }
        return Promise.resolve();
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).catch(legacy);
      }
      return legacy();
    };
  }
