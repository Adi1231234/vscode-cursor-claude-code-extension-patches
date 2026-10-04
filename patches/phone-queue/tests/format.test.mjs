/* What /queue prints, against mod/hooks/format.js itself.
 *
 *     node patches/phone-queue/tests/format.test.mjs
 *
 * Pinned: the numbers printed are the ones the commands take (1.. in order,
 * s1.. at their own time), every state the panel shows on a row is a mark on
 * that row, a refusal comes first, and the reply reads the same raw (the
 * Claude app) and as markdown (the panel) - see tests/plain.mjs. */
import { formatQueue, formatResult } from '../mod/hooks/format.js'
import { HINT } from '../mod/hooks/help.js'
import { plainProblems } from './plain.mjs'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)) }

const NOW = new Date(2026, 9, 2, 13, 0, 0).getTime()
const MIN = 60000
const it = (text, extra) => Object.assign({ text, mode: 'queue', at: null, dur: null, hold: false, off: false, missed: false, rearm: false, files: 0 }, extra || {})
const lines = (s) => s.split('\n').map((l) => l.replace(/ +$/, ''))

let out = formatQueue({ paused: false, scheduled: [], lane: [] }, NOW)
ok(out === '▶ Running · empty', 'an empty queue is one line')

const q = {
  paused: true,
  scheduled: [it('check mail', { mode: 'time', at: NOW + 90 * MIN })],
  lane: [
    it('fix the bug'),
    it('write docs', { off: true }),
    it('run tests', { mode: 'timer', at: NOW + 10 * MIN, dur: 10 * MIN, hold: true }),
    it('deploy', { mode: 'after', dur: 5 * MIN }),
    it('old', { mode: 'time', at: NOW - 60 * MIN, missed: true, hold: true }),
    it('again', { mode: 'timer', dur: 30 * MIN, rearm: true, hold: true }),
    it('with pics', { files: 2 }),
    it('tonight', { mode: 'time', at: NOW + 22 * 60 * MIN, hold: true }),
  ],
}
out = formatQueue(q, NOW)
const L = lines(out)
ok(L[0] === '⏸ Paused · 8 in order, 1 at their own time', 'the first line is the state and the counts')
ok(L.indexOf('📋 In order') >= 0 && L.indexOf('📋 In order') < L.indexOf('🕑 At their own time'),'the order first, the items with their own time after')
ok(L.includes('1 · fix the bug'), 'a plain row is its number and its text')
ok(L.includes('2 · ⏭ skipped · write docs'), 'a skipped row says so')
ok(L.includes('3 · ⏱ in 10m · run tests'), 'a timer counts down; holding is its default, so it is not said')
ok(L.includes('4 · ⏳ 5m after the one before · deploy'), 'an after item not armed yet')
ok(L.includes('5 · ⚠ missed 12:00 · old'), 'a missed time')
ok(L.includes('6 · ⏱ stopped by a restart · again'), 'a timer a restart stopped')
ok(L.includes('7 · 📎2 · with pics'), 'attachments are counted')
ok(L.includes('8 · 🕑 tomorrow 11:00, holds · tonight'), 'an at-time that holds says so, and names the day')
ok(L.includes('s1 · 🕑 14:30 · check mail'), 'an own-time row: s-number and clock')

const long = 'x'.repeat(200)
out = formatQueue({ paused: false, scheduled: [], lane: [it(long), it('a\n  b')] }, NOW)
const rows = lines(out).filter((l) => /^\d+ · /.test(l))
ok(rows[0].length === 4 + 50 && rows[0].endsWith('…'), 'a long text is cut so a row fits a phone')
ok(rows[1] === '2 · a b', 'a multi-line text is shown on one line')

out = formatResult({ op: 'pause' }, { error: '', queue: q }, NOW)
ok(lines(out)[0].startsWith('✅ Paused') && lines(out)[1].startsWith('⏸ Paused'), 'an action opens with what happened, then the state')
ok(!out.includes(HINT), 'an action does not repeat the hint')
out = formatResult({ op: 'list' }, { error: '', queue: q }, NOW)
ok(out.endsWith(HINT), 'a plain /queue ends with where the commands are')
out = formatResult({ op: 'del' }, { error: 'There is no item 9', queue: { paused: false, scheduled: [], lane: [] } }, NOW)
ok(lines(out)[0] === '⚠️ Not done: There is no item 9', 'a refusal comes first')
ok(formatResult({ op: 'list' }, null, NOW) === '⚠️ Not done: the editor did not answer', 'no answer at all')

/* An action names the item it acted on - a typed number may have hit
   another row than the one meant, and this is how the phone finds out. */
const one = { id: 7, ...it('run the tests', { mode: 'timer', at: NOW + 10 * MIN, dur: 10 * MIN, hold: true }) }
const after = { paused: false, scheduled: [], lane: [it('a'), one] }
ok(lines(formatResult({ op: 'del' }, { error: '', item: it('fix the bug'), queue: after }, NOW))[0] === '✅ Deleted: fix the bug', 'a delete names the item')
ok(lines(formatResult({ op: 'add' }, { error: '', item: one, queue: after }, NOW))[0] === '✅ Added: ⏱ in 10m · run the tests', 'an add says when it goes')
ok(lines(formatResult({ op: 'move' }, { error: '', item: one, queue: after }, NOW))[0].startsWith('✅ Moved to place 2: '), 'a move says where it is now')
ok(lines(formatResult({ op: 'skip' }, { error: '', item: it('x', { off: true }), queue: after }, NOW))[0] === '✅ Skipped: x' &&
  lines(formatResult({ op: 'skip' }, { error: '', item: it('x'), queue: after }, NOW))[0] === '✅ Back in the queue: x', 'a skip says which way it went')
const soon = it('soon', { mode: 'timer', at: NOW + 20000, dur: MIN, hold: true })
ok(lines(formatQueue({ paused: false, scheduled: [], lane: [soon] }, NOW)).includes('1 · ⏱ in <1m · soon'), 'under a minute is "<1m", not "0m"')

for (const [name, text] of [['the list', formatResult({ op: 'list' }, { error: '', queue: q }, NOW)],
                           ['an action', formatResult({ op: 'pause' }, { error: '', queue: q }, NOW)]]) {
  const bad = plainProblems(text)
  ok(!bad.length, name + ' reads the same raw and as markdown' + (bad.length ? ': ' + bad[0] : ''))
}

console.log(fail ? fail + ' failed, ' + pass + ' passed' : pass + ' passed')
process.exit(fail ? 1 : 0)
