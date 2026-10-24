/* rows.js turns a CLI frame into the row shape ccReply reads. The frames come
 * from two sources with the same shape: the app's own event stream (ipc.js) and
 * a Remote Control conversation's WebSocket (remote-sub.js). This checks both of
 * that shape's forms - a user frame whose content is a plain string, and an
 * assistant frame whose content is an array - measured live on claude.ai. */
const fs = require("fs"), path = require("path"), vm = require("vm");
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "js", "rows.js"), "utf8"), ctx);
const row = ctx.window.__ccdRow;

let bad = 0;
function ok(c, m) { if (c) console.log("  ok   " + m); else { bad++; console.log("  FAIL " + m); } }

var u = row({ type: "user", uuid: "u1", message: { role: "user", content: "Reply with only TWO." } });
ok(u && u.type === "user" && u.content[0].content.text === "Reply with only TWO.", "a user frame with string content becomes a user row");
ok(u && u.model === undefined, "a user row has no model");

var a = row({ type: "assistant", uuid: "a1", message: { model: "claude-opus-5-5", content: [{ type: "text", text: "TWO" }] } });
ok(a && a.type === "assistant" && a.content[0].content.text === "TWO", "an assistant frame with array content becomes an assistant row");
ok(a && a.model === "claude-opus-5-5", "an assistant row carries the model - ccReply counts that as a model answering");

var syn = row({ type: "assistant", uuid: "s1", message: { model: "<synthetic>", content: [{ type: "text", text: "You've hit your limit" }] } });
ok(syn && syn.isSynthesizedByLoop && syn.model === undefined, "a <synthetic> assistant row is loop output and carries no model");

var stop = row({ type: "user", uuid: "x1", message: { role: "user", content: "[Request interrupted by user]" } });
ok(stop && stop.content[0].content.text === "[Request interrupted by user]", "a stop row keeps its interrupted text for ccReply");

ok(row({ type: "result", is_error: false }) === null, "a result frame makes no row (it drives processIncomingMessage, not messages)");
ok(row({ type: "rate_limit_event", rate_limit_info: {} }) === null, "a rate_limit_event frame makes no row");
ok(row(null) === null && row({}) === null, "a missing or typeless frame makes no row");

if (bad) { console.log(bad + " failed"); process.exit(1); }
console.log("rows: all passed");
