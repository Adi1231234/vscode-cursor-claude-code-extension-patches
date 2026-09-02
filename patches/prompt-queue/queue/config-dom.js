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

  /* A square ghost button whose whole label is an inline SVG - the shape every
     injected icon control in this panel already had, written once. */
  function iconBtn(icon, title, cls, fn) {
    var b = btn("__qIconBtn" + (cls ? " " + cls : ""), title);
    b.innerHTML = icon;
    b.setAttribute("aria-label", title);
    b.addEventListener("click", function (ev) { ev.stopPropagation(); fn(); });
    return b;
  }

  function swapAt(arr, i, j) {
    if (i < 0 || j < 0 || i >= arr.length || j >= arr.length) return false;
    var t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
    return true;
  }

  function inp() {
    return globalThis.__ccInput();                     /* cached in lib/js/ccStore.js */
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

