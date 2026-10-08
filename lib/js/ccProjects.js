/* Shared host runtime: where the CLI keeps its transcripts, and how it names
   the folder of a directory in there.

   ~/.claude/projects/<key>/<sessionId>.jsonl, where <key> is the directory with
   every character that is not a letter or a digit turned into "-". Past 200
   characters the CLI truncates the key and appends a hash; that is not
   reproduced here, so a key that long comes back null and the caller leaves it
   alone. Guarded, so the first patch to inject it wins. */
globalThis.__ccProjectsDir = globalThis.__ccProjectsDir || function () {
    var path = require("path");
    var base = process.env.CLAUDE_CONFIG_DIR || path.join(require("os").homedir(), ".claude");
    return path.join(base, "projects");
};

globalThis.__ccProjectKey = globalThis.__ccProjectKey || function (dir) {
    if (typeof dir !== "string" || !dir) return null;
    var key = dir.replace(/[^a-zA-Z0-9]/g, "-");
    return key.length > 200 ? null : key;
};
