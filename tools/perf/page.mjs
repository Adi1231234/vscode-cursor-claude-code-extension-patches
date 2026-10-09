/* The chat panel's HTML, exactly as the extension builds it, for a plain browser.

   The page a panel loads is a template literal inside extension.js
   (getHtmlForWebview), and every webview patch injects its <script> into that
   template. So the faithful page - the app's own skeleton plus every patch in
   the order the patches put it - is that template with its few slots filled.
   Each slot is recognised by its shape, never by the minified name in it:

     the CSP <meta>            dropped - it only allows the editor's own origin
     nonce="${x}"              nonce="perf" (the scripts no longer need it)
     <link href="${x}" ...>    the stylesheet
     src="${x}" type="module"  the app's script
     <div id="root"...>        rebuilt: the session to open and a signed-in user
     ${x?"true":"false"}       false - a panel in an editor tab
     ${x}                      '' - the editor's font settings; the page keeps
                               the browser's defaults

   Whatever is left once the slots are filled is cooked the way the template
   literal would cook it, so the browser gets the same bytes the webview does.
   A ${ that survives is a template this does not know: it throws rather than
   hand the browser a page that is not the real one. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function template(extensionJs) {
  const def = /getHtmlForWebview\([\w$,=!]+\)\{/g;
  for (let m; (m = def.exec(extensionJs)); ) {
    const start = extensionJs.indexOf('return`<!DOCTYPE html>', m.index);
    const end = extensionJs.indexOf('</html>`', start);
    if (start < 0 || end < 0) continue;
    const tpl = extensionJs.slice(start + 'return`'.length, end + '</html>'.length);
    if (tpl.includes('<div id="root"')) return tpl;
  }
  throw new Error('no chat panel template (getHtmlForWebview with a #root) in extension.js');
}

const escape = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* opts: { css, js, host: [urls of scripts to run first], session, auth } */
export function panelHtml(extDir, opts, jsFile = 'extension.js') {
  let t = template(readFileSync(join(extDir, jsFile), 'utf8'));
  const root = `<div id="root" data-initial-session="${escape(opts.session)}"` +
    ` data-initial-auth-status="${escape(JSON.stringify(opts.auth))}"></div>`;
  t = t.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
    .replace(/nonce="\$\{[\w$]+\}"/g, 'nonce="perf"')
    .replace(/<link href="\$\{[\w$]+\}" rel="stylesheet">/, `<link href="${opts.css}" rel="stylesheet">`)
    .replace(/src="\$\{[\w$]+\}" type="module"/, `src="${opts.js}" type="module"`)
    .replace(/<div id="root"[\s\S]*?><\/div>/, root)
    .replace(/\$\{[\w$]+\?"true":"false"\}/g, 'false')
    .replace(/\$\{[\w$]+\}/g, '');
  if (t.includes('${')) throw new Error(`unknown slot in the panel template: ${t.slice(t.indexOf('${'), t.indexOf('${') + 60)}`);
  const cooked = (0, eval)('`' + t.replace(/`/g, '\\`') + '`');
  const host = opts.host.map((u) => `<script src="${u}"></script>`).join('');
  return cooked.replace('<head>', '<head>' + host);
}
