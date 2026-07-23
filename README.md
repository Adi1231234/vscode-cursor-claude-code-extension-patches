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

Most of these are genuine defects in how the extension handles **git worktrees** and **webview restoration** — the kind that make your Claude tabs come back **blank** or as a **new chat** after a window reload, or make a worktree session open **empty**. Each was tracked down by instrumenting the extension on both sides of the webview boundary, reproducing the failure, and reading the evidence. The root cause of every fix is written up below.

## ⚡ Quick start

```powershell
# Windows PowerShell
./apply.ps1
```

Then reload the window: **`Ctrl+Shift+P` → “Developer: Reload Window”**.

`apply.ps1` auto-detects the newest `anthropic.claude-code-*` under `%USERPROFILE%\.cursor\extensions`, writes UTF-8 (no BOM), and is **idempotent** — already-applied patches are skipped, so it's safe to run every time the extension updates.

## 🗂️ Repository layout

Each feature / bug fix is a **self-contained folder** under `patches/`, and the shared plumbing lives in `lib/` — so every patch does exactly one thing and is easy to read, reuse, or drop.

- **`apply.ps1`** — orchestrator: finds the extension, then dot-sources and runs each patch in order.
- **`lib/`** — reusable helpers: `Io.ps1` (UTF-8 no-BOM read/write), `Ui.ps1` (console output), `Extension.ps1` (locate the extension + detect the minified nonce / class names into a shared `$Ctx`).
- **`patches/<name>/`** — one folder per patch. Each has:
  - `patch.ps1` — defines a single `Invoke-Patch $Ctx` function (single responsibility, fail-safe).
  - `README.md` — what it does, which file it touches, its guard marker.
  - resource files where relevant (`rtl.css`, `queue.js`, `queue.css`, `cleanup.js`, …).

Adding a patch = drop a new `patches/<name>/patch.ps1` that defines `Invoke-Patch`, and add its name to the ordered list in `apply.ps1`. Nothing else.

## ✨ Features

- 🌐 **RTL text** — right-to-left rendering for chat + AskUserQuestion dialogs (Hebrew / Arabic), with code blocks kept LTR.
- ⌨️ **Input RTL** — `dir=auto` on the composer so mixed-direction input renders correctly.
- 🔍 **Zoom** — `Ctrl`+Scroll / pinch to zoom the webview.
- 📥 **Prompt Queue** — Codex-style queue: hold messages while Claude is busy, edit / reorder / skip, sent one per turn.
- 🔓 **Bypass permission mode** — default the webview to `bypassPermissions`.

## 🐞 Bug fixes — with proven root causes

> The through-line: a worktree session's transcript lives under the **worktree's** `~/.claude/projects/<encoded-cwd>/` folder, but much of the extension's bookkeeping only looks at the **main repo's** folder. That mismatch is the source of most of these.

<details>
<summary><b>🧵 <code>ELECTRON_RUN_AS_NODE</code> leaks into every subprocess</b></summary>

<br>

Cursor sets `ELECTRON_RUN_AS_NODE=1` on its extension host; the extension re-spreads `process.env` unfiltered into every child env it builds, so the flag leaks into every subprocess the CLI spawns (Bash tool, PowerShell tool, terminal). **Fix:** strip it at each construction site.
</details>

<details>
<summary><b>📜 Worktree sessions missing from history</b></summary>

<br>

The history-list handler hardcoded `includeWorktrees` **off**. **Fix:** flip it on so `/resume` and the history panel list sessions from every worktree of the repo.
</details>

<details>
<summary><b>🏷️ Worktree session opens empty (title written to the wrong folder)</b></summary>

<br>

**Symptom:** a worktree session shows in history with a title but opens **blank**.

**Root cause:** `renameSession()` writes the title to `join(nu(this.projectRoot), <sid>.jsonl)` — the **main** repo's folder — but the transcript lives under the **worktree's** folder. `appendFile` then *creates* a title-only “phantom” `<sid>.jsonl` in the main folder. The open-content resolver (`bRt`) checks the main folder **first** and returns the first file with `size > 0`, so the 129-byte phantom **shadows** the real transcript → empty.

**Fix:** before writing, resolve `<sid>.jsonl` to whichever folder actually holds it (largest file = real transcript). A companion cleanup deletes phantoms already on disk — but only when a real, larger transcript for the same id exists elsewhere; a file with no content twin is never touched.
</details>

