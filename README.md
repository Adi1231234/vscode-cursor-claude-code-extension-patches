# Cursor Claude Code Patches

A single PowerShell script that patches the **Claude Code extension for Cursor** (`anthropic.claude-code-*`) to fix a set of real bugs and add quality-of-life features. Every patch was derived from **runtime evidence** (instrumented logs, stack traces, reproduction), not guesswork - the root cause of each fix is documented below.

> These patches edit the extension's bundled, minified `extension.js` / `webview/index.js` in place. Re-run the script **after each extension update** (Cursor replaces the files on update). Every patch is guarded and **fail-safe**: if an anchor is not found on a future version, that patch simply skips instead of corrupting anything, and the regexes capture minified variable names so they survive minor version bumps.

## Usage

```powershell
# run in PowerShell (Windows)
./patch-claude-code.ps1
# then: Cursor -> Ctrl+Shift+P -> "Developer: Reload Window"
```

The script auto-detects the newest installed `anthropic.claude-code-*` extension under `%USERPROFILE%\.cursor\extensions`. It reads/writes UTF-8 (no BOM) and is idempotent - already-applied patches are skipped.

## What it patches

Features (personal preference):
- **RTL text** - right-to-left rendering for chat + AskUserQuestion dialogs (Hebrew/Arabic).
- **Input RTL** - `dir=auto` on the composer so mixed-direction input renders correctly.
- **Zoom** - Ctrl+Scroll / pinch to zoom the webview.
- **Prompt Queue** - Codex-style queue: hold messages while Claude is busy, edit/reorder/skip, send one per turn.
- **Bypass permission mode** - default the webview to `bypassPermissions`.

Bug fixes (proven from logs - see below):
- **ELECTRON_RUN_AS_NODE leak** - stop `ELECTRON_RUN_AS_NODE=1` leaking into every subprocess the CLI spawns.
- **Worktree sessions in history** - flip `includeWorktrees` on so history lists sessions from all worktrees.
- **Worktree title dir** - session titles were written to the wrong project dir, hiding the real transcript.
- **Phantom title cleanup** - delete the empty title-only session files that bug already created.
- **Worktree fork/diff** - `fork`/inline-diff failed with "Session not found" for worktree sessions.
- **Reload restore** - Claude tabs came back blank / as a new chat after "Reload Window".

The feature patches (RTL, Zoom, Queue, etc.) are personal preference. The **bug fixes** below are the interesting part - each is a genuine defect in the extension's handling of **git worktrees** and **webview restoration**, proven from logs.

---

## Bug fixes - root causes (the interesting part)

Context: the extension stores each session's transcript under `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`. When you work in a **git worktree**, the CLI writes the transcript under the *worktree's* project dir, but much of the extension's session bookkeeping only looks at the *main repo's* project dir. That mismatch is the source of most of these bugs.

### 1. Worktree session titles written to the wrong dir (+ phantom files)

**Symptom:** a worktree session shows in history with a title but opens **empty**.

**Root cause:** `renameSession()` writes the custom/ai title to `join(nu(this.projectRoot), <sid>.jsonl)` - the **main** repo's project dir - but the transcript lives under the **worktree's** dir. `appendFile` then *creates* a title-only "phantom" `<sid>.jsonl` in the main dir. The open-content resolver (`bRt`) checks the main dir **first** and returns the first file with `size>0`, so the phantom (129 bytes, title only) **shadows** the real transcript, and the session opens empty.

**Fix:** before writing the title, resolve `<sid>.jsonl` to whichever project dir actually holds it (largest existing file = the real transcript). Plus a cleanup pass that deletes the phantom files already on disk (only when a real, larger transcript for the same sid exists elsewhere - never touches a file without a content twin).

### 2. Worktree fork / inline-diff "Session not found"

**Symptom:** forking a message (or the inline diff view) in a worktree session throws `Session <sid> not found`.

**Root cause:** `forkSession()` (and the diff view) call `ensureSessionLoaded(sid)`, which reads **only** `nu(this.projectRoot)/<sid>.jsonl` = the main dir. For a worktree session the transcript is elsewhere, so nothing loads and `sessionMessages` has no entry. Fork also re-reads the original file a second time for its `file-history` (checkpoint) data via the same wrong path.

