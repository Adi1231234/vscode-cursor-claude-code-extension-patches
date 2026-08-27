/* AUTOFOLLOWUP host runtime - part 2: the responders folder.

   Responders live in ~/.claude/responders/ (or $CLAUDE_CONFIG_DIR/responders/).
   Global on purpose: the same list appears in every editor window and every
   repository, and nothing has to be copied into a project. What is *armed* is per
   panel and lives in the webview, not here.

   The webview cannot read files - its content runs in a sandboxed iframe with no
   node integration in either editor - so every read and write happens in the
   extension host and travels over an "__ccaf" message.

   The file format itself is format.js. */
globalThis.__ccAfStore = globalThis.__ccAfStore || (function () {
  var fs = require("fs"), path = require("path"), os = require("os");

  var MAX_FILE = 262144;        /* a prompt is prose; anything larger is not one */

  function root() {
    var base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
    return path.join(base, "responders");
  }

  /* Created on first use rather than at install time: the folder belongs to the
     user, and an empty one nobody asked for is litter. */
  function ensureRoot() {
    var r = root();
    try { fs.mkdirSync(r, { recursive: true }); } catch (e) {}
    return r;
  }

  /* A responder's id is its filename without .md. Anything that could escape the
     folder is refused rather than sanitised - a silently renamed file is worse
     than a visible failure to save. */
  function safeId(id) {
    if (!id || typeof id !== "string" || id.length > 64) return null;
    if (!/^[A-Za-z0-9._-]+$/.test(id) || id === "." || id === "..") return null;
    return id;
  }

  function fileFor(id) {
    var s = safeId(id);
    return s ? path.join(root(), s + ".md") : null;
  }

  function read(id) {
    var f = fileFor(id);
    if (!f) return null;
    try {
      if (fs.statSync(f).size > MAX_FILE) return null;
      return globalThis.__ccAfFormat.parse(id, fs.readFileSync(f, "utf8"));
    } catch (e) { return null; }
  }

  function list() {
    var r = ensureRoot(), names;
    try { names = fs.readdirSync(r); } catch (e) { return []; }
    var out = [];
    names.forEach(function (n) {
      if (!/\.md$/i.test(n)) return;
      var one = read(n.replace(/\.md$/i, ""));
      if (one) out.push(one);
    });
    out.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    return out;
  }

  function save(r) {
    var f = fileFor(r && r.id);
    if (!f) return false;
    ensureRoot();
    try { fs.writeFileSync(f, globalThis.__ccAfFormat.serialize(r), "utf8"); return true; }
    catch (e) { return false; }
  }

  function remove(id) {
    var f = fileFor(id);
    if (!f) return false;
    try { fs.unlinkSync(f); return true; } catch (e) { return false; }
  }

  /* Written on first list() when the folder is empty, so the picker is never a
     blank menu with no way to learn the shape. These are examples, not defaults:
     deleting them is expected and nothing recreates them afterwards. */
  function seedIfEmpty(samples) {
    var r = ensureRoot();
    try { if (fs.readdirSync(r).some(function (n) { return /\.md$/i.test(n); })) return; }
    catch (e) { return; }
    (samples || []).forEach(function (s) {
      try { fs.writeFileSync(path.join(r, s.id + ".md"), s.text, "utf8"); } catch (e) {}
    });
  }

  return { root: root, list: list, read: read, save: save, remove: remove,
           seedIfEmpty: seedIfEmpty };
})();
