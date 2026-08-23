/* BGTASKS host runtime - part 1: locating a session's log directories.

   The webview cannot read files (its content runs in a sandboxed iframe, so no node
   integration in either editor), so every log read happens here in the extension
   host and is pushed to the panel over a "__ccbg" message.

   Two directories per session:
     %TEMP%/claude/<cwd-slug>/<sessionId>/tasks/<taskId>.output       (any task)
     <config>/projects/<cwd-slug>/<sessionId>/subagents/[...]/agent-<id>.jsonl
   The <cwd-slug> is never recomputed here: its drive-letter casing differs between
   URI.fsPath and git, and a worktree gets its own slug. Session ids are uuids, so
   scanning one level down for the id is unambiguous - the same trick ccWtResolve.js
   uses. A caller that already knows a real output path can pass it as a hint and
   skip the scan entirely. */
globalThis.__ccBg = globalThis.__ccBg || (function () {
  var fs = require("fs"), path = require("path"), os = require("os");

  var INITIAL_TAIL = 262144;    /* bytes of an already-written log sent on open */
  var MAX_DELTA = 1048576;      /* bytes read per change notification */
  var COALESCE_MS = 60;         /* fs.watch fires repeatedly for one append */
  var MAX_HISTORY = 200;

  function configRoot() {
    return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  }

  function isDir(p) {
    try { return fs.statSync(p).isDirectory(); } catch (e) { return false; }
  }

  function findSessionDir(root, sid, leaf) {
    var names;
    try { names = fs.readdirSync(root); } catch (e) { return null; }
    for (var i = 0; i < names.length; i++) {
      var p = path.join(root, names[i], sid, leaf);
      if (isDir(p)) return p;
    }
    return null;
  }

  function tasksDir(sid, hint) {
    if (hint && isDir(hint)) return hint;
    if (!sid) return null;
    return findSessionDir(path.join(os.tmpdir(), "claude"), sid, "tasks");
  }

  function agentsDir(sid) {
    if (!sid) return null;
    return findSessionDir(path.join(configRoot(), "projects"), sid, "subagents");
  }

  /* agent-<id>.jsonl, plus the workflows/<runId>/ subdirectories */
  function walkAgents(dir, out, depth) {
    var ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (var i = 0; i < ents.length; i++) {
      var full = path.join(dir, ents[i].name);
      if (ents[i].isDirectory()) {
        if (depth < 3) walkAgents(full, out, depth + 1);
        continue;
      }
      var m = /^agent-(.+)\.jsonl$/.exec(ents[i].name);
      if (m) out.push({ taskId: m[1], kind: "agent", path: full });
    }
  }

  function stamp(items) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var st;
      try { st = fs.statSync(items[i].path); } catch (e) { continue; }
      if (!st.isFile() || st.size === 0) continue;
      out.push({ taskId: items[i].taskId, kind: items[i].kind, path: items[i].path, size: st.size, mtime: st.mtimeMs });
    }
    return out;
  }

  /* An agent's <taskId>.output is a hardlink (or, on fallback, a stale copy) of its
     transcript, so the transcript always wins for the same id. */
  function listHistory(sid, hint) {
    var agents = [];
    var ad = agentsDir(sid);
    if (ad) walkAgents(ad, agents, 0);
    var outputs = [];
    var td = tasksDir(sid, hint);
    if (td) {
      var names;
      try { names = fs.readdirSync(td); } catch (e) { names = []; }
      for (var i = 0; i < names.length; i++) {
        if (!/\.output$/.test(names[i])) continue;
        outputs.push({ taskId: names[i].slice(0, -7), kind: "text", path: path.join(td, names[i]) });
      }
    }
    var seen = Object.create(null), all = stamp(agents);
    for (var a = 0; a < all.length; a++) seen[all[a].taskId] = true;
    var texts = stamp(outputs);
    for (var t = 0; t < texts.length; t++) if (!seen[texts[t].taskId]) all.push(texts[t]);
    all.sort(function (x, y) { return y.mtime - x.mtime; });
    return all.slice(0, MAX_HISTORY);
  }
