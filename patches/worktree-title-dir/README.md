# Worktree title dir

**Type:** bug fix
**Touches:** `extension.js`
**Guard marker:** `/* WTTITLEFIX */`

A worktree session shows a title but opens **empty**: `renameSession()` writes the title to the MAIN repo dir, but the transcript lives under the WORKTREE dir, creating a title-only phantom that the open-content resolver returns instead of the real transcript. Fix: resolve `<sid>.jsonl` to the dir that actually holds it (largest file). Injects the shared `__ccWtResolve` helper (reused by `worktree-fork-diff`). Pairs with `phantom-cleanup`.

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`). Idempotent and fail-safe: if its anchor isn't found it skips instead of corrupting anything.
