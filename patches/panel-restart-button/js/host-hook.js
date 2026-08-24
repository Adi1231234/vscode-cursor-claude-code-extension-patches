/* PANELRESTART host hook - installed at the top of every chat surface's
   onDidReceiveMessage by Add-WebviewMessageHook. The restart request is ours,
   not part of the app's protocol, so it stops here. */

if (__MSG__ && __MSG__.type === "ccReloadPanel") {
    this.__ccReloadWebview(__WV__, __MSG__.sessionId);
    return;
}
