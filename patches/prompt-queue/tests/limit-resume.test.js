/* A run the session (five-hour) limit cut carries on at the reset: a
 * "continue" at the front of the lane, timed a minute past it, holding the
 * rest (queue/limit-resume.js).
 *
 *     node patches/prompt-queue/tests/limit-resume.test.js */
const { queueWith, frame, refusal, result429, resultOk, said, answer, command, tick, ok, done, HOUR } = require('./limit-harness.js');
const MIN = 60000;

(async () => {
  const reset = Math.floor(Date.now() / 1000) + 2 * HOUR;
  let q = queueWith(['next', 'after']);
  q.run(...refusal('five_hour', { resetsAt: reset }));
  let r = q.Q[0];
  ok(r && r.resume === 'reset' && r.text === 'continue', 'a "continue" goes at the front of the queue');
  ok(r.mode === 'time' && r.hold && r.at === reset * 1000 + MIN, 'timed a minute past the reset, holding the rest');
  ok(!q.paused(), 'the queue is not parked - the continue is what holds it');
  ok(q.next() === null, 'nothing is sent before then');
  ok(q.lane()[0] === r && q.lane().length === 3, 'it is the first of the lane, the person\'s items behind it');
  ok(/continue at/.test(q.logs.join()), 'and the log says when');
  ok(q.badge().textContent === 'usage limit' && /continues by itself/.test(q.badge().attrs.title), 'the header says why, and when it goes on');

  /* A local command while it waits - /queue from the phone - is a run that
     ends with no 429: the continue must not move, nothing may park. */
  const at = r.at, start = r.start, logs = q.logs.length;
  q.run(resultOk);
  ok(r.at === at && r.start === start && q.logs.length === logs && !q.paused(), 'a run that was not refused leaves the continue alone');

  /* A floating scheduled item (an at-time that does not hold) is not behind
     the continue in the lane, and comes due while it waits: held all the same. */
  const floater = { id: 99, text: 'at noon', files: [], mode: 'time', at: Date.now() - 1, start: Date.now() - MIN, hold: false };
  q.Q.push(floater);
  ok(q.next() === floater && q.veto(floater) === true, 'while the limit holds nothing goes, a due floating item included');
  r.off = true;
  ok(q.veto(floater) === false, 'unless the person parked the continue - then it holds nothing');
  r.off = false;
  q.Q.pop();

  r.at = Date.now() - 1;
  ok(q.next() === r && q.veto(r) === false, 'at its time it is the one that sends');

  q = queueWith([]);
  q.pause(true);
  q.run(...refusal('five_hour'));
  ok(q.Q.length === 1 && q.Q[0].resume && !q.paused(), 'an empty queue gets one too, and a pause with nothing to hold is lifted');

  q = queueWith(['mine']);
  q.pause(true);
  q.run(...refusal('five_hour'));
  ok(q.paused() && q.Q[0].resume, 'a pause over the person\'s own items stays theirs');
  ok(/once you press play/.test(q.badge().attrs.title), 'and the header says the continue waits for Play');

  q = queueWith(['next']);
  q.run(...refusal('five_hour', { resetsAt: reset }));
  q.run(...refusal('five_hour', { resetsAt: reset + HOUR }));
  ok(q.Q.filter((it) => it.resume).length === 1 && q.Q[0].at === (reset + HOUR) * 1000 + MIN,
    'a second refusal moves the one continue rather than adding another');

  /* The continue went out at the reset and the server still refused it, and
     the CLI sent no new frame (the state did not change): the result alone
     says so. It must not drain the queue - it tries again in a few minutes. */
  q = queueWith(['next']);
  q.run(...refusal('five_hour', { resetsAt: Math.floor(Date.now() / 1000) + 120 }));
  const realNow = Date.now;
  Date.now = () => realNow() + 20 * MIN;        /* the reset, and the continue's minute, are behind us */
  try {
    q.Q.shift();                                 /* the continue was sent */
    q.run(result429);
    r = q.Q[0];
    ok(r && r.resume && r.at > Date.now() + 5 * MIN && r.at < Date.now() + 7 * MIN && q.Q.length === 2,
      'refused again past the reset with no new frame: a new continue in a few minutes, the rest still held');
  } finally {
    Date.now = realNow;
  }

  /* The weekly limit refuses while a session continue waits: the same item,
     now waiting for Play, the schedule gone. */
  q = queueWith(['next']);
  q.run(...refusal('five_hour'));
  const same = q.Q[0];
  q.run(...refusal('seven_day'));
  ok(q.Q[0] === same && same.resume === 'play' && same.mode === 'queue' && !same.at && q.paused() &&
    q.Q.filter((it) => it.resume).length === 1, 'a weekly refusal turns the waiting continue into one for Play');

  /* Somebody took over: a run of their own went through while it waited. */
  q = queueWith(['next']);
  q.run(...refusal('five_hour'));
  q.frame(frame({ status: 'allowed', rateLimitType: 'five_hour' }));
  await tick();
  ok(q.Q[0].resume, 'an allowed frame alone drops nothing - a side call on another model sends one too');
  q.runRows([said('/queue'), command('queue: 2 queued')], resultOk);
  ok(q.Q[0].resume, 'nor does a local command, in which no model answered');
  q.runRows([said('go on yourself'), answer('done')], resultOk);
  ok(!q.Q.some((it) => it.resume) && q.Q.length === 1 && /somebody took over/.test(q.logs.join()),
    'a prompt of their own that went through drops the continue');

  q = queueWith(['next'], { resumeAfterLimit: true });
  q.run(...refusal('five_hour'));
  const item = q.Q[0];
  const off = queueWith([], { resumeAfterLimit: false });
  ok(!off.veto({ text: 'x' }), 'the veto leaves a plain item alone');
  q = queueWith(['next'], { resumeAfterLimit: false });
  q.Q.unshift(Object.assign({}, item));
  ok(q.veto(q.Q[0]) && !q.Q.some((it) => it.resume) && q.paused(),
    'turned off in Settings after it was scheduled: it is dropped and the queue parks');

  done();
})();
