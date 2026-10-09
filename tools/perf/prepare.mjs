/* An extension to measure: the published VSIX from OpenVSX, unpacked into a
   folder of its own and patched there by apply.ps1 -ExtensionsDir. apply.ps1
   keeps the untouched bundles beside the patched ones (*.pristine,
   lib/Pristine.ps1), so that one folder serves both variants. Nothing outside
   the folder is touched; the VSIX is cached (CC_PERF_CACHE, default
   <tmp>/cc-perf/cache), so a CI cache keeps it across runs. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API = 'https://open-vsx.org/api/Anthropic/claude-code/win32-x64';
const vsixUrl = (v) => `${API}/${v}/file/Anthropic.claude-code-${v}@win32-x64.vsix`;

export async function latestVersion() {
  const r = await fetch(API);
  if (!r.ok) throw new Error(`OpenVSX said ${r.status} for ${API}`);
  return (await r.json()).version;
}

async function vsixFile(version, log) {
  const dir = process.env.CC_PERF_CACHE || join(tmpdir(), 'cc-perf', 'cache');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `claude-code-${version}.vsix`);
  if (existsSync(file)) return file;
  log(`downloading ${version} from OpenVSX`);
  const r = await fetch(vsixUrl(version));
  if (!r.ok) throw new Error(`OpenVSX said ${r.status} for ${version}`);
  writeFileSync(`${file}.part`, Buffer.from(await r.arrayBuffer()));
  renameSync(`${file}.part`, file);
  return file;
}

/* A VSIX is a zip with the extension under extension/. Windows' own tar
   (bsdtar, in System32) reads zips - named by path, because a GNU tar that
   Git puts on PATH does not; elsewhere unzip does. */
function unpack(vsix, into) {
  const tmp = mkdtempSync(join(tmpdir(), 'cc-perf-vsix-'));
  const tar = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  if (process.platform === 'win32') execFileSync(tar, ['-xf', vsix, '-C', tmp]);
  else execFileSync('unzip', ['-q', vsix, '-d', tmp]);
  renameSync(join(tmp, 'extension'), into);
}

/* skip: patch names to leave out (apply.ps1 -Skip), to see what one costs. */
export async function prepareExtension({ repo, version, skip = [], log = () => {} }) {
  const v = version || (await latestVersion());
  const vsix = await vsixFile(v, log);
  const extensions = mkdtempSync(join(tmpdir(), 'cc-perf-ext-'));
  const ext = join(extensions, `anthropic.claude-code-${v}-win32-x64`);
  unpack(vsix, ext);
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
