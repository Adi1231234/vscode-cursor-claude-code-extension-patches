/* What name.test.js runs against: the host runtime loaded from its files, a
 * throwaway ~/.claude/projects (via CLAUDE_CONFIG_DIR) to write transcripts
 * shaped like the CLI's into, and a fake channel whose query records the
 * renames it is asked for. */
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-session-name-'));
process.env.CLAUDE_CONFIG_DIR = path.join(tmp, 'config');

const lib = (f) => path.resolve(__dirname, '..', '..', '..', 'lib', 'js', f);
eval(fs.readFileSync(lib('ccProjects.js'), 'utf8'));
eval(fs.readFileSync(lib('ccTranscript.js'), 'utf8'));
eval(fs.readFileSync(path.resolve(__dirname, '..', 'host', 'name.js'), 'utf8'));
const arrived = globalThis.__ccSessionName;

const logged = [];
const host = { logger: { log: (t) => logged.push(t) } };
const line = (o) => JSON.stringify(o) + '\n';
const title = (t, sid = 'x') => line({ type: 'custom-title', sessionId: sid, customTitle: t });
const chatter = (n) => Array.from({ length: n }, (_, i) =>
    line({ type: 'user', message: { content: 'שלום ' + i + ' '.repeat(i % 7) } })).join('');

let seq = 0;
function transcript(body, folder = 'C--proj') {
    const id = 'sess-' + (++seq);
    const dir = path.join(process.env.CLAUDE_CONFIG_DIR, 'projects', folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, id + '.jsonl'), body);
    return id;
}
const sizeOf = (id, folder) => fs.statSync(path.join(process.env.CLAUDE_CONFIG_DIR, 'projects', folder, id + '.jsonl')).size;

function channel(refuse) {
    const sent = [];
    return {
        sent,
        query: { renameSession: async (t, sid) => { if (refuse) throw new Error(refuse); sent.push([t, sid]); } },
    };
}
/* A session arriving the way sessionIdArrived hands it over: the channel's
   sessionId is assigned right after the call. */
function arrive(ch, sid) {
    const p = arrived(host, ch, sid);
    ch.sessionId = sid;
    return p;
}

const cleanup = () => fs.rmSync(tmp, { recursive: true, force: true });

module.exports = { arrived, host, logged, line, title, chatter, transcript, sizeOf, channel, arrive, cleanup };
