# tools/lab - a patched editor, running, in one command

Checking a patch for real means: a pristine bundle, patched, in an editor that
is not yours, with a panel open and a debugger attached. Every step of that has
a trap in it, and each one fails **silently** - which is why this exists.

```
node tools/lab/lab.mjs up               # pristine -> patched -> editor -> panel open
node tools/lab/lab.mjs eval <script.js> # run a script inside that panel
node tools/lab/lab.mjs repatch          # pristine again -> apply.ps1 -> real reload
node tools/lab/lab.mjs down [--purge]   # stop it (--purge also deletes the profile)
```

`up` prints the port, the window and the panel target id. The edit-and-look loop
is `repatch` + `eval`; the editor stays up between them.

Run it from the repo root as written, or from anywhere with the full path to
`lab.mjs` - it finds the repo from its own location. The script you hand `eval`
is resolved against *your* working directory, so a relative path is fine.

Flags: `--version 2.1.241` (default: the newest version installed on this
machine), `--port N` (default 9555), `--code <path to Code.exe>` (default: the
usual install locations). `--help` prints all of it. Needs Windows, VS Code and
Node 22+.

Everything lives in `%TEMP%\cc-lab\<version>-p<port>\` - a lab is identified by
both, so `--port 9556` is a second, independent lab. Your own editor, profile,
extensions and `argv.json` are never touched. The VSIX cache is kept outside the
per-version folder, so `--purge` costs you a re-patch, not a 110MB download.

## What each step is guarding against

All of these were found the hard way; each one looks like "the patch broke the
extension" rather than like what it is.

- **Never patch your own install to test.** A patch writes a guard and reports
  `[skip]` on the second run, so re-running `apply.ps1` over an install that is
  already patched proves nothing. `up` installs the VSIX from OpenVSX, and
  every run restores those pristine bundles before applying, so what you are
  looking at is always the patch source as it is right now.
- **Install the VSIX, do not unzip it.** VS Code reads `extensions.json` in the
  extensions dir; a folder placed beside it by hand is not an installed
  extension.
- **Workspace trust.** The extension declares
  `untrustedWorkspaces.supported: false`, and a fresh profile trusts nothing, so
  it is never loaded: no line in `exthost.log`, no `Claude Code:` entries in the
  palette, no panel, no reason given. `<lab>/ud/User/settings.json` turns trust
  off.
- **The CDP port comes from `argv.json`, in the home directory.**
  `--remote-debugging-port` on the command line is ignored, and the file the
  editor reads is the same one your real install uses. The lab gets a home of
  its own instead (`USERPROFILE` / `HOME`), with its own `argv.json`. All of it
  is written from Node, i.e. UTF-8 with no BOM: PowerShell's `Out-File -Encoding
  utf8` adds one, VS Code's `JSON.parse` then throws, and the port silently
  never opens.
- **A port that answers is not proof the lab is up.** Another worktree's lab may
  hold it, and then everything you measure is someone else's window. Every
  command checks the listening process is this lab before touching it.
- **Occlusion.** Windows marks a covered window `visibilityState: "hidden"`, and
  a hidden page is not delivered input - `Input.dispatchKeyEvent` goes nowhere,
  so the palette never opens and nothing keyboard-driven works, which is
  everything (see `tools/cdp/README.md`). The lab launches with
  `--disable-features=CalculateNativeWinOcclusion`.
- **The editor's own first-run dialog.** A fresh profile puts a modal *"Welcome
  to VS Code / Sign in to use GitHub Copilot"* over everything and parks focus
  on its Sign In button, from where `Ctrl+Shift+P` does nothing. The gate is
  `workbench.welcomePage.experimentalOnboarding`, which is what
  `tryShowOnboarding` actually reads; the similarly named `onboarding.enabled`
  is a different engine and leaves the dialog up. With it off, focus lands in
  the panel by itself.
- **Signed in, without your profile.** A redirected home means no credentials,
  and the panel cannot start a session. The lab copies
  `.claude/.credentials.json` and the account half of `.claude.json` -
  `projects` (every conversation you have ever had) and `mcpServers` (which
  would spawn your servers) are dropped.
- **Remote Control stays off.** `<lab>/home/.claude/settings.json` sets
  `remoteControlAtStartup: false`, so starting a lab never publishes a throwaway
  session to claude.ai.
- **`apply.ps1` always exits 0.** The lab reads its output instead: it stops if
  nothing was patched, and prints every `[miss]`, because a missed anchor is the
  usual reason a patch "does nothing" in a newer bundle.

## Writing the script for `eval`

One expression, evaluated inside the panel, exactly as `tools/cdp/cdp.mjs eval`
does - `document` is the panel's document. Wrap anything longer in
`(async () => { ... })()`; the return value is printed as JSON.

```js
(() => {
  const chip = document.querySelector('.cc-rc-chip');
  return chip && { cls: chip.className, state: chip.getAttribute('data-rc-state') };
})()
```

## When something still goes wrong

The lab's own logs are under `<lab>/ud/logs/`. The extension host log is the one
that says whether the extension loaded at all; `main.log` is where a broken
`argv.json` is reported.
