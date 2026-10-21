/* Which title a channel's CLI is sent, against real files (see fixture.js).
 *
 *   node patches/session-name-sync/tests/name.test.js
 */
const { arrived, host, logged, line, title, chatter, transcript, sizeOf, channel, arrive, cleanup } = require('./fixture');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
    // 1. renamed before the first message: the title is the first line, the conversation follows
    let id = transcript(title('VITER 2') + chatter(20));
    let ch = channel();
    await arrive(ch, id);
    ok(same(ch.sent, [['VITER 2', id]]), 'a title written before the conversation must be sent');

    // 2. renamed twice: the newest title wins
    id = transcript(title('VITER DEVOPS') + chatter(5) + title('VITER IDEAS') + chatter(5));
    ch = channel();
    await arrive(ch, id);
    ok(same(ch.sent, [['VITER IDEAS', id]]), 'the newest title must be sent');

    // 3. no title of its own: nothing is sent, and the log says why
    id = transcript(chatter(10) + line({ type: 'ai-title', aiTitle: 'made up', sessionId: 'x' }));
    ch = channel();
    await arrive(ch, id);
    ok(ch.sent.length === 0, 'an AI title is not the user\'s title');
    ok(logged.some((t) => t.includes(id) && t.includes('no title')), 'a silence must be logged');

    // 4. the newest record is blank: the title was cleared, an older one does not come back
    id = transcript(title('old') + chatter(3) + title('   '));
    ch = channel();
    await arrive(ch, id);
    ok(ch.sent.length === 0, 'a cleared title must not fall back to an older one');

    // 5. the same session arriving again on the same channel (every turn's init): sent once
    id = transcript(title('once') + chatter(2));
    ch = channel();
    await arrive(ch, id);
    await arrive(ch, id);
    ok(same(ch.sent, [['once', id]]), 'a channel names its session once');

    // 6. a new channel on the same session (a reload) sends it again
    const again = channel();
    await arrive(again, id);
    ok(same(again.sent, [['once', id]]), 'a relaunched CLI must be named again');

    // 7. the channel moved to another session while the file was read: nothing for the old one
    const a = transcript(title('first') + chatter(2));
    const b = transcript(chatter(2));
    ch = channel();
    const p = arrived(host, ch, a);
    ch.sessionId = b;
    await p;
    ok(ch.sent.length === 0, 'a session the channel left must not be named');

    // 8. the CLI refuses: logged, never thrown
    id = transcript(title('refused') + chatter(2));
    ch = channel('session_id is not the current session');
    let threw = false;
    try { await arrive(ch, id); } catch (e) { threw = true; }
    ok(!threw && logged.some((t) => t.includes(id) && t.includes('did not take')), 'a refusal must be logged, not thrown');

    // 8b. a refusal is not the last word: the session's next arrival tries again
    ch.query.renameSession = async (t, sid) => { ch.sent.push([t, sid]); };
    await arrive(ch, id);
    ok(same(ch.sent, [['refused', id]]), 'a refused session must be retried when it arrives again');

    // 8c. a fork: it starts on the session it came from, which its CLI refuses, then names its own
    const parent = transcript(title('parent') + chatter(2));
    const forked = transcript(chatter(2) + title('parent (fork)'));
    ch = channel();
    ch.sessionId = parent;
    ch.query.renameSession = async (t, sid) => {
        if (sid !== forked) throw new Error('session_id is not the current session');
        ch.sent.push([t, sid]);
    };
    await arrived(host, ch);
    await arrive(ch, forked);
    ok(same(ch.sent, [['parent (fork)', forked]]), 'a fork must be named with its own title');

    // 9. no transcript at all
    ch = channel();
    await arrive(ch, 'never-written');
    ok(ch.sent.length === 0, 'a session with no transcript is left alone');

    // 9b. a CLI that started on a session it resumed: the channel already holds the id
    id = transcript(title('resumed') + chatter(2));
    ch = channel();
    ch.sessionId = id;
    await arrived(host, ch);
    await arrive(ch, id);
    ok(same(ch.sent, [['resumed', id]]), 'a resumed session is named at start, and only once');

    // 9c. a new conversation's CLI starts with no session at all: nothing yet
    ch = channel();
    await arrived(host, ch);
    ok(ch.sent.length === 0 && ch.__ccNamedSession === undefined, 'a channel with no session yet is left for later');

    // 10. a long transcript: the title sits several chunks back from the end, in another folder
    id = transcript(title('far back') + chatter(20000), 'C--elsewhere');
    ok(sizeOf(id, 'C--elsewhere') > 3 * 256 * 1024, 'the long case must span several chunks');
    ch = channel();
    await arrive(ch, id);
    ok(same(ch.sent, [['far back', id]]), 'a title far from the end must still be found');

    cleanup();
    console.log(fail ? `FAILED - ${pass} passed, ${fail} failed` : `ok - ${pass} passed, 0 failed`);
    process.exit(fail ? 1 : 0);
})();
