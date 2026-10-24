/* The webview queue (patches/prompt-queue), run in the Desktop Code tab.
   In the editor it is one script - an IIFE inside a <script> - for the one
   panel. Here the same fragments are the body of a factory, called once per
   conversation by engines.js with that conversation's host (env-engine.js):
   every call is a queue with its own state. Only this wrapper, the surface
   (env-engine.js, env-desktop.js, env-send.js) and the stores underneath
   (desktop/lib/js/) are the desktop's own. */
window.__ccdQueueEngine = function (host) {
