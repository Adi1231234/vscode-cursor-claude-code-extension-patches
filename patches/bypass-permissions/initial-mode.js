/* BYPASS-INITIAL-MODE */
getInitialPermissionMode() {
    // The host hands this back to the webview as config.initialPermissionMode, and
    // the webview writes it over every session's permissionMode signal - so this,
    // not the signal's seed, is what decides the mode a session launches in.
    // Answer bypassPermissions before the persisted globalState default is read
    // (the auto-mode rollout leaves "auto" sitting there). When bypassing is not
    // allowed at all, fall through to the stock resolution: a bypass mode would be
    // downgraded at launch anyway.
    if (this.getAllowDangerouslySkipPermissions()) return "bypassPermissions";
