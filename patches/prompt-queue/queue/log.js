  /* ---------- In-webview logger + viewer (safe: no host bridge, no api wrap) ----------
     ccLog(tag, ...args) buffers to an in-memory ring (2000) mirrored to
     localStorage so logs survive reloads. A modal (the log button by the send
     button) shows them - screenshot/copy it. Deliberately touches nothing
     special: wrapping acquireVsCodeApi or injecting a full logger broke the
     Cursor webview, so this stays minimal. */
  /* NOTE: do NOT touch localStorage (or anything but function defs) at load -
     load-time localStorage access breaks the Cursor webview. All storage access
     is lazy: inside ccLog (runs after load) and openLogModal (on click). */
  var _ccLogs = [];
  /* Newline as a char code, never as a backslash-n escape: this file is injected
     into a template literal in extension.js, which would turn a backslash-n into
     a real newline and break the string. fromCharCode(10) survives untouched. */
  var NL = String.fromCharCode(10);

  function ccLog(tag) {
    var parts = [];
    for (var i = 1; i < arguments.length; i++) {
      var a = arguments[i];
      try { parts.push(typeof a === "string" ? a : JSON.stringify(a)); } catch (e) { parts.push(String(a)); }
    }
    var t = "";
    try { t = new Date().toISOString().slice(11, 23); } catch (e) {}
    _ccLogs.push(t + " [" + (tag || "log") + "] " + parts.join(" "));
    while (_ccLogs.length > 2000) _ccLogs.shift();
  }

  /* Comprehensive environment probe - tells us what a host bridge could use. */
  function ccLogEnv() {
    ccLog("env", "======== probe ========");
    try { var n = (parseInt(localStorage.getItem("__ccLoadN") || "0", 10) || 0) + 1; localStorage.setItem("__ccLoadN", String(n)); ccLog("env", "load #" + n + " (increments => localStorage persists across reloads)"); } catch (e) { ccLog("env", "loadN ERR", e.message); }
    ccLog("env", "typeof window=" + typeof window, "globalThis=" + typeof globalThis, "self=" + typeof self);
    ccLog("env", "typeof process=" + typeof process, "typeof require=" + typeof require);
    try { ccLog("env", "process.versions=", (typeof process !== "undefined" && process.versions) ? Object.keys(process.versions).join(",") : "n/a"); } catch (e) { ccLog("env", "process.versions ERR", e.message); }
    ccLog("env", "typeof acquireVsCodeApi=" + typeof acquireVsCodeApi);
    ccLog("env", "typeof localStorage=" + typeof localStorage);
    try { localStorage.setItem("__cct", "1"); ccLog("env", "localStorage rw OK, got=", localStorage.getItem("__cct")); localStorage.removeItem("__cct"); } catch (e) { ccLog("env", "localStorage ERR", e.message); }
    try { ccLog("env", "location=", (typeof location !== "undefined") ? location.href : "n/a"); } catch (e) {}
    try { ccLog("env", "window.parent===window:", window.parent === window, "top===window:", window.top === window); } catch (e) {}
    try { var gk = []; for (var k in window) { try { if (/vscode|acquire|postmessage|__vscode|messagechannel/i.test(k)) gk.push(k); } catch (e) {} } ccLog("env", "window keys ~vscode/api:", gk.join(",") || "(none)"); } catch (e) {}
    try { ccLog("env", "queue state: Q=" + Q.length, "paused=" + paused, "_curSid=" + (typeof _curSid !== "undefined" ? _curSid : "?")); } catch (e) {}
    ccLogEnvSession();
  }

  /* Session-id detection detail (the persistence hinge). */
  function ccLogEnvSession() {
    try { ccLog("sid", "getSessionId()=", getSessionId()); } catch (e) { ccLog("sid", "getSessionId ERR", e.message); }
    try {
      var e = inp(); ccLog("sid", "input found:", !!e);
      if (!e) return;
      var f = fiberOf(e), d = 0, hit = 0;
      while (f && d < 800) {
        var p = f.memoizedProps;
        if (p && (p.activeSessionId !== undefined || p.sessionId !== undefined)) {
          var v = p.activeSessionId !== undefined ? p.activeSessionId : p.sessionId;
          var kind = (v && typeof v === "object") ? ("object keys=" + Object.keys(v).slice(0, 6).join(",") + (typeof v.value !== "undefined" ? " value=" + v.value : "")) : (typeof v + " " + v);
          ccLog("sid", "hop " + d + " prop " + (p.activeSessionId !== undefined ? "activeSessionId" : "sessionId") + " -> " + kind);
          hit++;
          if (hit >= 4) break;
        }
        f = f.return; d++;
      }
      if (!hit) ccLog("sid", "no activeSessionId/sessionId found up " + d + " hops from input");
    } catch (e) { ccLog("sid", "fiber probe ERR", e.message); }
  }

  function openLogModal() {
    ccLogEnv();   /* fresh environment probe every time it opens (safe: on click, not at load) */
    var sh = openShell({ title: "Queue logs (" + _ccLogs.length + ")", cls: "__qLogBox" });
    var pre = el("pre", "__qLogPre"); pre.textContent = _ccLogs.join(NL);
    var copy = btn("__qBtnGhost"); copy.textContent = "Copy all";
    copy.addEventListener("click", function () { try { navigator.clipboard.writeText(_ccLogs.join(NL)); copy.textContent = "Copied!"; setTimeout(function () { copy.textContent = "Copy all"; }, 1500); } catch (e) { ccLog("ui", "copy ERR", e.message); } });
    var clr = btn("__qBtnGhost __qClearBtn"); clr.textContent = "Clear";
    clr.addEventListener("click", function () { _ccLogs.length = 0; pre.textContent = ""; sh.title.textContent = "Queue logs (0)"; });
    var re = btn("__qBtnPrimary"); re.textContent = "Re-probe";
    re.addEventListener("click", function () { ccLogEnv(); pre.textContent = _ccLogs.join(NL); sh.title.textContent = "Queue logs (" + _ccLogs.length + ")"; pre.scrollTop = pre.scrollHeight; });
    sh.foot.appendChild(copy); sh.foot.appendChild(clr); sh.foot.appendChild(re);
    sh.box.appendChild(pre);
    sh.mount();
    pre.scrollTop = pre.scrollHeight;
  }

