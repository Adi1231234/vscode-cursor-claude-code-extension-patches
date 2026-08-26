<script nonce="${__NONCE__}">/* BGTASKS */(function () {
  /* Background tasks: an animated indicator in the composer footer, and a
     list-detail dialog (tasks / live log) behind it.

     Everything is observed, never polled: the whole SDK stream arrives on the
     window "message" event, and log files are tailed by the extension host over
     the private "__ccbg" channel.

     This file is injected inside a template literal in extension.js, so it may not
     contain a backtick, a dollar-brace, or any backslash at all (a unicode escape
     of the u-XXXX form is the one exception the other patches rely on) - the
     literal evaluates them before the browser ever sees the script. */

  var CH = "__ccbg";
  var NL = String.fromCharCode(10);
  var BS = String.fromCharCode(92);   /* a literal backslash cannot be typed here */
  var MAX_LOG = 600;            /* live log entries kept per task */
  var MAX_TEXT = 400000;        /* characters kept in a text log pane */
  var NARROW = 560;             /* below this the two panes stack (see README) */

  /* ---------- DOM utilities ---------- */
  function el(tag, cls, text) {
    var x = document.createElement(tag);
    if (cls) x.className = cls;
    if (text !== undefined) x.textContent = text;
    return x;
  }

  function btn(cls, label) {
    var b = el("button", cls);
    b.type = "button";
    if (label) b.setAttribute("aria-label", label);
    return b;
  }

  /* A square icon button with the app's own tooltip treatment, never a native
     title attribute - that renders the delayed, unstyled OS tooltip. */
  function iconBtn(cls, label, svg) {
    var b = btn("__bgIcoBtn " + cls, label);
    b.innerHTML = svg;
    b.appendChild(el("span", "__bgTip", label));
    return b;
  }

  function inp() { return globalThis.__ccInput(); }   /* cached in lib/js/ccStore.js */

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* Writes only on a real change. Assigning textContent replaces the node's
     children even when the string is identical, and that replacement is itself a
     childList mutation - with a MutationObserver on document.body driving the
     render pass, an unconditional write re-triggers the pass that wrote it. */
  function setText(node, s) {
    if (node && node.textContent !== s) node.textContent = s;
  }

  function ago(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + "s";
    var m = Math.floor(s / 60);
    if (m < 60) return m + "m " + (s % 60) + "s";
    return Math.floor(m / 60) + "h " + (m % 60) + "m";
  }

  function clock(ms) {
    var d = new Date(ms);
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }

  function oneLine(s, max) {
    var t = String(s === undefined || s === null ? "" : s).split(NL).join(" ").trim();
    return t.length > max ? t.slice(0, max - 1) + "…" : t;
  }

  /* ---------- Task type -> icon + wording ---------- */
  /* The CLI encodes the type in the first character of the task id, which is the
     only clue for a row recovered from disk. */
  var PREFIX = {
    b: "local_bash", a: "local_agent", r: "remote_agent", t: "in_process_teammate",
    w: "local_workflow", m: "monitor_mcp", s: "monitor_ws", k: "mcp_task",
    d: "dream", e: "auto_mode_scan"
  };

  function typeOfId(id) { return PREFIX[String(id).charAt(0)] || "task"; }

  var SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">';
  var ICON_AGENT = SVG + '<rect x="4" y="8" width="16" height="12" rx="3"></rect><path d="M12 8V4"></path><circle cx="12" cy="3" r="1.4"></circle><path d="M9 13v1.5"></path><path d="M15 13v1.5"></path></svg>';
  var ICON_SHELL = SVG + '<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M7 9l3 3-3 3"></path><path d="M13 15h4"></path></svg>';
  var ICON_FLOW = SVG + '<rect x="3" y="3" width="7" height="6" rx="1.5"></rect><rect x="14" y="15" width="7" height="6" rx="1.5"></rect><path d="M6.5 9v6a3 3 0 0 0 3 3H14"></path></svg>';
  var ICON_DOT = SVG + '<circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l2.5 2.5"></path></svg>';
  var ICON_BACK = SVG + '<path d="M15 19l-7-7 7-7"></path></svg>';
  var ICON_CLOSE = SVG + '<path d="M6 6l12 12"></path><path d="M18 6L6 18"></path></svg>';
  var ICON_WRAP = SVG + '<path d="M4 6h16"></path><path d="M4 12h12a3 3 0 0 1 0 6h-3"></path><path d="M15 15l-2 3 2 3"></path><path d="M4 18h4"></path></svg>';
  var ICON_FOLLOW = SVG + '<path d="M12 4v12"></path><path d="M7 12l5 5 5-5"></path><path d="M5 20h14"></path></svg>';
  var ICON_COPY = SVG + '<rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V6a2 2 0 0 1 2-2h9"></path></svg>';
  var ICON_OPEN = SVG + '<path d="M14 4h6v6"></path><path d="M20 4l-8 8"></path><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"></path></svg>';
  /* The composer button. The mark in the middle is what the button IS - a place
     where things run - and it is the same prompt chevron the shell rows carry, so
     the button and the rows it opens read as one family. The ring only exists
     while something is running: it fades in, spins, and the mark steps back to
     make room for it. Idle, there is no ring at all, because a stopped spinner
     reads as a load that got stuck rather than as "here is the history". */
  /* 18px to sit level with the queue button beside it - the app's own footer
     glyphs are measured at 26, but that is the row above; the cluster this lands
     in is [runs][queue][send] and reads wrong at anything smaller. */
  var RUN_ICON = '<svg class="__bgRun" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">'
    + '<g class="__bgRunRing" stroke-width="2.2"><circle cx="12" cy="12" r="9.6" opacity="0.25"></circle><path d="M21.6 12a9.6 9.6 0 0 0-9.6-9.6"></path></g>'
    + '<g class="__bgRunMark" stroke-width="2"><path d="M6 7.5l5 4.5-5 4.5"></path><path d="M13 16.5h5"></path></g>'
    + '</svg>';

  function iconFor(type) {
    if (type === "local_agent" || type === "remote_agent" || type === "in_process_teammate") return ICON_AGENT;
    if (type === "local_bash") return ICON_SHELL;
    if (type === "local_workflow") return ICON_FLOW;
    return ICON_DOT;
  }
