/* When does an open count as finished? The patched wait beside the app's own,
   on a fake clock, in the three states a panel can be in.
 *     node patches/restore-breaker-frames/tests/settle.test.js */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const here = __dirname;
let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) passed++;
  else { failed++; console.log("  FAIL " + msg); }
}

/* A clock with timers and frames. `frames` false is a renderer that delivers
   none; `stallAfter` lets that many through and then stops. */
function world({ hidden = false, frames = true, stallAfter = Infinity } = {}) {
  let now = 0, seq = 0, delivered = 0;
  const timers = new Map(), logs = [], rafs = new Set();
  const at = (ms, fn) => { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id; };
  const ctx = {
    document: { visibilityState: hidden ? "hidden" : "visible" },
    setTimeout: (fn, ms) => at(ms, fn),
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame: (fn) => {
      const live = frames && delivered < stallAfter;
      const id = live ? at(16, () => { delivered++; rafs.delete(id); fn(); }) : ++seq;
      rafs.add(id);
      return id;
    },
    cancelAnimationFrame: (id) => { timers.delete(id); rafs.delete(id); },
    __ccLog: (...a) => logs.push(a.join(" ")),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  ctx.advance = (ms) => {
    const end = now + ms;
    for (;;) {
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].fn();
    }
    now = end;
  };
  ctx.now = () => now;
  ctx.logs = logs;
  ctx.pendingFrames = () => rafs.size;
  return ctx;
}

function patched(opts) {
  const ctx = world(opts);
  const src = fs.readFileSync(path.join(here, "..", "js", "settle.js"), "utf8")
    .split("__NAME__").join("wait").split("__DELAY__").join("3000");
  vm.runInContext(src, ctx);
  return ctx;
}
function upstream(opts) {
  const ctx = world(opts);
  vm.runInContext(fs.readFileSync(path.join(here, "upstream-2.1.301.js"), "utf8"), ctx);
  ctx.wait = ctx.qx5;
  return ctx;
}

/* Starts the wait and reports when `done` ran (or null within 60 s). */
function run(make, opts, cancelAt) {
  const w = make(opts);
  let doneAt = null;
  const cancel = w.wait(() => { doneAt = w.now(); });
  if (cancelAt !== undefined) { w.advance(cancelAt); cancel(); }
  w.advance(60000);
  return { doneAt, logs: w.logs, pending: w.pendingFrames() };
}

/* A panel that paints: both settle after two frames and the app's 3 s. */
let u = run(upstream), p = run(patched);
ok(u.doneAt === 3032, "upstream settles after two frames + 3000 ms (" + u.doneAt + ")");
ok(p.doneAt === 3032, "patched settles at the same moment (" + p.doneAt + ")");
ok(p.logs.length === 0, "and says nothing");

/* A hidden document: neither asks for frames. */
u = run(upstream, { hidden: true }); p = run(patched, { hidden: true });
ok(u.doneAt === 3000 && p.doneAt === 3000, "hidden: both settle at 3000 ms");

/* A visible panel that gets no frames - the docvoice window of 2026-10-18. */
u = run(upstream, { frames: false }); p = run(patched, { frames: false });
ok(u.doneAt === null, "no frames: upstream never settles, so the open counts against the conversation");
ok(p.doneAt === 6000, "no frames: patched settles once the timer proves the panel alive (" + p.doneAt + ")");
ok(p.logs.length === 1 && /not painting/.test(p.logs[0]), "and logs why");
ok(p.pending === 0, "and leaves no frame request behind");

/* One frame, then nothing. */
p = run(patched, { stallAfter: 1 });
ok(p.doneAt === 6000 && p.pending === 0, "a stall after the first frame settles too, its second frame cancelled");

/* Cancelled before it settles (the conversation changed): nothing runs. */
p = run(patched, { frames: false }, 1000);
ok(p.doneAt === null && p.pending === 0 && p.logs.length === 0, "cancel stops the frames, the timer and the log");
p = run(patched, {}, 1000);
ok(p.doneAt === null, "cancel during the 3 s stops it as well");

console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
