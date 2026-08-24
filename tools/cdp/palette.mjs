/* Run a workbench command in a window, through its Command Palette.

   Why the palette and not something more direct: the workbench renderer exposes
   no command API to CDP (no `require`, no service handle - only the sandbox
   preload's `window.vscode`), and the one reload channel that preload CAN reach,
   `vscode:reloadWindow`, is handled in main as `sender.reload()` - a plain
   renderer reload, i.e. exactly what `Page.reload` already does. The real
   `Developer: Reload Window` goes through INativeHostService.reload() ->
   CodeWindow.reload(), which rebuilds the window configuration and re-loads it.
   The only way to reach that from outside is the way a person does: keystrokes.
   CDP's Input domain delivers trusted key events to the renderer, so the
   keybinding service handles them exactly as it handles a real Ctrl+Shift+P -
   no OS-level typing, and the window does not need focus. */

import { connect, unwrap } from './client.mjs';

const CTRL_SHIFT = 10;
const VISIBLE_PALETTE = `(() => {
  const w = document.querySelector('.quick-input-widget');
  return !!w && w.style.display !== 'none';
})()`;
const ROWS = `[...document.querySelectorAll('.quick-input-list .monaco-list-row')]
  .slice(0, 5).map((r) => r.innerText.replace(/\\s+/g, ' ').trim())`;

const evalIn = async (c, expression) =>
  unwrap(await c.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }));

async function key(c, opts) {
  await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...opts });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...opts });
}

const ESCAPE = { windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27, key: 'Escape', code: 'Escape' };
const ENTER = { windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, key: 'Enter', code: 'Enter' };
const PALETTE = { modifiers: CTRL_SHIFT, windowsVirtualKeyCode: 80, nativeVirtualKeyCode: 80, key: 'P', code: 'KeyP' };

/* Poll instead of sleeping: the palette opens on its own schedule, and the list
   filters one frame after the text lands. */
async function until(fn, tries = 20, waitMs = 150) {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, waitMs));
  }
  return null;
}

const matches = (row, title) => row.toLowerCase().startsWith(title.toLowerCase());

/* Whatever holds DOM focus gets the keystroke first, and some of what the
   workbench focuses on its own never lets it reach the keybinding service - a
   fresh profile parks focus on the welcome page's Sign In button, and from
   there Ctrl+Shift+P does nothing at all (the event arrives, trusted, and no
   palette opens). Dropping focus back to the body is what a person does by
   clicking elsewhere, and it costs nothing when focus was already fine. */
const BLUR = `(() => { const a = document.activeElement; if (a && a !== document.body) a.blur(); return true; })()`;

/* A page that is not being delivered input cannot be typed into, so ask for the
   window first. Cheap, and it costs nothing when the window was already up. */
async function raise(c) {
  try { await c.send('Page.bringToFront'); } catch { /* not every target allows it */ }
}

/* When the chord does nothing there are several possible reasons and they need
   different answers, so collect what the window actually looked like rather than
   leaving the next reader to guess from "palette did not open". */
const STATE = `(() => {
  const a = document.activeElement;
  return {
    visibility: document.visibilityState,
    focused: document.hasFocus(),
    activeElement: a ? (a.className || a.tagName) : null,
    quickInputExists: !!document.querySelector('.quick-input-widget'),
    modal: !!document.querySelector('.monaco-dialog-box, .dialog-shadow'),
  };
})()`;

/* The shortcut is dropped if it lands while the window is still settling (right
   after a reload, most of all), so send it again rather than giving up on one. */
async function openPalette(c) {
  await raise(c);
  for (let attempt = 0; attempt < 3; attempt++) {
    await evalIn(c, BLUR);
    await key(c, PALETTE);
    if (await until(() => evalIn(c, VISIBLE_PALETTE), 8, 150)) return true;
  }
  return await evalIn(c, STATE);
}

/* Type `title` into the window's palette and run the first entry, but only if
   that entry really is the command asked for - otherwise Escape and say so.
   `commit: false` stops before running it (dry run), for checking a title. */
export async function runCommand(pageTarget, title, { commit = true } = {}) {
  const c = await connect(pageTarget.webSocketDebuggerUrl);
  try {
    if (await evalIn(c, VISIBLE_PALETTE)) await key(c, ESCAPE);
    const opened = await openPalette(c);
    if (opened !== true) {
      const s = opened || {};
      /* Ordered by how reliably each one explains it. A modal really does eat the
         chord. Focus is the next best signal. visibilityState is reported but not
         blamed: measured in this lab, a window can read "hidden" and still be
         delivered these key events perfectly well. */
      const why = s.modal ? ' - a modal dialog is in the way'
        : s.focused === false ? ' - the window does not have focus'
        : '';
      return { ok: false, reason: `palette did not open${why}`, window: s };
    }

    await c.send('Input.insertText', { text: title });
    const rows = await until(async () => {
      const r = await evalIn(c, ROWS);
      return Array.isArray(r) && r.length ? r : null;
    });
    if (!rows) { await key(c, ESCAPE); return { ok: false, reason: 'no command matched', rows: [] }; }
    if (!matches(rows[0], title)) {
      await key(c, ESCAPE);
      return { ok: false, reason: 'first entry is not that command', rows };
    }
    if (!commit) { await key(c, ESCAPE); return { ok: true, ran: false, rows }; }

    await key(c, ENTER);
    return { ok: true, ran: true, rows };
  } finally {
    try { c.close(); } catch { /* a reload tears the connection down under us */ }
  }
}
