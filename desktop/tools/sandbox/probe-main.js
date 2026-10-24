/* Sandbox-only probe, main side: writes what probe-renderer.js reports to
   C:\ccd\out\probe.json (the folder the sandbox shares with the host), and a
   line to probe-main.log when it loads and on every report, so a silence can
   be told apart from a main payload that never ran. */
(function () {
    if (typeof process === "undefined" || process.type !== "browser") return;
    var fs = require("fs");
    var OUT = "C:\\ccd\\out\\";
    function line(s) { try { fs.appendFileSync(OUT + "probe-main.log", new Date().toISOString() + " " + s + "\n"); } catch (e) {} }
    line("main probe loaded; CC_PHONE_QUEUE_URL set later, PLUGIN_DIRS=" + (process.env.CLAUDE_CODE_PLUGIN_DIRS || ""));
    require("electron").ipcMain.on("ccd-probe", function (ev, data) {
        line("report from " + (ev.senderFrame ? ev.senderFrame.url : "?") + " phoneUrl=" + (process.env.CC_PHONE_QUEUE_URL ? "set" : "unset"));
        try { fs.writeFileSync(OUT + "probe.json", JSON.stringify(data, null, 1)); } catch (e) { line("write failed: " + e.message); }
    });
    /* cmd.json from the host: handed to every claude.ai page (probe-actions.js). */
    var last = "";
    function sendCmd() {
        var raw = "";
        try { raw = fs.readFileSync(OUT + "cmd.json", "utf8"); } catch (e) { return; }
        if (!raw || raw === last) return;
        last = raw;
        var cmd;
        try { cmd = JSON.parse(raw); } catch (e) { line("bad cmd.json"); return; }
        require("electron").webContents.getAllWebContents().forEach(function (wc) {
            if (wc.getURL().indexOf("https://claude.ai/") === 0) { wc.send("ccd-probe-cmd", cmd); line("cmd " + cmd.id + " " + cmd.action + " -> " + wc.getURL()); }
        });
    }
    try { fs.watch(OUT, function (_t, name) { if (name === "cmd.json") setTimeout(sendCmd, 100); }); } catch (e) { line("watch failed: " + e.message); }
})();
