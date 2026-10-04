/* What a run that is not Claude's, or a stop that is not this panel's, does to
 * the rest of the panel - the two found 2026-10-04:
 *   - a Stop from the phone never passes the panel's interrupt(), so the queue
 *     sent its next item the moment the turn ended;
 *   - every /queue is a run of its own, so it read as "Claude finished".
 * The stop is the client's (harness.mjs): over Remote Control the site's own
 * Stop button, in the panel the connection's interruptClaude() - the call the
 * panel's Stop ends in, made without going through the decorated interrupt(). */
import { later, same, texts } from './labels.mjs';

export const STOPS = [
  { name: 'a stop from outside the panel parks the queue', run: async (t) => {
    await t.reset([]);
    const rows = await t.ev('__ccStore().messages.value.length');
    // The log is a ring of 2000 lines, so lines are taken by their time stamp.
    const since = await t.ev('new Date().toISOString().slice(11, 23)');
    // Long enough that the stop lands mid-reply: a short story was done first.
    await t.flow('Write a 2000 word story about a lighthouse, in ten chapters. No tools.', [], { reply: false });
    await t.until('__qAuto.busy()', 20000);
    await t.ev('__qRemote.run({ op: "play" }) && __qRemote.run({ op: "add", mode: "queue", text: "Reply with exactly one word: never" }).queue');
    await t.until('false', 2500);                       // let the reply get going
    const how = await t.stop();
    await t.idle();
    await t.until('false', 2000);                       // a pass would have sent by now
    const q = await t.queue();
    const stopped = await t.ev('__ccStore().messages.value.slice(' + rows + ').some((m) => JSON.stringify(m.content || "").includes("interrupted by user"))');
    const log = await t.ev('__ccLogs().filter((l) => l.slice(0, 12) >= ' + JSON.stringify(since) + ' && /Stop did not see/.test(l)).length');
    return [[stopped, 'the turn was stopped, not finished first (stop: ' + how + ')'], [q.paused, 'the queue is paused'],
      [same(texts(q.lane), ['Reply with exactly one word: never']), 'the next item is still waiting'], [log > 0, 'the log says why']];
  } },
  { name: 'a menu nobody answers is withdrawn, and nothing is stopped or parked', run: async (t) => {
    const { at } = later();
    await t.reset([{ text: 'later', mode: 'time', at }]);
    await t.ev('__qRemote.run({ op: "play" }).error');
    const before = await t.ev('__ccStore().messages.value.length');   // the case before this one stops a turn
    await t.flow('/queue', [], { reply: false });
    const d = await t.ev('__e2e.next()');
    /* What the host posts once the mod's wait runs out (register.js), with the
       question as the panel drew it - its spacing differs from the mod's. */
    const msg = { type: '__ccphone', op: 'run', id: -1, sid: await t.ev('__qRemote.sid()'), cmd: { op: 'drop', question: d.question } };
    await t.ev('window.dispatchEvent(new MessageEvent("message", { data: ' + JSON.stringify(msg) + ' })) && "sent"');
    const gone = await t.until('!__e2e.dialog()', 5000);
    await t.idle();
    const q = await t.queue();
    const stops = await t.ev('__ccStore().messages.value.slice(' + before + ').filter((m) => JSON.stringify(m.content || "").includes("interrupted by user")).length');
    return [[gone === true, 'the dialog is gone'], [stops === 0, 'no stop was written'],
      [!q.paused && q.scheduled.length === 1, 'the queue is neither parked nor changed']];
  } },
  { name: 'a /queue command is not a reply: no "Claude finished"', run: async (t) => {
    await t.reset([{ text: 'a' }]);
    await t.flow('/queue list', []);
    await t.idle();
    const last = await t.ev('__ccLogs().filter((l) => /\\[notify\\] quiet/.test(l)).slice(-1)[0] || ""');
    const row = await t.ev('(() => { const r = [...document.querySelectorAll("[class*=timelineMessage_]")].filter((n) => /^queue: /.test(n.innerText)).pop(); return __ccReply.isClaudeRow(r); })()');
    return [[/nothing from Claude/.test(last), 'the finish notice stayed quiet: ' + last],
      [row === false, 'the command row is not taken for a reply']];
  } },
];
