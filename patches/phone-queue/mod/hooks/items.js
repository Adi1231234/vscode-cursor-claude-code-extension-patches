// The item screens of the /queue menu: browse the items a page at a time, then
// one item with everything that can be done to it. A delete asks first - one
// stray tap must not take a message away - and so does a typed edit: "back"
// or "2" typed there would otherwise have replaced the item's text for good.
//
// Every screen ends with BACK, and `back` is how a screen returns to the one it
// was opened from: a function that shows that screen again. The queue can move
// while a screen is open, so a command says what the button said - which way a
// skip goes, "up" from where the item is now - never a place read earlier.

import { BACK, ask, askHold, askWhen, done, entries, itemLabel, target } from './screens.js'
import { quoted, row, short } from './format.js'

const NEXT = 'Next ›'

// The items as buttons. Up to 3 fit with Back; past that, 2 a page and Next.
// A number can always be typed instead.
export async function browse(io, q, now, from, back) {
  const all = entries(q)
  if (!all.length) return 'The queue is empty.'
  const per = all.length <= 3 ? 3 : 2
  const shown = all.slice(from, from + per), more = from + per < all.length
  const labels = [...shown.map(itemLabel), ...(more ? [NEXT] : []), BACK]
  const head = 'Items ' + (from + 1) + '-' + (from + shown.length) + ' of ' + all.length
  const ans = await ask(io, head + '\nTap one, or type its number (like 5 or s1).', labels, 'Items')
  const again = () => browse(io, q, now, from, back)
  if (ans === NEXT) return browse(io, q, now, from + per, again)
  if (ans === BACK) return back()
  const e = shown[labels.indexOf(ans)] || all.find((x) => x.ref === ans.trim().toLowerCase())
  return e ? item(io, e, q, now, again) : '⚠️ There is no item ' + ans
}

// One item: its whole text and its state, then what can be done to it.
export async function item(io, e, q, now, back) {
  const skip = e.it.off ? '↩ Un-skip' : '⏭ Skip'
  const SEND = '🚀 Send now', MORE = '⋯ More'
  const ans = await ask(io, row(e.ref, e.it, now, 160) + '\nTap one, or type new text for it.',
    [SEND, skip, MORE, BACK], 'Item ' + e.ref)
  const again = () => item(io, e, q, now, back)
  if (ans === SEND) return done(io, { op: 'now', ref: target(e) })
  if (ans === skip) return done(io, { op: 'skip', ref: target(e), off: !e.it.off })
  if (ans === MORE) return more(io, e, q, again)
  if (ans === BACK) return back()
  return confirmEdit(io, e, ans, again)
}

async function confirmEdit(io, e, text, back) {
  const yes = '✏️ Yes, change it'
  const ans = await ask(io, 'Change item ' + e.ref + ' to this?\n' + quoted(text, 120), [yes, BACK], 'Edit')
  return ans === yes ? done(io, { op: 'edit', ref: target(e), text }) : back()
}

async function more(io, e, q, back) {
  const MOVE = '↕ Move', TIME = '⏱ Change time', DEL = '🗑 Delete'
  const labels = [...(e.lane && q.lane.length > 1 ? [MOVE] : []), TIME, DEL, BACK]
  const ans = await ask(io, 'Item ' + e.ref + ' · ' + short(e.it.text, 60), labels, 'Item ' + e.ref)
  const again = () => more(io, e, q, back)
  if (ans === MOVE) return move(io, e, q, again)
  if (ans === TIME) return changeTime(io, e, again)
  if (ans === DEL) return confirmDelete(io, e, again)
  return back()
}

// The places that make sense from here - one each, so two buttons never go to
// the same place - with Back; any place by typing.
async function move(io, e, q, back) {
  const n = q.lane.length, seen = new Set()
  const opts = [['⬆ To the top', 'top', 1], ['↑ One up', 'up', e.pos - 1],
    ['↓ One down', 'down', e.pos + 1], ['⬇ To the bottom', 'bottom', n]]
    .filter(([, , to]) => to >= 1 && to <= n && to !== e.pos && !seen.has(to) && seen.add(to))
    .slice(0, 3)
  const ans = await ask(io, 'Item ' + e.ref + ' is in place ' + e.pos + ' of ' + n + '.\nOr type a place.',
    [...opts.map((o) => o[0]), BACK], 'Move')
  if (ans === BACK) return back()
  const pick = opts.find((o) => o[0] === ans)
  const to = pick ? pick[1] : parseInt(ans, 10)
  if (!pick && !(to >= 1)) return '⚠️ Not a place: ' + ans
  return done(io, { op: 'move', ref: target(e), to })
}

async function changeTime(io, e, back) {
  const sched = await askWhen(io, 'When should item ' + e.ref + ' go?')
  if (sched.back) return back()
  const held = await askHold(io, sched)
  if (held.back) return changeTime(io, e, back)
  return done(io, { op: 'when', ref: target(e), ...held })
}

async function confirmDelete(io, e, back) {
  const yes = '🗑 Yes, delete it'
  const ans = await ask(io, 'Delete item ' + e.ref + '?\n' + quoted(e.it.text, 80), [yes, BACK], 'Delete')
  return ans === yes ? done(io, { op: 'del', ref: target(e) }) : back()
}
