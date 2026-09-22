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
        notified.push({ via: 'toast', title: opts.env.CC_TOAST_TITLE, body: opts.env.CC_TOAST_BODY, launch: opts.env.CC_TOAST_LAUNCH });
        return { on: () => {}, kill: () => {} };
      } };
    }
    return realRequire(name);
  };
  // eslint-disable-next-line no-unused-vars
  const require = stub;                     // shadows inside the eval below
  delete globalThis.__ccNotify;             // the IIFE guards on itself
  eval(fs.readFileSync(path.resolve(__dirname, '..', 'host', 'notify.js'), 'utf8'));
  return globalThis.__ccNotify;
}

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };
const done = (extra) => Object.assign({ type: '__ccnotify', op: 'done', title: 'Claude finished', body: 'proj' }, extra);

function run(label, setup, msg) {
  notified = [];
  focused = false; vscodeThrows = false;
  folders = [{ uri: { fsPath: 'C:\\proj\\demo app' } }];
  setup();
  const handled = loadHost().handle(msg);
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

// 7. the click target: this window's folder, ending in a slash so the editor
//    treats it as a folder (a path without one opens an editor tab instead)
r = run('launch uri', () => { focused = false; }, done({ skipWhenFocused: true }));
ok(notified[0] && notified[0].launch === 'vscode://file/C:/proj/demo%20app/',
   'launch uri is the window folder, slash-terminated and encoded: ' + (notified[0] || {}).launch);

// a window with no folder has nothing to focus, so the toast gets no launch
r = run('no folder', () => { folders = []; }, done({ skipWhenFocused: true }));
ok(notified[0] && notified[0].launch === '', 'no workspace folder means no click target: ' + JSON.stringify((notified[0] || {}).launch));

// 8. somebody else's message is not ours
notified = [];
ok(loadHost().handle({ type: 'something-else' }) === false, 'a foreign message must not be claimed');
ok(notified.length === 0, 'a foreign message must not notify');

console.log((fail ? 'FAILED' : 'ok') + ' - ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
