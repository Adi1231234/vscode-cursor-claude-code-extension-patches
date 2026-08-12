# cwd-drive-case

Stops IDE-started sessions from becoming unresumable with
`Error: Claude Code process exited with code 1`, whose real cause is hidden
behind a wall of MCP shutdown logging:

```
[worktree] declining to resume into c:\...\.claude\worktrees\<name> (work-tree-elsewhere):
Refusing to use c:\...\.claude\worktrees\<name> as an isolation worktree:
git resolves its working tree to C:/.../.claude/worktrees/<name>
```

Both paths are the same directory. They differ only in the case of the drive letter.

## Root cause (proven)

1. **VS Code / Cursor produce a lower-cased drive letter.** Every workspace entry in
   `%APPDATA%\Cursor\User\workspaceStorage\*\workspace.json` (VS Code: `%APPDATA%\Code\...`) is stored as
   `file:///c%3A/...`, and `URI.fsPath` renders that as `c:\...`. The extension
   passes it straight through: `Spawning Claude with SDK query function - cwd: c:\...`.
2. **Node does not normalise a spawn `cwd`.** A child spawned with `cwd: "c:\\..."`
   reports exactly `c:\...` from `process.cwd()`, so the spelling survives into the
   CLI and into the `{"type":"worktree-state","worktreeSession":{"worktreePath":...}}`
   record `EnterWorktree` writes to the transcript.
3. **git reports the canonical spelling.** `git rev-parse --show-toplevel` returns
   `C:/...` for the same directory.
4. **Claude Code >= 2.1.222 compares the two case-sensitively.** The isolation-worktree
   guard calls `Fye(topLevel, pin)`, which bottoms out in `gyr(a, b, false)` - the
   case-*sensitive* arm of a helper whose sibling `mBt` (used for the containment
   checks right next to it) passes `true`. The win32 canonicaliser normalises
   separators but never touches letter case, so `c:\...` and `C:\...` compare as
   two different directories, the guard returns `reason:"work-tree-elsewhere"`,
   and the CLI exits 1.

Isolating the variable in a clean repo, with only the recorded spelling changed:

- `C:\` + backslashes (what the OS reports) - resumes, exit 0
- `c:\` + backslashes (only the drive letter differs) - refused, exit 1
- `C:/` + forward slashes - resumes, exit 0, so separators are normalised and are
  not the trigger
- `C:\appdata\...` (one interior segment miscased) - refused, exit 1, so this is a
  plain case-sensitive comparison of the whole path, not drive-letter handling

Across CLI versions with identical lower-cased input: 2.1.221 resumes, 2.1.222
refuses, 2.1.226 refuses. The strings `work-tree-elsewhere`, `as an isolation
worktree` and `cannot resume into worktree` are absent from the 2.1.220 and
2.1.221 binaries and present from 2.1.222 - the release whose changelog reads
"isolation now applies to file edits and Bash in every session type".

The CLI-side comparison is an upstream bug. This patch removes the *input* that
trips it, which is the extension's own non-canonical spelling.

## What it does

Wraps the `cwd` of every options object the extension uses to launch a claude
process - the SDK query and the "Open Claude in Terminal" path - in
`__ccDriveCase`, which upper-cases a leading drive letter and passes anything
else (UNC, POSIX, non-strings) through untouched.

- Anchor: `cwd:<arg>||this.cwd,`
- Guard: `/* CWDDRIVECASE */`

## Repairing transcripts written before the patch

Sessions recorded before this patch still hold the lower-cased spelling and stay
unresumable. `repair-transcripts.ps1` rewrites the drive letter in the
`worktree-state` records under `~/.claude/projects`. It is deliberately *not* run
by `apply.ps1` - it touches your session history, not the extension:

```powershell
./patches/cwd-drive-case/repair-transcripts.ps1 -WhatIf   # list what would change
./patches/cwd-drive-case/repair-transcripts.ps1           # rewrite, after a backup
```

Close your other Claude Code windows first. A transcript is rewritten as a whole
file, so anything a live session appends between the read and the write is lost.
Pass `-SkipSessionId <uuid>` to leave a session you cannot close alone. Originals
are copied to a timestamped folder under `%TEMP%` unless you pass `-NoBackup`.
