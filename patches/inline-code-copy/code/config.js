<script nonce="${__NONCE__}">/* INLINECODE */(function(){
  /* Double-click an inline code chip in the transcript to copy it.
     Fenced code blocks are excluded: the app already gives those their own copy
     button, and inside one a double-click is how you select a word.
     One delegated listener and a body-mounted toast - nothing is added inside
     the message list, so the transcript's height (and the app's scroll pinning)
     is untouched. Sections: config (here), clipboard runtime, the handler. */

  var MSGS = '[class*="messagesContainer_"]';   /* only the chat, not the composer */
  var RING = "__ccCodeOk";                      /* brief outline on the chip that was copied */
  var RING_MS = 900;
  var TOAST_MS = 900;
  var FADE_MS = 260;
