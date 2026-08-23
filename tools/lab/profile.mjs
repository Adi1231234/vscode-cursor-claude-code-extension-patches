/* The two profiles the lab needs, and why each line of them is there.

   `<lab>/ud` is the editor profile. A fresh one does not trust the folder it
   opens, and the extension declares `untrustedWorkspaces.supported: false` - so
   it is never loaded: nothing in `exthost.log`, no `Claude Code:` entries in the
   palette, no panel, and no message anywhere saying why. That one setting is
   the difference between "the lab works" and an hour of looking for a patch bug
   that does not exist.

   `<lab>/home` is the redirected home (see editor.mjs). It carries the CDP port
   in `argv.json`, the credentials so the panel is signed in, and a settings
   file that turns Remote Control's auto-start off - a lab must never publish a
   throwaway session to claude.ai just by starting.

   Every file here is written from Node, i.e. UTF-8 with no BOM, and it has to
   stay that way: PowerShell 5.1's `Out-File -Encoding utf8` prepends a BOM,
   VS Code's `JSON.parse` of `argv.json` then throws, and the only symptom is a
   CDP port that never opens (the reason is buried in the lab's own `main.log`). */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const EDITOR_SETTINGS = {
    'security.workspace.trust.enabled': false,
    /* The editor's own first-run onboarding puts a modal "Welcome to VS Code /
       Sign in to use GitHub Copilot" over a fresh profile and parks focus on
       its Sign In button, from where Ctrl+Shift+P does nothing at all - so the
       lab's panel and reload steps would hang on a dialog nobody asked for.
       This is the setting `tryShowOnboarding` actually reads before showing it
       (the similarly named `onboarding.enabled` gates a different engine and
       leaves this dialog up); palette.mjs blurring first is only a backstop. */
    'workbench.welcomePage.experimentalOnboarding': false,
    'window.restoreWindows': 'none',
    'update.mode': 'none',
    'extensions.autoUpdate': false,
    'workbench.startupEditor': 'none',
};

const CLI_SETTINGS = { remoteControlAtStartup: false };

export async function write(lay, port) {
    await mkdir(join(lay.ud, 'User'), { recursive: true });
    await mkdir(join(lay.home, '.vscode'), { recursive: true });
    await mkdir(join(lay.home, '.claude'), { recursive: true });
    await mkdir(lay.proj, { recursive: true });

    await writeFile(join(lay.ud, 'User', 'settings.json'), JSON.stringify(EDITOR_SETTINGS, null, 2));
    await writeFile(join(lay.home, '.vscode', 'argv.json'), JSON.stringify({ 'remote-debugging-port': String(port) }, null, 2));
    await writeFile(join(lay.home, '.claude', 'settings.json'), JSON.stringify(CLI_SETTINGS, null, 2));
    await writeFile(join(lay.proj, 'readme.txt'), 'Scratch folder for the patch lab.\n');
    await copyAuth(lay);
}

/* Signed in, without dragging the real profile along: the credentials plus the
   account/onboarding half of `.claude.json`. `projects` and `mcpServers` are
   dropped - the first is the bulk of that file and every conversation you have
   ever had, the second would have the lab spawn your MCP servers on startup. */
async function copyAuth(lay) {
    const creds = join(homedir(), '.claude', '.credentials.json');
    if (existsSync(creds)) await writeFile(join(lay.home, '.claude', '.credentials.json'), await readFile(creds));

    const config = join(homedir(), '.claude.json');
    if (!existsSync(config)) return;
    const parsed = JSON.parse(await readFile(config, 'utf8'));
    delete parsed.projects;
    delete parsed.mcpServers;
    await writeFile(join(lay.home, '.claude.json'), JSON.stringify(parsed, null, 2));
}
