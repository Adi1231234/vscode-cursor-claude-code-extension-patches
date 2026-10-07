<script nonce="${__NONCE__}">/* INPUTUSAGE */(function(){
  /* How much of the 5-hour and the weekly usage is left, on a thin line at the
     very bottom of the composer box: "Session 77% left · Weekly 60% left".

     The numbers are the app's own. It keeps the account's rate-limit windows in
     one panel-wide signal, fed by every reply's rate_limit_event and by the
     host's panel_usage_update, and draws them only in the session list's
     "Account & usage" section. The webview half of this patch hands that
     signal out as globalThis.__ccUsageWindows(), and this script subscribes to
     it - a push, never a poll.

     Work per panel, by design (see "The webview runtime" in CLAUDE.md):
       - nothing at all while the numbers stand still;
       - one text write when a window moves a whole point;
       - one timer, set for the moment the next window resets, because a
         window past its reset reads as fully left with no new event;
       - one shared-observer subscription scoped to the composer box, which
         only checks that the line is still the box's last child.
     The line sits outside the footer row, so the app's footer fitter never
     sees it change.

     Sections: open (here), text, row, live. */
