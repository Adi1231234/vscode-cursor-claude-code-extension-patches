# Saved queues

A queue you built once and want again in the next chat: save the current queue
under a name, and pick it back up from any conversation.

Part of `prompt-queue` rather than a patch of its own - it shares `Q`,
`render()`, `enqueue` and the modal chrome, and all of that lives inside one
injected IIFE. Fragments, concatenated by `../patch.ps1`:

- `store.js` - the data. Read/write, the two conversions, the row preview, and
  loading into `Q`.
- `modal.js` - the dialog shell: icons, the `_sv` state, Escape-steps-back, and
  the panel-header door.
- `list.js` - the list view: filter, keyboard, empty states, footer.
- `row.js` - one row (load / edit / delete-with-confirm).
- `save-form.js` - the revealed name field.
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

## How the dialog is laid out, and why

Every choice below was either measured off the app or taken from the guidance
the pattern has; none of it was picked by eye.

- **The list owns the top.** Loading is the frequent job. The first version put
  a name field and a Save button above the list, which meant the first thing
  you saw - at exactly the moment you had come to load something with an empty
  queue - was a *disabled* control. Saving is now one footer button that
  reveals the field (`save-form.js`); the field is gone again the moment it is
  used. That is progressive disclosure, and it is also the fix for a documented
  anti-pattern (a disabled control in the primary position).
- **A row is name + what is in it.** Two saved queues cannot be told apart by
  name alone without remembering what you put in them, so the second line is
  the prompts themselves, ellipsised by CSS - everything is offered and the row
  stays two lines tall. The row IS the load button, shaped like the app's own
  command-menu item.
- **How many is a chip, not a phrase.** `3 messages ·` at the head of every
  preview line repeats itself down the list and eats the width that the preview
  needs. As a chip on the trailing edge it lines up into a column you can run
  your eye down, and the preview gets the whole line. The chip reads as a bare
  number, so the row carries an `aria-label` with the sentence instead.
- **One hairline of accent at the leading edge** grows in on hover and to full
  height on focus. It is the only thing on the row that moves, and it tells you
  which row you are on before you read a word - which the active background
  alone, a ~1.4:1 change, does not.
- **The row's controls are always visible**, at `--app-secondary-foreground`,
  rather than appearing on hover. A control that appears on hover does not
  exist for the keyboard, for touch, or for anyone scanning for it.
- **Keyboard.** Focus lands inside the dialog on open (the filter if there is
  one, else the first row). Up and down walk the rows and Enter loads - the
  keys the app's own command menu answers to; the rows are real buttons, so
  Enter and the screen-reader semantics come for free. Escape **steps back one
  level** - out of the name field, out of a delete confirm, out of the editor -
  and only closes the dialog from the list. That is what the shared shell's
  "a caller may claim a key" hook exists for.
- **A filter appears only at six saved queues.** Below that, scanning is
  instant and a filter is a row of noise.
- **The footer's Save changes weight with the situation**: ghost while there
  are saved queues on screen (the primary action is a *row*, and an orange
  button beside the list pulls the eye off the content), primary when the list
  is empty and it is the only thing to do.
- **The empty state** is a picture, a headline, one sentence naming the next
  concrete step, and the action itself right below - not "no data". The picture
  is the queue drawn in the panel's own vocabulary (three rows fading back,
  bookmarked) rather than a generic glyph: an illustration that does not say
  what the moment is is decoration.
- **Heights come from flex, never from `vh`.** `patches/zoom` puts the panel in
  a second coordinate system where viewport units report the *unzoomed*
  viewport while every rect is `1/zoom` of it, so a `44vh` list is the wrong
  size at any zoom but 1. `min-height:0` on the scrollers lets the box hand
  them exactly the room it has left.
- **Delete confirms; it does not offer undo.** The current guidance prefers
  undo for reversible actions, and confirmation for infrequent, irreversible
  ones. This is the second: the prompts are gone. So it follows the
  confirmation rules - it names the queue, states what goes with it, labels the
  button with the verb rather than "OK", and leaves the focus on Cancel so a
  stray Enter cannot delete. It happens **in place of the row** because one
  shell is open at a time by design and stacked modals are what every guideline
  says not to build. The sentence wraps rather than ellipsising: what would get
  cut is the consequence.
- **Target sizes.** The editor's reorder arrows are 24x24 and the skip
  checkbox gets a 24px hit area around its 15px box - WCAG 2.2 SC 2.5.8 (AA).
  The first version had 18x13 arrows.
- **Contrast.** Secondary text is the `--app-secondary-foreground` token at
  full opacity (5.4:1), not the app's own 50% dim (~3.4:1). The delete button
  is dark text on the salmon: white on `--app-error-foreground` is 2.5:1.

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

`../queue/modal-shell.js` (behaviour) and `../queue/modal.css` (the look) -
overlay, head, foot, Esc, backdrop, focus trap, focus restore, and
one-modal-at-a-time. The schedule modal and the log viewer were each carrying
their own copy of that; both now call `openShell()`, so all three dialogs are
one design line and a change lands in all of them at once.

That line is the app's **own confirm-dialog family**, measured off the live DOM
and the same one `patches/remote-control-chip` settled on: a box on an
`--app-modal-background` scrim, `--app-spacing-*` / `--corner-radius-*`
throughout, and a 1px border **instead of a shadow**. Read the design-line
bullet in the root `CLAUDE.md` before changing any of it - in particular the
part about `--app-input-background` being the same colour as
`--app-primary-background`, which is why every field in these dialogs carries a
border the app's own fields do not need.
