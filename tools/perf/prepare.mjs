/* An extension to measure: the published VSIX from OpenVSX, unpacked into a
   folder of its own and patched there by apply.ps1 -ExtensionsDir. apply.ps1
   keeps the untouched bundles beside the patched ones (*.pristine,
   lib/Pristine.ps1), so that one folder serves both variants. Nothing outside
   the folder is touched.

   Only what a panel needs is fetched: the VSIX also carries the CLI itself
   (resources/native-binary, 256 MB unpacked of its 120 MB), which no panel
   loads - vsix.mjs reads ~4 MB of it instead of downloading it all. The slim
   copy is cached per version (CC_PERF_CACHE, default <tmp>/cc-perf/cache). */
import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchExtension } from './vsix.mjs';
import { runApply } from '../apply-run.mjs';

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
  /* The way install.ps1 runs it (tools/apply-run.mjs), and nothing less than a
     clean run passes: this is the check every pull request into master has to
     pass, so a patch that throws or no longer finds its anchor in the current
     extension stops the merge instead of reaching users. */
  const run = await runApply({ repo, extensionsDir: extensions, skip });
  const missed = [...run.failures.map((l) => `[fail] ${l}`), ...run.misses.map((l) => `[miss] ${l}`)];
  if (run.code || missed.length || !run.finished) {
    throw new Error(`apply.ps1 did not patch ${v} cleanly (exit ${run.code}):\n${missed.join('\n')}\n${run.out.slice(-2000)}`);
  }
  const out = run.out;
  for (const f of ['extension.js', 'webview/index.js', 'webview/index.css']) {
    if (!existsSync(join(ext, `${f}.pristine`))) throw new Error(`apply.ps1 left no ${f}.pristine:\n${out.slice(-2000)}`);
  }
  return { ext, version: v, missed };
}
