// Run before the payload in Chrome: the preload's require("electron") answered
// with an ipcRenderer that records its listeners and what the page sends, so a
// check can play the main process:
//   __fakeIpc.emit(channel suffix, msg)  delivers to the payload's listeners
//   __fakeIpc.sent                       every { channel, msg } the page sent
//   __fakeIpc.invoked                    every { channel, args } it invoked
//   __fakeIpc.answers[name](args)        what an invoke of "...LocalSessions_$_<name>" resolves to
window.__fakeIpc = {
    channels: [], sent: [], invoked: [], answers: {},
    emit: function (suffix, msg) {
        this.channels.forEach(function (c) { if (c.name.slice(-suffix.length) === suffix) c.fn({}, msg); });
    }
};
window.require = function (m) {
    if (m !== "electron") throw new Error("no module " + m);
    var F = window.__fakeIpc;
    return { ipcRenderer: {
        on: function (name, fn) { F.channels.push({ name: name, fn: fn }); },
        send: function (name, msg) { F.sent.push({ channel: name, msg: msg }); },
        invoke: function (name) {
            var args = [].slice.call(arguments, 1), short = name.split("LocalSessions_$_").pop();
            F.invoked.push({ channel: short, args: args });
            return Promise.resolve(F.answers[short] ? F.answers[short](args) : null);
        }
    } };
};
