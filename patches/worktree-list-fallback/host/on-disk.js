/* `git worktree list`, read from the files git itself reads it from.

   The extension finds a worktree session by asking git for the repo's
   worktrees, and gives that call 5 s. When it fails - a timeout under the load
   of an editor starting with many panels is the measured case - the lister
   returns [] and every caller reads that as "this repo has no worktrees": the
   session is not found, the tab opens a new empty chat, and the tab's saved id
   is overwritten.

   This is the lister's answer in that case. git keeps its worktree registry as
   plain files: <common dir>/worktrees/<id>/gitdir holds "<worktree>/.git", and
   the main worktree is the folder holding the common dir. Same set, same order
   (main first, the rest sorted by path), same spelling (forward slashes), each
   path put through the lister's own mapper. Nothing readable gives [] - what
   the lister returned before. The decision goes to the extension host log. */
globalThis.__ccWorktreesOnDisk = globalThis.__ccWorktreesOnDisk || (function () {
    var fs = require("fs");
    var path = require("path");

    function gitPath(p) {
        return p.split(path.sep).join("/");
    }

    async function readText(file) {
        try {
            return (await fs.promises.readFile(file, "utf8")).trim();
        } catch (e) {
            return null;
        }
    }

    // What git accepts as a repository folder: a HEAD, and either its own
    // objects and refs or a `commondir` naming the folder that has them. A bare
    // `.git` folder without them (one sits at C:\ here) is walked past, as git does.
    function isGitDir(dir) {
        var has = function (n) { return fs.existsSync(path.join(dir, n)); };
        return has("HEAD") && (has("commondir") || (has("objects") && has("refs")));
    }

    // The folder that holds `.git`, walking up from dir the way git does.
    function findTop(dir) {
        var d = path.resolve(dir);
        for (;;) {
            var dotGit = path.join(d, ".git");
            if (fs.existsSync(dotGit) && (!fs.statSync(dotGit).isDirectory() || isGitDir(dotGit))) return d;
            var up = path.dirname(d);
            if (up === d) return null;
            d = up;
        }
    }

    // In the main worktree `.git` is the repository; in a linked one it is a
    // file "gitdir: <common>/worktrees/<id>" whose folder names the common dir
    // in its `commondir` file. A `.git` file without one (a submodule) is a
    // repository of its own, checked out where the file is.
    async function repoOf(top) {
        var dotGit = path.join(top, ".git");
        if (fs.statSync(dotGit).isDirectory()) return { common: dotGit, main: top };
        var m = /^gitdir:\s*(.+)$/m.exec((await readText(dotGit)) || "");
        if (!m) return null;
        var gitDir = path.resolve(top, m[1].trim());
        if (!isGitDir(gitDir)) return null;
        var common = await readText(path.join(gitDir, "commondir"));
        if (!common) return { common: gitDir, main: top };
        common = path.resolve(gitDir, common);
        return { common: common, main: path.basename(common) === ".git" ? path.dirname(common) : common };
    }

    async function linked(common) {
        var dir = path.join(common, "worktrees");
        var names;
        try {
            names = await fs.promises.readdir(dir);
        } catch (e) {
            return [];
        }
        var paths = await Promise.all(names.map(async function (n) {
            var g = await readText(path.join(dir, n, "gitdir"));
            return g ? gitPath(path.dirname(path.resolve(dir, n, g))) : null;
        }));
        return paths.filter(Boolean).sort(byPath);
    }

    // git's order for linked worktrees: by path, ignoring case where the file
    // system does, with "/" before any other character (adi-tools/.claude/...
    // comes before adi-tools-rc).
    function byPath(a, b) {
        var key = function (p) {
            p = process.platform === "linux" ? p : p.toLowerCase();
            return p.split("/").join(String.fromCharCode(0));
        };
        var x = key(a), y = key(b);
        return x < y ? -1 : x > y ? 1 : 0;
    }

    function log(cwd, err, text) {
        var why = err && (err.killed ? "timed out" : err.code || err.message);
        console.warn("[cc worktree-list-fallback] git worktree list failed in " + cwd + " (" + why + "); " + text);
    }

    return async function onDisk(cwd, map, err) {
        try {
            var top = findTop(cwd);
            var repo = top && await repoOf(top);
            if (!repo) {
                log(cwd, err, "no repository found on disk, so no worktrees");
                return [];
            }
            var main = gitPath(fs.realpathSync.native(repo.main));
            var list = [main].concat(await linked(repo.common)).map(function (p) { return map(p); });
            log(cwd, err, "read " + list.length + " worktree(s) from " + repo.common + " instead");
            return list;
        } catch (e) {
            log(cwd, err, "and reading them from disk failed too (" + e.message + ")");
            return [];
        }
    };
})();
