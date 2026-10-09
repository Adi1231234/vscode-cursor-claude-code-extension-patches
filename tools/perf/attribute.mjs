/* Which patch a JS stack frame belongs to.

   The patches' scripts are inline <script>s in the panel page, each opening
   with its guard comment (/* QUEUE *\/, /* MSGCARDS *\/ ...), so a frame in the
   page maps to a patch exactly: the last <script> that starts at or above its
   line. A frame in index.js is the app's own code or code a patch spliced into
   the bundle; the nearest guard comment above it is reported as a hint only. */

const GUARD = /\/\*\s*([A-Z][A-Z0-9-]{2,})\s*\*\//;

export function pageScripts(html) {
  const lines = html.split('\n');
  const starts = [];
  lines.forEach((l, i) => {
    const at = l.indexOf('<script');
    if (at < 0) return;
    const head = l.slice(at) + ' ' + (lines[i + 1] || '');
    const g = GUARD.exec(head);
    starts.push({ line: i, name: g ? g[1] : 'page' });
  });
  return starts;
}

/* index.js, with where each line starts, read once. */
export function indexSource(text) {
  const starts = [0];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  return { text, starts };
}

function nearestGuard(src, line, column) {
  const at = (src.starts[line] ?? 0) + column;
  const window = src.text.slice(Math.max(0, at - 4000), at);
  const all = [...window.matchAll(new RegExp(GUARD.source, 'g'))];
  return all.length ? all[all.length - 1][1] : null;
}

/* frame -> "QUEUE", "index.js (near FOOTERFIT)", "index.js", "page" */
export function owner(frame, scripts, indexJs) {
  const url = String(frame.url || '').split('?')[0];
  if (url.endsWith('/panel.html')) {
    let name = 'page';
    for (const s of scripts) if (s.line <= frame.lineNumber) name = s.name;
    return name;
  }
  if (url.endsWith('/index.js') && indexJs) {
    const g = nearestGuard(indexJs, frame.lineNumber, frame.columnNumber);
    return g ? `index.js (near ${g})` : 'index.js';
  }
  return url.split('/').pop() || '(native)';
}

/* The first frame of a stack that is not the browser's own. */
export function blame(stack, scripts, indexJs) {
  const f = (stack || []).find((x) => x.url);
  return f ? `${owner(f, scripts, indexJs)} ${f.functionName || '(anon)'}` : '(no stack)';
}
