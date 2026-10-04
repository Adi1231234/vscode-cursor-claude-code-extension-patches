/* lib/js/ccReply.js: telling Claude's replies from the rows drawn like them.
 *
 *     node patches/prompt-queue/tests/reply.test.js
 *
 * The store rows below are the shapes read off a live 2.1.287 panel on
 * 2026-10-04: a reply has a model, a command's output is isSynthesizedByLoop
 * right after its "<command-name>" user row, an API error is isSynthesizedByLoop
 * after a real prompt, the Remote Control notice isSynthetic, and a stop is a
 * user row reading "[Request interrupted by user]". */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };

const text = (t) => [{ content: { type: 'text', text: t } }];
const reply = (uuid, t) => ({ type: 'assistant', uuid, model: 'claude-opus-5-5', content: text(t) });
const command = (uuid, t) => ({ type: 'assistant', uuid, isSynthesizedByLoop: true, content: text(t) });
const apiError = command;   /* the same flag: model "<synthetic>" */
const notice = (uuid) => ({ type: 'assistant', uuid, isSynthetic: true, content: text('Remote Control is active') });
const user = (uuid, t) => ({ type: 'user', uuid, content: text(t) });

const window = {};
global.globalThis.__ccStore = undefined;
eval(fs.readFileSync(path.join(ROOT, 'lib', 'js', 'ccReply.js'), 'utf8'));
const R = window.__ccReply;
const store = (list) => ({ messages: { value: list } });

/* ---- what Claude wrote since a mark ---- */
let s = store([user('u1', 'hi'), reply('a1', 'hello')]);
let at = R.mark(s);
s.messages.value.push(user('u2', '<command-name>/queue</command-name>'), command('c1', 'queue: Paused'));
ok(JSON.stringify(R.since(at, s)) === '{"replied":false,"stopped":false}', 'a /queue run: no reply from Claude');
s.messages.value.push(notice('n1'));
ok(!R.since(at, s).replied, 'the Remote Control notice is not a reply either');
s.messages.value.push(user('u3', 'go'), reply('a2', 'done'));
ok(R.since(at, s).replied, 'a real reply is one');

s = store([user('u1', 'write a story')]);
at = R.mark(s);
s.messages.value.push(user('u2', '[Request interrupted by user]'));
ok(R.since(at, s).stopped, 'a stop is seen, wherever it came from');
s = store([]);
at = R.mark(s);
s.messages.value.push(user('u2', '[Request interrupted by user for tool use]'));
ok(R.since(at, s).stopped, 'a stop during a tool call, or a refused one, too');
ok(R.since(null, s) === null && R.since(R.mark(s), {}) === null, 'no mark, or no message list: no answer rather than a guess');
s = store([user('u1', 'go')]);
at = R.mark(s);
s.messages.value.push(Object.assign(user('u2', '[Request interrupted by user]'), { interruptedByShutdown: true }));
ok(!R.since(at, s).stopped, 'a CLI shutting down mid-turn is no stop');

s = store([user('u1', 'write it')]);
at = R.mark(s);
s.messages.value.push(apiError('e1', 'API Error: usage limit reached'));
ok(R.since(at, s).replied, 'an API error after a real prompt is news, not a command');
s = store([user('u1', '<command-name>/context</command-name>'), command('c1', 'ctx')]);
at = R.mark(s);
s.messages.value.push(user('u2', 'go on'), reply('a1', 'ok'), apiError('e1', 'Connection lost mid-response'));
ok(R.since(at, s).replied, 'a run with a reply and then an error: replied');

/* The store trims its list (past 600 rows it drops 100): a mark that was a
   position pointed into the run's own rows after that. */
s = store(Array.from({ length: 600 }, (_, i) => reply('r' + i, 'old')));
at = R.mark(s);
s.messages.value = s.messages.value.slice(100).concat([user('u9', '<command-name>/queue</command-name>'), command('c9', 'queue: x')]);
ok(JSON.stringify(R.since(at, s)) === '{"replied":false,"stopped":false}', 'after a trim, the old rows are still not part of this run');
s.messages.value = s.messages.value.slice(100).concat([user('u10', '[Request interrupted by user]')]);
ok(R.since(at, s).stopped, 'and a stop after a trim is still seen');

/* A reply stopped mid-thought leaves its "thinking" row with no uuid: it is
   an old row on the next run, not a new reply. */
s = store([user('u1', 'write it'), { type: 'assistant', content: [{ content: { type: 'thinking' } }] }, user('u2', '[Request interrupted by user]')]);
at = R.mark(s);
s.messages.value.push(user('u3', '<command-name>/queue</command-name>'), command('c3', 'queue: x'));
ok(!R.since(at, s).replied, 'a row with no uuid from before the mark is not this run\'s reply');

/* ---- transcript rows, by the uuid they carry ---- */
s = store([reply('a1', 'x'), user('u1', '<command-name>/queue</command-name>'), command('c1', 'queue: x'), notice('n1')]);
const row = (uuid) => ({ getAttribute: (k) => (k === 'data-bookmark-uuid' ? uuid : null) });
ok(R.isClaudeRow(row('a1'), s) === true, 'a reply row is Claude\'s');
ok(R.isClaudeRow(row('c1'), s) === false, 'a command\'s output row is not');
ok(R.isClaudeRow(row('n1'), s) === false, 'the notice row is not');
s.messages.value.push(user('u5', 'go'), apiError('e5', 'API Error'));
ok(R.isClaudeRow(row('e5'), s) === true, 'an API error row is read as a reply, as before');
ok(R.isClaudeRow(row('zz'), s) === null && R.isClaudeRow({ getAttribute: () => null }, s) === null, 'a row it cannot place: no verdict');

console.log(fail ? fail + ' failed, ' + pass + ' passed' : pass + ' passed');
process.exit(fail ? 1 : 0);
