// Run before the payload in Chrome: the preload's require("electron") answered
// with an ipcRenderer that records its listeners, so a check can play the main
// process and hand the page session events (window.__fakeIpc.emit) through the
// payload's real ipc.js path, channel name included.
window.__fakeIpc = { channels: [], emit: function (ev) {
    this.channels.forEach(function (c) { if (/LocalSessions_\$_onEvent$/.test(c.name)) c.fn({}, ev); });
} };
window.require = function (m) {
    if (m !== "electron") throw new Error("no module " + m);
    return { ipcRenderer: { on: function (name, fn) { window.__fakeIpc.channels.push({ name: name, fn: fn }); } } };
};
