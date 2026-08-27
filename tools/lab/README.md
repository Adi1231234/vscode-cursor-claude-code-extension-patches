# tools/lab - a patched editor, running, in one command

Checking a patch for real means: a pristine bundle, patched, in an editor that
is not yours, with a panel open and a debugger attached. Every step of that has
a trap in it, and each one fails **silently** - which is why this exists.

```
node tools/lab/lab.mjs up               # pristine -> patched -> editor -> panel open
node tools/lab/lab.mjs eval <script.js> # run a script inside that panel
node tools/lab/lab.mjs width [px]       # set the panel's width (no argument: report it)
node tools/lab/lab.mjs repatch          # pristine again -> apply.ps1 -> real reload
node tools/lab/lab.mjs down [--purge]   # stop it (--purge also deletes the profile)

node tools/lab/selftest/run.mjs         # is the patcher + the lab still sound?
node tools/lab/selftest/run.mjs --no-editor   # ...when the editor cannot start
```

**When the editor will not start**, `--no-editor` runs everything that reads the
bundle rather than the panel: every module and patch parses, every guard landed,
the injected scripts survive their template literal, `apply.ps1` is idempotent,
a throwing patch is reported without stopping the others, and a missing anchor
writes nothing. Only the width section needs a panel. The reason this exists:
a VS Code installer holding the `vscode-updating` mutex blocks every launch for as
long as any window is open - hours on a working machine - and without the flag
that takes the other thirty checks down with it, including the ones that would
have caught a real defect.

**If you have just arrived:** `node tools/lab/selftest/run.mjs --fresh` builds a
lab from nothing and checks the whole chain - every module and patch parses, every
patch guard landed, the injected scripts survive the template literal they live in,
the panel width can be set exactly, `apply.ps1` is idempotent and refuses a
half-applied run, a missing anchor leaves the bundle untouched, and the working
tree is clean afterwards. It takes a couple of minutes, costs nothing, and leaves
the lab up for you to work in. Everything below is the detail behind those checks.

`up` prints the port, the window, the panel target id and the panel's width. The
edit-and-look loop is `repatch` + `eval`; the editor stays up between them.

Run it from the repo root as written, or from anywhere with the full path to
`lab.mjs` - it finds the repo from its own location. The script you hand `eval`
is resolved against *your* working directory, so a relative path is fine.

Flags: `--version 2.1.241` (default: the newest version installed on this
machine), `--port N` (default 9555), `--width N` (panel width for `up` /
`repatch`), `--code <path to Code.exe>` (default: the usual install locations).
`--help` prints all of it. Needs Windows, VS Code and Node 22+.

## Width is a test parameter

`up` opens the panel as an editor tab, which is **wide** - and anything the
panel places against its own edges (popovers, wrapping, ellipsising, RTL) only
misbehaves once the panel is narrow. A lab that only ever runs wide is a lab
that reproduces none of those.

So every command reports `panelWidth`, and `up --width 300` (or `width 300` on
a running lab) puts you in the regime where they show up. The worked example is
`patches/history-dialog-clip`: at 790px its dialog is exactly where it should
be, and at 300px the unpatched bundle puts it 157px outside the panel.

The width is set by sizing the workbench viewport over CDP, not by dragging the
sash beside the panel. Dragging is the obvious way and it is a trap: which sash
governs the panel depends on the layout; pulling the side bar's sash far enough
*collapses the side bar*, which hands its space to the editor area and makes the
panel wider instead of narrower (measured: asked 400, got 1409); and once the side
bar is gone there is no sash beside the panel at all, so the tool has locked itself
out of its own parameter. That is where an afternoon of testing actually left it.

The panel is the editor area, so its width is the viewport minus whatever chrome
sits beside it - measure that and the viewport for any panel width is arithmetic.
One `Emulation.setDeviceMetricsOverride`, no mouse events, nothing to collapse, and
it comes back down as easily as it goes up. The chrome changes as the side bar hits
its own minimum, so the arithmetic repeats until it stops making progress rather
than a fixed number of times, and it waits 900ms between passes - a measured
number, not a guess: at 400ms the big narrowings stalled short (1200 -> 150 landed
on 214 and only reached 150 on a second run), at 900ms every transition lands first
time. Measured exact across 150 / 200 / 300 / 420 / 620 / 780 / 1200 / 4000 in both
directions, with the panel's own `clientWidth` agreeing every time; a machine slow
enough to stall anyway gets told where the workbench settled rather than a silent
wrong width. The override lives on the window's page target,
so it survives a real `Developer: Reload Window`: 300px before `repatch`, 300px
after.

A window can hold **more than one** Claude panel (one in a tab, one in the side
bar), and the editor keeps a backgrounded one alive at `visibility: hidden`. A
hidden webview is not laid out, so it answers CDP with the size and the DOM it
had when it was last on screen - which is how `eval` can quietly run against a
panel nobody is looking at. `claudePanels` now returns the visible one first
(`cdp.mjs list` marks the others `hidden`), and the width is set on the same
panel it is read from.

