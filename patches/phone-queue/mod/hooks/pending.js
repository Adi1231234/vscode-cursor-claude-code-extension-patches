// Phone commands already applied on arrival (session.receive), waiting for
// command.run to print their answer - see register.js. Pure, so it holds no $.

const kept = []

// The two events see the same message; compare it with its spacing folded, so
// a re-spaced or re-wrapped copy cannot miss its answer and be applied twice.
const same = (s) => String(s || '').replace(/\s+/g, ' ').trim()

export function keep(args, value) {
  kept.push({ key: same(args), value })
  if (kept.length > 20) kept.shift()
}

// The newest match: neither event carries an id to pair them by, and an
// answer whose message never reached command.run (cancelled on the phone)
// must not be printed for a later one. Undefined when there is none.
export function take(args) {
  const i = kept.findLastIndex((a) => a.key === same(args))
  return i >= 0 ? kept.splice(i, 1)[0].value : undefined
}
