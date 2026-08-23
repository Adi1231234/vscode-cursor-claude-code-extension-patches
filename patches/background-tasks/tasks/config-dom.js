<script nonce="${__NONCE__}">/* BGTASKS */(function () {
  /* Background tasks: an animated indicator in the composer footer, and a
     two-pane dialog (task list / live log) behind it.

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

  /* ---------- DOM utilities ---------- */
  function qs(sel, root) { return (root || document).querySelector(sel); }

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

  function inp() { return qs('[aria-label="Message input"][contenteditable]'); }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function ago(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + "s";
    var m = Math.floor(s / 60);
    if (m < 60) return m + "m " + (s % 60) + "s";
    return Math.floor(m / 60) + "h " + (m % 60) + "m";
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

  var ICON_AGENT = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="3"></rect><path d="M12 8V4"></path><circle cx="12" cy="3" r="1.4"></circle><path d="M9 13v1.5"></path><path d="M15 13v1.5"></path></svg>';
  var ICON_SHELL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M7 9l3 3-3 3"></path><path d="M13 15h4"></path></svg>';
  var ICON_FLOW = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="6" rx="1.5"></rect><rect x="14" y="15" width="7" height="6" rx="1.5"></rect><path d="M6.5 9v6a3 3 0 0 0 3 3H14"></path></svg>';
  var ICON_DOT = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l2.5 2.5"></path></svg>';

  function iconFor(type) {
    if (type === "local_agent" || type === "remote_agent" || type === "in_process_teammate") return ICON_AGENT;
    if (type === "local_bash") return ICON_SHELL;
    if (type === "local_workflow") return ICON_FLOW;
    return ICON_DOT;
  }

  var SPINNER = '<svg class="__bgSpin" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9" opacity="0.25"></circle><path d="M21 12a9 9 0 0 0-9-9"></path></svg>';
