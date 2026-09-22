/* Why a finish did, or did not, become a notification.

   This feature is silent by design, and a silent feature has one bad failure
   mode: when nothing happens there is no way to tell whether it decided to stay
   quiet, or never saw the run at all. One run in this panel's testing produced
   no toast and could not be explained afterwards, because nothing had been
   written down. So every decision leaves a line.

   It writes into the queue patch's own in-panel ring (Ctrl+Alt+L opens the
   viewer, window.__ccLogs() reads it) rather than starting a second log. If
   that patch is not installed there is nowhere to write and this is a no-op -
   the feature must not depend on its own diagnostics. */
function __ccSettingsNote(decision, detail) {
    try {
        if (typeof window.__ccLog === "function") {
            window.__ccLog("notify", decision, detail === undefined ? "" : detail);
        }
    } catch (e) {}
}
