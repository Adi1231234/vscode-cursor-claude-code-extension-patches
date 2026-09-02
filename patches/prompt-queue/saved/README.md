# Saved queues

A queue you built once and want again in the next chat: save the current queue
under a name, and pick it back up from any conversation.

Part of `prompt-queue` rather than a patch of its own - it shares `Q`,
`render()`, `enqueue` and the modal chrome, and all of that lives inside one
injected IIFE. Four fragments, concatenated by `../patch.ps1`:

- `store.js` - the data. Read/write, the two conversions, and loading into `Q`.
- `modal.js` - the dialog and its list view, plus the panel-header door.
- `list.js` - one row of the list (load / edit / delete-with-confirm).
- `edit.js` - the editor view.
- `saved.css` - injected under its own guard `/* QSAVED */`.

## Where it is stored, and why localStorage is enough

`localStorage`, one key `ccq:saved`, shared by every session - not the
per-conversation `ccq:<sessionId>` the live queue uses. That sharing is the
whole feature, and it rests on a **measured** fact: every Claude panel in a
window is served from the *same* webview origin, so they get the same
localStorage. Two panels open side by side in the lab both reported
`vscode-webview://0c8i409p...`, both read the same `ccq:saved`, and each still
had its own session queue (5 rows in one, 0 in the other).

```json
{"v":1,"list":[{"id":"s...","name":"Nightly review","ts":1788320620623,
                "items":[{"t":"review the auth module"},{"t":"open a PR","o":1}]}]}
```

Newest first, capped at 60. Text only, so the quota this fills is negligible
next to the live queue's own saves (which carry image data URLs).

## What a saved item keeps - and what it deliberately drops

- **text** and **`o`, the skipped flag**. A template where some lines are parked
  on purpose is a real thing to want back.
- **a relative schedule only** - `timer` or `after`, with its duration. An
  at-time is a commitment to one wall-clock moment; replaying it next week means
  nothing, so such an item is saved as a plain queue item.
- **no attachments.** A data URL would sit in localStorage for ever for a file
  the next chat has no reason to still want, and the live queue's own save
  already falls back to text-only the moment that quota bites.

A loaded `timer` comes back exactly as a restart brings one back: **inactive,
"Restart Nm", one click to run it from now** (`rearm`). It is not armed at load,
because a *due* timer is the one thing that fires **through** the paused hold
(`firstSendableIndex`) - arming it here would send behind the user's back. An
`after` item needs no origin at all: it arms itself by position, so it restores
fully live.

## Loading parks the queue

`loadSavedInto` sets `paused` while idle, exactly as `commitComposerToQueue`
does for one typed add. Dropping N prompts into an idle queue and watching the
first one leave immediately is the one outcome nobody wants; the user releases
them with the panel's play button.

Loading **appends** to the current queue rather than replacing it - with the
usual empty queue the two are the same thing, and only one of them can throw
away work.

## Two doors, one dialog

- the bookmark beside the composer's send button (`__qSaved`, ranked 30 in
  `lib/js/ccRow.js` between the log button and the add button). This is the
  only one reachable **while the queue is empty**, which is exactly when you
  want to load a saved one - the panel is `display:none` then.
- the bookmark in the queue panel's own header, which opens the same dialog
  with the name field focused, because from there you came to save.

The dialog has two views in one shell - list and editor - so there is never a
second overlay and Esc always means the same thing. Delete confirms **in place
of its row** rather than in a nested dialog (one shell is open at a time by
design), with Cancel holding the focus so Enter never deletes. The editor works
on a **draft copy**, which is what makes Back a real cancel; a blank line is
dropped on save, since `flush()` silently drops a blank item and a message that
vanishes later is worse than one that never saved.

## The modal shell it shares

`../queue/modal-shell.js` - overlay, head, foot, Esc, backdrop, focus trap,
focus restore, and one-modal-at-a-time. The schedule modal and the log viewer
were each carrying their own copy of that; both now call `openShell()`.
