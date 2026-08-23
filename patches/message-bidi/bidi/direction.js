<script nonce="${__NONCE__}">/* MSGBIDI */(function () {
  /* Which way a rendered message should read.

     The app marks every markdown block unicode-bidi:plaintext, which makes the UA
     derive a base direction per block from its FIRST STRONG character and ignore
     the rtl patch's direction:rtl (see message-bidi.css for the full root cause).
     That heuristic is what the HTML standard calls "very crude" and reserves for
     text "whose direction is truly unknown" - here it is known, so we decide it
     once for the whole message and let every block inherit, which is what
     w3.org/International/questions/qa-html-dir prescribes for a document.

     The count is over WORDS, and a word is RTL when its first strong character is
     (so "he-benchmark" is a Hebrew word, not nine Latin letters), with the RTL
     share compared against 0.4 rather than a half. Both details are lifted from
     goog.i18n.bidi.estimateDirection, which is the same decision made in
     production: an RTL text nearly always carries Latin terminology, while the
     reverse is rare, so a symmetric vote is biased against RTL from the start.

     Sections: counting (here), then apply + observer. */

  var MD = ".__MD__";                                        /* root_<hash> - one rendered message */
  var BLOCKS = "p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th";    /* exactly what the app marks plaintext */
  var SKIP = "code,pre";                                     /* terminology, and forced LTR anyway */
  var RTL_SHARE = 0.4;

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

  /* The text of one block, minus code spans. Inline markup splits a word across
     text nodes ("he-" in the paragraph, "benchmark" inside <strong>), so the
     pieces are joined with nothing between them and only whitespace separates
     words - otherwise every emphasised term would be counted as its own word. */
  function textOf(el) {
    var walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var out = "";
    var node;
    while ((node = walk.nextNode())) {
      if (node.parentElement && node.parentElement.closest(SKIP)) continue;
      out += node.nodeValue;
    }
    return out;
  }

  /* One word, classified the way estimateDirection does: RTL if its first strong
     character is RTL, LTR if it holds any Latin letter at all, and otherwise not
     counted - a bare number or a URL is weak and must not carry the vote. */
  function tally(word, counts) {
    if (word.slice(0, 4) === "http") return;
    var first = 0;
    var hasLtr = false;
    for (var i = 0; i < word.length; i++) {
      var s = strength(word.charCodeAt(i));
      if (!s) continue;
      if (!first) first = s;
      if (s > 0) hasLtr = true;
    }
    if (first < 0) { counts.rtl++; counts.total++; return; }
    if (hasLtr) counts.total++;
  }

  /* Split on whitespace by code point, never with a regex: a backslash escape in
     this file is eaten by the template literal it is injected into, so a literal
     whitespace class would reach the browser as the letter it escapes. */
  function count(text, counts) {
    var word = "";
    for (var i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) <= 32) {
        if (word) { tally(word, counts); word = ""; }
        continue;
      }
      word += text.charAt(i);
    }
    if (word) tally(word, counts);
  }

  /* Does this text carry any strong letter of the given direction? That is the
     only per-block question left: a block with none of the message's own script
     is the "rare occasion" where a block may override the declared direction. */
  function holds(text, dir) {
    var want = dir === "rtl" ? -1 : 1;
    for (var i = 0; i < text.length; i++) if (strength(text.charCodeAt(i)) === want) return true;
    return false;
  }
