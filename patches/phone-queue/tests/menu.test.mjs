/* The /queue menu, against mod/hooks/menu.js, items.js and screens.js, with a
 * scripted io: the dialog's answers are given in order (a number taps that
 * button, a string is typed into the free-text field), and what the menu sends
 * the panel is recorded.
 *
 *     node patches/phone-queue/tests/menu.test.mjs
 *
 * Pinned: every button ends in the panel command it names, addressed by the
 * item's identity; typing does the obvious thing on each screen; a delete asks
 * first; every screen below the first has Back, and Back goes one screen up;
 * and every screen fits the dialog (2-4 short buttons, a short top). */
import { menu } from '../mod/hooks/menu.js'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)) }

const NOW = new Date(2026, 9, 2, 13, 0, 0).getTime()
const BACK = '‹ Back'
let ids = 0
const it = (text, extra) => Object.assign({ id: ++ids, text, mode: 'queue', at: null, dur: null, hold: false, off: false, missed: false, rearm: false, files: 0 }, extra || {})

const screens = []
function io(queue, answers) {
  const asked = [], sent = []
  return {
    asked, sent,
    now: async () => NOW,
    ask: async (question, labels, header) => {
      asked.push({ question, labels, header })
      screens.push({ question, labels, header })
      const a = answers.shift()
      return typeof a === 'number' ? labels[a] : a
    },
    call: async (cmd) => { sent.push(cmd); return { error: '', queue } },
  }
}
const changed = (x) => x.sent.filter((c) => c.op !== 'list')
const json = (o) => JSON.stringify(o)
// A script that runs out of answers closes the menu there - the same as no answer.
async function run(script) {
  const x = io(many, script.slice())
  try { x.out = await menu(x) } catch (err) { if (err.message !== 'closed') throw err; x.out = null }
  return x
}

const many = { paused: true, scheduled: [it('check mail', { mode: 'time', at: NOW + 3600000 })],
  lane: [it('fix the login bug'), it('write docs', { off: true }), it('run tests'), it('deploy'), it('tidy up')] }
const lane = many.lane.map((x) => 'id:' + x.id), sched = 'id:' + many.scheduled[0].id
const backToPlay = (x) => json(changed(x)) === json([{ op: 'play' }])

/* ---- the first screen ---- */
let x = await run([0])
ok(x.asked[0].header === 'Queue' && x.asked[0].question.split('\n').length <= 7, 'a short top under the Queue chip')
ok(json(x.asked[0].labels) === json(['▶ Play', '➕ Add', '📋 Items (6)', '❓ Help']), 'Play, Add, Items, Help - and no Back above the top')
ok(backToPlay(x), 'Play plays')
x = await run(['summarize the branch'])
ok(json(changed(x)[0]) === '{"op":"add","mode":"queue","text":"summarize the branch"}', 'text typed on the first screen is added in its turn')

/* ---- help ---- */
x = await run([3, 0])
ok(x.out.includes('typed shortcuts'), 'Help, then the typed shortcuts as text')
ok(backToPlay(await run([3, 1, 0])), 'Help, Back, Play')

/* ---- add ---- */
x = await run([1, 1, 'run the tests'])
ok(json(changed(x)) === json([{ op: 'add', mode: 'timer', dur: 600000, text: 'run the tests' }]), 'Add, In 10 minutes, the text')
x = await run([1, 'tomorrow 9:00', 0])
ok(changed(x)[0].at === new Date(2026, 9, 3, 9, 0).getTime() && changed(x)[0].text === 'Continue', '"tomorrow 9:00" typed, then Continue')
ok(backToPlay(await run([1, 3, 0])), 'Add, Back, Play')
x = await run([1, 1, 1, 2, 'x'])
ok(json(changed(x)) === json([{ op: 'add', mode: 'timer', dur: 3600000, text: 'x' }]), 'Back on the text goes to When again')

/* ---- items, two a page past three ---- */
x = await run([2, 2, 0, 1])
ok(json(x.asked[1].labels.slice(2)) === json(['Next ›', BACK]), 'two items, Next, Back')
ok(x.asked[2].labels[0].startsWith('3 ·'), 'Next shows the next two')
ok(json(changed(x)) === json([{ op: 'skip', ref: lane[2], off: true }]), 'item 3, Skip - by identity, and which way it goes')
ok(backToPlay(await run([2, 2, 3, 3, 0])), 'Back from page 2 is page 1, Back again is the first screen')
x = await run([2, 's1', 0])
ok(json(changed(x)) === json([{ op: 'now', ref: sched }]), 'a number typed picks the item; Send now')
x = await run([2, 1, 'write the API docs', 0])
ok(json(changed(x)) === json([{ op: 'edit', ref: lane[1], text: 'write the API docs' }]), 'text typed on an item replaces it, once confirmed')
x = await run([2, 1, 'back', 1, 3, 3, 0])
ok(backToPlay(x) && x.asked[3].header === 'Edit', 'a typed "back" is only a proposed text: Back keeps the item as it was')
ok(json(x.asked[2].labels) === json(['🚀 Send now', '↩ Un-skip', '⋯ More', BACK]), 'an item: Send now, Un-skip, More, Back')
ok(backToPlay(await run([2, 0, 3, 3, 0])), 'Back from an item is its page')

