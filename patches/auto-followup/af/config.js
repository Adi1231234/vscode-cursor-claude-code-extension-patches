<script nonce="${__NONCE__}">/* AUTOFOLLOWUP */(function(){
  /* Auto follow-up: when a turn ends, a second model reads what Claude wrote and
     types the next message in the user's place.

     Sections: config/state, host bridge, claims ledger, the lane, the composer
     button, the picker, the manage dialog, the loop.

     Why a slot of its own rather than an item in the prompt queue, which already
     sends one message per turn:

       1. commitComposerToQueue sets paused on an idle add, on purpose - that is
          how a batch is built. A follow-up is generated exactly when idle, so
          going through that path would pause the queue every single turn and the
          loop would never run.
       2. pauseOnStop returns early when the queue is empty. The slot is filled
          *after* a turn ends, so at the moment stop is pressed there is nothing
          in Q, paused never gets set, and the stop gesture would fail to stop the
          loop. Here the same interrupt() hook disarms directly, with no such
          condition.
       3. A queued item waits its turn. A follow-up written for turn N and sent
          three turns later is answering a conversation that has moved on, so the
          slot holds one message, replaced every turn, and never accumulates.
       4. The queue persists to localStorage and restores held. A follow-up is
          valid for one turn, so restoring one blindly after a reload would send
          a stale message into a conversation that has moved on. The slot is
          stored with the message it was written for and comes back only while
          that message is still the last thing Claude said - see af/persist.js.

     The user's own queue always wins: nothing is generated while items are
     waiting in it, so a batch the user typed is never overtaken. */

  /* ---------- Config and state ---------- */
  var TICK = 300;                  /* the loop's own poll, independent of the queue's */
  var SETTLE_MS = 700;             /* quiet after busy drops, before reading the reply */
  var CLAIM_KEY = "ccAfClaims:";   /* + session id */
  var ARM_KEY = "ccAfArmed:";      /* + session id */
  var FIRST_KEY = "ccAfFirst:";    /* + session id - has first_question been put */
  var ASKED_KEY = "ccAfAsked:";    /* + session id - what the panel actually sent */
  var STATE_KEY = "ccAfState:";  /* + session id - turns, slot, stop reason */
  var MAX_ASKED = 5;               /* enough to recognise a repeat, not a transcript */
  var MAX_CLAIMS = 60;             /* the ledger is a cue, not an archive */
  var MAX_TRANSCRIPT = 60000;      /* context: full-session, kept from the end */

  /* This whole script is injected into a template literal, so every backslash is
     evaluated before the browser ever sees it: a "
" written here arrives as a
     real newline and breaks the string it sits in, and a regex escape silently
     loses its backslash and changes what the pattern matches. Neither is visible
     to node --check of the fragment or of the patched bundle. See CLAUDE.md.
     Hence this, and character classes instead of escapes everywhere below. */
  var NL = String.fromCharCode(10);

  var armed = null;        /* the responder id, or null when off */
  var meta = null;         /* its parsed fields, from the host list */
  var list = [];           /* every responder the host knows about */
  var listSeen = false;    /* has the host ever answered with one - see tick */
  var askedListAt = 0;
  var turns = 0;           /* how many follow-ups this arming has produced */
  var slot = null;         /* {message, why, invalid} awaiting send, or null */
  var stopped = null;      /* the stop reason once the loop has ended */
  var paused = false;     /* held by hand, still armed - see setPaused */
  /* {running, onDisk, stale} from the host, so the panel can say when the
     bundle on disk is newer than the code this window is running. */
  var buildInfo = null;
  var pending = false;     /* a run is in flight */
  var lastSeen = "";       /* the reply already answered, so one turn is not answered twice */
  var wasBusy = false;
  var idleAt = 0;
  var rid = 0;
  var sid = "";

  /* ---------- DOM utilities ---------- */
  function el(tag, cls) {
    var x = document.createElement(tag);
    if (cls) x.className = cls;
    return x;
  }

  function txt(node, s) {
    node.textContent = s == null ? "" : String(s);
    return node;
  }

  function on(node, ev, fn) {
    node.addEventListener(ev, function (e) {
      e.preventDefault();
      e.stopPropagation();
      fn(e);
    });
    return node;
  }


  /* A div with a click handler is invisible to a keyboard and to a screen reader.
     Every control in the dialog was one: the settings were spans, the responders
     in the rail were divs, and the close was a span - so the whole dialog could
     be opened and then not used without a mouse.

     press() is the one place that fixes it: the same handler on click and on
     Enter or Space, plus the role and the tab stop that make it announce itself.
     Space is preventDefault-ed because on a focused element it scrolls. */
  function press(node, fn, role) {
    node.setAttribute("role", role || "button");
    node.setAttribute("tabindex", "0");
    on(node, "click", fn);
    node.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
      e.preventDefault();
      e.stopPropagation();
      fn(e);
    });
    return node;
  }

  function icon(name) {
    var s = {
      loop: '<path d="M8 2.2a5.8 5.8 0 1 1-5.1 3"/><path d="M2.4 1.9v3.4h3.4"/><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/>',
      pencil: '<path d="M11.2 2.6 13.4 4.8 5.6 12.6 2.6 13.4 3.4 10.4z"/>',
      dot: '<circle cx="8" cy="8" r="3" fill="currentColor" stroke="none"/>'
    }[name] || "";
    return '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
           'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' + s + '</svg>';
  }

  function qInp() {
    return globalThis.__ccInput ? globalThis.__ccInput() : null;
  }

  function qApi() {
    return window.__qAuto || null;
  }

  /* Through the queue's own ring, so Ctrl+Alt+L shows both patches in one place
     and there is not a second log to know about. window.__ccLog does not exist -
     ccLog lives inside the queue's IIFE - which is why this goes through the
     __qAuto surface rather than guessing at a global. */
  function log(a, b, c) {
    try { var q = qApi(); if (q && q.log) q.log(a, b, c); } catch (e) {}
  }
