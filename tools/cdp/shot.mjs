/* A picture of the panel, because the alternative is designing blind.

   The lab runs on a desktop of its own, so nothing on screen can be captured
   the ordinary way and a screenshot has to come from the renderer itself.
   Page.captureScreenshot on the window target returns the whole window, which
   is what you want for layout; `--sel <css>` clips it to one element's box,
   which is what you want when the thing under review is a dialog.

       node tools/cdp/shot.mjs <window-substring> <out.png> [--sel .__afDlg] [--port N]
*/
import { writeFileSync } from 'node:fs';
import { connect, targets } from './client.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i < 0 ? d : argv[i + 1]; };
const positional = argv.filter((a, i) => !a.startsWith('--') && !String(argv[i - 1] || '').startsWith('--'));
const [match, out] = positional;
const port = Number(flag('--port', 9555));
const sel = flag('--sel', null);

if (!match || !out) {
  console.error('usage: shot.mjs <window-substring> <out.png> [--sel <css>] [--port N]');
  process.exit(2);
}

const list = await targets(port);
const t = list.find((x) => x.type === 'page' && (x.title || '').includes(match));
if (!t) {
  console.error(`no window titled like "${match}". Windows: ` +
    list.filter((x) => x.type === 'page').map((x) => x.title).join(' | '));
  process.exit(1);
}

const c = await connect(t.webSocketDebuggerUrl);
await c.send('Page.enable');

let clip;
if (sel) {
  /* The dialog lives in the panel's own iframe, so its box has to be measured
     where it is drawn and then offset by that frame's position in the window. */
  const js = `(() => {
    const walk = (doc, ox, oy) => {
      const e = doc.querySelector(${JSON.stringify(sel)});
      if (e) { const r = e.getBoundingClientRect();
               return { x: r.x + ox, y: r.y + oy, width: r.width, height: r.height }; }
      for (const f of doc.querySelectorAll('iframe')) {
        try { const r = f.getBoundingClientRect();
              const hit = walk(f.contentDocument, ox + r.x, oy + r.y);
              if (hit) return hit; } catch (e) {}
      }
      return null;
    };
    return JSON.stringify(walk(document, 0, 0));
  })()`;
  const r = await c.send('Runtime.evaluate', { expression: js, returnByValue: true });
  const box = JSON.parse(r.result?.result?.value || 'null');
  if (!box) { console.error(`no element matching ${sel} in that window`); process.exit(1); }
  const pad = 12;
  clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad),
           width: box.width + pad * 2, height: box.height + pad * 2, scale: 2 };
}

const shot = await c.send('Page.captureScreenshot', clip ? { format: 'png', clip } : { format: 'png' });
if (!shot.result?.data) { console.error('capture returned nothing'); process.exit(1); }
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
c.close();
console.log(`${out}  ${clip ? Math.round(clip.width) + 'x' + Math.round(clip.height) + ' @2x' : 'full window'}`);
