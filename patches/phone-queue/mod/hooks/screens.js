// What the /queue menu's screens share: the items as the panel numbers them,
// sending one command and answering with its result, and the "when" picker
// that both Add and an item's Change time use.
//
// Every screen is one $.ui.ask: a question, 2-4 buttons, and the dialog's own
// free-text field. io (from register.js) is ask / call / now, so nothing here
// touches $ and every screen is tested with a scripted io.

import { formatResult, short } from './format.js'
import { parseMoment } from './time.js'

// The items, in the panel's order and numbering (1, 2 ... then s1, s2 ...),
// each with the identity a command addresses it by: a number can point at
// another row by the time a later tap lands (remote-api.js).
export function entries(q) {
  return [...q.lane.map((it, i) => ({ ref: String(i + 1), it, lane: true, pos: i + 1 })),
    ...q.scheduled.map((it, i) => ({ ref: 's' + (i + 1), it, lane: false }))]
}

export const target = (e) => 'id:' + e.it.id

// The menu was closed rather than answered: register.js prints nothing for it.
export class Closed extends Error {}

// The Claude app's Skip does not dismiss the dialog - it ANSWERS it, with the
// text "[No preference]" (found in neither the CLI nor the extension, so it is
// the app's own). Measured 2026-10-04: the first screen took it for a typed
// message, added it to the queue, and Play then sent "[No preference]" to
// Claude, which went off and did things nobody asked for. Its X does the same
// with "[User dismissed — do not proceed, wait for next instruction]" (read off
// what claude.ai sends, 2026-10-04) - 60 characters, past the 40 an earlier
// version allowed, so on the first screen X queued that sentence. So no screen
// reads the dialog directly: an answer that is nothing but a placeholder in
// brackets, of any length, the CLI's own "(notes only)", or no answer at all
// closes the menu. "[urgent] fix prod" is still a message.
const SKIPPED = /^\s*(\[[^\]]*\]|\(notes only\))?\s*$/

export async function ask(io, question, labels, header) {
  const ans = await io.ask(question, labels, header)
  if (typeof ans !== 'string' || SKIPPED.test(ans)) throw new Closed('closed')
  return ans
}

// A button for an item: its number and the start of its text.
export const itemLabel = (e) => e.ref + ' · ' + short(e.it.text, 24)

export async function done(io, cmd) {
  return formatResult(cmd, await io.call(cmd), await io.now())
}

const WHEN = [
  ['In its turn', { mode: 'queue' }],
  ['In 10 minutes', { mode: 'timer', dur: 600000 }],
  ['In 1 hour', { mode: 'timer', dur: 3600000 }],
]

// Every screen but the first ends with this button, and it goes one screen up
// (Adi asked for it on every screen). A dialog holds 4 buttons, so it costs a
// slot: what it pushed out is reachable by typing (a time, a place, a number).
export const BACK = '‹ Back'

// When should it go: a button, or a time typed in (time.js reads it, as it
// reads the time in "/queue add in 10m"). Anything else asks again, saying
// why, rather than ending the menu on a typo.
// -> a schedule for remote-api.js, or { back: true }.
export async function askWhen(io, title, why) {
  const now = await io.now()
  const ans = await ask(io, (why ? why + '\n' : '') + title + '\nOr type a time: 14:30, in 2h, tomorrow 9:00.',
    [...WHEN.map((w) => w[0]), BACK], 'When')
  if (ans === BACK) return { back: true }
  const pick = WHEN.find((w) => w[0] === ans)
  if (pick) return pick[1]
  const typed = parseMoment(ans, now)
  if (typed && !typed.error) return typed
  return askWhen(io, title, '⚠️ ' + ((typed && typed.error) || 'Not a time: ' + short(ans, 20)))
}

// For a schedule that has a moment: should the items after it wait for it?
// The default (a timer holds, an at-time does not) is the first button. Only
// a button answers it: typed text here once meant "wait", whatever it said.
// -> the schedule with its hold, or { back: true }.
export async function askHold(io, sched, why) {
  if (sched.mode !== 'timer' && sched.mode !== 'time') return sched
  const wait = '⏸ They wait for it', go = '▶ They go on'
  const first = sched.mode === 'timer' ? [wait, go] : [go, wait]
  const ans = await ask(io, (why ? why + '\n' : '') + 'Should the items after it wait for it?', [...first, BACK], 'When')
  if (ans === BACK) return { back: true }
  if (ans !== wait && ans !== go) return askHold(io, sched, '⚠️ Tap one of the buttons.')
  return { ...sched, hold: ans === wait }
}
