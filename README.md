<div align="center">

# 🩹 Claude Code — VS Code / Cursor Extension Patches

**One command applies a folder of small, self-contained patches that fix real bugs in the Claude Code extension — every fix proven from runtime logs, not guesswork.**

![Platform](https://img.shields.io/badge/platform-Windows-0078D6?logo=windows&logoColor=white)
![PowerShell](https://img.shields.io/badge/PowerShell-5391FE?logo=powershell&logoColor=white)
![Editor](https://img.shields.io/badge/Cursor%20%2F%20VS%20Code-000000?logo=visualstudiocode&logoColor=white)
![Fixes](https://img.shields.io/badge/bug%20fixes-6%20proven%20from%20logs-2ea44f)
![Fail-safe](https://img.shields.io/badge/patching-fail--safe%20%26%20idempotent-blue)
![License](https://img.shields.io/badge/license-MIT-green)

<sub>Patches the bundled, minified <code>extension.js</code> / <code>webview/index.js</code> in place · re-run after each extension update · nothing here is a workaround — each patch is a root-cause fix.</sub>

</div>

---

Most of these are genuine defects in how the extension handles **git worktrees** and **webview restoration** — the kind that make your Claude tabs come back **blank** or as a **new chat** after a reload, or make a worktree session open **empty**. Each was tracked down by instrumenting the extension on both sides of the webview boundary, reproducing the failure, and reading the evidence.

## ⚡ Quick start

One line in **PowerShell** — no clone, no git required:

```powershell
irm https://raw.githubusercontent.com/Adi1231234/vscode-cursor-claude-code-extension-patches/master/install.ps1 | iex
```

Then reload: `Ctrl+Shift+P` → `Developer: Reload Window`. That's it.

It downloads this repo to a temp folder, runs `apply.ps1`, and cleans up. **Idempotent** — already-applied patches skip, so re-run it after every extension update. *(Cloned the repo instead? Just run `./apply.ps1`.)*

**Both editors at once.** It patches the newest `anthropic.claude-code-*` in **every** editor that has it installed — `%USERPROFILE%\.cursor\extensions`, `.vscode`, `.vscode-insiders`, `.vscode-oss` — so a machine with Cursor *and* VS Code gets both in one run; an editor without the extension is just reported and skipped. Custom `--extensions-dir`? `./apply.ps1 -ExtensionsDir '<path>'`.

## 🗂️ Layout

Each feature / bug fix is a **self-contained folder** under `patches/`; the shared plumbing lives in `lib/` — so every patch does one thing and is easy to read or reuse.

- **`apply.ps1`** — finds every install, then dot-sources and runs each patch in order against each one.
- **`lib/`** — reusable helpers: `Io` (UTF-8 read/write), `Ui` (output), `Editors` (where each editor keeps its extensions), `Extension` (locate + detect minified names into a shared `$Ctx`), `Patch` (css/script injectors + the shared worktree resolver).
- **`patches/<name>/`** — one folder per patch: a `patch.ps1` exposing a single `Invoke-Patch $Ctx` (fail-safe, idempotent), its own `README.md`, and any resource files (`*.css`, `queue/*.js`, `cleanup.js`).

- **`lib/Pristine.ps1`** — keeps an unpatched copy of each bundle file as
  `extension.js.pristine` (and the two webview files) and restores it before every
  run, so a second run applies the *current* patches instead of skipping the ones
  it recognises. Without it an install patched last week never received this
  week's version of a patch: every line said `[skip]`, the run exited 0, and the
  bundle did not change. If a bundle is already patched and no `.pristine` sits
  beside it, nothing here can undo that - reinstall the extension in the editor
  (or delete its folder and let the editor download it again) and run once more.

- **`tools/which-build.mjs`** — which windows are running the bundle that is on
  disk and which need a reload. `Developer: Reload Window` restarts **one**
  window's extension host; every other window keeps the code it loaded when it
  started, and nothing says so. Every patched bundle now carries a stamp
  (`ccAfStamp:"<utc> <sha>"`), the panel compares the one it is running with the
  one in the file and puts *a newer build is installed, reload this window* on the
  button, and this tool answers the same question from outside - including for a
  window patched before the stamp existed, which cannot answer for itself.

*Add a patch* = drop `patches/<name>/patch.ps1` defining `Invoke-Patch`, add its name to the list in `apply.ps1`. Nothing else.

## ✨ Features

🌐 RTL text · ⌨️ Input RTL · 🔍 Zoom (Ctrl+Scroll) · 📥 Codex-style Prompt Queue · 📋 [Copy icon on every message](patches/copy-message) · 🔓 Bypass permission mode · ⚙️ [Background tasks + live logs](patches/background-tasks) · 🗣️ [Subagent text on the stream](patches/subagent-stream-flags) · 🔄 [Restart one panel](patches/panel-restart-button) · 🔁 [Auto follow-up](patches/auto-followup).

🔁 **Auto follow-up** — a second model reads what Claude just wrote and types
your next message. You write one file that says how to answer for you
(`~/.claude/responders/*.md`), arm it with one click in the composer footer, and
it keeps going until its stop condition is met or you press stop. See
[patches/auto-followup](patches/auto-followup).

🔄 **Restart Claude** — an icon in the panel header, next to Session history. It
reloads **that one panel** and the CLI process behind it, then comes back on the
same conversation: what `Developer: Reload Window` does to every panel and the
whole workbench at once, aimed at the single one that is wedged. *Verified in a
live editor:* the clicked panel got a new document and a new channel, its
neighbours kept theirs, and the transcript came back intact.

⚙️ **Background tasks** — an animated indicator in the composer footer whenever a
subagent, a backgrounded command or a workflow is running. Click it for a two-pane
dialog: running tasks on top, a separator, finished ones below, and the selected
task's log streaming live beside them (a subagent's tool calls and prose straight
off the SDK stream, everything else tailed from disk by the extension host).

## 🐞 Bug fixes

Each links to its folder's README for the full root cause + proof.

- 🧵 [**ELECTRON_RUN_AS_NODE leak**](patches/electron-run-as-node) — the flag leaks into every subprocess the CLI spawns; stripped at each site.
- 📜 [**Worktree sessions in history**](patches/worktree-history) — `includeWorktrees` was hardcoded off.
- 🏷️ [**Worktree title dir**](patches/worktree-title-dir) — the title was written to the main repo dir, creating a phantom that shadows the real transcript → session opens **empty**.
- 🍴 [**Worktree fork / diff**](patches/worktree-fork-diff) — "Session not found" because the loader only reads the main dir.
- 🔤 [**cwd drive-letter case**](patches/cwd-drive-case) — from **CLI 2.1.222** on, IDE-started worktree sessions die on resume with `process exited with code 1`. `URI.fsPath` hands the CLI `c:\…`, git reports `C:/…`, and the new isolation-worktree guard compares them **case-sensitively**. *Proof:* same repo, same session, only the drive letter changed → exit 0 vs exit 1; and 2.1.221 resumes where 2.1.222 refuses.
- 🔄 [**Reload restore**](patches/reload-restore) — blank / new-chat tabs after reload: (1) the sessionID was dropped on deserialize; (2) VS Code sometimes never loads a restored iframe → recovery re-loads it; (3) a `git worktree list` **5s timeout** drops worktree sessions from the list → bumped to 20s + retry `activate` instead of new-chatting. *Proof:* `HOST Xpe empty dur=5270` at the moment of `activate → FAILED-newChat`.

- ↔️ [**Bidi marks printed as text**](patches/bidi-mark-strip) — the webview's Trojan-Source mitigation rewrites every bidi control character into printable escape text, so an invisible RLM inside an answer is *shown* mid-sentence. The three implicit marks (ALM / LRM / RLM) are now dropped instead; the characters that can actually reorder a run are still escaped.

- 📱 [**Remote Control chip**](patches/remote-control-chip) — while Remote Control is on, a full-width banner sits above the input for the whole session and wraps to two, three, four lines in a sidebar. It carries one bit of state and one action, so it becomes a **small icon in the input footer row** instead: drawn to the bundle's own footer-icon metrics and wearing its `footerButton` class, green while connected, a hover tooltip that says what it is, and a click that opens a confirm dialog (session link, Close / Disconnect) rather than dropping the connection silently. *Measured in a live panel:* footer height identical before and after, so the composer does not move.

## 🔬 How the intermittent bugs were caught

Injected logging at the decisive points on **both** sides of the webview boundary — host (`fs.appendFileSync`) and webview (capture the `vscode` API at the top, `postMessage` to the host) — then reloaded until the failure fired and read the evidence. All instrumentation is stripped from the shipped patch.

## 🛡️ Safe by design

- **Fail-safe** — a missing anchor **skips** instead of corrupting anything.
- **Version-tolerant** — regexes capture the minified variable names.
- **Idempotent** — re-running never double-applies.
- **No secrets, no hardcoded user paths** — everything derives from `%USERPROFILE%` / `os.homedir()`.

## 📄 License

MIT — personal tooling, shared in case it helps others hitting the same worktree / reload issues. No warranty. Targets extension `2.1.x`.
