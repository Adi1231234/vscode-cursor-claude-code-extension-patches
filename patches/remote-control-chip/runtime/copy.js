/* Every string the chip shows, in one place: `tip` is the hover tooltip,
   `title` / `body` are the dialog's. Nothing here says "click to disconnect" -
   the dialog's buttons say what happens, which is the point of having one. */
var __ccRcCopy = {
    connecting: {
        tip: "Remote Control: connecting to claude.ai/code",
        title: "Remote Control is connecting",
        body: "This session is being handed to claude.ai/code so you can follow it from your phone or a browser.",
        action: "Stop connecting"
    },
    connected: {
        tip: "Remote Control: this session is also open on claude.ai/code",
        title: "Remote Control is active",
        body: "This session is also open on claude.ai/code. Keep working here, on your phone, or in a browser - it is the same conversation.",
        action: "Disconnect"
    },
    error: {
        tip: "Remote Control: could not connect",
        title: "Remote Control could not connect",
        body: "Remote Control failed to reach claude.ai/code.",
        action: "Disconnect"
    }
};

function __ccRcCopyFor(state) {
    var copy = __ccRcCopy[state.status] || __ccRcCopy.connected;
    if (state.status !== "error" || !state.error) return copy;
    return { tip: copy.tip + " (" + state.error + ")", title: copy.title, body: state.error, action: copy.action };
}
