// Run before the payload in Chrome: the preload's require("electron") answered
// with an ipcRenderer that records its listeners and what the page sends, so a
// check can play the main process: window.__fakeIpc.emit(channel suffix, msg)
// delivers to the payload's own listeners (ipc.js, the phone link), and
// window.__fakeIpc.sent holds every { channel, msg } the page sent.
window.__fakeIpc = {
    channels: [], sent: [],
    emit: function (suffix, msg) {
        this.channels.forEach(function (c) { if (c.name.slice(-suffix.length) === suffix) c.fn({}, msg); });
    }
};
window.require = function (m) {
    if (m !== "electron") throw new Error("no module " + m);
    return { ipcRenderer: {
        on: function (name, fn) { window.__fakeIpc.channels.push({ name: name, fn: fn }); },
        send: function (name, msg) { window.__fakeIpc.sent.push({ channel: name, msg: msg }); }
    } };
};
