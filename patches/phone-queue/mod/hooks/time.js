// Reading a moment or a length, for /queue add (parse.js) and for the menu's
// "When" field (screens.js) alike, so the two accept the same things. Pure -
// `now` comes in - and tested in tests/parse.test.mjs.
//
// A time is read whole or refused, never half-read: "at 9:00 pm deploy" once
// became 09:00 with the text "pm deploy", twelve hours early and silent.

const UNIT = {
  s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000,
  m: 60000, min: 60000, mins: 60000, minute: 60000, minutes: 60000,
  h: 3600000, hr: 3600000, hrs: 3600000, hour: 3600000, hours: 3600000,
  d: 86400000, day: 86400000, days: 86400000,
}
const DAY = /^(today|tomorrow)$/i
export const MAX_AHEAD = 30 * 86400000
export const TOO_FAR = 'Up to 30 days ahead'

// The first word and the untouched rest, so a multi-line message keeps its lines.
export function next(s) {
  const m = /^\s*(\S+)\s*([\s\S]*)$/.exec(s)
  return m ? [m[1], m[2]] : ['', '']
}

// "10m", "1h", "1h30m", "45s", "2d" -> milliseconds; 0 when it is not a length.
export function parseDuration(word) {
  const m = /^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(word || '')
  if (!m || !word) return 0
  return ((+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0)) * 1000
}

// "14:30", "9pm", "9:30pm" -> the next such moment after `now` (tomorrow when
// today's has passed, or when `tomorrow` says so); null when it is not a time.
// A bare "9" is not one: without minutes it needs am or pm.
export function parseClock(word, now, tomorrow) {
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/i.exec(word || '')
  if (!m || (m[2] === undefined && !m[3])) return null
  let h = +m[1]
  const min = +(m[2] || 0), ap = (m[3] || '').toLowerCase()
  if (ap && (h < 1 || h > 12)) return null
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  if (h > 23 || min > 59) return null
  const d = new Date(now)
  if (tomorrow) d.setDate(d.getDate() + 1)
  d.setHours(h, min, 0, 0)
  if (!tomorrow && d.getTime() <= now) d.setDate(d.getDate() + 1)
  return d.getTime()
}

// A length at the front of rest - "10m", "1h30m" or "10 minutes" -> [ms, rest].
export function takeLength(rest) {
  const [w, r] = next(rest)
  if (parseDuration(w)) return [parseDuration(w), r]
  const [u, r2] = next(r), unit = u.toLowerCase()
  return /^\d+$/.test(w) && Object.hasOwn(UNIT, unit) ? [+w * UNIT[unit], r2] : null
}

// A moment at the front of rest - "14:30", "9 pm", "tomorrow 9:00",
// "9:00 tomorrow" -> { at, rest }, { error }, or null when there is none.
export function takeClock(rest, now) {
  let [w, r] = next(rest), day = ''
  if (DAY.test(w)) { day = w.toLowerCase(); [w, r] = next(r) }
  const [ap, r2] = next(r)
  if (/^(am|pm)$/i.test(ap)) { w += ap; r = r2 }
  const [d, r3] = next(r)
  if (!day && DAY.test(d)) { day = d.toLowerCase(); r = r3 }
  const at = parseClock(w, now, day === 'tomorrow')
  if (!at) return null
  if (day === 'today' && new Date(at).toDateString() !== new Date(now).toDateString()) return { error: 'That time has already passed today' }
  return { at, rest: r }
}

// What the menu's "When" field takes, the whole answer: "14:30", "9pm",
// "tomorrow 9:00", "2h", "in 20 minutes", "at 14:30" -> a schedule, { error },
// or null when it is not a time at all.
export function parseMoment(text, now) {
  let [w, rest] = next(String(text || ''))
  if (!/^(in|at)$/i.test(w)) rest = String(text || '')
  const len = takeLength(rest)
  if (len && !len[1].trim()) return len[0] > MAX_AHEAD ? { error: TOO_FAR } : { mode: 'timer', dur: len[0] }
  const t = takeClock(rest, now)
  if (t && t.error) return t
  return t && !t.rest.trim() ? { mode: 'time', at: t.at } : null
}
