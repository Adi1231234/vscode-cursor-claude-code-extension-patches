// /queue's grammar: the words after the command, turned into the one command
// object the panel's queue applies (patches/prompt-queue/queue/remote-api.js).
// Pure - no $ and no clock of its own, `now` comes in - so it is tested without
// a session (tests/parse.test.mjs). Times and lengths are time.js; what the
// user reads about all of it is help.js.

import { MAX_AHEAD, TOO_FAR, next, takeClock, takeLength } from './time.js'

export const VERBS = {
  '': 'menu', menu: 'menu', list: 'list', ls: 'list', show: 'list',
  pause: 'pause', play: 'play', resume: 'play',
  add: 'add',
  del: 'del', delete: 'del', rm: 'del', remove: 'del',
  skip: 'skip', move: 'move', mv: 'move',
  now: 'now', send: 'now', edit: 'edit',
  help: 'help', '?': 'help', h: 'help',
}

// The arguments of a message that is a /queue command, or null when it is not one.
export function queueArgs(text) {
  const m = /^\s*\/queue(?:\s+([\s\S]*))?$/.exec(String(text || ''))
  return m ? (m[1] || '').trim() : null
}

// The schedule at the front of an add, if there is one: [fields, rest] or [{error}].
function parseWhen(rest, now) {
  const [kind, after] = next(rest)
  const k = kind.toLowerCase()
  if (k === 'in' || k === 'after') {
    const len = takeLength(after)
    if (!len) return [{ error: 'Give a length like 10m, 1h or 1h30m after "' + k + '"' }]
    if (len[0] > MAX_AHEAD) return [{ error: TOO_FAR }]
    return [{ mode: k === 'in' ? 'timer' : 'after', dur: len[0] }, len[1]]
  }
  if (k === 'at') {
    const t = takeClock(after, now)
    if (!t || t.error) return [{ error: (t && t.error) || 'Give a time like 14:30 or 9pm after "at" ("at 9:00 tomorrow" works too)' }]
    return [{ mode: 'time', at: t.at }, t.rest]
  }
  return [{ mode: 'queue' }, rest]
}

function parseAdd(rest, now) {
  const [when, after] = parseWhen(rest, now)
  if (when.error) return when
  const cmd = { op: 'add', ...when }
  let text = after
  const [word, tail] = next(after)
  if (cmd.mode !== 'queue' && /^(no)?hold$/i.test(word)) {
    cmd.hold = !/^no/i.test(word)
    text = tail
  }
  cmd.text = text.trim()
  return cmd.text ? cmd : { error: 'Nothing to add - write the message after the command' }
}

// Everything after "/queue" -> { op, ... }, { help }, or { error }.
export function parseQueue(args, now) {
  const [word, rest] = next(String(args || ''))
  const w = word.toLowerCase(), op = Object.hasOwn(VERBS, w) ? VERBS[w] : ''
  if (!op) return { error: 'Unknown: "' + word + '"' }
  if (op === 'help') return { help: true }
  if (op === 'menu' || op === 'list' || op === 'pause' || op === 'play') return { op }
  if (op === 'add') return parseAdd(rest, now)
  const [ref, tail] = next(rest)
  if (!/^s?\d+$/i.test(ref)) return { error: 'Say which item, by the number /queue shows (1, 2, ... or s1 for a scheduled one)' }
  if (op === 'move') {
    const to = /^\d+$/.test(tail.trim()) ? +tail.trim() : 0
    return to ? { op, ref, to } : { error: 'Say where to: /queue move ' + ref + ' 1' }
  }
  if (op === 'edit') return tail.trim() ? { op, ref, text: tail.trim() } : { error: 'Write the new text after the number' }
  if (tail.trim()) return { error: 'One item at a time: /queue ' + w + ' ' + ref }
  return { op, ref }
}
