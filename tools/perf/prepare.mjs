/* An extension to measure: the published VSIX from OpenVSX, unpacked into a
   folder of its own and patched there by apply.ps1 -ExtensionsDir. apply.ps1
   keeps the untouched bundles beside the patched ones (*.pristine,
   lib/Pristine.ps1), so that one folder serves both variants. Nothing outside
   the folder is touched.

   Only what a panel needs is fetched: the VSIX also carries the CLI itself
   (resources/native-binary, 256 MB unpacked of its 120 MB), which no panel
   loads - vsix.mjs reads ~4 MB of it instead of downloading it all. The slim
   copy is cached per version (CC_PERF_CACHE, default <tmp>/cc-perf/cache). */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchExtension } from './vsix.mjs';

const API = 'https://open-vsx.org/api/Anthropic/claude-code/win32-x64';
const vsixUrl = (v) => `${API}/${v}/file/Anthropic.claude-code-${v}@win32-x64.vsix`;
const NOT_FOR_A_PANEL = ['resources/native-binary', 'resources/audio-capture'];

export async function latestVersion() {
  const r = await fetch(API);
  if (!r.ok) throw new Error(`OpenVSX said ${r.status} for ${API}`);
  return (await r.json()).version;
}

/* The slim, unpatched extension of a version, from the cache or OpenVSX.
   Fetched into a sibling folder and renamed into place, so a run cut short
   never leaves a half copy that looks complete. */
async function slimExtension(version, log) {
  const cache = process.env.CC_PERF_CACHE || join(tmpdir(), 'cc-perf', 'cache');
  const slim = join(cache, `claude-code-${version}`);
  if (existsSync(join(slim, 'extension.js'))) return slim;
  const part = `${slim}.part`;
  rmSync(part, { recursive: true, force: true });
  mkdirSync(part, { recursive: true });
  const t = Date.now();
  const bytes = await fetchExtension(vsixUrl(version), part, NOT_FOR_A_PANEL);
  log(`fetched ${version} from OpenVSX: ${(bytes / 1e6).toFixed(1)} MB in ${Date.now() - t} ms`);
  renameSync(part, slim);
  return slim;
}

/* skip: patch names to leave out (apply.ps1 -Skip), to see what one costs. */
export async function prepareExtension({ repo, version, skip = [], log = () => {} }) {
  const v = version || (await latestVersion());
  const extensions = mkdtempSync(join(tmpdir(), 'cc-perf-ext-'));
  const ext = join(extensions, `anthropic.claude-code-${v}-win32-x64`);
  cpSync(await slimExtension(v, log), ext, { recursive: true });
  log(`patching ${v} with apply.ps1`);
  const shell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
  const out = execFileSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(repo, 'apply.ps1'),
    '-ExtensionsDir', extensions, ...(skip.length ? ['-Skip', skip.join(',')] : [])], { encoding: 'utf8' });
  const missed = out.split(/\r?\n/).filter((l) => /\[(miss|fail)\]/.test(l)).map((l) => l.trim());
  for (const f of ['extension.js', 'webview/index.js', 'webview/index.css']) {
    if (!existsSync(join(ext, `${f}.pristine`))) throw new Error(`apply.ps1 left no ${f}.pristine:\n${out.slice(-2000)}`);
  }
  return { ext, version: v, missed };
}
