/* AUTOFOLLOWUP host runtime - part 0: which build is running.

   Twice now a change was applied to the bundle, the window was reloaded, and the
   old behaviour was still on screen - with no way to tell, from the panel, which
   of the two was true: the reload had not restarted this window's extension
   host, or it had and the change was not doing what it was meant to. The two
   need completely different work, and guessing which one it is has cost hours.

   So every patched bundle carries a stamp, and the host can answer the question
   directly. It reads the extension.js it was loaded from - the file, now, on
   disk - and compares the stamp in there with the one compiled into itself:

     running   what this extension host actually has in memory
     onDisk    what the last apply.ps1 wrote
     stale     they differ, so a reload of this window would change the code

   A window that has never been reloaded since the patch reports stale, and the
   panel says so on the button rather than leaving someone to wonder. */
globalThis.__ccAfBuild = globalThis.__ccAfBuild || (function () {
  /* The literal the reader below looks for. It has to be a plain string in the
     file, not something assembled at run time, because what is being read is the
     file rather than this program. */
  /* ccAfStamp:"__CCSTAMP__" */
  var RUNNING = "__CCSTAMP__";
  var MARK = "ccAfStamp:";

  /* The stamp as it appears in the file, so it can be found again by reading it:
     ccAfStamp:<value>. Written by this very line, which is why it is built from
     pieces - a literal would match itself and every read would find the needle
     rather than the one in the file. */
  function needle() { return MARK + '"'; }

  function onDisk() {
    var file = "";
    try { file = __filename; } catch (e) {}
    if (!file) {
      /* An extension host that does not expose __filename to this scope: ask the
         editor where the extension lives. */
      try {
        var vscode = require("vscode");
        var ext = vscode.extensions.getExtension("Anthropic.claude-code")
               || vscode.extensions.getExtension("anthropic.claude-code");
        if (ext) file = require("path").join(ext.extensionPath, "extension.js");
      } catch (e) {}
    }
    if (!file) return "";
    try {
      var text = require("fs").readFileSync(file, "utf8");
      var at = text.indexOf(needle());
      if (at < 0) return "";
      var from = at + needle().length;
      var to = text.indexOf('"', from);
      return to > from ? text.slice(from, to) : "";
    } catch (e) { return ""; }
  }

  function state() {
    var disk = onDisk();
    return { running: RUNNING, onDisk: disk, stale: !!disk && disk !== RUNNING };
  }

  return { running: RUNNING, state: state, mark: MARK + '"' + RUNNING + '"' };
})();
