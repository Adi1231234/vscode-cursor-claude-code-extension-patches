<script nonce="${__NONCE__}">/* QUEUE */(function(){
  /* Codex-style prompt queue for the Claude Code composer.
     Sections: config/state, DOM utils, session discovery, busy detection,
     file attachments, composer chips, image preview, queue model,
     rendering, panel resize, composer interception, flushing, init. */

  /* ---------- Config and state ---------- */
  var BUSY = "Queue another message";
  var PVH = "__PVHASH__";
  var Q = [];             /* queued items: {id, text, files, off} */
  var idc = 0;            /* id counter */
  var flushing = false;   /* a flush is in progress */
  var paused = false;     /* queue paused by user */
  var collapsed = false;  /* panel minimized */
  var bodyMax = null;     /* user-resized body height */
  var panel = null;       /* queue panel element */
  var editing = false;    /* an inline position-number edit is focused */

  /* ---------- DOM utilities (reusable) ---------- */
  function qs(sel) {
    return document.querySelector(sel);
  }

  function el(tag, cls) {
    var x = document.createElement(tag);
    if (cls) x.className = cls;
    return x;
  }

  function btn(cls, title) {
    var b = el("button", cls);
    b.type = "button";
    if (title) b.title = title;
    return b;
  }

  function inp() {
    return qs('[aria-label="Message input"][contenteditable]');
  }

  function setText(e, t) {
    e.textContent = t;
    e.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }

  function delay(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function suggestionsOpen() {
    return !!qs('[class*="popupVisible"],[class*="suggestions_"]');
  }

  /* ---------- React fiber / session discovery ---------- */
  var _session = null, _sessEl = null, _ctx = null;

  function fiberOf(node) {
    if (!node) return null;
    try {
      var ks = Object.keys(node);
      for (var i = 0; i < ks.length; i++) {
        if (ks[i].indexOf("__reactFiber$") === 0 || ks[i].indexOf("__reactInternalInstance$") === 0) return node[ks[i]];
      }
    } catch (e) {}
    return null;
  }

  function sessionFromProps(p) {
    if (p && p.session && typeof p.session.send === "function") {
      if (p.context) _ctx = p.context;
      return p.session;
    }
    return null;
  }

  function searchUp(node) {
    var f = fiberOf(node), d = 0;
    while (f && d < 300) {
      var s = sessionFromProps(f.memoizedProps);
      if (s) return s;
      f = f.return;
      d++;
    }
    return null;
  }

  function searchDown(node) {
    var f = fiberOf(node);
    if (!f) return null;
    var stack = [f], n = 0;
    while (stack.length && n < 4000) {
      var cur = stack.pop();
      n++;
      var s = sessionFromProps(cur.memoizedProps);
      if (s) return s;
      if (cur.child) stack.push(cur.child);
      if (cur.sibling) stack.push(cur.sibling);
    }
    return null;
  }

  function getSession() {
    try {
      var e = inp();
      if (_session && _sessEl === e && typeof _session.send === "function") return _session;
      var anchors = [e];
      if (e) {
        if (e.closest) anchors.push(e.closest("form"));
        anchors.push(e.parentElement);
      }
      anchors.push(qs('[class*="messageInputContainer"]'));
      anchors.push(qs('[class*="composer"]'));
      anchors.push(qs("#root"));
      for (var a = 0; a < anchors.length; a++) {
        if (!anchors[a]) continue;
        var s = searchUp(anchors[a]);
        if (s) { _session = s; _sessEl = e; return s; }
      }
      var down = searchDown(qs("#root"));
      if (down) { _session = down; _sessEl = e; return down; }
    } catch (err) {}
    _session = null;
    _sessEl = null;
    return null;
  }

  function useCtrlEnter() {
    try {
      getSession();
      return !!(_ctx && _ctx.useCtrlEnterToSend === true);
    } catch (e) {
      return false;
    }
  }

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

  /* ---------- Queue model ---------- */
  function enqueue(text, files) {
    Q.push({ id: ++idc, text: text, files: files });
  }

  function removeAt(i) {
    Q.splice(i, 1);
    render();
  }

  function swapItems(i, j) {
    if (i < 0 || j < 0 || i >= Q.length || j >= Q.length) return;
    var t = Q[i];
    Q[i] = Q[j];
    Q[j] = t;
    render();
  }

  function moveToFirst(i) {
    if (i <= 0 || i >= Q.length) return;
    Q.unshift(Q.splice(i, 1)[0]);
    render();
  }

  /* Reorder by typed position: MOVE (not swap) the item to 1-based slot p,
     clamped into [1, length]. Identity-based so it stays correct even if the
     queue shifted (e.g. the top item flushed) while the field was focused. */
  function moveItemTo(it, p) {
    var from = Q.indexOf(it);
    if (from >= 0) {                 /* skip move if already sent/removed */
      var to = p - 1;
      if (to < 0) to = 0;
      if (to > Q.length - 1) to = Q.length - 1;
      if (to !== from) {
        Q.splice(from, 1);
        Q.splice(to, 0, it);
      }
    }
    /* Always re-render so an edited number snaps back to the real position -
       e.g. an out-of-range value like 8 in a 3-item queue resets to 3. */
    render();
  }

  function toggleSkip(it) {
    it.off = !it.off;
    render();
  }

  function firstSendableIndex() {
    for (var k = 0; k < Q.length; k++) {
      if (!Q[k].off) return k;
    }
    return -1;
  }

  /* ---------- Rendering (render orchestrates small builders) ---------- */
  function ensurePanel(e) {
    if (panel && panel.isConnected) return;
    panel = el("div", "__qPanel");
    var anchor = e.closest('[class*="messageInputContainer_"]') || e.parentNode;
    anchor.parentNode.insertBefore(panel, anchor);
  }

  function buildResizeHandle() {
    var rh = el("div", "__qResize");
    rh.title = "Drag to resize";
    rh.addEventListener("pointerdown", startResize);
    return rh;
  }

  function buildHeader() {
    var head = el("div", "__qHead" + (collapsed ? " __qHeadCollapsed" : ""));
    var toggle = btn("__qToggle" + (paused ? " __qPlay" : ""), paused ? "Resume queue" : "Pause queue");
    toggle.addEventListener("click", function () {
      paused = !paused;
      render();
      if (!paused && !isBusy() && Q.length) flush();
    });
    var label = el("span", "__qHeadLabel");
    label.textContent = (paused ? "paused \u00B7 " : "") + Q.length + " queued";
    var min = btn("__qMin", collapsed ? "Expand queue" : "Minimize queue");
    min.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="' + (collapsed ? "6 15 12 9 18 15" : "6 9 12 15 18 9") + '"></polyline></svg>';
    min.addEventListener("click", function () { collapsed = !collapsed; render(); });
    head.appendChild(toggle);
    head.appendChild(label);
    head.appendChild(min);
    return head;
  }

  function buildNav(i) {
    var nav = el("span", "__qNav");
    if (i > 0) {
      var top = btn("__qTop", "Move to top");
      top.textContent = "\u2912";
      top.addEventListener("click", function (e) { e.stopPropagation(); moveToFirst(i); });
      nav.appendChild(top);
    }
    var up = btn("__qUp", "Move up");
    up.textContent = "\u25B2";
    up.disabled = (i === 0);
    up.addEventListener("click", function (e) { e.stopPropagation(); swapItems(i, i - 1); });
    var down = btn("__qDown", "Move down");
    down.textContent = "\u25BC";
    down.disabled = (i === Q.length - 1);
    down.addEventListener("click", function (e) { e.stopPropagation(); swapItems(i, i + 1); });
    nav.appendChild(up);
    nav.appendChild(down);
    return nav;
  }

  function buildThumbs(files) {
    var tb = el("span", "__qThumbs");
    files.forEach(function (fl) {
      var isImg = fl.dataUrl && fl.dataUrl.indexOf("data:image") === 0;
      if (isImg) {
        var im = el("img", "__qThumb");
        im.src = fl.dataUrl;
        im.title = "Click to preview";
        im.style.cursor = "zoom-in";
        im.addEventListener("click", function (ev) { ev.stopPropagation(); openPreview(fl.dataUrl, fl.name); });
        tb.appendChild(im);
      } else {
        var dc = el("span", "__qDoc");
        dc.title = fl.name;
        dc.textContent = ((fl.name.split(".").pop() || "") + "").toUpperCase().slice(0, 4) || "FILE";
        tb.appendChild(dc);
      }
    });
    return tb;
  }

  function buildRow(it, i) {
    var row = el("div", "__qRow" + (it.off ? " __qOff" : ""));
    var check = el("span", "__qCheck" + (it.off ? "" : " __qOn"));
    check.textContent = it.off ? "" : "\u2713";
    check.title = it.off ? "Skipped - won't be sent (click to enable)" : "Will be sent (click to skip)";
    check.addEventListener("click", function () { toggleSkip(it); });
    var num = el("input", "__qNum");
    num.type = "text";
    num.inputMode = "numeric";
    num.value = (i + 1);
    num.title = "Position - type a number, Enter to move (Esc to cancel)";
    num.setAttribute("aria-label", "Queue position");
    var canceled = false;
    num.addEventListener("focus", function () { editing = true; num.select(); });
    num.addEventListener("input", function () {
      var digits = num.value.replace(/[^0-9]/g, "");
      if (digits !== num.value) num.value = digits;
    });
    num.addEventListener("keydown", function (ev) {
      ev.stopPropagation();
      if (ev.key === "Enter") { ev.preventDefault(); num.blur(); }
      else if (ev.key === "Escape") { ev.preventDefault(); canceled = true; num.blur(); }
    });
    num.addEventListener("blur", function () {
      editing = false;
      var cur = Q.indexOf(it) + 1;
      if (canceled) { canceled = false; num.value = cur; return; }
      var p = parseInt(num.value, 10);
      if (isNaN(p)) { num.value = cur; return; }
      if (p === cur) { num.value = cur; return; }  /* no change - skip rebuild so a following click is not swallowed */
      moveItemTo(it, p);
    });
    var text = el("div", "__qText");
    text.contentEditable = "plaintext-only";
    text.dir = "auto";
    text.textContent = it.text;
    text.addEventListener("input", function () { it.text = text.textContent; });
    text.addEventListener("keydown", function (ev) {
      ev.stopPropagation();
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); text.blur(); }
    });
    var del = btn("__qDel", "Remove from queue");
    del.textContent = "\u2715";
    del.addEventListener("click", function () { removeAt(i); });
    row.appendChild(buildNav(i));
    row.appendChild(check);
    row.appendChild(num);
    row.appendChild(text);
    if (it.files && it.files.length) row.appendChild(buildThumbs(it.files));
    row.appendChild(del);
    return row;
  }

  function buildBody() {
    var body = el("div", "__qBody");
    if (bodyMax) body.style.maxHeight = bodyMax + "px";
    Q.forEach(function (it, i) { body.appendChild(buildRow(it, i)); });
    return body;
  }

  function render() {
    /* A rebuild destroys any focused position input, so clear the edit flag -
       otherwise an external re-render could leave it stuck true and freeze flushing. */
    editing = false;
    var e = inp();
    if (!e) return;
    ensurePanel(e);
    /* Preserve the body scroll position across the full rebuild, so adding an
       item or reordering does not snap the list back to the top. */
    var prevBody = panel.querySelector(".__qBody");
    var prevScroll = prevBody ? prevBody.scrollTop : 0;
    panel.innerHTML = "";
    panel.style.display = Q.length ? "flex" : "none";
    if (!Q.length) return;
    if (!collapsed) panel.appendChild(buildResizeHandle());
    panel.appendChild(buildHeader());
    if (collapsed) return;
    var body = buildBody();
    panel.appendChild(body);
    body.scrollTop = prevScroll;
  }

  /* ---------- Panel resize ---------- */
  function startResize(ev) {
    ev.preventDefault();
    var body = panel && panel.querySelector(".__qBody");
    if (!body) return;
    var startY = ev.clientY, startH = body.getBoundingClientRect().height;
    function move(e) {
      var dy = startY - e.clientY;
      bodyMax = Math.max(48, Math.min(window.innerHeight * 0.8, startH + dy));
      body.style.maxHeight = bodyMax + "px";
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /* ---------- Composer interception (enqueue while busy) ---------- */
  function commitComposerToQueue(ev, e) {
    var t = (e.textContent || "").trim();
    if (!t) return;
    var files = readChips();
    ev.preventDefault();
    ev.stopImmediatePropagation();
    enqueue(t, files);
    setText(e, "");
    if (files.length) clearChips();
    render();
  }

  function onComposerKeydown(ev) {
    try {
      if (flushing) return;
      var e = inp();
      if (!e || ev.target !== e) return;
      if (ev.key !== "Enter" || ev.shiftKey || ev.isComposing) return;
      if (useCtrlEnter() && !(ev.ctrlKey || ev.metaKey)) return;
      if (suggestionsOpen()) return;
      if (!isBusy()) return;
      if (hasUnmanagedChips()) return;
      commitComposerToQueue(ev, e);
    } catch (err) {}
  }

  function onComposerSubmit(ev) {
    try {
      if (flushing) return;
      var e = inp();
      if (!e) return;
      var f = e.closest("form");
      if (!f || ev.target !== f) return;
      if (!isBusy()) return;
      if (hasUnmanagedChips()) return;
      commitComposerToQueue(ev, e);
    } catch (err) {}
  }

  /* ---------- Flushing (send one item when idle) ---------- */
  async function sendViaSession(s, it, files) {
    await s.send(it.text, files, false);
  }

  async function sendViaDom(e, it, files) {
    e.focus();
    setText(e, it.text);
    if (files.length) await reattachToComposer(files);
    var f = e.closest("form");
    if (f && f.requestSubmit) f.requestSubmit();
    else e.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", ctrlKey: true, bubbles: true, cancelable: true }));
  }

  async function flush() {
    if (paused || flushing || editing || isBusy()) return;
    var idx = firstSendableIndex();
    if (idx < 0) return;
    var e = inp();
    if (!e) return;
    var s = getSession();
    var canSend = !!(s && typeof s.send === "function");
    var hasDraft = (e.textContent || "").trim().length > 0;
    /* Root protection: a DOM flush types the item into the box. With no session AND
       an unsent draft present, never type over it - wait until it is sent/cleared. */
    if (!canSend && hasDraft) return;
    flushing = true;
    var it = Q.splice(idx, 1)[0];
    render();
    if (!it.text || !it.text.trim()) { flushing = false; return; }  /* drop blank item, never send empty */
    try {
      var files = await buildFiles(it.files);
      if (canSend) await sendViaSession(s, it, files);
      else await sendViaDom(e, it, files);
    } catch (err) {
      Q.splice(idx, 0, it);
      render();
    } finally {
      flushing = false;
    }
  }

  /* ---------- Init ---------- */
  hookFileReader();
  document.addEventListener("keydown", onComposerKeydown, true);
  document.addEventListener("submit", onComposerSubmit, true);
  setInterval(function () {
    try {
      if (Q.length && (!panel || !panel.isConnected)) render();
      if (!isBusy() && Q.length) flush();
    } catch (e) {}
  }, 150);
})();</script>
