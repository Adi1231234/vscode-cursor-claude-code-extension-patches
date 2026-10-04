// What /queue help prints, laid out by text.js. Sized for a phone: measured
// on one, a line holds about 36 characters, and "command -> what it does" on
// one line broke mid-sentence. So each command is a line of its own - a real
// example, not a placeholder - with what it does on a short line under it.

import { page } from './text.js'

export const HINT = '💡 All commands: /queue help'

const DOES = '↳ '

// A section: its heading, then each [example, what it does] as two lines.
const section = (heading, pairs) => [heading, ...pairs.flatMap(([cmd, does]) => [cmd, DOES + does])]

export const HELP = page([
  [
    '📋 /queue',
    'Send /queue alone for a menu of',
    'buttons: everything is there.',
    'The same things as typed shortcuts:',
  ],
  section('⏯ See and hold', [
    ['/queue', 'a menu of buttons'],
    ['/queue list', 'the whole queue'],
    ['/queue pause', 'stop sending'],
    ['/queue play', 'start sending again'],
  ]),
  section('➕ Add', [
    ['/queue add fix the bug', 'add it at the end'],
    ['/queue add in 10m run the tests', 'send it in 10 minutes'],
    ['/queue add at 14:30 deploy', 'send it at 14:30'],
    ['/queue add at 9am tomorrow standup', 'tomorrow at 9:00'],
    ['/queue add after 5m summarize', '5 min after the one before'],
  ]),
  section('✏️ Change (numbers from /queue)', [
    ['/queue del 2', 'delete item 2'],
    ['/queue skip 2', 'skip it (again: bring it back)'],
    ['/queue move 3 1', 'move item 3 to place 1'],
    ['/queue now 2', 'send it right now'],
    ['/queue edit 2 new text', 'replace its text'],
  ]),
  [
    '💡 Good to know',
    'Lengths: 45s · 10m · 2h · 1h30m',
    'or in words: 10 minutes, 2 hours',
    '⏱ "in 10m" holds the items after it',
    '🕑 "at 14:30" does not hold them',
    'Add hold or nohold after the time',
    'to change that',
    's1, s2 = items with their own time',
  ],
  [
    '📱 From the phone',
    'A command works at once, even',
    'while Claude is working. Its reply',
    'shows up when Claude finishes.',
    'While the menu is open, the queue',
    'waits. Skip closes the menu, and',
    'so do 5 minutes with no answer.',
  ],
])
