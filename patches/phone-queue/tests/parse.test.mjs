/* /queue's grammar, against mod/hooks/parse.js itself.
 *
 *     node patches/phone-queue/tests/parse.test.mjs
 *
 * Pinned: what a phone user types maps to exactly one queue command, a
 * multi-line message keeps its lines, and anything ambiguous is refused with a
 * reason rather than guessed into an add. */
import { parseQueue, queueArgs } from '../mod/hooks/parse.js'
import { parseDuration, parseClock, parseMoment } from '../mod/hooks/time.js'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)) }

// A fixed "now": 2026-10-02 13:00 local time.
const NOW = new Date(2026, 9, 2, 13, 0, 0).getTime()
const MIN = 60000

/* ---- which messages are /queue at all ---- */
ok(queueArgs('/queue') === '', '/queue alone has empty args')
ok(queueArgs('  /queue add hi ') === 'add hi', 'args are the rest, trimmed')
ok(queueArgs('/queued thing') === null, '/queued is not /queue')
ok(queueArgs('please /queue it') === null, 'only a message that starts with /queue')

/* ---- the plain verbs ---- */
ok(parseQueue('', NOW).op === 'menu', 'nothing after /queue opens the menu')
ok(parseQueue('list', NOW).op === 'list', '/queue list prints the whole queue')
ok(parseQueue('pause', NOW).op === 'pause' && parseQueue('PLAY', NOW).op === 'play', 'pause / play, any case')
ok(parseQueue('help', NOW).help === true, 'help')
ok(/unknown/i.test(parseQueue('pasue', NOW).error), 'a typo is refused, never added as a message')

/* ---- add ---- */
let c = parseQueue('add fix the login bug', NOW)
ok(c.op === 'add' && c.mode === 'queue' && c.text === 'fix the login bug', 'a plain add')
c = parseQueue('add line one\nline two', NOW)
ok(c.text === 'line one\nline two', 'a multi-line message keeps its lines')
c = parseQueue('add in 10m run the tests', NOW)
ok(c.mode === 'timer' && c.dur === 10 * MIN && c.text === 'run the tests' && c.hold === undefined,
  'a timer; the hold is left to the queue default')
c = parseQueue('add after 1h30m deploy', NOW)
ok(c.mode === 'after' && c.dur === 90 * MIN && c.text === 'deploy', 'after, with a compound length')
c = parseQueue('add at 14:30 nohold check mail', NOW)
ok(c.mode === 'time' && c.at === new Date(2026, 9, 2, 14, 30).getTime() && c.hold === false && c.text === 'check mail',
  'at a later time today, hold switched off')
c = parseQueue('add at 9:00 hold standup', NOW)
ok(c.at === new Date(2026, 9, 3, 9, 0).getTime() && c.hold === true, 'an hour already past today means tomorrow')
c = parseQueue('add at tomorrow 2:15pm x', NOW)
ok(c.at === new Date(2026, 9, 3, 14, 15).getTime(), '"tomorrow" and am/pm')
c = parseQueue('add hold the door', NOW)
ok(c.mode === 'queue' && c.text === 'hold the door', '"hold" only means the flag after a time')
ok(/length/.test(parseQueue('add in soon x', NOW).error), 'a timer needs a length')
ok(/time/.test(parseQueue('add at 25:00 x', NOW).error), 'an hour that does not exist is refused')
ok(/nothing to add/i.test(parseQueue('add in 5m', NOW).error), 'a schedule with no text is refused')

/* ---- the row commands ---- */
ok(JSON.stringify(parseQueue('del 2', NOW)) === '{"op":"del","ref":"2"}', 'del by number')
ok(parseQueue('rm s1', NOW).ref === 's1', 'a scheduled row by s-number')
ok(/which item/i.test(parseQueue('skip two', NOW).error), 'a row must be named by its number')
c = parseQueue('move 3 1', NOW)
ok(c.op === 'move' && c.ref === '3' && c.to === 1, 'move from, to')
ok(/where to/i.test(parseQueue('move 3', NOW).error), 'move needs a place')
c = parseQueue('edit 2 new words\nand a line', NOW)
ok(c.op === 'edit' && c.text === 'new words\nand a line', 'edit keeps the new text whole')
ok(parseQueue('now 1', NOW).op === 'now' && parseQueue('send 1', NOW).op === 'now', 'now / send')

/* ---- a time is read whole, never half-read ---- */
c = parseQueue('add at 9:00 pm deploy', NOW)
ok(c.at === new Date(2026, 9, 2, 21, 0).getTime() && c.text === 'deploy', '"9:00 pm" is 21:00, and "pm" is not the text')
c = parseQueue('add at 9pm deploy', NOW)
ok(c.at === new Date(2026, 9, 2, 21, 0).getTime() && c.text === 'deploy', '"9pm" with no minutes')
c = parseQueue('add at 14:00 tomorrow deploy', NOW)
ok(c.at === new Date(2026, 9, 3, 14, 0).getTime() && c.text === 'deploy', '"tomorrow" after the time')
c = parseQueue('add at 9am tomorrow hold standup', NOW)
ok(c.at === new Date(2026, 9, 3, 9, 0).getTime() && c.hold === true && c.text === 'standup', 'am, tomorrow and hold, in that order')
ok(/passed today/.test(parseQueue('add at 9:00 today x', NOW).error), '"today" with an hour gone is refused, not moved to tomorrow')
c = parseQueue('add in 20 minutes run the tests', NOW)
ok(c.mode === 'timer' && c.dur === 20 * MIN && c.text === 'run the tests', 'a length in words')
ok(/30 days/.test(parseQueue('add in 99999d x', NOW).error), 'no timer years away')
ok(/time/.test(parseQueue('add at 9 x', NOW).error), 'a bare "9" is not a time')

/* ---- what is refused rather than half-done ---- */
ok(/one item at a time/i.test(parseQueue('del 2 3', NOW).error), 'del of two items is refused, not done to the first')
ok(/unknown/i.test(parseQueue('constructor 2', NOW).error) && /unknown/i.test(parseQueue('__proto__ 1', NOW).error),
  'an object\'s own names are not commands')

/* ---- the menu's When field ---- */
const at = (h, m, d = 2) => new Date(2026, 9, d, h, m).getTime()
ok(parseMoment('in 2h', NOW).dur === 120 * MIN && parseMoment('20 min', NOW).dur === 20 * MIN, '"in 2h" and "20 min"')
ok(parseMoment('at 14:30', NOW).at === at(14, 30) && parseMoment('9:00 tomorrow', NOW).at === at(9, 0, 3), '"at 14:30" and "9:00 tomorrow"')
ok(parseMoment('soon', NOW) === null && parseMoment('14:30 please', NOW) === null, 'anything else is not a time')

/* ---- the units on their own ---- */
ok(parseDuration('45s') === 45000 && parseDuration('2d') === 2 * 86400000, 'seconds and days')
ok(parseDuration('') === 0 && parseDuration('m') === 0 && parseDuration('10') === 0, 'no unit is not a length')
ok(parseClock('12:00am', NOW, false) === new Date(2026, 9, 3, 0, 0).getTime(), '12am is midnight')
ok(parseClock('13:00', NOW, false) === new Date(2026, 9, 3, 13, 0).getTime(), 'exactly now is tomorrow, never the past')

console.log(fail ? fail + ' failed, ' + pass + ' passed' : pass + ' passed')
process.exit(fail ? 1 : 0)
