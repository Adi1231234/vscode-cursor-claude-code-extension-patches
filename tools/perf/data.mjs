/* Everything the fake host hands the panel (window.__perf): the init state
   and CLI state recorded from a real host (fixtures/, personal data left out),
   the made-up conversation, and the session list that names it - without that
   entry the panel does not open the conversation at all. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conversation } from './transcript.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (n) => JSON.parse(readFileSync(join(HERE, 'fixtures', `${n}.json`), 'utf8'));

export function panelData(turns) {
  const session = conversation(turns);
  const at = Date.UTC(2026, 9, 1);
  return {
    init: fixture('init-state'),
    claude: fixture('claude-config'),
    session,
    sessions: [{ id: session.sessionId, archived: false, lastModified: at, lastActivity: at, fileSize: 1,
      summary: 'Perf session', customTitle: 'Perf session', isCurrentWorkspace: true }],
  };
}

export const budgets = () => JSON.parse(readFileSync(join(HERE, 'budgets.json'), 'utf8'));
