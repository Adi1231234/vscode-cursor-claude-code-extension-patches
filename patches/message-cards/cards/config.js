<script nonce="${__NONCE__}">/* MSGCARDS */(function(){
  /* Every action in its own place, as one card - the two parts CSS cannot do:
     the badge's word (how long a command took, or how it exited), read off the
     session store, and a "Show all" where a clamp really hides something.
     Both are absolute inside their row, so arriving a frame after the app's
     render adds no height (CLAUDE.md: injected UI must add no height), and
     neither is a scroll anchor. Sections: config (here), the shared store / dom
     / watch runtimes, badge, more, observe. */

  var ROW = '[data-testid="assistant-message"]';
  var CONTENT = '[class*="toolBodyRowContent_"]';
  var OUT_CONTENT = '[class*="toolBodyRow_"]:not([class*="inputRow_"]) ' + CONTENT;
  var NL = String.fromCharCode(10);

  /* A command row: one of Claude's rows holding a tool call. */
  function isTool(row) {
    return !!(row && row.matches && row.matches(ROW) && row.querySelector(':scope > [class*="toolUse_"]'));
  }
