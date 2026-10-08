/* The queue parks when a run is refused by a usage limit it will not
 * continue after - a weekly one, the session limit with the setting off, or
 * one it cannot name (queue/usage-limit.js, queue/limit-resume.js).
 *
 *     node patches/prompt-queue/tests/limit.test.js
 *
 * The continue-at-the-reset side is limit-resume.test.js; both run on
 * limit-harness.js. */
const { queueWith, frame, rejected, refusal, result429, resultOk, tick, ok, done } = require('./limit-harness.js');

(async () => {
  let q = queueWith(['next', 'after']);
  q.run(...refusal('seven_day'));
  ok(q.paused(), 'a run refused by a weekly limit parks the queue');
  ok(/weekly limit, resets .* - queue parked/.test(q.logs.join()), 'and the log says which limit and when it resets');
  ok(q.seen.length === 2, 'every frame still reaches the store (the app call is not altered)');
  ok(q.badge().textContent === 'usage limit' && /weekly limit.*Press play/.test(q.badge().attrs.title), 'the header says why it is paused');
  ok(q.Q.length === 2 && !q.Q.some((it) => it.resume), 'and nothing is added to continue a weekly limit');

  q = queueWith(['next'], { resumeAfterLimit: false });
  q.run(...refusal('five_hour'));
  ok(q.paused() && !q.Q.some((it) => it.resume), 'the session limit with the setting off parks too');

  q = queueWith(['next']);
  q.run(frame({ status: 'allowed', rateLimitType: 'five_hour' }), resultOk);
  ok(!q.paused(), 'a run that simply finished does not park it');
  ok(q.badge().textContent === '', 'and there is no badge');

  /* The state still says refused, but this run was not: a local command
     (/queue from the phone) ends with no 429. */
  q = queueWith(['next']);
  q.frame(rejected('seven_day'));
  q.run(resultOk);
  ok(!q.paused(), 'a run that was not refused parks nothing, whatever the state says');

  q = queueWith(['next']);
  q.run(rejected('seven_day', { overageStatus: 'allowed' }), resultOk);
  ok(!q.paused(), 'a rejection usage credits cover is not a limit (the app reads it the same way)');

  /* Refused with no frame at all: still a refusal, of a limit it cannot name. */
  q = queueWith(['next']);
  q.run(result429);
  ok(q.paused() && q.badge().textContent === 'usage limit', 'a 429 with no frame parks, and says so');

  q = queueWith([]);
  q.run(...refusal('seven_day'));
  ok(!q.paused(), 'an empty queue has nothing to park');

  q = queueWith(['next']);
  q.frame(rejected('seven_day'));
  q.frame(result429);
  q.busy(false, true);
  ok(!q.paused(), 'the first value after a switch of conversation is no run\'s end');

  /* Play pressed while the limit still holds: the person sending anyway. The
     CLI sends no new frame for the same refusal - only the result says it. */
  q = queueWith(['next', 'after']);
  q.run(...refusal('seven_day'));
  q.pause(false);
  ok(q.badge().textContent === '', 'Play releases it, and the badge goes with the pause');
  q.run(result429);
  ok(q.paused(), 'and a run refused again with no new frame parks it again');

  q = queueWith(['next']);
  q.rehook();
  q.frame(rejected('seven_day'));
  await tick();
  ok(q.seen.length === 1, 'a second pass does not wrap the store twice');

  done();
})();
