/* Reads what a session's own transcript says about its worktree.

   The CLI writes a {"type":"worktree-state"} record only when the session
   itself moved into a worktree (EnterWorktree) - a session that was started
   inside a worktree has none - and re-appends it with every metadata flush.

   { seen, session }: seen is whether the file holds any worktree record at
   all; session is the newest record that still names a worktree session (an
   ExitWorktree writes a null one after it), or null. Needs ccTranscript.js. */
globalThis.__ccWorktreeOrigin = globalThis.__ccWorktreeOrigin || async function (file) {
    var out = { seen: false, session: null };
    await globalThis.__ccTranscript.scanBack(file, "worktree-state", function (rec) {
        out.seen = true;
        if (!rec.worktreeSession) return false;
        out.session = rec.worktreeSession;
        return true;
    });
    return out;
};