**Fix:** resolve the session file across worktree dirs before loading, in both the message load and the file-history read.

### 3. Blank / new-chat tabs after "Reload Window"

This one took the most digging - it is **three** distinct defects that all surface as "my Claude tabs are broken after reload". All were proven with an on-disk log the patch temporarily writes from both the extension host and the webview.

#### 3a. The session id was thrown away on restore

`deserializeWebviewPanel(panel, state)` restored each tab but called `setupPanel(panel, void 0, ...)` - it read `state.isFullEditor` yet **ignored `state.sessionID`** (which VS Code hands right back in `state`). So the restored tab had no session; restoration then fell onto a fragile webview-side fallback gated by a 10-minute freshness window, which usually failed. **Proof:** `HOST setupPanel session=undefined` while `savedState={... "sessionID":"a3925312-..."}`.

**Fix:** pass `state.sessionID` to `setupPanel`.

#### 3b. VS Code silently fails to load some restored webview iframes

Even with the session passed correctly, VS Code/Cursor sometimes **never loads the iframe** of a restored webview panel - the panel reports `visible=true active=true`, its HTML is set, but its script **never runs** and focusing it does not help. **Proof:** the very first line of `index.js` posts an `IFRAME-SCRIPT-START` message; for a blank tab that message *never arrives*, while its sibling tab's does. This is a platform-level webview-restoration race, not the extension's fault.

**Fix (recovery):** after `setupPanel`, if the panel's webview sends **no message within a few seconds** (or on focus while still blank), force a reload by re-assigning `webview.html` (a fresh nonce each time forces the iframe to reload). Retries a few times.

#### 3c. `git worktree list` timeout drops sessions -> restore opens a new chat

**Symptom (rare):** a tab restores as a **brand-new chat** instead of the conversation. Switching sessions and back doesn't help; only opening a fresh tab and re-picking the session works.

**Root cause:** on restore, the webview asks the host for the session list; `activateSessionFromServer(sid)` returns `false` and the stock code then calls `createSession()` (a new chat). It returns false because the session was **absent from `listSessions()`**. Why absent? The host enumerates worktree sessions by running `git worktree list --porcelain` with a **5-second timeout**. On reload (many worktrees + several webviews each scanning at once + a busy machine) that command occasionally exceeds 5s, hits the timeout, and `catch{return []}` returns **empty** -> `VRt` concludes "no worktrees" -> every worktree session vanishes from the list -> `activate` fails -> new chat.

**Proof:** `HOST Xpe empty dur=5270` (the git command ran 5.27s and timed out), with the duration distribution showing it is normally ~600ms but spikes past 5s under load; and `activate(<sid>) -> FAILED-newChat` at the exact moment.

**Fix:** two coupled changes. (1) bump the `git worktree list` timeout `5000 -> 20000` so the slow-but-successful scan completes; (2) on the webview side, if `activateSessionFromServer` fails during restore, **retry** up to 10x (1s apart) before ever falling back to a new chat - the session exists, so a retry finds it once the list is complete.

---

## How these were found

The reload bugs are intermittent (some only reproduce once in dozens of reloads). They were diagnosed by temporarily injecting logging at the decisive points on **both** sides of the webview boundary:

- **Host** (`extension.js`, runs in Node): writes to a plain file via `fs.appendFileSync` - deserialize state, `setupPanel` session + caller stack, panel visibility/dispose events, the recovery mechanism firing, `git worktree list` timing/result/errors, and the raw `listSessions` result.
- **Webview** (`index.js`, sandboxed, no fs): captures the `vscode` API once at the top and `postMessage`s diagnostics to the host, which the host writes to the same file - iframe-start, the restore-decision inputs, and the branch actually taken.

Then reload until the bug fires, read the file, and the root cause is unambiguous. All instrumentation is removed from the shipped patch; only the fixes remain.

---

*Personal tooling, shared in case it helps others hitting the same worktree / reload issues. No warranty. The patches target extension version 2.1.x; anchors are written to survive minor updates but may need a refresh on major ones.*
