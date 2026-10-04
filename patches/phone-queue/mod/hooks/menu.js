// /queue with nothing after it: the queue as a menu of buttons.
//
// Why buttons: "on mobile devices, selecting is often preferred over typing"
// (Microsoft Bot Framework design guide), and a reply the user has to read
// through is what made the text version tiring. The only dialog a mod may raise
// is $.ui.ask - $.tool.call refuses AskUserQuestion ("that is $.ui.ask (host
// check)") - so every screen is a question, 2-4 buttons, and the dialog's own
// free-text field ("Something else" on the phone). Measured on a phone: the
// question keeps its line breaks and the buttons are full-width rows. The app is
// reported to cut a long question after a few lines (anthropics/claude-code
// #28991), so the top shows the state and at most SHOWN items.
//
// io comes from register.js (ask / call / now); see screens.js.

import { HELP } from './help.js'
import { formatResult, row, status } from './format.js'
import { BACK, ask, askWhen, done, entries } from './screens.js'
import { browse, item } from './items.js'

const SHOWN = 4
const PLAY = '▶ Play', PAUSE = '⏸ Pause', ADD = '➕ Add'
const HELP_BTN = '❓ Help'

// The first screen has no Back - there is nothing above it; the dialog's own
// Skip closes the menu. Every screen below it goes back here through this.
// Typed text is a message to add, unless it is an item's number - the items
// screen says "type its number", and "2" added as a message would go to
// Claude as soon as the menu closed.

export async function menu(io, why) {
  const res = await io.call({ op: 'list' })
  if (!res || !res.queue) return formatResult({ op: 'list' }, res, await io.now())
  const q = res.queue, now = await io.now(), all = entries(q)
  const lines = [...(why ? [why] : []), status(q), ...all.slice(0, SHOWN).map((e) => row(e.ref, e.it, now, 28))]
  if (all.length > SHOWN) lines.push('+' + (all.length - SHOWN) + ' more')
  lines.push('Tap one, or type a message to add it.')
  const ITEMS = '📋 Items (' + all.length + ')'
  const labels = [q.paused ? PLAY : PAUSE, ADD, ...(all.length ? [ITEMS] : []), HELP_BTN]
  const pick = await ask(io, lines.join('\n'), labels, 'Queue')
  if (pick === PLAY) return done(io, { op: 'play' })
  if (pick === PAUSE) return done(io, { op: 'pause' })
  const back = () => menu(io)            // read the queue again: it may have moved
  if (pick === ADD) return add(io, back)
  if (pick === ITEMS) return browse(io, q, now, 0, back)
  if (pick === HELP_BTN) return help(io, back)
  if (/^\s*s?\d+\s*$/i.test(pick)) {
    const e = all.find((x) => x.ref === pick.trim().toLowerCase())
    return e ? item(io, e, q, now, back) : menu(io, '⚠️ There is no item ' + pick.trim())
  }
  return done(io, { op: 'add', mode: 'queue', text: pick })
}

// When first (its default hold), then the message - typed, or "Continue",
// the message most often queued.
async function add(io, back) {
  const sched = await askWhen(io, 'When should it go?')
  if (sched.back) return back()
  const text = await ask(io, 'What should Claude do?\nType it in the box below.', ['Continue', BACK], 'Add')
  if (text === BACK) return add(io, back)
  return done(io, { op: 'add', ...sched, text })
}

// How the menu works, short enough for the top of a dialog, with Back; the
// typed shortcuts are one more tap away, as text.
async function help(io, back) {
  const ALL = '📖 Typed shortcuts'
  const lines = [
    'Tap a button to act.',
    'Type in the box to add a message.',
    'On an item, type to change its text.',
    'Times: 14:30, in 2h, tomorrow 9:00.',
    '⏱ A timer holds the items after it.',
    '🕑 A set time does not.',
    'While Claude works, the menu opens',
    'when it is done. /queue pause',
    'and the other shortcuts work at once.',
    'While this menu is open, the queue',
    'waits. Skip closes it, and so do',
    '5 minutes with no answer.',
  ]
  const ans = await ask(io, lines.join('\n'), [ALL, BACK], 'Help')
  return ans === ALL ? HELP : back()
}
