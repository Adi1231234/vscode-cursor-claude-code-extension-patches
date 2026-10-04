/* /queue help, against mod/hooks/help.js, parse.js and format.js.
 *
 *     node patches/phone-queue/tests/help.test.mjs
 *
 * Pinned: every verb the parser accepts is in the help, so a command cannot be
 * added without saying how to use it; the help reads the same raw (the Claude
 * app) and as markdown (the panel); it is reachable the ways a phone user would
 * try; and a plain /queue says where it is. */
import { HELP, HINT } from '../mod/hooks/help.js'
import { VERBS, parseQueue } from '../mod/hooks/parse.js'
import { formatResult } from '../mod/hooks/format.js'
import { plainProblems } from './plain.mjs'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)) }

const NOW = new Date(2026, 9, 2, 13, 0, 0).getTime()
const empty = { error: '', queue: { paused: false, scheduled: [], lane: [] } }

for (const op of new Set(Object.values(VERBS))) {
  if (op === 'menu' || op === 'help') continue   // the menu is the bare /queue
  ok(HELP.includes('/queue ' + op), 'the help shows /queue ' + op)
}
for (const w of ['in 10m', 'at 14:30', 'after 5m', 'hold', 'nohold', 's1', '⏱', '🕑']) {
  ok(HELP.includes(w), 'the help explains ' + w)
}

const bad = plainProblems(HELP)
ok(!bad.length, 'the help reads the same raw and as markdown' + (bad.length ? ': ' + bad[0] : ''))
/* Measured on a phone: about 36 characters fit a line, and a longer one broke
   mid-sentence ("send in 10 / minutes"). */
const long = HELP.split('\n').filter((l) => [...l].length > 36)
ok(!long.length, 'every help line fits a phone line' + (long.length ? ': ' + long[0] : ''))

for (const w of ['help', 'HELP', '?', 'h']) ok(parseQueue(w, NOW).help === true, '/queue ' + w + ' opens the help')

ok(formatResult({ op: 'list' }, empty, NOW).endsWith(HINT), 'a plain /queue ends with where the help is')
ok(!formatResult({ op: 'pause' }, empty, NOW).includes(HINT), 'an action answers without the hint')

console.log(fail ? fail + ' failed, ' + pass + ' passed' : pass + ' passed')
process.exit(fail ? 1 : 0)
