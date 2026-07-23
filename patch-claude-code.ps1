# Claude Code Patches for Cursor
# Patches: RTL text, Input RTL, Zoom (Ctrl+Scroll), Bypass permission mode, Prompt Queue (Codex-style), ELECTRON_RUN_AS_NODE leak fix, Worktree sessions in history, Worktree session TITLE dir fix (+ phantom cleanup), Worktree FORK/diff fix, Reload restore (session + blank-tab recovery + git-worktree timeout + activate retry)
# Run after each extension update

$ErrorActionPreference = "Stop"

# Always read/write as UTF-8 without BOM, independent of the host's default
# code page - otherwise glyphs like the queue arrows get mangled when the
# script runs under a non-UTF-8 PowerShell (Set-Content defaults to ANSI).
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false
function ReadText($p)    { return [System.IO.File]::ReadAllText($p) }
function WriteText($p,$t){ [System.IO.File]::WriteAllText($p, $t, $Utf8NoBom) }
function AppendText($p,$t){ [System.IO.File]::AppendAllText($p, $t, $Utf8NoBom) }

$extDir = "$env:USERPROFILE\.cursor\extensions"
$latest = Get-ChildItem $extDir -Directory -Filter "anthropic.claude-code-*" |
    Sort-Object Name -Descending |
    Select-Object -First 1

if (-not $latest) {
    Write-Host "Claude Code extension not found!" -ForegroundColor Red
    exit 1
}

Write-Host "Patching $($latest.Name)..." -ForegroundColor Cyan

