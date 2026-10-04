/* The phone's path through the mod, against mod/hooks/register.js itself with
 * a fake engine: register(on) is called, its hooks are kept, and they are fired
 * the way the engine fires them - session.receive on arrival, command.run when
 * the CLI reaches the message. $ is a stub that records every POST.
 *
 *     node patches/phone-queue/tests/register.test.mjs
 *
 * This is the part the lab cannot drive (it needs a phone): pinned here is that
 * a phone command is applied exactly once - on arrival - and printed later; that
 * the menu is never run on arrival; that the panel's own commands run at once;
 * and that a Skip or a Stop are said plainly. */
import { register } from '../mod/hooks/register.js'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)) }

const hooks = {}
register((name, a, b) => { hooks[name] = typeof a === 'function' ? a : b })

/* idle: every wait for an answer runs out at once; otherwise a wait lasts
   until it is cancelled, as $.clock.sleep with a signal does. */
function engine({ fetch, ask, idle } = {}) {
  const posts = []
  const $ = {
    env: { get: async (k) => ({ CC_PHONE_QUEUE_URL: 'http://127.0.0.1:1/k', CC_PHONE_QUEUE_PANEL: 'tok' })[k] },
    session: { id: async () => 'sid-1' },
    clock: {
      now: async () => new Date(2026, 9, 2, 13, 0).getTime(),
      sleep: (ms, o) => idle ? Promise.resolve()
        : new Promise((res, rej) => o.signal.addEventListener('abort', () => rej(new Error('aborted')))),
    },
    command: { register: async () => {} },
    ui: { ask: ask || (async () => { throw new Error('queue: $.ui.ask: no answer (the dialog was dismissed)') }) },
    http: { fetch: fetch || (async (url, init) => {
      posts.push(JSON.parse(init.body))
      return { text: JSON.stringify({ error: '', queue: { paused: true, scheduled: [], lane: [] } }) }
    }) },
  }
  return { $, posts }
}
const next = async (e) => e
const bridge = { kind: 'bridge' }, composer = { kind: 'composer' }
const applied = (x) => x.posts.filter((p) => p.cmd.op !== 'list')

/* ---- a change from the phone: applied on arrival, printed later, once ---- */
let x = engine()
await hooks['session.receive'](x.$, { origin: bridge, text: '/queue pause' }, next)
ok(applied(x).length === 1 && x.posts[0].cmd.op === 'pause', 'applied the moment it arrives')
ok(x.posts[0].panel === 'tok' && x.posts[0].sid === 'sid-1', 'sent with the panel token and the session')
let out = await hooks['command.run'](x.$, { command: 'queue', args: 'pause', origin: bridge })
ok(applied(x).length === 1 && /Paused/.test(out.text), 'printed when the CLI reaches it, not applied again')

x = engine()
await hooks['session.receive'](x.$, { origin: bridge, text: '/queue add  buy\n milk' }, next)
await hooks['command.run'](x.$, { command: 'queue', args: 'add buy milk', origin: bridge })
ok(applied(x).length === 1, 'a re-spaced copy still finds its answer - never added twice')

x = engine()
await hooks['session.receive'](x.$, { origin: bridge, text: '/queue pause' }, next)   /* cancelled: never runs */
await hooks['session.receive'](x.$, { origin: bridge, text: '/queue pause' }, next)
await hooks['command.run'](x.$, { command: 'queue', args: 'pause', origin: bridge })
ok(applied(x).length === 2, 'two phone messages, two applications, each once')

/* Play on arrival, then a Stop from the phone parks the queue before the turn
   ends: the reply says what happened and how the queue stands now. */
let parked = false
x = engine({ fetch: async (url, init) => {
  const cmd = JSON.parse(init.body).cmd
  if (cmd.op === 'play') { parked = true; return { text: JSON.stringify({ error: '', queue: { paused: false, scheduled: [], lane: [] } }) } }
  return { text: JSON.stringify({ error: '', queue: { paused: parked, scheduled: [], lane: [] } }) }
} })
await hooks['session.receive'](x.$, { origin: bridge, text: '/queue play' }, next)
out = await hooks['command.run'](x.$, { command: 'queue', args: 'play', origin: bridge })
ok(/✅ Running/.test(out.text) && /⏸ Paused/.test(out.text) && !/▶ Running/.test(out.text), 'the state printed is the queue now, not at arrival')

/* ---- what is not applied on arrival ---- */
x = engine()
await hooks['session.receive'](x.$, { origin: bridge, text: '/queue' }, next)
await hooks['session.receive'](x.$, { origin: bridge, text: '/queue list' }, next)
await hooks['session.receive'](x.$, { origin: bridge, text: '/queue pasue' }, next)
await hooks['session.receive'](x.$, { origin: composer, text: '/queue pause' }, next)
await hooks['session.receive'](x.$, { origin: bridge, text: 'please /queue pause' }, next)
ok(x.posts.length === 0, 'the menu, a list, a typo, a non-phone message and a non-command: nothing on arrival')

/* ---- the panel's own composer: at once ---- */
x = engine()
out = await hooks['command.run'](x.$, { command: 'queue', args: 'play', origin: composer })
ok(x.posts.length === 1 && x.posts[0].cmd.op === 'play' && /Running/.test(out.text), 'a typed command runs when it runs')

/* ---- closing, failing and stopping are said plainly ---- */
x = engine()
out = await hooks['command.run'](x.$, { command: 'queue', args: '', origin: bridge })
ok(JSON.stringify(out) === '{}', 'a dismissed menu prints nothing')
x = engine({ ask: async () => '[No preference]' })
out = await hooks['command.run'](x.$, { command: 'queue', args: '', origin: bridge })
ok(JSON.stringify(out) === '{}' && x.posts.length === 1 && x.posts[0].cmd.op === 'list', "the app's Skip prints nothing and changes nothing")
x = engine({ ask: async () => { throw new TypeError('boom') } })
out = await hooks['command.run'](x.$, { command: 'queue', args: '', origin: bridge })
ok(/The menu failed: boom/.test(out.text), 'a real failure in the menu says so')
x = engine({ idle: true, ask: () => new Promise(() => {}) })
out = await hooks['command.run'](x.$, { command: 'queue', args: '', origin: bridge })
const drop = x.posts.find((p) => p.cmd.op === 'drop')
ok(drop && /Paused/.test(drop.cmd.question) && /no answer in 5 minutes/.test(out.text),
  'a menu nobody answers is withdrawn in the panel (the queue waits while it is open) and says why')
x = engine({ fetch: async () => { throw new Error('HooksError: $.http.fetch(x) failed: remote-cancel') } })
out = await hooks['command.run'](x.$, { command: 'queue', args: 'pause', origin: composer })
ok(/stopped before it reached the editor - nothing changed/.test(out.text), 'Stop while it waited: said plainly')

console.log(fail ? fail + ' failed, ' + pass + ' passed' : pass + ' passed')
process.exit(fail ? 1 : 0)
