/* Reads what a session's own transcript says about its worktree.

   The CLI writes a {"type":"worktree-state"} record only when the session
   itself moved into a worktree (EnterWorktree) - a session that was started
   inside a worktree has none - and re-appends it with every metadata flush, so
   the newest one sits near the end of the file. A transcript can run to tens of
   megabytes, so it is read backwards a chunk at a time, split on "\n" at the
   byte level: 0x0A never occurs inside a UTF-8 sequence, so no line is ever
   decoded from half a character. */
globalThis.__ccTranscript = globalThis.__ccTranscript || (function () {
    var fs = require("fs");
    var path = require("path");
    var CHUNK = 256 * 1024;
    var MARK = '"type":"worktree-state"';

    /* The folder a transcript sits in is keyed by the directory the session
       was in, and a session that entered a worktree took its file along - so
       it cannot be derived from the cwd the panel holds. Look for the id in
       every folder, which is what the CLI itself does for --resume <id>. */
    async function find(sessionId) {
        var root = globalThis.__ccProjectsDir();
        var entries;
        try {
            entries = await fs.promises.readdir(root, { withFileTypes: true });
        } catch (e) {
            return null;
        }
        for (var i = 0; i < entries.length; i++) {
            if (!entries[i].isDirectory()) continue;
            var file = path.join(root, entries[i].name, sessionId + ".jsonl");
            try {
                await fs.promises.access(file);
                return file;
            } catch (e) {}
        }
        return null;
    }

    function parse(line) {
        if (line.indexOf(MARK) === -1) return undefined;
        try {
            var rec = JSON.parse(line);
            return rec && rec.type === "worktree-state" ? rec : undefined;
        } catch (e) {
            return undefined;
        }
    }

    /* { seen, session }: seen is whether the file holds any worktree record at
       all; session is the newest record that still names a worktree session
       (an ExitWorktree writes a null one after it), or null. */
    async function worktreeOrigin(file) {
        var out = { seen: false, session: null };
        var fh = await fs.promises.open(file, "r");
        try {
            var end = (await fh.stat()).size;
            var carry = Buffer.alloc(0);
            while (end > 0) {
                var start = Math.max(0, end - CHUNK);
                var chunk = Buffer.alloc(end - start);
                await fh.read(chunk, 0, chunk.length, start);
                var buf = Buffer.concat([chunk, carry]);
                end = start;
                /* The first line may have started in the chunk before this
                   one: hold it back until that chunk is joined on. A line
                   longer than a whole chunk is held back entire. */
                var cut = start > 0 ? buf.indexOf(10) : -1;
                if (start > 0 && cut === -1) {
                    carry = buf;
                    continue;
                }
                carry = buf.subarray(0, Math.max(cut, 0));
                var lines = buf.subarray(cut + 1).toString("utf8").split("\n");
                for (var j = lines.length - 1; j >= 0; j--) {
                    var rec = parse(lines[j]);
                    if (rec === undefined) continue;
                    out.seen = true;
                    if (rec.worktreeSession) {
                        out.session = rec.worktreeSession;
                        return out;
                    }
                }
            }
            return out;
        } finally {
            await fh.close();
        }
    }

    return { find: find, worktreeOrigin: worktreeOrigin };
})();
