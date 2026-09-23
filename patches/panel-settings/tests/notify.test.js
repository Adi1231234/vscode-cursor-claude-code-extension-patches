/* The focus gate, both ways.
 *
 * The lab cannot prove this one: it starts its editor on a Windows desktop
 * object of its own, precisely so it never takes focus, so its window is never
 * the focused window and only the "not focused" branch would ever run there.
 * So the host module is loaded here with require() shadowed - vscode and
 * child_process both stubbed - and asked directly.
 *
 *   node patches/panel-settings/tests/notify.test.js
 */
const fs = require('fs');
const path = require('path');
const realRequire = require;

let focused = false;      // what vscode.window.state.focused answers
let vscodeThrows = false; // or whether it can be read at all
let notified = [];        // every toast that actually went out, by either route
let folders = [{ uri: { fsPath: 'C:\\proj\\demo app' } }];  // this window's folder

function loadHost() {
  const stub = (name) => {
    if (name === 'vscode') {
      if (vscodeThrows) throw new Error('no vscode here');
      return {
        window: {
          state: { get focused() { return focused; } },
          showInformationMessage: (m) => notified.push({ via: 'editor', text: m })
        },
        workspace: { workspaceFolders: folders },
        env: { uriScheme: 'vscode', appRoot: 'C:\\nowhere' }
      };
    }
    if (name === 'child_process') {
      return { spawn: (exe, args, opts) => {
        notified.push({
          via: 'toast', title: opts.env.CC_TOAST_TITLE, body: opts.env.CC_TOAST_BODY,
          folder: opts.env.CC_TOAST_FOLDER, exe: opts.env.CC_TOAST_EXE
        });
        return { on: () => {}, kill: () => {} };
      } };
    }
    return realRequire(name);
  };
  // eslint-disable-next-line no-unused-vars
  const require = stub;                     // shadows inside the evals below
  delete globalThis.__ccNotify;             // both IIFEs guard on themselves
  delete globalThis.__ccToastShow;
  const host = (f) => path.resolve(__dirname, '..', 'host', f);
  eval(fs.readFileSync(host('show.js'), 'utf8'));      // raises the toast
  eval(fs.readFileSync(host('notify.js'), 'utf8'));    // decides whether to
  return globalThis.__ccNotify;
}

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };
const done = (extra) => Object.assign({ type: '__ccnotify', op: 'done', title: 'Claude finished', body: 'proj' }, extra);

let replies = [];                         // what the host told the panel back
const webview = { postMessage: (m) => { replies.push(m); return Promise.resolve(true); } };

function run(label, setup, msg) {
  notified = []; replies = [];
  focused = false; vscodeThrows = false;
  folders = [{ uri: { fsPath: 'C:\\proj\\demo app' } }];
  setup();
  const handled = loadHost().handle(msg, webview);
  return { label, handled, sent: notified.length };
}

// 1. the whole point: setting on, window focused -> nothing goes out
let r = run('on + focused', () => { focused = true; }, done({ skipWhenFocused: true }));
ok(r.sent === 0, 'setting on and window focused must stay quiet, sent ' + r.sent);
ok(r.handled === true, 'the message is still ours and must not fall through to the app');

// 2. the other branch: same setting, window not focused -> it fires
r = run('on + unfocused', () => { focused = false; }, done({ skipWhenFocused: true }));
ok(r.sent === 1, 'setting on and window unfocused must notify, sent ' + r.sent);

// 3. setting off -> focus is irrelevant
r = run('off + focused', () => { focused = true; }, done({ skipWhenFocused: false }));
ok(r.sent === 1, 'setting off must notify even when focused, sent ' + r.sent);

// 4. an old panel that sends no flag at all keeps the old behaviour
r = run('absent + focused', () => { focused = true; }, done({}));
ok(r.sent === 1, 'no flag must notify, sent ' + r.sent);

// 5. fail open: if focus cannot be read, notify rather than swallow
r = run('unreadable + on', () => { vscodeThrows = true; }, done({ skipWhenFocused: true }));
ok(r.sent === 1, 'unreadable focus must fail open and notify, sent ' + r.sent);

// 6. the toast still carries what it should
r = run('payload', () => { focused = false; }, done({ skipWhenFocused: true }));
ok(notified[0] && notified[0].title === 'Claude finished' && notified[0].body === 'proj',
   'title and body reach the toast: ' + JSON.stringify(notified[0]));

// 7. the click target: this window's folder, handed to the editor's own
//    command line by a shortcut (toast.ps1 writes it). The folder goes over
//    verbatim - no uri, so nothing to encode and no security prompt.
r = run('focus target', () => { focused = false; }, done({ skipWhenFocused: true }));
ok(notified[0] && notified[0].folder === 'C:\\proj\\demo app',
   'the click target is the window folder, verbatim: ' + (notified[0] || {}).folder);
ok(notified[0] && notified[0].exe === process.execPath,
   'and the editor binary to hand it to: ' + (notified[0] || {}).exe);

// a window with no folder has nothing to focus, so the toast gets no target
r = run('no folder', () => { folders = []; }, done({ skipWhenFocused: true }));
ok(notified[0] && notified[0].folder === '' && notified[0].exe === '',
   'no workspace folder means no click target: ' + JSON.stringify((notified[0] || {}).folder));

// 8. somebody else's message is not ours
notified = []; replies = [];
ok(loadHost().handle({ type: 'something-else' }, webview) === false, 'a foreign message must not be claimed');
ok(notified.length === 0, 'a foreign message must not notify');
ok(replies.length === 0, 'a foreign message must not be answered either');

// 9. every decision is reported back, because none of them is visible from the
//    panel: staying quiet and never receiving the message look identical there.
r = run('reply when quiet', () => { focused = true; }, done({ skipWhenFocused: true }));
ok(replies.length === 1 && replies[0].op === 'decided' &&
   replies[0].shown === false && replies[0].focused === true,
   'a suppressed toast must be reported as suppressed: ' + JSON.stringify(replies));

r = run('reply when shown', () => { focused = false; }, done({ skipWhenFocused: true }));
ok(replies.length === 1 && replies[0].shown === true && replies[0].focused === false,
   'a raised toast must be reported as raised: ' + JSON.stringify(replies));

// 10. the capability probe: this host answers a ping, and a host from before
//     the gates swallows it - which is how the panel knows to say so rather
//     than showing a switch its own window has never heard of.
r = run('ping', () => {}, { type: '__ccnotify', op: 'ping' });
ok(r.handled === true && r.sent === 0 && replies.length === 1 && replies[0].op === 'pong',
   'a ping must be answered with a pong and nothing else: ' + JSON.stringify(replies));

// 11. a panel whose webview cannot be posted to must still get its toast: the
//     reply is diagnostics, the toast is the feature.
notified = []; replies = [];
ok(loadHost().handle(done({ skipWhenFocused: true }), null) === true,
   'a missing webview must not stop the message being claimed');
ok(notified.length === 1, 'nor stop the toast, sent ' + notified.length);

console.log((fail ? 'FAILED' : 'ok') + ' - ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
