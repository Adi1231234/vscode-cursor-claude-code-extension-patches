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

It downloads this repo to a temp folder, runs `apply.ps1` against the newest `anthropic.claude-code-*` under `%USERPROFILE%\.cursor\extensions`, and cleans up. **Idempotent** — already-applied patches skip, so re-run it after every extension update. *(Cloned the repo instead? Just run `./apply.ps1`.)*

## 🗂️ Layout

Each feature / bug fix is a **self-contained folder** under `patches/`; the shared plumbing lives in `lib/` — so every patch does one thing and is easy to read or reuse.

- **`apply.ps1`** — finds the extension, then dot-sources and runs each patch in order.
- **`lib/`** — reusable helpers: `Io` (UTF-8 read/write), `Ui` (output), `Extension` (locate + detect minified names into a shared `$Ctx`), `Patch` (css/script injectors + the shared worktree resolver).
- **`patches/<name>/`** — one folder per patch: a `patch.ps1` exposing a single `Invoke-Patch $Ctx` (fail-safe, idempotent), its own `README.md`, and any resource files (`*.css`, `queue/*.js`, `cleanup.js`).

*Add a patch* = drop `patches/<name>/patch.ps1` defining `Invoke-Patch`, add its name to the list in `apply.ps1`. Nothing else.

## ✨ Features

🌐 RTL text · ⌨️ Input RTL · 🔍 Zoom (Ctrl+Scroll) · 📥 Codex-style Prompt Queue · 🔓 Bypass permission mode.

## 🐞 Bug fixes

Each links to its folder's README for the full root cause + proof.

- 🧵 [**ELECTRON_RUN_AS_NODE leak**](patches/electron-run-as-node) — the flag leaks into every subprocess the CLI spawns; stripped at each site.
- 📜 [**Worktree sessions in history**](patches/worktree-history) — `includeWorktrees` was hardcoded off.
- 🏷️ [**Worktree title dir**](patches/worktree-title-dir) — the title was written to the main repo dir, creating a phantom that shadows the real transcript → session opens **empty**.
- 🍴 [**Worktree fork / diff**](patches/worktree-fork-diff) — "Session not found" because the loader only reads the main dir.
- 🔄 [**Reload restore**](patches/reload-restore) — blank / new-chat tabs after reload: (1) the sessionID was dropped on deserialize; (2) VS Code sometimes never loads a restored iframe → recovery re-loads it; (3) a `git worktree list` **5s timeout** drops worktree sessions from the list → bumped to 20s + retry `activate` instead of new-chatting. *Proof:* `HOST Xpe empty dur=5270` at the moment of `activate → FAILED-newChat`.

## 🔬 How the intermittent bugs were caught

Injected logging at the decisive points on **both** sides of the webview boundary — host (`fs.appendFileSync`) and webview (capture the `vscode` API at the top, `postMessage` to the host) — then reloaded until the failure fired and read the evidence. All instrumentation is stripped from the shipped patch.

## 🛡️ Safe by design

- **Fail-safe** — a missing anchor **skips** instead of corrupting anything.
- **Version-tolerant** — regexes capture the minified variable names.
- **Idempotent** — re-running never double-applies.
- **No secrets, no hardcoded user paths** — everything derives from `%USERPROFILE%` / `os.homedir()`.

## 📄 License

MIT — personal tooling, shared in case it helps others hitting the same worktree / reload issues. No warranty. Targets extension `2.1.x`.
