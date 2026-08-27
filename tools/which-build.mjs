/* Which windows are running the bundle that is on disk, and which need a reload.
 *
 *     node tools/which-build.mjs
 *
 * The panel says this for itself - the button's tooltip names both stamps when
 * they differ (patches/auto-followup/host/stamp.js). That only works from a
 * window whose extension host already has the stamp in it, so this exists for
 * the rest: a window patched before the stamp landed cannot tell you anything,
 * and this can, from the outside.
 *
 * The rule is one comparison: an extension host that started BEFORE the bundle
 * was last written is running the code that was there before it. Nothing else -
 * no cache, no service worker, no editor version - is involved. A window reload
 * restarts that host, which is why it is the fix.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readdirSync } from 'node:fs';

const DIRS = ['.vscode', '.vscode-insiders', '.cursor', '.vscode-oss']
  .map((d) => join(homedir(), d, 'extensions'))
  .filter((d) => existsSync(d));

function bundles() {
  const out = [];
  for (const dir of DIRS) {
    for (const name of readdirSync(dir)) {
      if (!name.startsWith('anthropic.claude-code-')) continue;
      const js = join(dir, name, 'extension.js');
      if (!existsSync(js)) continue;
      let stamp = '';
      const text = readFileSync(js, 'utf8');
      const at = text.indexOf('ccAfStamp:"');
      if (at >= 0) stamp = text.slice(at + 11, text.indexOf('"', at + 11));
      out.push({ dir, name, js, written: statSync(js).mtime, stamp });
    }
  }
  return out;
}

/* The extension host is a Code.exe utility process; the session processes it
   spawned are what say which extension folder it loaded. */
function hosts() {
  const ps = `Get-CimInstance Win32_Process -Filter "Name='Code.exe' OR Name='Cursor.exe'" |
    Where-Object { $_.CommandLine -match 'node.mojom.NodeService' } | ForEach-Object {
      $kids = @(Get-CimInstance Win32_Process -Filter ("ParentProcessId=" + $_.ProcessId) |
                Where-Object { $_.Name -eq 'claude.exe' })
      $ext = ''
      if ($kids.Count -and $kids[0].CommandLine -match 'claude-code-([0-9.]+[^\\\\]*)') { $ext = $Matches[1] }
      [pscustomobject]@{ pid = $_.ProcessId; started = $_.CreationDate.ToString('o'); ext = $ext; panels = $kids.Count }
    } | ConvertTo-Json -Compress`;
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim();
    if (!out) return [];
    const j = JSON.parse(out);
    return Array.isArray(j) ? j : [j];
  } catch (e) {
    console.error('could not read the running processes: ' + e.message);
    return [];
  }
}

const found = bundles();
if (!found.length) { console.log('no Claude Code extension found'); process.exit(0); }

console.log('bundles on disk');
for (const b of found) {
  console.log(`  ${b.name}`);
  console.log(`    written ${b.written.toLocaleString()}   stamp ${b.stamp || '(none - patched before the stamp existed)'}`);
}

const live = hosts().filter((h) => h.panels > 0);
console.log('');
console.log(live.length ? 'extension hosts with a Claude panel' : 'no extension host is serving a Claude panel');
let stale = 0;
for (const h of live) {
  const started = new Date(h.started);
  /* Match by the folder its sessions were spawned from, so two installs do not
     get compared against each other's file. */
  const b = found.find((x) => h.ext && x.name.indexOf(h.ext) >= 0) || found[0];
  const old = started < b.written;
  if (old) stale++;
  console.log(`  pid ${h.pid}  started ${started.toLocaleString()}  ${h.panels} panel(s)  ${h.ext || ''}`);
  console.log(`    ${old ? 'RELOAD PENDING - started before the bundle was written' : 'running what is on disk'}`);
}
console.log('');
console.log(stale
  ? `${stale} window(s) are running code older than the file. Reload them: Ctrl+Shift+P, Developer: Reload Window.`
  : 'every window with a panel is running the bundle that is on disk.');
