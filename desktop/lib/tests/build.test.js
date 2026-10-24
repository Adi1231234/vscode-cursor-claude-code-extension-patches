/* The payload build (lib/build.cjs) on a stand-in preload: both payloads
 * parse, every build-time token is filled, every patch in patches/order.json
 * is in, and a preload with no channel prefix (or two) leaves the stream
 * unwired rather than guessed. */
const vm = require('vm'), path = require('path');
const { build, webChannel } = require(path.join(__dirname, '..', 'build.cjs'));

let bad = 0;
function ok(cond, msg) { if (cond) console.log('  ok   ' + msg); else { bad++; console.log('  FAIL ' + msg); } }
const parses = (code) => { try { new vm.Script(code); return true; } catch (e) { console.log('    ' + e.message); return false; } };

const CH = '$eipc_message$_8b0b60bb-4f91-4463-859c-aa7572d3beee_$_claude.web_$_';
const out = build({ mainViewText: 'x="' + CH + '";y="' + CH + '"', stamp: '2026-10-24T00:00Z' });
ok(out.channel === CH, 'the claude.web channel prefix is read from the preload');
ok(parses(out.renderer), 'the renderer payload parses');
ok(parses(out.main), 'the main payload parses');
ok(!/__CCD_[A-Z_]+__/.test(out.renderer), 'no build-time token is left in the renderer payload');
ok(out.renderer.includes(CH + 'LocalSessions_$_onEvent') || out.renderer.includes('"' + CH + '"'), 'the event stream is wired to it');
ok(out.patches.includes('prompt-queue') && out.patches.includes('phone-queue'), 'every patch in order.json is built');
ok(/window\.__ccd\.style\("queue",/.test(out.renderer), 'the queue stylesheet is in, as one __ccd.style call');
ok(/function ccPhoneListen/.test(out.main) && /CLAUDE_CODE_PLUGIN_DIRS/.test(out.main), 'the phone listener and its wiring are in the main payload');

const run = (href) => { const win = {}; new vm.Script(out.renderer).runInNewContext({ window: win, location: { href }, require: () => { throw new Error('no electron'); } }); return win; };
ok(Object.keys(run('about:blank')).length === 0, 'in an about:blank document of the window the payload does nothing');
ok(webChannel('nothing here') === null, 'no prefix in the preload: none is guessed');
ok(webChannel('"' + CH + '" "' + CH.replace('8b0b', '9c1c') + '"') === null, 'two different prefixes: none is guessed');
const skipped = build({ mainViewText: '', skip: ['phone-queue'], stamp: 'x' });
ok(!skipped.patches.includes('phone-queue') && !skipped.main.trim(), '-Skip leaves a patch out, main payload included');

if (bad) { console.log(bad + ' failed'); process.exit(1); }
console.log('build: all passed');
