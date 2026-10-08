/* A turn the session (five-hour) limit stopped carries on at the reset: a
 * "continue" at the front of the lane, timed a minute past it, holding the
 * rest (queue/limit-resume.js).
 *
 *     node patches/prompt-queue/tests/limit-resume.test.js */
const { queueWith, frame, rejected, tick, ok, done, HOUR } = require('./limit-harness.js');

(async () => {
  const reset = Math.floor(Date.now() / 1000) + 2 * HOUR;
  let q = queueWith(['next', 'after']);
  q.run(rejected('five_hour', { resetsAt: reset }));
  let r = q.Q[0];
  ok(r && r.resume && r.text === 'continue', 'a "continue" goes at the front of the queue');
  ok(r.mode === 'time' && r.hold && r.at === reset * 1000 + 60000, 'timed a minute past the reset, holding the rest');
  ok(!q.paused(), 'the queue is not parked - the continue is what holds it');
  ok(q.next() === null, 'nothing is sent before then');
  ok(q.lane()[0] === r && q.lane().length === 3, 'it is the first of the lane, the person\'s items behind it');
  ok(/continue at/.test(q.logs.join()), 'and the log says when');
  ok(q.badge().textContent === 'usage limit' && /continues by itself/.test(q.badge().attrs.title), 'the header says why, and when it goes on');

  r.at = Date.now() - 1;
  ok(q.next() === r, 'at its time it is the one that sends');

  q = queueWith([]);
  q.pause(true);
  q.run(rejected('five_hour'));
  ok(q.Q.length === 1 && q.Q[0].resume && !q.paused(), 'an empty queue gets one too, and a pause with nothing to hold is lifted');

  q = queueWith(['mine']);
  q.pause(true);
  q.run(rejected('five_hour'));
  ok(q.paused() && q.Q[0].resume, 'a pause over the person\'s own items stays theirs');

  q = queueWith(['next']);
  q.run(rejected('five_hour', { resetsAt: reset }));
  q.run(rejected('five_hour', { resetsAt: reset + HOUR }));
  ok(q.Q.filter((it) => it.resume).length === 1 && q.Q[0].at === (reset + HOUR) * 1000 + 60000,
    'a second refusal moves the one continue rather than adding another');

  q = queueWith(['next']);
  q.run(rejected('five_hour'));
  q.frame(frame({ status: 'allowed', rateLimitType: 'five_hour' }));
  await tick();
  ok(!q.Q.some((it) => it.resume) && q.Q.length === 1, 'a refusal lifted early (somebody took over) drops the continue');

  q = queueWith(['next'], { resumeAfterLimit: true });
  q.run(rejected('five_hour'));
  const item = q.Q[0];
  const off = queueWith([], { resumeAfterLimit: false });
  ok(!off.veto({ text: 'x' }), 'the veto leaves a plain item alone');
  q = queueWith(['next'], { resumeAfterLimit: false });
  q.Q.unshift(Object.assign({}, item));
  ok(q.veto(q.Q[0]) && !q.Q.some((it) => it.resume) && q.paused(),
    'turned off in Settings after it was scheduled: it is dropped and the queue parks');

  done();
})();
