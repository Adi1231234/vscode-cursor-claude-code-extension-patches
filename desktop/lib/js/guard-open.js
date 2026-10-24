/* The renderer payload runs only in the claude.ai page itself.
   The preload it rides in (mainView.js) also runs in the empty about:blank
   documents of the same window - measured in the app: a probe reported from
   one - and a second copy of the queue there answered the phone "not mine"
   for the same window, racing the copy that had the conversation. The whole
   payload is this one function; guard-close.js ends it. */
(function () {
    if (!/^https:\/\/claude\.ai\//.test(String(typeof location === "undefined" ? "" : location.href))) return;
