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

