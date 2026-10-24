/* The webview queue (patches/prompt-queue), run in the Desktop Code tab.
   It is one script there - an IIFE inside a <script> - and the same fragments
   run here inside this patch's init, which boot.js calls once the DOM exists.
   Only this wrapper, the surface (env-desktop.js) and the store underneath
   (desktop/lib/js/session.js) are the desktop's own. */
window.__ccd.patch("prompt-queue", function () {
