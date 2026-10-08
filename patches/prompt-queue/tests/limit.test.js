/* The queue parks when a turn ends on a usage limit it will not continue
 * after - a weekly one, or the session limit with the setting off
 * (queue/usage-limit.js, queue/limit-resume.js).
 *
 *     node patches/prompt-queue/tests/limit.test.js
 *
 * The continue-at-the-reset side is limit-resume.test.js; both run on
 * limit-harness.js. */
const { queueWith, frame, rejected, tick, ok, done } = require('./limit-harness.js');

(async () => {
  let q = queueWith(['next', 'after']);
  q.busy(true);
  q.frame(rejected('seven_day'));
  q.frame({ type: 'result' });
  q.busy(false);
  ok(q.paused(), 'a turn that ended on a weekly limit parks the queue');
  ok(/weekly limit, resets .* - queue parked/.test(q.logs.join()), 'and the log says which limit and when it resets');
  ok(q.seen.length === 2, 'every frame still reaches the store (the app call is not altered)');
  ok(q.badge().textContent === 'usage limit' && /weekly limit/.test(q.badge().attrs.title), 'the header says why it is paused');
  ok(q.Q.length === 2 && !q.Q.some((it) => it.resume), 'and nothing is added to continue a weekly limit');

  q = queueWith(['next'], { resumeAfterLimit: false });
  q.run(rejected('five_hour'));
  ok(q.paused() && !q.Q.some((it) => it.resume), 'the session limit with the setting off parks too');

  q = queueWith(['next']);
  q.run(frame({ status: 'allowed', rateLimitType: 'five_hour' }));
  ok(!q.paused(), 'a turn that simply finished does not park it');
  ok(q.badge().textContent === '', 'and there is no badge');

  q = queueWith(['next']);
  q.run(rejected('seven_day', { overageStatus: 'allowed' }));
  ok(!q.paused(), 'a rejection usage credits cover is not a limit (the app reads it the same way)');

  q = queueWith(['next']);
  q.busy(true);
  q.frame(rejected('seven_day'));
  q.frame(frame({ status: 'allowed' }));
  q.busy(false);
  ok(!q.paused(), 'an allowed frame after the rejection clears it');

  q = queueWith(['next']);
  q.frame(rejected('seven_day', { resetsAt: Math.floor(Date.now() / 1000) - 3600 }));
  q.run();
  ok(q.paused(), 'a refusal whose reset time already passed still holds for a few minutes');

  q = queueWith([]);
  q.run(rejected('seven_day'));
  ok(!q.paused(), 'an empty queue has nothing to park');

  q = queueWith(['next']);
  q.frame(rejected('seven_day'));
  q.busy(false, true);
  ok(!q.paused(), 'the first value after a switch of conversation is no run\'s end');

  /* Play pressed while the limit still holds: the person sending anyway. */
  q = queueWith(['next', 'after']);
  q.run(rejected('seven_day'));
  q.pause(false);
  ok(q.badge().textContent === '', 'Play releases it, and the badge goes with the pause');
  q.run();
  ok(q.paused(), 'and a turn that ends while the limit still holds parks it again');

  q = queueWith(['next']);
  q.rehook();
  q.frame(rejected('seven_day'));
  await tick();
  ok(q.seen.length === 1, 'a second pass does not wrap the store twice');

  done();
})();