# --- CSS: unicode-bidi plaintext for RTL text detection ---
$css = Join-Path $latest.FullName "webview\index.css"
if (-not (Test-Path $css)) {
    Write-Host "CSS file not found: $css" -ForegroundColor Red
} else {
    $cssContent = ReadText $css
    if ($cssContent -match '/\* RTL patch \*/') {
        Write-Host "CSS already patched, skipping." -ForegroundColor Yellow
    } else {
        AppendText $css @"

/* RTL patch */
[class*="messagesContainer_"]{direction:rtl;text-align:right}
[class*="userMessageContainer_"]{text-align:right!important}
pre,code,.monaco-editor,[class*="codeBlock"]{direction:ltr!important;text-align:left!important;unicode-bidi:embed!important}
/* AskUserQuestion dialog RTL - scoped via :has() so regular permission prompts stay LTR */
[class*="permissionRequestContainer_"]:has([class*="questionsContainer_"]){direction:rtl}
[class*="permissionRequestContainer_"]:has([class*="questionsContainer_"]) [class*="button_"]{text-align:right}
[class*="permissionRequestContainer_"]:has([class*="questionsContainer_"]) [class*="shortcutNum_"]{padding-right:0;padding-left:4px}
[class*="permissionRequestContainer_"]:has([class*="questionsContainer_"]) [class*="otherInput_"] [class*="input_"]{unicode-bidi:plaintext}
[class*="permissionRequestContainer_"]:has([class*="questionsContainer_"]) [class*="otherInput_"] [class*="placeholder_"]{left:auto;right:8px}
"@
        Write-Host "CSS patched." -ForegroundColor Green
    }

    # Queue panel CSS (separate guard so it applies even if RTL block was added earlier)
    $cssContent = ReadText $css
    if ($cssContent -match '/\* QUEUE \*/') {
        Write-Host "Queue CSS already patched, skipping." -ForegroundColor Yellow
    } else {
        AppendText $css @"

/* QUEUE */
.__qPanel{display:none;position:relative;z-index:1;flex-direction:column;margin:0 0 6px;padding:0 6px 2px;border:1px solid var(--vscode-input-border,rgba(128,128,128,.35));border-radius:8px;background:var(--vscode-input-background,rgba(128,128,128,.08))}
.__qResize{height:9px;flex:none;cursor:ns-resize;display:flex;align-items:center;justify-content:center;opacity:.3;transition:opacity .12s ease;touch-action:none}
.__qResize:hover{opacity:.7}
.__qResize::before{content:"";width:26px;height:2px;border-radius:1px;background:currentColor}
.__qBody{overflow-y:auto;overscroll-behavior:contain;max-height:40vh}
.__qMin{flex:none;background:none;border:none;color:inherit;cursor:pointer;width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;opacity:.7;transition:background .12s ease,opacity .12s ease}
.__qMin:hover{background:rgba(128,128,128,.16);opacity:1}
.__qMin svg{display:block;pointer-events:none}
.__qHead{display:flex;align-items:center;gap:9px;padding:6px 6px 8px;border-bottom:1px solid color-mix(in srgb,var(--vscode-foreground,#cccccc) 10%,transparent)}
.__qHead.__qHeadCollapsed{border-bottom:none;padding-bottom:6px}
.__qToggle{flex:none;background:none;border:none;color:inherit;cursor:pointer;width:20px;height:20px;border-radius:6px;display:flex;align-items:center;justify-content:center;gap:2px;opacity:.6;transition:background .12s ease,opacity .12s ease,color .12s ease}
.__qToggle:hover{background:rgba(128,128,128,.16);opacity:1}
.__qToggle.__qPlay{color:var(--app-claude-orange,#d97757);opacity:1;gap:0}
.__qToggle::before,.__qToggle::after{content:"";width:3px;height:10px;border-radius:1px;background:currentColor}
.__qToggle.__qPlay::after{display:none}
.__qToggle.__qPlay::before{width:0;height:0;border-radius:0;background:none;border-style:solid;border-width:5px 0 5px 9px;border-color:transparent transparent transparent currentColor}
.__qHeadLabel{flex:1;font-size:11px;letter-spacing:.05em;text-transform:uppercase;font-weight:500;opacity:.55;line-height:1}
.__qRow{display:flex;align-items:center;gap:8px;padding:6px 4px;font-size:12px;line-height:1.45;position:relative}
.__qRow:not(:last-child){border-bottom:1px solid color-mix(in srgb,var(--vscode-foreground,#cccccc) 12%,transparent)}
.__qRow:hover{background:rgba(128,128,128,.08)}
.__qNav{flex:none;display:flex;flex-direction:column;gap:1px;align-items:center;justify-content:center}
.__qTop,.__qUp,.__qDown{cursor:pointer;border:none;background:none;color:var(--vscode-foreground,#cccccc);opacity:.5;font-size:8px;line-height:1;padding:1px 3px;border-radius:3px;display:flex;align-items:center;justify-content:center;transition:opacity .1s ease,background .1s ease}
.__qTop:hover,.__qUp:hover,.__qDown:hover{opacity:1;background:rgba(128,128,128,.2)}
.__qTop:disabled,.__qUp:disabled,.__qDown:disabled{opacity:.13;cursor:default;background:none}
.__qTop{font-size:11px;margin-bottom:1px}
.__qCheck{flex:none;box-sizing:border-box;width:15px;height:15px;border:1.5px solid color-mix(in srgb,var(--vscode-foreground,#cccccc) 32%,transparent);border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;line-height:1;color:transparent;transition:background .12s ease,border-color .12s ease}
.__qCheck:hover{border-color:color-mix(in srgb,var(--vscode-foreground,#cccccc) 55%,transparent)}
.__qCheck.__qOn{background:color-mix(in srgb,var(--vscode-foreground,#cccccc) 26%,transparent);border-color:transparent;color:var(--vscode-foreground,#cccccc)}
.__qNum{opacity:.55;font-variant-numeric:tabular-nums;width:2.4ch;min-width:2.4ch;box-sizing:content-box;text-align:center;background:none;border:none;outline:none;color:inherit;font:inherit;padding:2px 0;border-radius:4px;cursor:text}
.__qNum:hover{background:rgba(128,128,128,.16);opacity:.85}
.__qNum:focus{opacity:1;background:color-mix(in srgb,var(--app-claude-orange,#d97757) 12%,transparent);box-shadow:0 0 0 1px var(--app-claude-orange,#d97757) inset}
.__qRow.__qOff .__qText{text-decoration:line-through;opacity:.5}
.__qRow.__qOff .__qNum{opacity:.35}
.__qText{flex:1;outline:none;white-space:pre-wrap;word-break:break-word;min-height:1.2em;border-radius:4px;padding:5px 8px;cursor:text}
.__qText:focus{background:color-mix(in srgb,var(--app-claude-orange,#d97757) 10%,transparent);box-shadow:0 0 0 1px var(--app-claude-orange,#d97757) inset}
.__qDel{background:none;border:none;color:inherit;opacity:.45;cursor:pointer;padding:2px 6px;font-size:13px;line-height:1;display:flex;align-items:center}
.__qDel:hover{opacity:1;color:var(--vscode-errorForeground,#f14c4c)}
.__qThumbs{display:flex;align-items:center;gap:3px;flex:none}
.__qThumb{width:20px;height:20px;border-radius:3px;object-fit:cover;border:1px solid color-mix(in srgb,var(--vscode-foreground,#cccccc) 20%,transparent)}
.__qDoc{display:flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 4px;border-radius:3px;font-size:8px;font-weight:600;letter-spacing:.03em;background:color-mix(in srgb,var(--vscode-foreground,#cccccc) 14%,transparent);border:1px solid color-mix(in srgb,var(--vscode-foreground,#cccccc) 22%,transparent);opacity:.8}
.__qRow.__qOff .__qThumb,.__qRow.__qOff .__qDoc{opacity:.5}
"@
        Write-Host "Queue CSS patched." -ForegroundColor Green
    }

    # Worktree banner: shrink to a small "worktree: NAME", drop the verbose
    # text and the buttons (Open worktree / mode). Class-prefix selectors so it
    # survives the per-version hash suffix.
    $cssContent = ReadText $css
    if ($cssContent -match '/\* WORKTREE \*/') {
        Write-Host "Worktree CSS already patched, skipping." -ForegroundColor Yellow
    } else {
        AppendText $css @"

/* WORKTREE */
[class*="worktreeBanner_"]{margin:4px 18px 2px;padding:0;border:none;background:none;font-size:11px;opacity:.6;gap:5px}
[class*="worktreeBanner_"] button{display:none}
[class*="worktreeBannerLeft_"]>span:not([class*="worktreeBannerName_"]){display:none}
[class*="worktreeBannerName_"]{background:none;color:var(--app-secondary-foreground);padding:0;font-size:11px;font-weight:500}
[class*="worktreeBannerName_"]::before{content:"worktree: ";opacity:.75;font-weight:400}
"@
        Write-Host "Worktree CSS patched." -ForegroundColor Green
    }
}

# --- JS patches in extension.js ---
$js = Join-Path $latest.FullName "extension.js"
if (-not (Test-Path $js)) {
    Write-Host "extension.js not found: $js" -ForegroundColor Red
} else {
    $jsContent = ReadText $js

    # Detect dynamic variable/class names from minified code
    $nonceVar = 'B'
    if ($jsContent -match 'nonce="\$\{([A-Za-z0-9_]+)\}"[^>]*src="\$\{[A-Za-z0-9_]+\}"[^>]*type="module"') {
        $nonceVar = $matches[1]
    }
    Write-Host "  nonce var: $nonceVar" -ForegroundColor Gray

    $messageInputClass = 'messageInput_cKsPxg'
    if ($jsContent -match 'messageInput:"(messageInput_[a-zA-Z0-9]+)"') {
        $messageInputClass = $matches[1]
    }
    Write-Host "  messageInput class: $messageInputClass" -ForegroundColor Gray

    $mentionMirrorClass = 'mentionMirror_cKsPxg'
    if ($jsContent -match 'mentionMirror:"(mentionMirror_[a-zA-Z0-9]+)"') {
        $mentionMirrorClass = $matches[1]
    }
    Write-Host "  mentionMirror class: $mentionMirrorClass" -ForegroundColor Gray

    # Zoom script (Ctrl+Scroll / pinch)
    if ($jsContent -match '/\* ZOOM \*/') {
        Write-Host "Zoom already patched, skipping." -ForegroundColor Yellow
    } else {
        $zoomScript = '<script nonce="${__NONCE__}">/* ZOOM */let _z=parseFloat(localStorage.getItem("__zoom")||"1");document.body.style.zoom=_z;window.addEventListener("wheel",function(e){if(e.ctrlKey){e.preventDefault();_z=Math.min(3,Math.max(0.5,_z+(e.deltaY<0?0.02:-0.02)));document.body.style.zoom=_z;localStorage.setItem("__zoom",_z)}},{passive:false})</script>'
        $zoomScript = $zoomScript -replace '__NONCE__', $nonceVar
        $pattern = '(<script nonce="[^"]*" src="[^"]*" type="module"></script>)'
        if ($jsContent -match $pattern) {
            $jsContent = $jsContent -replace $pattern, "`$1`n        $zoomScript"
            WriteText $js $jsContent
            Write-Host "Zoom patched." -ForegroundColor Green
        } else {
            Write-Host "Could not find script tag for zoom injection, skipping." -ForegroundColor Yellow
        }
    }

    # Input RTL (dir=auto on messageInput and mentionMirror)
    $jsContent = ReadText $js
    if ($jsContent -match '/\* INPUTRTL \*/') {
        Write-Host "Input RTL already patched, skipping." -ForegroundColor Yellow
    } else {
        $inputRtlScript = '<script nonce="${__NONCE__}">/* INPUTRTL */new MutationObserver(function(){document.querySelectorAll(".__MSGINPUT__:not([dir]),.__MIRROR__:not([dir])").forEach(function(e){e.dir="auto"})}).observe(document.body,{childList:true,subtree:true})</script>'
        $inputRtlScript = $inputRtlScript -replace '__NONCE__', $nonceVar
        $inputRtlScript = $inputRtlScript -replace '__MSGINPUT__', $messageInputClass
        $inputRtlScript = $inputRtlScript -replace '__MIRROR__', $mentionMirrorClass
        $zoomEnd = $jsContent.IndexOf('/* ZOOM */')
        if ($zoomEnd -ge 0) {
            $scriptEnd = $jsContent.IndexOf('</script>', $zoomEnd) + '</script>'.Length
            $jsContent = $jsContent.Substring(0, $scriptEnd) + "`n        $inputRtlScript" + $jsContent.Substring($scriptEnd)
            WriteText $js $jsContent
            Write-Host "Input RTL patched." -ForegroundColor Green
        } else {
            Write-Host "Could not find ZOOM script to insert INPUTRTL after, skipping." -ForegroundColor Yellow
        }
    }

    # Prompt Queue (Codex-style): hold messages while Claude is busy, edit/delete/reorder, send one at a time after each turn
    $jsContent = ReadText $js
    if ($jsContent -match '/\* QUEUE \*/') {
        Write-Host "Queue already patched, skipping." -ForegroundColor Yellow
    } else {
        $queueScript = @'
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
'@
        $queueScript = $queueScript -replace '__NONCE__', $nonceVar
        # Detect the image-preview class hash from webview/index.js (their lightbox classes)
        $pvHash = 'vRjSkQ'
        $webJsForHash = Join-Path $latest.FullName "webview\index.js"
        if (Test-Path $webJsForHash) {
            $wcForHash = ReadText $webJsForHash
            if ($wcForHash -match 'previewOverlay:"previewOverlay_([a-zA-Z0-9]+)"') { $pvHash = $matches[1] }
        }
        Write-Host "  preview class hash: $pvHash" -ForegroundColor Gray
        $queueScript = $queueScript -replace '__PVHASH__', $pvHash
        $anchor = $jsContent.IndexOf('/* INPUTRTL */')
        if ($anchor -lt 0) { $anchor = $jsContent.IndexOf('/* ZOOM */') }
        if ($anchor -ge 0) {
            $scriptEnd = $jsContent.IndexOf('</script>', $anchor) + '</script>'.Length
            $jsContent = $jsContent.Substring(0, $scriptEnd) + "`n        " + $queueScript + $jsContent.Substring($scriptEnd)
            WriteText $js $jsContent
            Write-Host "Queue patched." -ForegroundColor Green
        } else {
            Write-Host "Could not find INPUTRTL/ZOOM script to insert QUEUE after, skipping." -ForegroundColor Yellow
        }
    }

    # ELECTRON_RUN_AS_NODE leak fix (root cause, not the BASH_ENV workaround):
    # Cursor sets ELECTRON_RUN_AS_NODE=1 on its own extension host so it can
    # run its bundled Electron binary as plain Node. The extension inherits
    # that into process.env and re-spreads it, unfiltered, into every env
    # object it builds for the child CLI process (Id(), the SDK transport's
    # initialize() default, and the auth spawn() calls) - which then leaks
    # into every subprocess the CLI spawns (Bash tool, PowerShell tool,
    # terminal). Strip it at each of those construction sites instead.
    $jsContent = ReadText $js
    if ($jsContent -match '/\* ELECTRONFIX \*/') {
        Write-Host "ELECTRON_RUN_AS_NODE fix already patched, skipping." -ForegroundColor Yellow
    } else {
        $patchedAny = $false

        $idOld = 'function Id(e){let t=lfe(Tn("environmentVariables")),r={...process.env};'
        $idNew = 'function Id(e){let t=lfe(Tn("environmentVariables")),r={...process.env};delete r.ELECTRON_RUN_AS_NODE;'
        if ($jsContent.Contains($idOld)) {
            $jsContent = $jsContent.Replace($idOld, $idNew)
            $patchedAny = $true
            Write-Host "  Id() env builder patched." -ForegroundColor Green
        } else {
            Write-Host "  Id() pattern not found, skipping that site." -ForegroundColor Yellow
        }

        $initOld = 'env:c={...process.env}'
        $initNew = 'env:c=(({ELECTRON_RUN_AS_NODE:__erdA,...__envRestA})=>__envRestA)(process.env)'
        if ($jsContent.Contains($initOld)) {
            $jsContent = $jsContent.Replace($initOld, $initNew)
            $patchedAny = $true
            Write-Host "  SDK transport initialize() default env patched." -ForegroundColor Green
        } else {
            Write-Host "  initialize() default env pattern not found, skipping that site." -ForegroundColor Yellow
        }

        $eEnvOld = '{...process.env,...e.env}'
        $eEnvNew = '(({ELECTRON_RUN_AS_NODE:__erdB,...__baseB})=>({...__baseB,...e.env}))(process.env)'
        if ($jsContent.Contains($eEnvOld)) {
            $jsContent = $jsContent.Replace($eEnvOld, $eEnvNew)
            $patchedAny = $true
            Write-Host "  auth spawn (...e.env) sites patched." -ForegroundColor Green
        } else {
            Write-Host "  auth spawn (...e.env) pattern not found, skipping that site." -ForegroundColor Yellow
        }

        $rEnvOld = '{...process.env,...r.env}'
        $rEnvNew = '(({ELECTRON_RUN_AS_NODE:__erdC,...__baseC})=>({...__baseC,...r.env}))(process.env)'
        if ($jsContent.Contains($rEnvOld)) {
            $jsContent = $jsContent.Replace($rEnvOld, $rEnvNew)
            $patchedAny = $true
            Write-Host "  runClaudeCommandRaw (...r.env) site patched." -ForegroundColor Green
        } else {
            Write-Host "  runClaudeCommandRaw (...r.env) pattern not found, skipping that site." -ForegroundColor Yellow
        }

        if ($patchedAny) {
            $jsContent = "/* ELECTRONFIX */`n" + $jsContent
            WriteText $js $jsContent
            Write-Host "ELECTRON_RUN_AS_NODE fix applied." -ForegroundColor Green
        } else {
            Write-Host "ELECTRON_RUN_AS_NODE fix: no target patterns matched, nothing changed." -ForegroundColor Red
        }
    }

    # Worktree sessions in history: the extension already has a built-in
    # includeWorktrees option, but the history-list handler hardcodes it OFF
    # (includeWorktrees:!1). Flip it to !0 so /resume and the history panel
    # list sessions from ALL of the repo's worktrees - the native code path
    # runs `git worktree list` and merges each worktree's project folder -
    # instead of only the current cwd. This fixes sessions "disappearing" from
    # history after an in-session switch into a worktree. Anchored on semantic
    # keys (dir / this.cwd / includeWorktrees) that are NOT minified, so it is
    # stable across versions. Fail-safe: if the anchor is absent it does
    # nothing, so a future rename can never corrupt session loading.
    $jsContent = ReadText $js
    if ($jsContent -match 'dir:this\.cwd,includeWorktrees:!0') {
        Write-Host "Worktree history already patched, skipping." -ForegroundColor Yellow
    } elseif ($jsContent.Contains('dir:this.cwd,includeWorktrees:!1')) {
        $jsContent = $jsContent.Replace('dir:this.cwd,includeWorktrees:!1', 'dir:this.cwd,includeWorktrees:!0')
        WriteText $js $jsContent
        Write-Host "Worktree history patched." -ForegroundColor Green
    } else {
        Write-Host "Worktree history anchor not found, skipping." -ForegroundColor Yellow
    }

    # Worktree session TITLES written to the wrong project dir (root-cause fix).
    # BUG: renameSession() (custom-title + ai-title) writes to
    # join(nu(this.projectRoot), `${sid}.jsonl`) = the MAIN repo's project dir,
    # but a worktree session's transcript lives under the WORKTREE's project dir
    # (the CLI's real cwd). appendFile then CREATES a title-only "phantom"
    # <sid>.jsonl in the main dir. Because the open-content resolver (bRt) checks
    # the parent dir FIRST and returns the first size>0 file, that phantom
    # SHADOWS the real transcript -> the session shows in history with a title but
    # opens EMPTY, and the real transcript never gets the title. includeWorktrees
    # fixed the read/list path; this fixes the write path. Fix: before writing,
    # resolve <sid>.jsonl to whichever project dir actually holds it (largest
    # existing file = the real transcript, not a stub). Fail-safe: no anchor
    # match -> nothing changes. Pairs with the phantom cleanup at end of script.
    $jsContent = ReadText $js
    if ($jsContent -match '/\* WTTITLEFIX \*/') {
        Write-Host "Worktree title-dir fix already patched, skipping." -ForegroundColor Yellow
    } else {
        $rnRx = 'async renameSession\((\w+),(\w+),(\w+)\)\{let (\w+)=(\w+)\(this\.projectRoot\),(\w+)=(\w+)\.join\(\4,`\$\{\1\}\.jsonl`\);'
        if ($jsContent -match $rnRx) {
            $helper = 'globalThis.__ccWtResolve=async function(sid,fallback){try{const P=require("path"),F=require("fs/promises"),OS=require("os");const root=P.join(OS.homedir(),".claude","projects");let dirs;try{dirs=await F.readdir(root,{withFileTypes:true})}catch{return fallback}let best=fallback,bestSize=-1;for(const d of dirs){if(!d.isDirectory())continue;const f=P.join(root,d.name,sid+".jsonl");try{const st=await F.stat(f);if(st.isFile()&&st.size>bestSize){bestSize=st.size;best=f}}catch{}}return best}catch{return fallback}};'
            $jsContent = [regex]::Replace($jsContent, $rnRx, '$&${6}=await globalThis.__ccWtResolve(${1},${6});')
            $jsContent = "/* WTTITLEFIX */`n$helper`n" + $jsContent
            WriteText $js $jsContent
            Write-Host "Worktree title-dir fix patched." -ForegroundColor Green
        } else {
            Write-Host "Worktree title-dir anchor not found, skipping." -ForegroundColor Yellow
        }
    }

    # Worktree session FORK / inline-diff "Session not found" (root-cause fix).
    # forkSession() and the inline diff view both call ensureSessionLoaded(sid),
    # which reads ONLY nu(this.projectRoot)/<sid>.jsonl = the MAIN project dir. For
    # a worktree session the transcript lives under the WORKTREE project dir, so
    # ensureSessionLoaded loads nothing -> sessionMessages has no entry -> fork
    # throws "Session <sid> not found" (and diffs come up empty). Fix: resolve the
    # session file across worktree dirs before loading (reuses __ccWtResolve from
    # the WTTITLEFIX helper; re-injects it if absent). ensureSessionLoaded is async,
    # so the await sits inside its `let` initializer. Fail-safe: no anchor -> no-op.
    $jsContent = ReadText $js
    if ($jsContent -match '/\* WTFORKFIX \*/') {
        Write-Host "Worktree fork/diff fix already patched, skipping." -ForegroundColor Yellow
    } else {
        $esRx = '(async ensureSessionLoaded\((\w)\)\{if\(this\.loadedSessions\.has\(\2\)\)return;let \w=\w+\(this\.projectRoot\),)(\w)=(\w+\.join\(\w+,`\$\{\2\}\.jsonl`\))'
        if ($jsContent -match $esRx) {
            if ($jsContent -notmatch '__ccWtResolve=async function') {
                $helper2 = 'globalThis.__ccWtResolve=async function(sid,fallback){try{const P=require("path"),F=require("fs/promises"),OS=require("os");const root=P.join(OS.homedir(),".claude","projects");let dirs;try{dirs=await F.readdir(root,{withFileTypes:true})}catch{return fallback}let best=fallback,bestSize=-1;for(const d of dirs){if(!d.isDirectory())continue;const f=P.join(root,d.name,sid+".jsonl");try{const st=await F.stat(f);if(st.isFile()&&st.size>bestSize){bestSize=st.size;best=f}}catch{}}return best}catch{return fallback}};'
                $jsContent = "/* CCWTRESOLVE */`n$helper2`n" + $jsContent
            }
            $jsContent = [regex]::Replace($jsContent, $esRx, '${1}${3}=await globalThis.__ccWtResolve(${2},${4})')
            # forkSession ALSO reads the original file a second time to copy its
            # file-history (checkpoint/restore) into the fork: <var>=ai.join(<parentDir>,
            # `${sid}.jsonl`),d=new Map,p=[]. Left unresolved, a forked worktree session
            # keeps its messages (from the load fix above) but loses file-history. Anchor
            # on the fork-unique `,d=new Map,p=[]` so it never touches ensureSessionLoaded.
            $fhRx = '(\w)=((\w+)\.join\(\w+,`\$\{(\w)\}\.jsonl`\)),d=new Map,p=\[\]'
            $jsContent = [regex]::Replace($jsContent, $fhRx, '${1}=await globalThis.__ccWtResolve(${4},${2}),d=new Map,p=[]')
            $jsContent = "/* WTFORKFIX */`n" + $jsContent
            WriteText $js $jsContent
            Write-Host "Worktree fork/diff fix patched." -ForegroundColor Green
        } else {
            Write-Host "Worktree fork/diff anchor not found, skipping." -ForegroundColor Yellow
        }
    }

    # Reload restore: blank Claude tabs after "Reload Window". Two coupled fixes.
    # (1) deserializeWebviewPanel restored each tab's panel but passed void 0 for the
    #     session (it only read isFullEditor from the saved state, ignoring the
    #     sessionID that VS Code hands back) - so every restored tab lost its
    #     conversation. Fix: pass the saved state's sessionID.
    # (2) Even with (1), VS Code sometimes never loads a restored webview's iframe on
    #     reload - the panel is "visible/active" but its script never runs, leaving a
    #     blank tab that even focusing can't recover (proven: the iframe emits zero
    #     messages). Recovery: if a panel's webview sends no message within a few
    #     seconds (or on focus while still blank), force-reload its HTML by
    #     re-assigning e.webview.html - which re-runs getHtmlForWebview with the
    #     sessionID from (1), so the tab restores. Both halves are required.
    # Anchors capture the minified var names; a missing anchor just skips (fail-safe).
    $jsContent = ReadText $js
    if ($jsContent -match '/\* RELOADFIX \*/') {
        Write-Host "Reload restore fix already patched, skipping." -ForegroundColor Yellow
    } else {
        $applied = $false
        $rx1 = '(deserializeWebviewPanel\((\w+),(\w+)\)\{[\s\S]{0,200}?\w+\.setupPanel\(\2,)void 0(,void 0,\w+\))'
        if ($jsContent -match $rx1) {
            $stateVar = $matches[3]
            $jsContent = [regex]::Replace($jsContent, $rx1, ('${1}' + $stateVar + '?.sessionID${4}'))
            $applied = $true
            Write-Host "  reload: session-restore patched." -ForegroundColor Green
        } else { Write-Host "  reload: deserialize anchor not found, skipping." -ForegroundColor Yellow }

        $sig = [regex]::Match($jsContent, 'setupPanel\((\w),(\w),(\w),(\w)\)\{let \w=\{isVisible')
        if ($sig.Success) {
            $pe = $sig.Groups[1].Value; $pt = $sig.Groups[2].Value; $pr = $sig.Groups[3].Value; $pn = $sig.Groups[4].Value
            $rx2 = '(\w\?\.fromClient\(\w\)\},null,this\.disposables\);)(let \w=\w\?[A-Za-z]+\.ViewColumn\.Active:' + $pe + '\.viewColumn;' + $pe + '\.onDidChangeViewState)'
            if ($jsContent -match $rx2) {
                $rec = 'let __self=this,__loaded=!1,__att=0;let __md=' + $pe + '.webview.onDidReceiveMessage(function(){__loaded=!0;try{__md.dispose()}catch(_){}});let __try=function(){if(__loaded||__att>=3||!' + $pe + '.visible)return;__att++;try{' + $pe + '.webview.html=__self.getHtmlForWebview(' + $pe + '.webview,' + $pt + ',' + $pr + ',!1,' + $pn + ')}catch(_){}setTimeout(__try,3000)};setTimeout(__try,4000);' + $pe + '.onDidChangeViewState(function(){if(!__loaded&&' + $pe + '.visible)__try()});'
                $jsContent = [regex]::Replace($jsContent, $rx2, ('${1}' + $rec + '${2}'))
                $applied = $true
                Write-Host "  reload: webview recovery patched." -ForegroundColor Green
            } else { Write-Host "  reload: setupPanel view-state anchor not found, skipping." -ForegroundColor Yellow }
        } else { Write-Host "  reload: setupPanel signature not found, skipping." -ForegroundColor Yellow }

        # (3) `git worktree list` runs with a 5s timeout; on reload (many worktrees +
        #     several webviews each scanning at once) it sometimes exceeds it, returns
        #     empty, and the worktree sessions vanish from the session list -> restore
        #     can't find the session -> opens a NEW chat. Bump the timeout to 20s so
        #     the (slow-but-successful) scan completes.
        $rxT = '("worktree","list","--porcelain"\],\{cwd:\w+,timeout:)5000(,windowsHide)'
        if ($jsContent -match $rxT) {
            $jsContent = [regex]::Replace($jsContent, $rxT, '${1}20000${2}')
            $applied = $true
            Write-Host "  reload: git-worktree-list timeout 5000->20000 patched." -ForegroundColor Green
        } else { Write-Host "  reload: git-worktree-list timeout anchor not found, skipping." -ForegroundColor Yellow }

        if ($applied) {
            $jsContent = "/* RELOADFIX */`n" + $jsContent
            WriteText $js $jsContent
            Write-Host "Reload restore fix patched." -ForegroundColor Green
        }
    }
}

# --- Bypass permission mode in webview/index.js ---
$webJs = Join-Path $latest.FullName "webview\index.js"
if (-not (Test-Path $webJs)) {
    Write-Host "webview/index.js not found: $webJs" -ForegroundColor Red
} else {
    $webJsContent = ReadText $webJs
    if ($webJsContent -match 'permissionMode=\w+\("bypassPermissions"\)') {
        Write-Host "Bypass mode already patched, skipping." -ForegroundColor Yellow
    } elseif ($webJsContent -match 'permissionMode=(\w+)\("default"\)') {
        $signalFn = $matches[1]
        Write-Host "  signal function: $signalFn" -ForegroundColor Gray
        $old = "permissionMode=$signalFn(`"default`")"
        $new = "permissionMode=$signalFn(`"bypassPermissions`")"
        $webJsContent = $webJsContent.Replace($old, $new)
        WriteText $webJs $webJsContent
        Write-Host "Bypass mode patched." -ForegroundColor Green
    } else {
        Write-Host "Could not find permissionMode default value, skipping." -ForegroundColor Yellow
    }

    # Reload restore (webview): activateSessionFromServer occasionally returns false
    # during restore (a git-worktree-list timeout, or a transient listSessions miss,
    # dropped the session from the list). Stock code then opens a NEW chat instead of
    # the conversation. Retry up to 10x (1s apart) before ever falling back to a new
    # chat - the session exists, so a retry finds it once the list is complete.
    # Regex captures the minified var names; a missing anchor just skips (fail-safe).
    $webJsContent = ReadText $webJs
    if ($webJsContent -match 'let __ra=function') {
        Write-Host "Webview activate-retry already patched, skipping." -ForegroundColor Yellow
    } else {
        $rxR = 'else if\((\w)\.initialSession\)(\w)\.activateSessionFromServer\(\1\.initialSession,\1\.initialPrompt\)\.then\(\((\w)\)=>\{if\(!\3\)\2\.createSession\(\{isExplicit:!1\}\)\.then\(\((\w)\)=>\{if\(\4&&\1\.initialPrompt\)\4\.initialPrompt\.value=\1\.initialPrompt\}\)\}\);'
        $m = [regex]::Match($webJsContent, $rxR)
        if ($m.Success) {
            $wu = $m.Groups[1].Value; $wl = $m.Groups[2].Value; $wg = $m.Groups[3].Value; $wv2 = $m.Groups[4].Value
            $rep = 'else if(' + $wu + '.initialSession){let __ra=function(k){return ' + $wl + '.activateSessionFromServer(' + $wu + '.initialSession,' + $wu + '.initialPrompt).then((' + $wg + ')=>{if(' + $wg + ')return;if(k<10){setTimeout(function(){__ra(k+1)},1000);return}' + $wl + '.createSession({isExplicit:!1}).then((' + $wv2 + ')=>{if(' + $wv2 + '&&' + $wu + '.initialPrompt)' + $wv2 + '.initialPrompt.value=' + $wu + '.initialPrompt})})};__ra(0)}'
            $webJsContent = $webJsContent.Replace($m.Value, $rep)
            WriteText $webJs $webJsContent
            Write-Host "Webview activate-retry patched." -ForegroundColor Green
        } else { Write-Host "Webview activate-retry anchor not found, skipping." -ForegroundColor Yellow }
    }
}

# --- Phantom worktree-title cleanup (data fix, complements WTTITLEFIX) ---
# The WTTITLEFIX patch stops NEW phantoms being created; this removes the ones
# already on disk so they stop shadowing the real transcripts. A file is only
# deleted when it is metadata-only (no user/assistant/etc. messages) AND another
# project dir holds a real, larger transcript for the SAME session id (its
# worktree twin). Anything without a content twin is left untouched. Safe and
# idempotent - after the first run there is nothing left to delete. Requires node
# (already a dependency of the CLI). Set $SkipPhantomCleanup = $true to skip.
$SkipPhantomCleanup = $false
if ($SkipPhantomCleanup) {
    Write-Host "Phantom cleanup skipped." -ForegroundColor Yellow
} else {
    $cleanupJs = @'
const P=require("path"),F=require("fs/promises"),OS=require("os");
const APPLY=process.argv.includes("--apply");
const CONTENT=new Set(["user","assistant","attachment","system","progress","summary"]);
async function classify(file){
  let txt; try{txt=await F.readFile(file,"utf8")}catch{return null}
  let hasContent=false,size=Buffer.byteLength(txt);
  for(const ln of txt.split("\n")){ if(!ln.trim())continue; let o;
    try{o=JSON.parse(ln)}catch{continue}
    if(CONTENT.has(o.type)){hasContent=true;break}
  }
  return{hasContent,size};
}
(async()=>{
  const root=P.join(OS.homedir(),".claude","projects");
  let rootDirs; try{rootDirs=await F.readdir(root,{withFileTypes:true})}catch{console.log("no projects dir");return}
  const bySid=new Map();
  for(const d of rootDirs){ if(!d.isDirectory())continue;
    let files; try{files=await F.readdir(P.join(root,d.name))}catch{continue}
    for(const f of files){ if(!f.endsWith(".jsonl"))continue;
      const sid=f.slice(0,-6); if(!/^[0-9a-f-]{30,}$/i.test(sid))continue;
      const full=P.join(root,d.name,f); const info=await classify(full); if(!info)continue;
      if(!bySid.has(sid))bySid.set(sid,[]); bySid.get(sid).push({dir:d.name,full,...info});
    }
  }
  let found=0,del=0;
  for(const [sid,arr] of bySid){
    if(arr.length<2)continue;
    const content=arr.filter(x=>x.hasContent), meta=arr.filter(x=>!x.hasContent);
    if(!content.length||!meta.length)continue;
    for(const ph of meta){
      found++;
      console.log((APPLY?"[DELETE] ":"[dry] ")+ph.size+"b :: "+ph.dir+"/"+sid+".jsonl");
      if(APPLY){try{await F.unlink(ph.full);del++}catch(e){console.log("  unlink failed: "+e.message)}}
    }
  }
  console.log(APPLY ? ("Deleted "+del+" phantom file(s).") : ("Would delete "+found+" phantom file(s)."));
})();
'@
    $tmpJs = Join-Path $env:TEMP "cc-phantom-cleanup.js"
    WriteText $tmpJs $cleanupJs
    Write-Host "`nScanning for shadowing phantom title files..." -ForegroundColor Cyan
    & node $tmpJs                # dry-run: list what would be removed
    if ($LASTEXITCODE -eq 0) {
        & node $tmpJs --apply    # remove them
    } else {
        Write-Host "node not available or scan failed - skipping phantom cleanup." -ForegroundColor Yellow
    }
    Remove-Item $tmpJs -ErrorAction SilentlyContinue
}

Write-Host "`nDone! Reload Cursor window (Ctrl+Shift+P -> Developer: Reload Window)" -ForegroundColor Cyan
