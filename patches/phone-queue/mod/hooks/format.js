// What /queue answers: what happened, where the queue stands, then one short
// line per item - the order first, then the items that go at their own time.
// Laid out by text.js (no markdown at all). Pure, `now` comes in,
// so it is tested without a session (tests/format.test.mjs).

import { HINT } from './help.js'
import { page } from './text.js'

// About a line and a half on a phone (measured: ~36 characters a line).
const TEXT_MAX = 50

// What an action answers first, with the item it acted on after a colon -
// a number typed on the phone may point at another row by the time it lands,
// so the answer says which one it was.
const DONE = {
  pause: '✅ Paused - nothing is sent until /queue play',
  play: '✅ Running',
  add: '✅ Added',
  del: '✅ Deleted',
  move: '✅ Moved',
  now: '✅ Sending it now',
  edit: '✅ Edited',
  when: '✅ Time set',
}

const NOT_DONE = '⚠️ Not done: '

const pad = (n) => (n < 10 ? '0' : '') + n
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString()

// 14:30, or "tomorrow 09:00" / "Oct 5 09:00" when it is not today. Tomorrow
// by the calendar, not by adding 24 hours: on a clock-change night that lands
// on the wrong day.
function clock(ms, now) {
  const d = new Date(ms), hm = pad(d.getHours()) + ':' + pad(d.getMinutes())
  if (sameDay(ms, now)) return hm
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (sameDay(ms, tomorrow.getTime())) return 'tomorrow ' + hm
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + hm
}

// A length the way the panel's chips say it: 45m, 2h, 1h05m - and under a
// minute "<1m", not "0m".
function span(ms) {
  const m = Math.max(0, Math.round(ms / 60000))
  if (m < 1) return '<1m'
  if (m < 60) return m + 'm'
  return Math.floor(m / 60) + 'h' + (m % 60 ? pad(m % 60) + 'm' : '')
}

export function short(text, max = TEXT_MAX) {
  const one = String(text || '').replace(/\s+/g, ' ').trim()
  return one.length > max ? one.slice(0, max - 1) + '…' : one
}

// An item's text on a line of its own, in quotes so it can never read as a
// list or a heading ("- write docs").
export const quoted = (text, max) => '“' + short(text, max) + '”'

// When an item goes, as one mark; '' for a plain item. The icons are the ones
// /queue help explains: a timer holds what follows, an "at" time does not.
function when(it, now) {
  if (it.missed) return '⚠ missed ' + clock(it.at, now)
  if (it.rearm) return '⏱ stopped by a restart'
  if (it.mode === 'after') return '⏳ ' + (!it.at ? span(it.dur) + ' after the one before' : it.at > now ? 'in ' + span(it.at - now) : 'due')
  if (it.mode !== 'timer' && it.mode !== 'time') return ''
  const icon = it.mode === 'timer' ? '⏱ ' : '🕑 '
  const at = it.at > now ? (it.mode === 'timer' ? 'in ' + span(it.at - now) : clock(it.at, now)) : 'due'
  return icon + at + (it.hold !== (it.mode === 'timer') ? (it.hold ? ', holds' : ', does not hold') : '')
}

// The item an action touched: when it goes, then its text.
const named = (it, now) => [when(it, now), short(it.text, 40)].filter(Boolean).join(' · ')

export function row(label, it, now, max = TEXT_MAX) {
  const marks = [it.off ? '⏭ skipped' : '', when(it, now), it.files ? '📎' + it.files : '']
  return [label, ...marks.filter(Boolean), short(it.text, max)].join(' · ')
}

export function status(q) {
  const n = q.lane.length, s = q.scheduled.length
  const parts = [n ? n + ' in order' : '', s ? s + ' at their own time' : ''].filter(Boolean)
  return (q.paused ? '⏸ Paused' : '▶ Running') + ' · ' + (parts.join(', ') || 'empty')
}

// The item the queue will send next, if any: the first in order not skipped.
function nextLine(q) {
  const it = q.lane.find((x) => !x.off && !x.missed && !x.rearm)
  return it ? 'Next: ' + short(it.text, 40) : ''
}

// The queue: its state, then the order, then the items that keep their own time.
export function queueBlocks(q, now) {
  return [
    [status(q)],
    q.lane.length ? ['📋 In order', ...q.lane.map((it, i) => row(String(i + 1), it, now))] : [],
    q.scheduled.length ? ['🕑 At their own time', ...q.scheduled.map((it, i) => row('s' + (i + 1), it, now))] : [],
  ]
}

export const formatQueue = (q, now) => page(queueBlocks(q, now))

// The answer to one command. "Give the essential answer first, then offer more"
// (Nielsen Norman Group, "less chat, more answer"): an action answers with what
// happened and where the queue now stands, in three short lines; the whole list
// is /queue list, asked for.
export function formatResult(cmd, res, now) {
  if (!res || !res.queue) return NOT_DONE + ((res && res.error) || 'the editor did not answer')
  if (cmd.op === 'list') return page([...queueBlocks(res.queue, now), [HINT]])
  return page([[firstLine(cmd, res, now), status(res.queue), nextLine(res.queue)].filter(Boolean)])
}

function firstLine(cmd, res, now) {
  if (res.error) return NOT_DONE + res.error
  const it = res.item
  const place = cmd.op === 'move' && it ? res.queue.lane.findIndex((x) => x.id === it.id) + 1 : 0
  const done = cmd.op === 'skip' ? (it && !it.off ? '✅ Back in the queue' : '✅ Skipped')
    : place ? '✅ Moved to place ' + place : DONE[cmd.op]
  return it ? done + ': ' + named(it, now) : done
}