<details>
<summary><b>🍴 Fork / inline-diff fails with “Session not found”</b></summary>

<br>

`forkSession()` and the inline diff view call `ensureSessionLoaded(sid)`, which reads **only** the main folder — so a worktree session loads nothing and throws. Fork also re-reads the original a second time for its `file-history` (checkpoint) data via the same wrong path.

**Fix:** resolve the session file across worktree folders in both the message load and the file-history read.
</details>

<details open>
<summary><b>🔄 Blank / new-chat tabs after “Reload Window” — three defects in one symptom</b></summary>

<br>

This one took the most digging. “My Claude tabs are broken after reload” turned out to be **three independent bugs**, each caught with an on-disk log the patch temporarily writes from *both* the extension host and the webview.

**3a — the session id was thrown away.**
`deserializeWebviewPanel(panel, state)` restored the tab but called `setupPanel(panel, void 0, …)` — it read `state.isFullEditor` yet **ignored `state.sessionID`** that VS Code hands right back.
🔎 *Proof:* `HOST setupPanel session=undefined` while `savedState={… "sessionID":"a3925312-…"}`.
✅ *Fix:* pass `state.sessionID` through.

**3b — VS Code sometimes never loads a restored iframe.**
Even with the session passed, Cursor/VS Code occasionally **never runs the webview's script** — the panel reports `visible=true active=true`, its HTML is set, but nothing executes and focusing it doesn't help.
🔎 *Proof:* the very first line of `index.js` posts an `IFRAME-SCRIPT-START` message; for a blank tab it **never arrives**, while its sibling's does. A platform-level webview race, not the extension.
✅ *Fix (recovery):* if a panel's webview sends no message within a few seconds (or on focus while still blank), force a reload by re-assigning `webview.html` (a fresh nonce forces the iframe to reload). Retries a few times.

**3c — `git worktree list` timeout drops sessions → new chat.**
On restore the webview asks for the session list; `activateSessionFromServer(sid)` returns `false` and the stock code then opens a **new chat**. It returns false because the session was **absent from `listSessions()`** — the host enumerates worktree sessions with `git worktree list --porcelain` on a **5-second timeout**, and on reload (10 worktrees + several webviews scanning at once + a busy machine) it occasionally exceeds 5s, hits the timeout, and `catch { return [] }` returns **empty** → “no worktrees” → every worktree session vanishes.
🔎 *Proof:* `HOST Xpe empty dur=5270` (git ran 5.27s and timed out) at the exact moment of `activate(<sid>) → FAILED-newChat`; the duration distribution is normally ~600 ms but spikes past 5 s under load.
✅ *Fix:* bump the timeout `5000 → 20000` so the slow-but-successful scan completes, **and** retry `activate` up to 10× (1 s apart) before ever falling back to a new chat — the session exists, so a retry finds it.
</details>

## 🔬 How the intermittent bugs were caught

Some of these reproduce only once in dozens of reloads. They were diagnosed by injecting logging at the decisive points on **both** sides of the webview boundary, then reloading until the failure fired and reading the evidence:

- **Host** (`extension.js`, Node) — `fs.appendFileSync` to a temp file: deserialize state, `setupPanel` session + caller stack, panel visibility / dispose events, the recovery mechanism firing, `git worktree list` timing / result / errors, and the raw `listSessions` result.
- **Webview** (`index.js`, sandboxed — no filesystem) — capture the `vscode` API once at the very top and `postMessage` diagnostics to the host, which writes them to the same file: iframe-start, the restore-decision inputs, and the branch actually taken.

All instrumentation is stripped from the shipped patch — only the fixes remain.

## 🛡️ Safe by design

- **Fail-safe** — every patch is guarded; if an anchor isn't found on a future version, that patch **skips** instead of corrupting anything.
- **Version-tolerant** — regexes capture the minified variable names, so patches survive minor version bumps.
- **Idempotent** — re-running never double-applies.
- **No secrets, no hardcoded user paths** — everything is derived from `%USERPROFILE%` / `os.homedir()`.

## 📄 License

MIT — personal tooling, shared in case it helps others hitting the same worktree / reload issues. No warranty. Targets extension `2.1.x`; anchors are written to survive minor updates but may need a refresh on a major one.
