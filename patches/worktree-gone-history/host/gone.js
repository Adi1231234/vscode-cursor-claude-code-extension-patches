/* The worktrees of a repo that git no longer lists, given back to the code that
   finds sessions.

   Every place the extension looks for a session - the history list, the lookup
   that loads a transcript by id, the resume precheck - takes the repo's
   worktrees from `git worktree list` and searches their projects folders. A
   session that was still inside a worktree when it was deleted has its
   transcript in exactly such a folder, so from that moment no lookup reaches it.

   This takes the list git returned and appends one path per projects folder
   that is named after a worktree of this repo (<repo key>--claude-worktrees-
   <name>) but matches none of the listed ones and has no live checkout behind
   it. Only the key of the path matters to the callers - they turn it back into
   a folder name - so the path is rebuilt from that name. Anything unreadable
   returns the list unchanged. */
globalThis.__ccGoneWorktrees = globalThis.__ccGoneWorktrees || (function () {
    var fs = require("fs");
    var path = require("path");

    function keyOf(p) {
        var k = globalThis.__ccProjectKey(p);
        return k ? k.toLowerCase() : null;
    }

    async function withGone(listed, root) {
        try {
            if (!Array.isArray(listed) || typeof root !== "string" || !root) return listed;
            var key = keyOf(root);
            if (!key) return listed;
            var prefix = key + "--claude-worktrees-";
            var known = {};
            listed.forEach(function (p) { var k = keyOf(p); if (k) known[k] = true; });
            var entries = await fs.promises.readdir(globalThis.__ccProjectsDir(), { withFileTypes: true });
            var out = listed.slice();
            for (var i = 0; i < entries.length; i++) {
                var name = entries[i].name;
                var lower = name.toLowerCase();
                if (!entries[i].isDirectory() || lower.indexOf(prefix) !== 0 || known[lower]) continue;
                var wt = path.join(root, ".claude", "worktrees", name.slice(prefix.length));
                if (fs.existsSync(path.join(wt, ".git"))) continue;
                known[lower] = true;
                out.push(wt);
            }
            return out;
        } catch (e) {
            return listed;
        }
    }

    return withGone;
})();
