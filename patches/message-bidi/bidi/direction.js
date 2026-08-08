<script nonce="${__NONCE__}">/* MSGBIDI */(function () {
  /* Which way each rendered message block should read.

     The app's markdown CSS marks every block unicode-bidi:plaintext, which makes
     the UA pick the base direction from the first strong character and ignore the
     rtl patch's direction:rtl entirely. So a Hebrew answer opening with an English
     word renders LTR and reads scrambled (see message-bidi.css for the full root
     cause). Here we replace that heuristic with a majority-of-letters one and put
     the verdict in the dir attribute; message-bidi.css is what lets dir win.

     Sections: classification (here), then apply + observer. */

  var MD = ".__MD__";                                        /* root_<hash> - one rendered markdown block */
  var BLOCKS = "p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th";    /* exactly what the app marks plaintext */
  var SKIP = "code,pre";                                     /* already forced LTR by the rtl patch */

  /* Strong direction of one code point: -1 RTL, 1 LTR, 0 weak/neutral.
     Numeric ranges rather than a regex on purpose - this file is injected inside
     a template literal, which would evaluate a backslash-u escape away (or fail
     to parse) long before the browser ever saw it. */
  function strength(c) {
    if (c >= 0x0590 && c <= 0x08FF) return -1;   /* Hebrew, Arabic, Syriac, Thaana, NKo, Samaritan */
    if (c >= 0xFB1D && c <= 0xFDFF) return -1;   /* Hebrew + Arabic presentation forms A */
    if (c >= 0xFE70 && c <= 0xFEFC) return -1;   /* Arabic presentation forms B */
    if (c >= 0x0041 && c <= 0x005A) return 1;    /* A-Z */
    if (c >= 0x0061 && c <= 0x007A) return 1;    /* a-z */
    if (c >= 0x00C0 && c <= 0x02AF) return 1;    /* Latin-1 supplement + Latin extended */
    if (c >= 0x0370 && c <= 0x058F) return 1;    /* Greek, Cyrillic, Armenian */
    return 0;
  }

  /* Sum of strong letters in a block: negative means RTL wins, positive LTR.
     Code spans are skipped - a flag or an identifier is terminology, not the
     language of the sentence, and it is rendered LTR regardless. Counting it
     would flip a short Hebrew line the moment it mentioned one. */
  function balance(el) {
    var walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var score = 0;
    var node, text, i;
    while ((node = walk.nextNode())) {
      if (node.parentElement && node.parentElement.closest(SKIP)) continue;
      text = node.nodeValue;
      for (i = 0; i < text.length; i++) score += strength(text.charCodeAt(i));
    }
    return score;
  }

  /* An empty answer (no letters at all, or a dead heat) leaves the block without
     a dir attribute, so it keeps inheriting the panel direction - and the CSS,
     scoped to [dir], leaves the app's own plaintext behaviour in place for it. */
  function decide(el) {
    var score = balance(el);
    return score < 0 ? "rtl" : score > 0 ? "ltr" : "";
  }
