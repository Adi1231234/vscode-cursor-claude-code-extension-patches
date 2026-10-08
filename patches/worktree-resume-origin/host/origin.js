/* Which folder a resumed session is launched in.

   The panel resumes a session whose recorded cwd is a worktree by launching
   the CLI inside that worktree. For a session that moved there itself, with
   EnterWorktree, that changes what the session is: the CLI takes the folder it
   was launched in as the session's live launch anchor, and from then on
   ExitWorktree will not move the session back to the folder it came from - it
   logs "not moving the permission anchor ... (a record-derived widening)",
   answers "Session is now back in <that folder>" all the same, leaves the
   transcript in the worktree's projects folder, and the next shell command puts
   the session back in the worktree. Delete the worktree then, and the session
   is gone from the panel's history.

   So a session whose own transcript says it entered the worktree is launched
   from the folder it entered it from, exactly as it was launched the first
   time. The CLI restores the worktree from that same record on its own, and
   ExitWorktree works again. A session that was started inside the worktree has
   no such record and is launched there as before. Anything unreadable keeps
   the panel's own choice: this only ever moves a launch back to a folder the
   session itself recorded. */
globalThis.__ccResumeOrigin = globalThis.__ccResumeOrigin || (function () {
    var fs = require("fs");
    var WORKTREE = /^(.*)[\\/]\.claude[\\/]worktrees[\\/][^\\/]+[\\/]?$/;

    function isDir(p) {
        try {
            return fs.statSync(p).isDirectory();
        } catch (e) {
            return false;
        }
    }

    /* The choice is invisible from the panel - the session simply opens - so
       say which way it went and why, in the extension's own log. */
    function say(logger, text) {
        try {
            if (logger && typeof logger.log === "function") logger.log("[worktree-resume-origin] " + text);
        } catch (e) {}
    }

    async function pick(sessionId, cwd, logger) {
        try {
            if (typeof sessionId !== "string" || !sessionId || typeof cwd !== "string") return cwd;
            var m = WORKTREE.exec(cwd);
            if (!m) return cwd;
            var file = await globalThis.__ccTranscript.find(sessionId);
            if (!file) {
                say(logger, sessionId + ": no transcript found, launching in " + cwd);
                return cwd;
            }
            var rec = await globalThis.__ccTranscript.worktreeOrigin(file);
            if (!rec.seen) {
                say(logger, sessionId + ": started inside " + cwd + ", launching it there");
                return cwd;
            }
            var s = rec.session;
            var origin = (s && (s.preEnterOriginalCwd || s.originalCwd)) || m[1];
            if (!isDir(origin)) {
                say(logger, sessionId + ": recorded origin " + origin + " is gone, launching in " + cwd);
                return cwd;
            }
            say(logger, sessionId + ": entered " + cwd + " itself, launching it from " + origin +
                " so the CLI restores the worktree and ExitWorktree can leave it");
            return origin;
        } catch (e) {
            say(logger, sessionId + ": kept " + cwd + " (" + e + ")");
            return cwd;
        }
    }

    return pick;
})();
