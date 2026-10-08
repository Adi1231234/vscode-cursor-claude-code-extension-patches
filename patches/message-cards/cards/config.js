<script nonce="${__NONCE__}">/* MSGCARDS */(function(){
  /* Every action in its own place, as one card - the two parts CSS cannot do:
     the badge's word (how long a command took, or how it exited), read off the
     session store, and a "Show all" where a clamp really hides something.
     Both are absolute inside their row, so arriving a frame after the app's
     render adds no height (CLAUDE.md: injected UI must add no height), and
     neither is a scroll anchor. Sections: config (here), the shared store / dom
     / watch runtimes, badge, more, observe. */

  /* The app's own classes, named exactly (patch.ps1 fills each one in), the
     same way the stylesheet names them. */
  var ROW = '[data-testid="assistant-message"]';
  var CONTENT = '.__TOOL_BODY_ROW_CONTENT__';
  var OUT_CONTENT = '.__TOOL_BODY_ROW__:not(.__INPUT_ROW__) ' + CONTENT;
  var RUNNING = '__DOT_PROGRESS__', FAILED = '__DOT_FAILURE__';
  var NL = String.fromCharCode(10);

  /* A command row: one of Claude's rows holding a tool call - the one the app
     gives a status class, and the one the stylesheet draws as a card. */
  function isTool(row) {
    var c = row && row.classList;
    return !!(c && row.matches(ROW) && (c.contains('__DOT_SUCCESS__') || c.contains(FAILED) || c.contains(RUNNING)));
  }
