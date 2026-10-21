# session-name-sync

A conversation renamed in the panel is listed under that name by `ListAgents`
and reachable under it with `SendMessage` - also after a reload, and also when
it was renamed before its CLI had told the host which session it runs.

## Two names, kept in two places

- **The tab title** is the newest `{"type":"custom-title"}` record in the
  session's transcript. The panel writes it there itself.
- **The name other sessions see** is the `name` in the CLI's session registry,
  `~/.claude/sessions/<pid>.json`, with `nameSource` `user`, `derived`, `auto`
  or `collision`. A CLI starts with a derived one: the folder plus two
  characters (`docvoice-2c`).

A panel rename writes the title, then sends `rename_session` (source `host`)
to the CLI - but only to a channel whose `sessionId` is that session. The CLI
then writes `custom-title` + `agent-name` and registers the name as `user`.

## Where it goes missing (measured on 2.1.301 - 2.1.306)

1. **A CLI the panel starts never takes the name back.** The CLI restores the
   registered name from the transcript's `agent-name` only on its terminal
   resume paths (startup resume, `/resume`, the picker). The SDK path the panel
   uses (lane `print` / `sdk_url`) restores the transcript but never calls that
   restore. So every reload, every restart button and every editor start drops
   every name: a session renamed to `2` on 2026-10-05 still carried
   `agent-name "2"` records after its 2026-10-18 restart, and was listed as
   `llama-cpp-docvoice-db` (`derived`). Reproduced in the lab: renamed live ->
   `user` "LAB NAME"; `Developer: Reload Window` -> `derived` "proj-7a".
2. **A rename before the host knows the session is never relayed.** The
   channel's `sessionId` is set from the CLI's first `system/init` frame
   (`sessionIdArrived`). The panel can know a new conversation's id before that
   (it can adopt one from the session list while the first turn starts up), and
   a rename in that window finds no channel to relay to. `VITER 2`, `VITER 3`
   and `VITER 11` (2.1.301) were renamed that way: `custom-title` as line 1 of
   the transcript, written 4 s before the first message, no `agent-name`,
   registry `derived`.

## The fix

The host sends the session's newest transcript title to its CLI as the same
`rename_session` the panel sends, once per channel and session, at the first of:

- `channelInitialized` - the CLI answered `initialize`. A resumed session is
  already known here, and for an idle tab after a reload nothing else comes:
  `init` arrives only with a turn.
- `sessionIdArrived` - the CLI said which session it runs: a new
  conversation's first turn, a fork (which starts on its parent's id, where the
  CLI's own check refuses the rename with `session_id is not the current
  session`; a refusal is logged and the fork is named with its own `(fork)`
  title here).

Only a title of the user's own (`custom-title`) is sent, never an `ai-title`,
and the newest record decides, so a cleared title does not bring an older one
back. A title that lands after this has run is relayed by the panel itself.
Every decision is logged in the extension's output as `[session-name-sync]`.

Checked in the lab on 2.1.306: an idle tab after a reload is registered `user`
under its title before any message; a renamed new conversation keeps its name;
a conversation with no title keeps the derived one. `tests/name.test.js` covers
the transcript side (newest wins, cleared title, forks, retry after a refusal,
a title several chunks back in a long file).

The transcript is read with `lib/js/ccTranscript.js` (find by id, scan
backwards), shared with `worktree-resume-origin`.
