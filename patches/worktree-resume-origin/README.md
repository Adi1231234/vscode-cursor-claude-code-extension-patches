# worktree-resume-origin

**Type:** bug fix
**Touches:** `extension.js`
**Guard marker:** `/* WORKTREERESUMEORIGIN */`

A session that moved into a worktree with `EnterWorktree` is resumed from the
folder it entered it from, not from inside the worktree. Without this, a session
that lived through an editor restart can no longer leave its worktree, and
deleting the worktree then drops it from the panel's history.

## What happened (2026-10-08, 2.1.292)

Two panels each worked in a worktree, merged their PR and deleted the worktree.
A window reload later both were gone from history. Their transcripts were intact,
in `~/.claude/projects/<repo>--claude-worktrees-<name>/`.

## Root cause (proven)

1. `EnterWorktree` moves the session's transcript into the worktree's projects
   folder, and `ExitWorktree` moves it back. Measured headless: clean, with the
   panel's lowercase `c:`, and after a resume launched from the repo folder - the
   file came home every time, and removing the worktree afterwards was safe.
2. The panel resumes a session whose recorded cwd is in `.claude/worktrees/<name>`
   by launching the CLI *inside* that worktree: the webview's `fromServer` sets
   `cwd = worktree.path`, and `launch_claude` hands it to the host.
3. The CLI takes the folder it was launched in as the session's live launch
   anchor. `ExitWorktree keep` then logs
   `not moving the permission anchor to "<repo>" - it strictly contains the session's live launch anchor (a record-derived widening)`,
   still answers `Session is now back in <repo>`, leaves the transcript in the
   worktree's projects folder, and the next shell command resets the session
   into the worktree. Reproduced headless by resuming with the worktree as cwd;
   the same line is in the real sessions' log, written after VS Code restarted
   at 14:52 with both sessions inside their worktrees.
4. The panel's history and reload-restore look only in the workspace's projects
   folder and in those of worktrees `git worktree list` still reports. Once the
   worktree is removed, the transcript is in neither. (`claude --resume <id>`
   in a terminal still finds it.)

The false "Session is now back" is an upstream CLI bug and cannot be patched
here. What can be fixed is step 2, the launch folder.

## What it does

At the host's `launch_claude` dispatch, the requested cwd goes through
`__ccResumeOrigin(sessionId, cwd)`:

- not a `.claude/worktrees/<name>` path, or no session id: unchanged;
- the transcript has no `worktree-state` record (the session was *started* in
  the worktree): unchanged - that session has nowhere else to go back to;
- it has one: launch from its `preEnterOriginalCwd` (or `originalCwd`, or the
  repo the worktree belongs to). The CLI restores the worktree from that same
  record by itself, with the original folder as its anchor, so `ExitWorktree`
  works again. Measured headless: resumed from the repo folder, the session was
  back in its worktree, and `ExitWorktree keep` took it and its transcript home.

Anything it cannot read keeps the panel's choice, and every decision is logged
to the extension's output as `[worktree-resume-origin] ...`. The transcript is
read backwards in 256KB chunks, so a 25MB file costs one or two reads.

- Anchor: `case"launch_claude":await this.launchClaude(<m>.channelId,<m>.resume,<m>.cwd,`
  (one match on every release checked, 2.1.241 to 2.1.292)
- Test: `node patches/worktree-resume-origin/tests/origin.test.js`
- Live test, in a real editor: `node tools/lab/lab.mjs up --port 9583`, then
  `node patches/worktree-resume-origin/tests/live/live.mjs --port 9583`. It enters
  a worktree, reloads with the session inside, leaves, deletes the worktree and
  reloads again, checking each step. `--lab <checkout>/tools/lab/lab.mjs` runs
  the same steps on a lab built without this patch, where they are meant to fail.
- Measured with that live test on 2.1.292, same steps on two labs: without this
  patch 5 of 7 checks fail exactly as the lost sessions did (relaunched inside
  the worktree, transcript left there, the second `pwd` back in the worktree,
  `not moving the permission anchor` in the log, gone from history after the
  delete); with it all 7 pass, and all 8 with `--exit remove`. A session that
  was *started* in a worktree (the panel's new-session-in-this-worktree) has no
  record, logs `started inside ..., launching it there`, and keeps launching
  there.

## What it does not cover

Deleting a worktree while a session is still inside it, without leaving it
first, still hides that session: its transcript is in the worktree's projects
folder, and the panel only looks in the folders of worktrees git still lists.
Measured in the lab with two sessions in one worktree. `recover-sessions.ps1`
below brings both back.

## Recovering sessions stranded before this patch

`recover-sessions.ps1` finds transcripts left in the projects folder of a
worktree that is gone, moves each one (with its folder of subagent logs and tool
results) to the projects folder of the directory the session came from, and
appends a `relocated` record naming that directory, so the panel lists the
session again and resumes it there. Not run by `apply.ps1`; close those sessions
first. Originals are copied to `%TEMP%` unless you pass `-NoBackup`.

```powershell
./patches/worktree-resume-origin/recover-sessions.ps1 -WhatIf               # list them
./patches/worktree-resume-origin/recover-sessions.ps1 -SessionId <uuid>     # move one
```

It leaves alone what the panel would not list anyway: sessions started by a
program (`entrypoint` `sdk-*`) and anything in a worktree the CLI makes and
removes on its own (`agent-a<hex>`, `wf-`, `bridge-` for Remote Control, `job-`,
`bg-`). A session that was started inside the worktree has no move records, so
the cwd of its messages says where it was. On the machine this was found on it
listed eight panel sessions going back three weeks, across three repositories,
and left nineteen Remote Control and agent sessions alone.