/* ---- more: move, change time, delete ---- */
x = await run([2, 0, 2])
ok(json(x.asked[3].labels) === json(['↕ Move', '⏱ Change time', '🗑 Delete', BACK]), 'More: Move, Change time, Delete, Back')
x = await run([2, 2, 0, 2, 0, 0])
ok(json(changed(x)) === json([{ op: 'move', ref: lane[2], to: 'top' }]), 'item 3, More, Move, To the top - from where it is when the tap lands')
x = await run([2, 1, 2, 0])
ok(json(x.asked[4].labels) === json(['⬆ To the top', '↓ One down', '⬇ To the bottom', BACK]), 'two buttons never go to the same place, and the bottom is not cut')
x = await run([2, 0, 2, 0])
ok(!x.asked[4].labels.some((l) => /top|up/i.test(l)) && x.asked[4].labels.at(-1) === BACK, 'the first item is not offered up; Back is there')
x = await run([2, 0, 2, 1, 2, 1])
ok(json(changed(x)) === json([{ op: 'when', ref: lane[0], mode: 'timer', dur: 3600000, hold: false }]), 'Change time, In 1 hour, They go on')
x = await run([2, 0, 2, 1, 0])
ok(json(changed(x)) === json([{ op: 'when', ref: lane[0], mode: 'queue' }]), '"In its turn" asks nothing about holding')
ok(backToPlay(await run([2, 0, 2, 1, 3, 3, 3, 3, 0])), 'Back from When, More, the item and the page walks up to the first screen')
x = await run([2, 0, 2, 2, 1, 3, 3, 3, 0])
ok(backToPlay(x), 'Delete asks first; Back keeps it and walks back up')
x = await run([2, 0, 2, 2, 0])
ok(json(changed(x)) === json([{ op: 'del', ref: lane[0] }]), 'Yes deletes it')

/* ---- typed text on the first screen, the When field and the hold ---- */
x = await run(['2', 3, 0])
ok(x.asked[1].header === 'Item 2' && backToPlay(x), 'a number typed on the first screen opens that item, not a message "2"')
x = await run(['9', 0])
ok(/no item 9/.test(x.asked[1].question) && backToPlay(x), 'a number with no item says so and shows the menu again')
x = await run([1, 'soon', 'in 2h', 'x'])
ok(/Not a time: soon/.test(x.asked[2].question) && changed(x)[0].dur === 7200000, 'a When typo asks again with the reason; "in 2h" then works')
x = await run([2, 0, 2, 1, 1, 'no', 1])
ok(/Tap one of the buttons/.test(x.asked[6].question) && changed(x)[0].hold === false, 'text typed on the hold screen asks again, it does not mean "wait"')

/* ---- Skip on the phone answers "[No preference]": it must close, never act ----
   Measured 2026-10-04: the first screen added it as a message and Play sent it
   to Claude. Every screen, in turn, and the other no-answers. */
const SKIP = '[No preference]'
const skipAt = [[SKIP], [1, SKIP], [1, 1, SKIP], [2, SKIP], [2, 0, SKIP], [2, 0, 2, SKIP],
  [2, 0, 2, 0, SKIP], [2, 0, 2, 1, SKIP], [2, 0, 2, 1, 1, SKIP], [2, 0, 2, 2, SKIP], [3, SKIP],
  ['(notes only)'], [''], [undefined],
  ['[User dismissed — do not proceed, wait for next instruction]'], [3, '[User dismissed — do not proceed, wait for next instruction]']]
for (const script of skipAt) {
  const y = io(many, script.slice())
  let closed = false
  try { await menu(y) } catch (err) { closed = err && err.message === 'closed' }
  ok(closed && !changed(y).length, 'a no-answer on screen ' + (script.length) + ' (' + JSON.stringify(script) + ') closes, nothing sent')
}
x = await run(['[urgent] fix prod'])
ok(json(changed(x)) === json([{ op: 'add', mode: 'queue', text: '[urgent] fix prod' }]), 'a real message that starts with a bracket is still a message')

/* ---- every screen ---- */
const below = screens.filter((s) => s.header !== 'Queue')
ok(below.length > 30 && below.every((s) => s.labels.at(-1) === BACK), 'every screen below the first ends with Back')
ok(screens.every((s) => s.labels.length >= 2 && s.labels.length <= 4), 'every screen has 2-4 buttons')
ok(screens.every((s) => s.labels.every((l) => [...l].length <= 30)), 'every button is short')
ok(screens.every((s) => [...s.header].length <= 12), 'every chip fits its 12 characters')

console.log(fail ? fail + ' failed, ' + pass + ' passed' : pass + ' passed')
process.exit(fail ? 1 : 0)
