/* Finding the Claude panel behind a CDP port, and running code *inside* it.

   Two facts make this non-obvious, both learned the hard way:

   1. A webview iframe is out-of-process. `Page.getFrameTree` on a window target
      therefore does NOT list it, so a window cannot be walked down to its
      webviews. But the window's own DOM still holds the <iframe> ELEMENT, and
      its src carries the same ?id=<uuid> as the webview target's url - an exact
      window -> webview mapping. (Matching on screen geometry instead silently
      mislabels every window that is stacked in the same place.)
   2. The target CDP lists is the webview *shell*; the panel's DOM is one frame
      deeper. That child frame has its own default execution context in the same
      target, so evaluating with its contextId lets a script be written as if it
      runs in the panel - no contentWindow hops, and `new MouseEvent(...)` is
      built in the right realm. */

import { connect, evaluate, targets, unwrap } from './client.mjs';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

const OWNED_WEBVIEWS = `[...document.querySelectorAll('iframe')]
  .map(f => ((f.getAttribute('src') || '') + ' ' + (f.src || '')).match(/${UUID}/))
  .filter(Boolean).map(m => m[0])`;

const IS_CLAUDE_PANEL = `!!document.querySelector('[aria-label="Message input"][contenteditable]')`;

/* Every webview in every window, tagged with the window that owns it. */
export async function webviews(port) {
  const all = await targets(port);
  const frames = all.filter((t) => t.type === 'iframe');
  const out = [];
  for (const page of all.filter((t) => t.type === 'page')) {
    const ids = await evaluate(page, OWNED_WEBVIEWS);
    for (const id of Array.isArray(ids) ? ids : []) {
      const target = frames.find((f) => (f.url || '').includes(id));
      if (target) out.push({ window: page.title, target });
    }
  }
  return out;
}

/* The child frame's default execution context - i.e. the panel itself. */
async function panelContext(client) {
  const contexts = [];
  client.on('Runtime.executionContextCreated', (p) => contexts.push(p.context));
  await client.send('Page.enable');
  const tree = await client.send('Page.getFrameTree');
  await client.send('Runtime.enable');
  await new Promise((r) => setTimeout(r, 250));
  const child = ((tree.result.frameTree.childFrames || [])[0] || {}).frame;
  if (!child) return null;
  const ctx = contexts.find(
    (c) => c.auxData && c.auxData.frameId === child.id && c.auxData.isDefault,
  );
  return ctx ? ctx.id : null;
}

/* Run an expression in the panel's own context. The script sees the panel's
   `document` / `window` directly. */
export async function evalInPanel(target, expression) {
  const c = await connect(target.webSocketDebuggerUrl);
  const contextId = await panelContext(c);
  if (!contextId) { c.close(); return { __error: 'no panel frame in this webview' }; }
  const r = await c.send('Runtime.evaluate', {
    expression,
    contextId,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  c.close();
  return unwrap(r);
}

/* A window reload tears its panel down and builds a new one with a new id.
   Wait for one to be serving again in the named window (null on timeout). */
export async function waitForPanel(port, windowTitle, tries = 60, waitMs = 1000) {
  for (let i = 0; i < tries; i++) {
    const hit = (await claudePanels(port).catch(() => []))
      .find((p) => p.window === windowTitle);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, waitMs));
  }
  return null;
}

/* Only the webviews that are actually a Claude Code panel. */
export async function claudePanels(port) {
  const found = [];
  for (const w of await webviews(port)) {
    if ((await evalInPanel(w.target, IS_CLAUDE_PANEL)) === true) found.push(w);
  }
  return found;
}
