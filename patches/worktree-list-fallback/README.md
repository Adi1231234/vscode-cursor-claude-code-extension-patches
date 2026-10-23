# worktree-list-fallback

**Type:** bug fix
**Touches:** `extension.js`
**Guard marker:** `/* WORKTREELISTFALLBACK */`

Tabs whose conversation lives in a worktree come back as a new empty chat after
the editor starts (or reloads) under load. With this patch, a failed
`git worktree list` is answered from git's own files, so the conversation is
found and the tab opens it.

## Root cause (proven)

1. On restore a tab asks the host for its saved session
   (`resolve_session_request` -> `resolveSession` -> `locateTranscript` ->
   `candidateProjectDirs`). A session inside a worktree is found only in the
   projects folder of a worktree that the lister reports.
2. The lister runs `git worktree list --porcelain` with `timeout: 5000`, and
   its `catch{return[]}` turns any failure into "this repo has no worktrees".
   Nothing is logged.
3. So the session is "not found", the tab starts a new empty chat
   (`fresh_after_missing_saved`) and its saved `sessionID` is overwritten:
   a later reload cannot bring the conversation back.

Measured on 2026-10-23 (2.1.309) after a PC restart: five windows started at
once, 22 `claude.exe` spawned within 12 s, event-loop stalls up to 4.7 s. Four
tabs (two windows of one repo, one each of two others) sent
`resolve_session_request`, got no "Resolved session" line and launched without
`resume` after **5.5-6.2 s**, the timeout plus the round trip; every lookup
that worked took 28 ms-1.7 s. The real extension code, loaded in Node with git
made to time out, returns "not found" after 5.0 s for the same sessions, and
finds them in 300 ms with git answering. Idle, the same `git worktree list`
takes 120-250 ms.

Raising the timeout (what `reload-restore` used to do, 5 s -> 20 s) only moves
the point where the same failure happens, and makes a tab wait up to 20 s for
it. It is retired in favour of this.

## What it does

`git worktree list` reads a registry of plain files: the main worktree is the
folder holding the common git dir, and each linked one is
`<common>/worktrees/<id>/gitdir` ("<worktree>/.git"). When the call fails, the
lister's `catch` now calls `__ccWorktreesOnDisk(cwd, map, err)`
(`host/on-disk.js`), which reads exactly that and returns git's answer: same
set (deleted "prunable" worktrees included), same order (main first, then by
path, case-folded, `/` before other characters), same spelling (forward
slashes), each path put through the lister's own mapper. It walks up from the
folder like git, and skips a `.git` folder that is not a repository (one sits
at `C:\` here). Nothing readable gives `[]`, as before. Every fallback writes
one line to the extension host log:
`[cc worktree-list-fallback] git worktree list failed in <cwd> (timed out); read N worktree(s) from <common> instead`.

Git stays the first source; the files are read only when it fails.

- Sites: the lister in each of the two bundled copies of that code (2.1.309:
  `TX`, `qf1`). Every caller of those finds sessions (history list, lookup by
  id, resume precheck, candidate folders), so all of them get the answer. The
  other two `git worktree list` calls in the bundle have other shapes and are
  left alone: the check that a path really is a registered worktree before
  trusting it (`git -C <path>`, `.slice(9).trim()`, no mapper) keeps git's
  answer as is, and worktree creation and cleanup (`-z`) already tells a failed
  call (`unreadable` / `unsupported`) from an empty answer.
- Matched 2 listers out of 4 calls in 2.1.296, 2.1.301, 2.1.306 and 2.1.309.
  A lister that is reshaped is a `[miss]`, never a guess.

## Tests

- `node patches/worktree-list-fallback/tests/on-disk.test.js` - a throwaway repo
  with real worktrees (a `_` in a name, one outside the repo, one deleted),
  asked from the main checkout, a subfolder and a worktree: the result must
  equal `git worktree list --porcelain` exactly.
- `node patches/worktree-list-fallback/tests/bundle.test.js <extension.js> [repo]` -
  loads a real bundle and runs its listers with git timing out. Patched: every
  lister returns what git prints (exit 0). On `extension.js.pristine` it
  reports `0 of N` (exit 1) - the bug.
