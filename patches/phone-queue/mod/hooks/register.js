// /queue - the editor panel's prompt queue, from the Claude app.
//
// The queue lives in the panel (patches/prompt-queue). This mod runs inside the
// CLI behind that panel, so all it does is carry the command to the extension
// host that spawned it (host/server.js, address in CC_PHONE_QUEUE_URL), which
// hands it to the panel that spawned this CLI (CC_PHONE_QUEUE_PANEL) and
// returns the result.
//
// Two ways in, because the extension runs the CLI as an SDK host:
//   - typed in the panel or the terminal: command.run, at once.
//   - sent from the phone: the SDK bridge queues the message behind a running
//     turn and only reaches command.run when the turn ends - `immediate` is
//     honoured by the terminal's bridge, not this one (measured: a /queue sent
//     40s into a turn ran when it finished). session.receive is raised on
//     arrival, so the command is applied there and its result kept for
//     command.run to print (pending.js). A pause sent mid-turn therefore holds
//     the next item; applied at the turn's end it would have lost the race.
//     What is printed is what happened then and the queue as it is NOW: a
//     Stop pressed after a "play" parks the queue, and the reply that comes at
//     the turn's end must not still say "Running" (measured from claude.ai).

import { parseQueue, queueArgs } from './parse.js'
import { formatResult } from './format.js'
import { HELP, HINT } from './help.js'
import { page } from './text.js'
import { menu } from './menu.js'
import { Closed } from './screens.js'
import { keep, take } from './pending.js'

async function callHost($, cmd) {
  const url = await $.env.get('CC_PHONE_QUEUE_URL')
  if (!url) {
    return { error: 'this window is not running the phone-queue patch yet - reload it (Developer: Reload Window)' }
  }
  const sid = await $.session.id()
  // Which panel spawned this CLI (host/server.js): the host routes by it.
  const panel = await $.env.get('CC_PHONE_QUEUE_PANEL')
  try {
    const r = await $.http.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ panel, sid, cmd }),
    })
    return JSON.parse(r.text)
  } catch (err) {
    // Stop pressed while this command waited behind a turn aborts the call
    // (measured: "failed: remote-cancel"). Nothing reached the panel.
    if (/remote-cancel|abort/i.test(String(err))) return { error: 'stopped before it reached the editor - nothing changed' }
    return { error: 'the editor did not answer (' + err + ')' }
  }
}

// A menu nobody answers held the queue for good: while its dialog is open the
// CLI is busy and the queue waits for it (measured: still waiting after 10
// minutes, and $.ui.ask has no timeout of its own). Returning without an
// answer frees the CLI but leaves the dialog drawn in the panel over the
// composer, answering nothing. So past IDLE_MIN the panel withdraws the dialog
// (webview/link.js "drop", the request's own reject, no interrupt) and the
// menu ends, saying why.
const IDLE_MIN = 5
class Idle extends Error {}

async function askOrClose($, question, options, header) {
  const idle = new AbortController()
  const asked = $.ui.ask(question, { options, header }).then((a) => ({ a }), (err) => ({ err }))
  const slept = $.clock.sleep(IDLE_MIN * 60000, { signal: idle.signal }).then(() => null, () => null)
  const first = await Promise.race([asked, slept])
  if (first) {
    idle.abort()
    if (first.err) throw first.err
    return first.a
  }
  await callHost($, { op: 'drop', question })
  throw new Idle('closed: no answer for ' + IDLE_MIN + ' minutes')
}

// What menu.js may do: ask with the app's own dialog, reach the panel, tell
// the time. Built here because only this file may hold $.
function makeIo($) {
  return {
    ask: (question, options, header) => askOrClose($, question, options, header),
    call: (cmd) => callHost($, cmd),
    now: () => $.clock.now(),
  }
}

// A command that changes the queue, as opposed to one that only shows it -
// the only kind worth applying the moment it arrives.
const changes = (cmd) => !!cmd.op && !['menu', 'list'].includes(cmd.op)

async function runQueue($, args) {
  const now = await $.clock.now()
  const cmd = parseQueue(args, now)
  if (cmd.help) return HELP
  if (cmd.error) return page([['⚠️ ' + cmd.error], [HINT]])
  if (cmd.op === 'menu') {
    try {
      return await menu(makeIo($))
    } catch (err) {
      // Closing the menu is a choice, not an error: Skip on the phone (Closed,
      // screens.js), the dialog's X, or the engine giving up on it ($.ui.ask
      // rejects with "no answer"). Anything else is a bug and says so.
      if (err instanceof Idle) return '⏱ The menu closed: no answer in ' + IDLE_MIN + ' minutes.\nThe queue goes on as it was.'
      if (err instanceof Closed || /\$\.ui\.ask: no answer/.test(String(err))) return ''
      return '⚠️ The menu failed: ' + (err && err.message ? err.message : err)
    }
  }
  return formatResult(cmd, await callHost($, cmd), await $.clock.now())
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'queue',
      description: "The panel's prompt queue: a menu of buttons, or a command such as pause, add, del",
      argumentHint: '[help | list | pause | play | add ... | del 2]',
      immediate: true,
    })
    return next(e)
  })

  on('session.receive', async ($, e, next) => {
    const args = queueArgs(e.text)
    if (e.origin.kind !== 'bridge' || args === null) return next(e)
    // The menu waits for command.run: a dialog belongs to the moment it opens.
    const cmd = parseQueue(args, await $.clock.now())
    if (!changes(cmd)) return next(e)
    keep(args, { cmd, res: await callHost($, cmd) })
    return next(e)
  })

  on('command.run', { command: 'queue' }, async ($, e) => {
    const args = String(e.args || '').trim()
    const done = e.origin.kind === 'bridge' ? take(args) : undefined
    if (done) {
      const now = await $.clock.now(), cur = await callHost($, { op: 'list' })
      return { text: formatResult(done.cmd, { ...done.res, queue: (cur && cur.queue) || done.res.queue }, now) }
    }
    const text = await runQueue($, args)
    return text ? { text } : {}
  })
}
