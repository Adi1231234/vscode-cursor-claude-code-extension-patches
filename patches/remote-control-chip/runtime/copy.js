/* Every string the chip shows, in one place. `tip` is the hover tooltip;
   `title`, `lead` + `tail` (the pill goes between them) and `options` are the
   dialog's. The first option is the primary one and the last is the way out -
   the order the app's own confirm dialogs use. Nothing here says "click to
   disconnect": the options say what happens, which is the point of a dialog. */
var __ccRcCopy = {
    /* Off has a tooltip and no dialog: one click turns Remote Control on, so
       there is nothing to confirm. The wording follows the app's own inactive
       footer button, which says what is not happening and then "Click to ...". */
    disconnected: {
        tip: "Remote Control is off. Click to also open this session on claude.ai/code"
    },
    connecting: {
        tip: "Remote Control: connecting to claude.ai/code",
        title: "Remote Control is connecting",
        lead: "This session is being handed to ",
        tail: " so you can follow it from your phone or a browser.",
        options: [
            { label: "Keep connecting", kind: "close" },
            { label: "Stop connecting", kind: "disconnect" }
        ]
    },
    connected: {
        tip: "Remote Control: this session is also open on claude.ai/code",
        title: "Remote Control is active",
        lead: "This session is also open on ",
        tail: ". Keep working here, on your phone, or in a browser - it is the same conversation.",
        options: [
            { label: "Disconnect", kind: "disconnect" },
            { label: "Cancel", kind: "close" }
        ]
    },
    error: {
        tip: "Remote Control: could not connect",
        title: "Remote Control could not connect",
        lead: "It could not reach ",
        tail: ".",
        options: [
            { label: "Disconnect", kind: "disconnect" },
            { label: "Cancel", kind: "close" }
        ]
    }
};

function __ccRcCopyFor(state) {
    var copy = __ccRcCopy[state.status] || __ccRcCopy.connected;
    if (state.status !== "error" || !state.error) return copy;
    return {
        tip: copy.tip + " (" + state.error + ")",
        title: copy.title,
        lead: copy.lead,
        tail: ". " + state.error,
        options: copy.options
    };
}
