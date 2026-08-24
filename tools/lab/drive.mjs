/* Driving the panel the way a person does, for the patches that only come alive
   once a session exists.

   Two traps live here, and both look like nothing happened:

   1. The webview target's DEFAULT execution context is the outer shell document
      (`index.html`, one script, empty body). The panel's own DOM is one frame
      deeper, so a `Runtime.evaluate` without the panel's context id finds no
      composer and no dialog - it is not that they are missing.
   2. Enter's `text` is a carriage return, not the string "Enter". With the key
      name in there the app receives the event and does not submit, and the prompt
      just sits in the composer looking like the send silently failed. */

import { connect, unwrap } from '../cdp/client.mjs';
import { claudePanels, panelContext } from '../cdp/panels.mjs';

const CR = String.fromCharCode(13);

async function withPanel(port, body) {
    const panel = (await claudePanels(port))[0];
    if (!panel) throw new Error('no Claude panel is serving - `lab.mjs up` first');
    const client = await connect(panel.target.webSocketDebuggerUrl);
    try {
        const contextId = await panelContext(client);
        if (!contextId) throw new Error('the webview has no panel frame yet');
        /* unwrap, because send returns the whole CDP envelope and the value is
           three levels down - reading it raw gives undefined, not an error. */
        const evaluate = async (expression) => unwrap(await client.send('Runtime.evaluate', {
            expression, contextId, returnByValue: true, userGesture: true,
        }));
        return await body(client, evaluate);
    } finally { client.close(); }
}

/* Type a prompt into the composer and send it. The composer is a contenteditable
   with role=textbox, not a textarea, so it takes typed input rather than a value. */
export function sendPrompt(port, text) {
    return withPanel(port, async (client, evaluate) => {
        const focused = await evaluate(`(() => {
            const el = document.querySelector('[role="textbox"][contenteditable]');
            if (!el) return 'none';
            el.focus();
            /* Anything a previous attempt left behind would be sent along with this. */
            const r = document.createRange(); r.selectNodeContents(el);
            const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
            document.execCommand('delete');
            return document.activeElement === el ? 'ok' : 'not-focused';
        })()`);
        if (focused !== 'ok') throw new Error(`could not focus the composer (${focused})`);

        await client.send('Input.insertText', { text });
        await new Promise((r) => setTimeout(r, 300));
        await key(client, 'Enter', 13, 'Enter', CR);
        await new Promise((r) => setTimeout(r, 1200));
        const left = await evaluate(`(document.querySelector('[role="textbox"][contenteditable]').textContent || '').length`);
        return { sent: left === 0 };
    });
}

/* The app's confirm dialogs are numbered option lists, so approving a tool call is
   the digit 1 - not a click on anything. */
export function pressKey(port, k) {
    return withPanel(port, async (client) => {
        if (k === 'Escape') return key(client, 'Escape', 27, 'Escape');
        if (k === 'Enter') return key(client, 'Enter', 13, 'Enter', CR);
        const code = /^[0-9]$/.test(k) ? `Digit${k}` : `Key${k.toUpperCase()}`;
        return key(client, k, k.toUpperCase().charCodeAt(0), code, k);
    });
}

/* A printable key needs the separate `char` event - the numbered confirm reads it
   and nothing happens without it. Enter must NOT get one: with both, the app takes
   the char as input instead of submitting and the prompt stays in the composer. */
async function key(client, name, vk, code, text) {
    const printable = text && text.length === 1 && text !== CR;
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: vk, code, key: name, text });
    if (printable) await client.send('Input.dispatchKeyEvent', { type: 'char', text });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: vk, code, key: name });
    await new Promise((r) => setTimeout(r, 200));
    return { pressed: name };
}
