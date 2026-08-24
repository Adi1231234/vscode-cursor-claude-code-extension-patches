/* PANELRESTART */
/*
 * Reload one Claude webview in place - what "Developer: Reload Window" does to
 * every panel at once, aimed at a single one.
 *
 * getHtmlForWebview is the only place that knows how a given view was built
 * (sidebar / editor tab / session-list), so record the three shape flags per
 * webview as it runs and replay them on demand. The reload then differs from
 * the original render in exactly two ways: it points at the session the panel
 * is showing *now*, and it drops the one-shot initial prompt.
 *
 * Re-assigning .html re-runs webview/index.js from scratch. The fresh client
 * then sends `init` with no channelId, which is upstream's own signal that the
 * client reloaded: processRequest closes every channel this comms object still
 * holds. So the CLI process behind this panel is restarted as well, and the
 * booting webview resumes the same session id.
 */
__ccReloadWebview(view, sessionId) {
    const webview = view && view.webview;
    const shape = webview && this.__ccHtmlShape && this.__ccHtmlShape.get(webview);
    if (!shape) return false;
    webview.html = this.getHtmlForWebview(webview, sessionId, undefined, shape[0], shape[1], shape[2]);
    return true;
}

__SIGNATURE__
    (this.__ccHtmlShape || (this.__ccHtmlShape = new WeakMap())).set(__WEBVIEW__, [__SIDEBAR__, __FULL_EDITOR__, __LIST_ONLY__]);
