/* Shared host runtime: a session's transcript, found by id and read from the
   end.

   The CLI re-appends a session's metadata records (its title, its worktree,
   ...) with every flush, so the newest one of a kind sits near the end of the
   file. A transcript can run to tens of megabytes, so it is read backwards a
   chunk at a time, split on the newline byte: 0x0A never occurs inside a
   UTF-8 sequence, so no line is ever decoded from half a character. Guarded,
   so the first patch to inject it wins. Needs ccProjects.js. No backslash in
   here: lib/js is checked as if it could land in a template literal. */
globalThis.__ccTranscript = globalThis.__ccTranscript || (function () {
    var fs = require("fs");
    var path = require("path");
    var CHUNK = 256 * 1024;

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

    function parse(line, type, mark) {
        if (line.indexOf(mark) === -1) return undefined;
        try {
            var rec = JSON.parse(line);
            return rec && rec.type === type ? rec : undefined;
        } catch (e) {
            return undefined;
        }
    }

    /* Hands every record of this type to visit, newest first, until visit
       returns true or the file runs out. */
    async function scanBack(file, type, visit) {
        var mark = '"type":"' + type + '"';
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
                var lines = buf.subarray(cut + 1).toString("utf8").split(String.fromCharCode(10));
                for (var j = lines.length - 1; j >= 0; j--) {
                    var rec = parse(lines[j], type, mark);
                    if (rec !== undefined && visit(rec) === true) return;
                }
            }
        } finally {
            await fh.close();
        }
    }

    return { find: find, scanBack: scanBack };
})();
