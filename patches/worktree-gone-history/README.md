# worktree-gone-history

**Type:** bug fix
**Touches:** `extension.js`
**Guard marker:** `/* WORKTREEGONEHISTORY */`

A session whose worktree is deleted while the session is still inside it stays
in the panel's history and can be opened and continued, from the folder the
worktree belonged to.

## Root cause (proven)

1. While a session is in a worktree, its transcript lives in that worktree's
   projects folder, `~/.claude/projects/<repo key>--claude-worktrees-<name>/`
   (see `patches/worktree-resume-origin` for how it gets there and back).
2. Every place the extension looks for a session takes the repo's worktrees from
   `git worktree list` and searches only their folders: the history list, the
   lookup that loads a transcript by id, the resume precheck and the scan for
   unreadable files - in both bundled copies of that code.
3. Delete the worktree without leaving it first and git stops listing it, so
   none of those looks in its folder again. Measured in the lab on 2.1.292 with
   `worktree-resume-origin` already in place: two sessions inside one worktree,
   worktree deleted, window reloaded - both gone from history.

## What it does

The six call sites that use git's answer to *find sessions* get it passed
through `__ccGoneWorktrees(listed, repo)`, which appends one path for every
folder named after a worktree of this repo that git did not list and that has no
live checkout behind it. The callers only turn that path back into a folder
name, so it is rebuilt from the folder's own name. Nothing else changes: the
one other caller of `git worktree list` - the check that a path really is a
registered worktree before trusting it - has none of these shapes and is left
exactly as it was.

When such a session is opened, `worktree-resume-origin` sees that the worktree
folder is gone and launches it from the repo instead (a session that entered
the worktree itself already went to its recorded origin). The CLI finds no
worktree to restore and carries on there.

- Shapes, each in both copies: history list `if(J)try{K=await <list>(W)}...if(K.length<=1)return`,
  lookup `for(let Y of await <list>($)){if(Y===$)continue;`, candidates
  `try{z=await <list>(Q)}catch{z=[]}for(let G of z){if(G===Q)continue;`.
  Only calls of a function that runs `git worktree list --porcelain` count.
  2.1.278 to 2.1.294: 2 + 3 + 1 sites. 2.1.241 and 2.1.258 have no history-list
  shape, so nothing is written there.
- A worktree name with `.` or `_` comes back with `-` in their place, which is
  how the folder spells it; matching is unaffected.
- Test: `node patches/worktree-gone-history/tests/gone.test.js`
- Live: `node patches/worktree-resume-origin/tests/live/live.mjs --port <lab> --exit none`
