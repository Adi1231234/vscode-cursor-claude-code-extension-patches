/* patches/input-usage/usage/text.js: the line's text and when it next changes.
 *
 *     node patches/input-usage/tests/text.test.js
 *
 * The windows below are the shape read off a live 2.1.292 panel on 2026-10-07
 * (globalThis.__ccUsageWindows().value): utilization 0..1, resetsAt in seconds. */
const fs = require('fs'), path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };

eval(fs.readFileSync(path.join(__dirname, '..', 'usage', 'text.js'), 'utf8'));

const NOW = Date.UTC(2026, 9, 7, 6, 15);
const inSec = (ms) => Math.floor((NOW + ms) / 1000);
const live = {
  five_hour: { utilization: 0.41, resetsAt: inSec(45 * 60e3) },
  seven_day: { utilization: 0.44, resetsAt: inSec(3 * 86400e3) }
};

let v = usageView(live, NOW);
ok(v.text === 'Session 59% left · Weekly 56% left', 'both windows: ' + v.text);
ok(v.nextAt === live.five_hour.resetsAt * 1000, 'next change is the nearer reset');

v = usageView({ five_hour: { utilization: 0.41, resetsAt: inSec(-1000) }, seven_day: live.seven_day }, NOW);
ok(v.text === 'Session 100% left · Weekly 56% left', 'a window past its reset is fully left: ' + v.text);
ok(v.nextAt === live.seven_day.resetsAt * 1000, 'a past reset is not the next change');

ok(usageView(null, NOW).text === null, 'no windows (an API key, no reading yet): no line');
ok(usageView({}, NOW).text === null, 'empty windows: no line');

v = usageView({ seven_day: { utilization: 1.3 } }, NOW);
ok(v.text === 'Weekly 0% left', 'over the limit stays at 0%, a lone window still shows: ' + v.text);
ok(v.nextAt === 0, 'no reset time: nothing to wait for');

ok(usageView({ five_hour: { utilization: 0.004 } }, NOW).text === 'Session 100% left', 'rounding');
ok(usageView({ seven_day_overage_included: { utilization: 0.5 } }, NOW).text === null, 'other windows are not shown');

console.log(`input-usage text: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
