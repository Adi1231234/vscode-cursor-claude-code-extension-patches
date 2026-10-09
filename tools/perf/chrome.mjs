/* A headless Chrome of its own: a throwaway profile, a debugging port Chrome
   picks (read back from DevToolsActivePort), and none of the throttling a
   background page gets - the measured page must run every frame it would run
   on screen. CHROME_PATH overrides where it is looked for. */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from '../cdp/client.mjs';

const CANDIDATES = [
  process.env.CHROME_PATH,
  join(process.env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe'),
  join(process.env['ProgramFiles(x86)'] || '', 'Google/Chrome/Application/chrome.exe'),
  join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export function findChrome() {
  const hit = CANDIDATES.find((p) => existsSync(p));
  if (!hit) throw new Error(`no Chrome found - set CHROME_PATH (looked in: ${CANDIDATES.join(', ')})`);
  return hit;
}

export async function launchChrome({ width = 520, height = 1000 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'cc-perf-chrome-'));
  const proc = spawn(findChrome(), [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: 'ignore' });
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await new Promise((r) => setTimeout(r, 100));
  if (!existsSync(portFile)) { proc.kill(); throw new Error('Chrome did not open a debugging port'); }
  const port = Number(readFileSync(portFile, 'utf8').split('\n')[0]);
  return {
    port,
    /* Closed through CDP, not by killing the process we started: that one can
       be a launcher that has already handed off to the real browser (a 60 KB
       chrome.exe that starts another build was measured doing exactly that),
       and killing it leaves a headless Chrome running for good. */
    close: async () => {
      try {
        const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(3000) })).json();
        const browser = await connect(ver.webSocketDebuggerUrl);
        await browser.send('Browser.close');
      } catch { /* already gone */ }
      proc.kill();
      for (let i = 0; i < 30; i++) {
        try { rmSync(profile, { recursive: true, force: true }); return; } catch { await new Promise((r) => setTimeout(r, 200)); }
      }
    },
  };
}
