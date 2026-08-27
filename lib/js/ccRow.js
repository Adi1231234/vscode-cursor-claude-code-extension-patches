/* Shared webview runtime: one order for the buttons patches inject into the
   composer footer.

   React re-renders that row, so every injected button has to re-anchor itself on
   a timer. Each patch did that with an absolute rule - "be the element
   immediately before .__qAdd" - and an absolute position over a shared parent is
   not composable: only one element can be immediately before anything, so two
   patches with the same target evict each other for as long as both are on
   screen.

   Measured before this existed, in a live panel over three seconds: the queue's
   log button moved 40 times and background-tasks' indicator moved 40 times,
   alternating between exactly two orders about every 150 ms. With auto-followup's
   button also in the contest it was the same story with three players.

   The fix is a relative order rather than competing absolutes. Every injected
   node declares a rank once; place() sorts the ones actually on screen and puts
   them in that order before the tail element, and moves a node only when its
   real predecessor differs from the one the order calls for. Any number of
   patches then converge, and no patch has to know that the others exist.

   Ranks are spaced so a later patch can land between two existing ones without
   renumbering anything. */
window.__ccRow = window.__ccRow || (function () {
  var RANK = {};

  /* Register once, at injection time, so a patch that is installed but currently
     rendering nothing still has its place reserved in the order. */
  function rank(cls, n) { RANK[cls] = n; }

  function has(el, cls) {
    /* No regular expression here on purpose. This file is injected inside a
       template literal, where a backslash is consumed before the browser ever
       parses it - so split(/[backslash]s+/) shipped as split(/s+/), a split on
       the letter s. A node carrying one class still matched and a node carrying
       two did not, so place() saw fewer ranked nodes than were there, decided
       the row was already correct, and moved nothing. It looked like the fix
       working. */
    var cn = " " + String((el && el.className) || "") + " ";
    return cn.indexOf(" " + cls + " ") >= 0;
  }

  /* tail: the app's own node that all of these sit before (the send button).
     Returns nothing; call it from the same tick loop that used to insertBefore. */
  function place(parent, tail) {
    if (!parent || !tail || tail.parentNode !== parent) return;
    var kids = [];
    for (var i = 0; i < parent.children.length; i++) {
      var c = parent.children[i];
      if (c === tail) continue;
      for (var cls in RANK) {
        if (RANK.hasOwnProperty(cls) && has(c, cls)) { kids.push({ node: c, r: RANK[cls] }); break; }
      }
    }
    if (kids.length < 2) {
      /* One injected node cannot argue with itself: keep the old behaviour so a
         patch installed on its own still lands next to the send button. */
      if (kids.length === 1 && tail.previousElementSibling !== kids[0].node) {
        parent.insertBefore(kids[0].node, tail);
      }
      return;
    }
    kids.sort(function (a, b) { return a.r - b.r; });
    /* Walk backwards from the tail so each node is compared against the one that
       should follow it, and move only what is actually out of place. A pass that
       finds the order already correct performs no DOM writes at all, which is
       what stops the churn. */
    var after = tail;
    for (var j = kids.length - 1; j >= 0; j--) {
      var n = kids[j].node;
      if (after.previousElementSibling !== n) parent.insertBefore(n, after);
      after = n;
    }
  }

  return { rank: rank, place: place, ranks: RANK };
})();