Everything lives in `%TEMP%\cc-lab\<version>-p<port>\` - a lab is identified by
both, so `--port 9556` is a second, independent lab. Your own editor, profile,
extensions and `argv.json` are never touched. The VSIX cache is kept outside the
per-version folder, so `--purge` costs you a re-patch, not a 110MB download.

## Testing a patch that needs a live session

Several patches only come alive once a conversation exists - `background-tasks`
learns its session id from the SDK stream, so an untouched lab shows no indicator
because there is correctly nothing to show. The lab carries its own credentials
for exactly this; keep it to what the test needs and take the lab down after.

```
node tools/lab/lab.mjs prompt "Start a background bash task printing one line per second for 60 seconds."
node tools/lab/lab.mjs press 1      # the confirm a tool call raises is a numbered list
node tools/lab/lab.mjs eval look.js # then read the panel
```

`drive.mjs` carries the two traps behind those, both of which look like nothing
happening at all: the webview target's **default execution context is the outer
shell document**, so a `Runtime.evaluate` without the panel frame's context id
finds no composer and no dialog and it is not that they are missing; and **Enter's
`text` is a carriage return, not the string "Enter"** - with the key name in there
the app takes the event and does not submit, and the prompt sits in the composer
looking like the send failed.

What is worth checking by hand once a task is running, none of which the self-test
can reach: the indicator appears in the composer footer next to the queue button
and animates; the dialog lists running above finished with an icon each; the log
pane grows while the task runs (compare it against the `.output` file on disk -
that is how the Windows `fs.watch` gap was found); a finished task moves into the
history group and the indicator goes quiet; Stop actually stops the process; and
a history row disappears when its log file is deleted.

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
- **The lab must not hold your screen, and nothing in band will do that.** It is
  left running for an afternoon while you work in your own editor. All four
  obvious answers are dead ends: VS Code has no minimized window state (its own
  enum carries `Minimized // not used anymore`, and `newWindowDimensions` offers
  only default/inherit/offset/maximized/fullscreen); Chromium has
  `--start-maximized` but no `start-minimized` anywhere in its source;
  `Start-Process -WindowStyle Minimized` sets `STARTUPINFO.wShowWindow`, which
  Windows uses only "if the nCmdShow parameter of ShowWindow is set to
  SW_SHOWDEFAULT" - Chrome opts in
  (`BrowserDesktopWindowTreeHostWin::GetInitialShowState` reads STARTUPINFO),
  Electron never defines that method and inherits `SW_SHOWNORMAL`, and measured,
  the window came up not minimized; and CDP cannot move it because Electron does
  not implement the Browser domain.
- **Minimizing it afterwards is worse than it looks.** The window is briefly on
  the screen before the call lands, and - the real problem - a minimized window
  runs no layout at all. Measured with the same `Emulation.setDeviceMetricsOverride`
  in both states: minimized, the workbench viewport went to 900 and then 1500
  while the panel's iframe stayed at 659 both times; restored, the same calls gave
  406 and then 1006 with the panel agreeing exactly. A lab whose whole point is
  width-dependent bugs cannot be a lab that never lays out.
- **So the window is never on your desktop.** Windows lets a process start on a
  desktop object of its own, and only the input desktop is on screen: a window on
  any other one cannot be shown, focused, clicked, or alt-tabbed to. `desktop.ps1`
  creates one and passes it as `STARTUPINFO.lpDesktop`, which has to happen at
  `CreateProcess` time - which is why it is not `Start-Process`. Measured: zero
  windows visible from the normal desktop, CDP fully working,
  `visibilityState: "visible"`, and `width 300` / `width 900` landing exactly.
  Two traps in that one call, both of which kill the editor with no log line at
  all: `CreateProcess` writes into `lpCommandLine`, so it needs a `StringBuilder`
  and not a marshaled string (otherwise ERROR_PATH_NOT_FOUND, which reads as a bad
  exe path), and the desktop object dies with its last handle, so the launcher has
  to stay alive until the editor has attached to it - `WaitForInputIdle`, not a
  sleep. Nothing has to clean the desktop up afterwards, and nothing does: a
  desktop object lives only while a handle is open or a thread is attached, and
  the launcher's handle is gone the moment it exits - so the editor is the last
  thing holding it, and it goes when the editor does. Measured by enumerating the
  window station's desktops: `Default` before, `cc-lab-...` and `Default` while
  the lab runs, `Default` again after `down` *and* after killing the processes
  outright. `lab.mjs down` is the only way to close that editor, since it has no
  taskbar entry, and it does stop it.
- **`Page.bringToFront` is focus, not the window.** It is what lets the palette
  chord fire, and on Electron it does nothing else - measured, it leaves a
  minimized window minimized and does not change the foreground window. Removing
  it on the theory that it raises the window breaks every keyboard-driven step
  with "the window does not have focus".
- **A port that answers is not a window to type into.** The CDP port opens when
  Chromium starts, which is before the workbench registers a page target, so
  `ensurePanel` waits for the window rather than looking once. This was hidden for
  a while by whatever slow call happened to sit in between.
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
- **A patch that throws must not pass for a patched install.** `apply.ps1` runs
  each patch in its own `try`, so one that throws no longer takes the rest of the
  run with it: it is reported as `[fail]`, the remaining patches still run, and
  the run ends with the list of failures and exit 1 instead of `Done`. The lab
  refuses on any of `[fail]`, a non-zero exit, no `[ok]` at all, or a missing
  `Done` line - a half-applied bundle looks exactly like a working one until the
  feature you are testing is the missing half. Every `[miss]` is printed too,
  because a missed anchor is the usual reason a patch "does nothing" in a newer
  bundle.
- **"Palette did not open" is not a diagnosis.** A modal in the way, a window
  delivered no input, and focus parked somewhere that swallows the chord need
  three different answers. The refusal now carries the window state that produced
  it - `visibility`, `focused`, `activeElement`, `modal` - so the next reader is
  not left guessing at keybindings.

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
