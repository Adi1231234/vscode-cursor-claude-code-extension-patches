# panel-settings

A **gear in the input footer row** that opens a **settings dialog**, and the
three settings in it: **raise a Windows notification when a run finishes**,
**stay quiet while the window you are looking at is the one Claude runs in**,
and **with a queue still to go, wait for the end of it rather than announcing
every item**.

## Why a Windows notification is a patch at all

The webview can already ask the host to show a message - upstream has a
`show_notification` request the panel calls in a dozen places, with a severity,
buttons and even an `onlyIfNotVisible` gate. But it ends at
`vscode.window.showInformationMessage`: a toast drawn **inside the editor
window**. The whole point of "tell me when it is done" is to be seen while that
window is behind a browser, so the notification has to leave the editor and
reach the Action Center, and nothing in either bundle does that.

Upstream has no "notify me when done" feature to turn on instead. The CLI's
settings schema does carry a `preferredNotifChannel`, but every value it accepts
is a terminal escape-sequence channel (`iterm2`, `kitty`, `ghostty`,
`terminal_bell`) - inert under the editor. The tab icon swapping to
`claude-logo-done.svg` and the sidebar badge are the only completion signals
there are, and both require looking at the window.

## How the three pieces fit

**The gear** is rendered from inside the input footer's own render, right after
the flex spacer, the same way `remote-control-chip` renders its chip - a plain
call in the children array rather than a component, so there are no hooks to
hold state in. It wears the app's own `footerButton footerButtonPrimary`, which
is what every icon in that row already is: 26px tall, 5px radius, the glyph
forced to 26x26, hover from the app's ghost background, drawn at the full
primary foreground rather than the row's dimmer label colour. The one
declaration of ours zeroes the `padding: 0 8px 0 0` that rule reserves for the
gap between an icon and a text label.

**The dialog** is the shared chrome in `lib/js/ccModal.js` + `lib/css/ccModal.css`
(the same one the queue's three dialogs use) with one group of toggle rows in
it, and **the toggle is the app's own switch**, not one of ours - see below.

**The notification** is raised by the extension host. The panel watches
`session.busy`, sends one message when it falls, and the host turns that into a
toast.

## Everything visible here was measured, not chosen

- **The switch.** The app ships one as its own component (`EH`): a 32x18 track
  at radius 9 going from `--app-input-border` to `--app-accent-color`, a 14x14
  thumb in `--app-primary-foreground` travelling `left: 2px -> 16px`, both
  transitions `.15s`, and **no hover, focus or active state of its own**. It is
  what upstream puts on "Focus view", "Thinking" and "Remote control at
  startup". Those values are reproduced exactly. They are re-expressed against
  the same tokens rather than borrowed by class name, for the reason
  `remote-control-chip` gives: a hashed module name ties the stylesheet to one
  release, and a hash that moves leaves the control with no styling at all.
- **The rows.** The app has exactly one dialog that holds preferences - the
  Memory / Instructions dialog - and this is its group: one hairline
  `--app-widget-border` box at `--corner-radius-small`, rows at `8px 12px` with
  a 1px divider between them and none after the last, a 12px gap, the label at
  13px `--app-primary-foreground` taking the width, an optional 11px
  `--app-secondary-foreground` detail, then the switch at the trailing edge.
  Hover is `--app-list-hover-background`; keyboard focus is a distinct state,
  drawn as a 1px inset `--app-input-active-border` outline.
- **The glyph.** Every icon in the footer row is a 20-unit viewBox holding a
  10-11 unit glyph with 1.0-unit walls and round caps - the `+` measures exactly
  10.0 x 10.0 between x5 and x15, the `/` exactly 11.0 x 11.0 between 4.5 and
  15.5. The gear spans 4.5 to 15.5 as well: a body circle at r=4.0, eight teeth
  whose round caps end at 5.5, a hub at r=1.7. The bundle's own Heroicons are
  deliberately not reused - they are 24-unit boxes at stroke-width 1.5, and the
  app only ever uses them inside menus and dialogs, never in this row.
- **The key legend.** The app puts one under a dialog it expects to be driven
  from the keyboard, at 11px secondary with bordered `kbd` caps.

### One thing deliberately not copied

`remote-control-chip` reads `css.footerButtonInactive` off the footer's module
map, and **that key does not exist** in 2.1.278 - so in its off state that chip
renders `class="footerButton_gGYT1w undefined cc-rc-chip"`. It is the exact
failure CLAUDE.md warns about under "Build the test harness from the markup the
app *emits*". Every class named by this patch was read back off the live module
map first.

## "The run finished" is watched, not polled

`session.busy` is a Preact signal and a signal carries `.subscribe()`, so the
falling edge arrives as a push. Nothing here runs on a timer. (The queue and
auto-followup patches poll `busy` at 150/300ms; they need a *settled reply*,
which is a different question from "did the turn end", and they predate this.)

Three things make the edge trustworthy:

- **It does not flap.** `busy` is set true once, on the SDK's `system`/`init`
  frame, and back to false only inside the store's own `endTurn()`, which runs
  on the `result` frame. It stays true across the tool calls inside a turn, so
  one rising-then-falling pair really is one run.
- **The first callback is not an edge.** `.subscribe()` hands back the *current*
  value immediately, so the first call only primes `wasBusy`. Without that,
  opening a panel mid-run would announce a finish that never happened.
- **Stop is not a finish.** `busy` goes false either way and cannot tell them
  apart, so the store's `interrupt()` - what the Stop button calls, synchronously
  with the click and before the signal flips - is wrapped to mark the next edge
  as one the user caused, and it is swallowed. Someone who just stopped a run
  does not need to be told it stopped. This is the same decoration
  `prompt-queue` and `auto-followup` already apply to that method.

The store object is **replaced whenever the conversation changes**, which is why
the watcher is wired from inside the footer's render rather than once at load:
that render re-runs with the new object. A marker on the store keeps it to one
wiring each, and the subscription is deferred off the render pass with a
`setTimeout(0)`, because subscribing creates an effect and a render is no place
for one.

## The host half

The panel sends one message - `{type:"__ccnotify", op:"done", title, body}` -
over `connection.value.send()`, the app's own back-channel and the only
sanctioned route (wrapping `acquireVsCodeApi` renders the Cursor panel blank).
`Add-WebviewMessageHook` puts a returning guard at the top of every chat
surface's `onDidReceiveMessage`, so the message is answered before the app's
protocol switch can log it as unknown.

The toast itself needs WinRT, which Node cannot reach from here without a native
module, so the host spawns PowerShell. Three decisions worth keeping:

- **The PowerShell is a real `.ps1`** in `host/`, base64'd (UTF-16LE) into the
  injected JS at patch time and run with `-EncodedCommand`. Languages do not mix
  in one file: the `.js` carries one opaque constant, and the script stays
  readable, reviewable and syntax-highlighted where it lives. `-EncodedCommand`
  also means there is no command line to quote wrong.
- **Nothing dynamic is ever interpolated.** The title and body travel in the
  environment (`CC_TOAST_TITLE` / `_BODY` / `_APPID`) and are XML-escaped inside
  the script, so no conversation title can break the toast's XML or inject
  anything. Verified with a body of `a <script> & "quotes"`.
- **The toast wears the running editor's identity, without branching on the
  editor.** Both editors publish a `win32AppUserModelId` in the `product.json`
  beside `vscode.env.appRoot` (`Microsoft.VisualStudioCode` / `Anysphere.Cursor`),
  so the host reads it from whichever editor it is running in and the toast
  carries that editor's name and icon instead of PowerShell's. If it cannot be
  read, the script falls back to the PowerShell AppID, which is always
  registered and still shows.

On anything that is not Windows the host falls back to
`vscode.window.showInformationMessage`, so the toggle still does something
recognisable there.

## Staying quiet while you are already looking

The second setting asks: when the run ends, is the focused window the one Claude
is running in? If so, say nothing.

**Only the host can answer that.** The panel is an out-of-process iframe, and
`document.hasFocus()` answers a different question - it is about the *panel*,
so it is false whenever the caret is in the editor beside it, and a run that
ended while you were typing in a file would notify anyway. The host has the
real answer in one property: there is exactly one extension host per editor
window, and this is that window's, so `vscode.window.state.focused` *is* the
question, with nothing to match up by hand.

So the setting lives in the panel with the other one, travels on the message as
`skipWhenFocused`, and the host applies it. If focus cannot be read at all the
toast still goes out: a notification you did not need is a smaller failure than
a silence you were relying on.

It defaults **on** - a toast about a window you are already watching is noise -
and it does nothing unless the first setting is on, which is why its row is
disabled until then rather than left looking live. A switch you can move that
changes nothing is worse than one you cannot.

### Testing it needs two different harnesses

A lab window **reports itself focused**, which is the opposite of what its own
desktop object suggests: it is the only window on that desktop, so Windows gives
it the focus there and `state.focused` is `true` even though nothing of it is on
your screen. So the lab can only exercise the *quiet* branch, and it does that
conclusively by changing one bit and nothing else (see Verified below). The
branch that actually notifies is covered in Node, with `require` shadowed so
`vscode` and `child_process` are both stubs:
`node patches/panel-settings/tests/notify.test.js`.

The queue gate gets the same treatment for the cases that decide whether a
notification is lost for ever - a paused queue, a panel with no queue patch, a
queue whose methods throw - in `node patches/panel-settings/tests/queue-gate.test.js`.
The lab drives the real queue, but only for the ordinary case.

## Waiting for the whole queue

A queue of five prompts is one piece of work, not five, so the moment worth
announcing is the end of it. The third setting holds the notification back while
anything is still lined up behind the run that just ended.

Nothing is reached into to find that out. The prompt-queue patch publishes its
own surface on `window.__qAuto` - the same one `auto-followup` reads - and two
of its methods answer this exactly: `count()`, which already excludes parked
items, and `paused()`.

**A paused queue counts as nothing pending**, deliberately. A held queue will
not send anything, so the run that just ended really was the last one, and
treating it as "more to come" would mean never notifying at all. The same goes
for a panel where the queue patch is not installed, and for anything here
throwing: no queue, so nothing to wait for, so notify.

The count is trustworthy at that instant because of the queue's own 150ms flush
tick: this runs synchronously on the signal falling, and that tick cannot have
come round yet, so the next item is still in the queue when it is counted.

## Clicking the toast raises that window

The toast carries `activationType="protocol"` and a `launch` uri built by the
host: the **window's own workspace folder**, slash-terminated, under the
editor's own scheme (`vscode.env.uriScheme`, so Cursor gets `cursor://` without
the patch knowing which editor it is in).

Everything else was measured and ruled out first:

- **We cannot focus the window ourselves.** `SetForegroundWindow` from a
  background process returns **false** - Windows refuses a caller that did not
  receive the last input.
- **The click cannot run our code for free.** The BurntToast author's own
  write-up states PowerShell cannot subscribe to a toast's WinRT events before
  7.1 (this machine's toasts run on 5.1), and every published recipe registers a
  custom scheme pointing at a `.cmd` or a `powershell` - both of which **flash a
  console window**. The editor's scheme is already registered and the editor is
  a windowed app, so nothing flashes at all.
- **The trailing slash is load-bearing.** `getWindowOpenableFromProtocolUrl`
  passes `gotoLineMode`, so a protocol path is a *file* unless it ends in `/`
  (`if (e.charCodeAt(e.length-1) !== 47)`). Without it the click opens an editor
  tab; a folder path without it lands in an empty new window. With it, a folder
  already open in a window simply focuses that window.
- **The extension's own deep link cannot do this.** `vscode://Anthropic.claude-code/open?session=…`
  exists and reveals a conversation, but the source says extension authorities
  are handled *inside* whichever window the uri is routed to - so it cannot
  raise the window the run happened in. Measured: it raised nothing.

### One setting it needs

The first `file:` uri from an external app raises **"An external application
wants to open '…' in Code. Do you want to open this folder?"** - that is
`shouldBlockOpenable`. It is switched off by
`security.promptForLocalFileProtocolHandling: false`, which is exactly what the
dialog's own "don't ask again" checkbox sets. The patch does **not** write that
setting: it is the user's, and a patch has no business editing settings.json.

## Why it was quiet

This feature is silent by design, and that has one bad failure mode: when no
toast appears there is nothing to tell you whether it decided to stay quiet or
never saw the run at all. One run in testing raised no toast and could not be
explained afterwards, because nothing had been written down.

So every decision leaves a line in the queue patch's own in-panel ring, under
the tag `notify` (`Ctrl+Alt+L` opens the viewer; `window.__ccLogs()` reads it):

```
13:14:02.053 [notify] armed busy=false
13:14:21.716 [notify] edge run ended
13:14:21.716 [notify] sent Walnut
```

and instead of `sent`, one of `quiet the user pressed Stop` / `quiet
notifyOnFinish is off` / `quiet queue still has work` / `lost no host connection
to send on`. A missing `edge` line means the run was never seen at all, which is
a different fault from any of those.

The **focus gate is applied in the host**, so `sent` is not the same as shown
while it is on - the line says so (`sent Walnut (host stays quiet if this window
is focused)`), or a reader chasing a silence would read `sent` and conclude the
message was lost when the host had deliberately swallowed it.

If the queue patch is not installed there is nowhere to write and this is a
no-op: the feature must not depend on its own diagnostics.

## The setting itself

One global `localStorage` key, `ccSettings`, holding `{v:1, values:{…}}`. The
key carries **no session id on purpose**: every Claude panel in a window shares
one webview origin, so a key without a session id is read by all of them - which
is what a preference should be. Turn it on here and the next chat, and the panel
beside it, already have it.

Nothing touches `localStorage` at load; every access sits behind a function the
panel calls once it is up, because touching it while the bundle is still
evaluating breaks the Cursor webview.

A write that fails (a full quota) puts the switch straight back rather than
leaving it showing a state that will not survive a reload.

## Anchors

- **footer**: the footer component's signature (`{session:…,mode:…,
  availablePermissionModes:…`) through `("div",{className:X.spacer}),`. That one
  match yields the session variable, the minified jsx factory and the CSS-module
  map, so none of the three is hardcoded. On 2.1.278 the session variable is
  literally `$`, which is why the capture class is `[\w$]+` and not `\w+`.
- **host**: `Add-WebviewMessageHook`, which anchors on
  `X.webview.onDidReceiveMessage((m)=>{` plus the nearest `?.fromClient(m)`.

Both are resolved **before anything is written**. A gear with no host behind it
is worse than no gear: it is a control that does nothing and says nothing about
why.

## Verified

Against a pristine **2.1.278**, patched in a throwaway `.vscode/extensions` via
`apply.ps1 -ExtensionsDir`:

- `[ok] settings gear + notify-on-finish (session: $, css: A7)` and
  `[ok] panel settings CSS appended`.
- The call lands exactly where it should:
  `F("div",{className:A7.spacer}),__ccSettingsGear(F, $, A7),F(qH0,{mode:J,…`
  - after the spacer, before the permission-mode button.
- The host guard landed at **all three** chat surfaces.
- `node --check` clean on both `extension.js` and `webview/index.js`.
- The embedded base64 decodes **byte-identically** to `host/toast.ps1`.
- Running that decoded script exactly as the host spawns it
  (`powershell -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand`,
  values in the environment) raised a real toast under
  `Microsoft.VisualStudioCode` and returned 0, with a body of
  `a <script> & "quotes"` - the escaping holds.
- Invoking the patch a second time reports `[skip] already patched` and leaves
  all three files byte-identical.

Then **in a real editor** (`tools/lab`, VS Code 2.1.278, pristine -> patched ->
real reload), at a 420px panel and again at 300px:

- **The gear is its neighbours.** `26x26`, `padding: 0`, `border-radius: 5px`,
  `rgb(191,191,191)` - the same box and the same colour as the `/` command
  button measured beside it in the same row, against the `+`'s `rgb(140,140,140)`
  label grey. Its glyph bbox is `10 x 10`, between the `+`'s `10x10` and the
  `/`'s `11x11`. No `undefined` in its class list. It sits after the spacer and
  before the permission button, and the footer's height is unchanged.
- **It survives a narrow panel.** At 300px the row is over capacity and the
  spacer has collapsed to 0. Before `flex-shrink: 0` the gear was squeezed to
  `18x26` with its 26px glyph painting past its own box; after, it holds `26x26`
  and the squeeze lands on the model pill (`18 -> 15px`), which is what the app
  already ellipsizes.
- **The dialog is the app's.** Overlay `position: fixed`, `inset: 0`, covering
  `420x783` against a body of `420x783` - no clipping under the zoom patch's
  second coordinate system. Box `384x212` at `border-radius: 8px` on a `1px`
  `--app-widget-border`, background `#191a1b`, and the only `box-shadow` is the
  inset hairline - no drop shadow. `role="dialog"`, `aria-modal="true"`.
- **The rows and the switch are the measured ones.** Row `role="switch"`,
  `padding: 8px 12px`, `gap: 12px`; label 13px `rgb(191,191,191)`; description
  11px `rgb(140,140,140)`. Track `32x18` at `border-radius: 9px`, thumb `14x14`
  at 50%, transitions `background .15s` / `left .15s`. Off -> on moves the thumb
  `left: 2px -> 16px` and the track to `rgb(41,122,160)`, which is this theme's
  `--app-accent-color` - blue here, not the orange in another theme, which is
  exactly why the token is read rather than a colour written down.
- **At 300px the dialog still fits**: `265x270`, left 17, right 283 against a
  300px panel, no horizontal overflow. The label holds one 17px line and the
  description wraps to three - the stacked shape was adopted because the
  trailing-detail shape wrapped the *label* to three lines here instead.
- **It leaves nothing behind.** Closing removes the overlay, returns focus to
  `messageInput_cKsPxg`, and `document.querySelectorAll(".__qModalOv, .__ccSetGroup")`
  is empty. The setting survives the close.
- **The watcher is on the live store**: `busy.subscribe` present and the store
  carries the patch's marker.

And end to end, with the toggle on, read back out of the Windows Action Center
(`ToastNotificationManager.History.GetHistory`):

- A real prompt ("Reply with exactly one word: pong") ran to completion and a
  new toast appeared - **"Claude finished | Pong"**, the body being the session
  summary the panel sent - filed under the editor's own AppUserModelID.
- A second run was **interrupted with the Stop button** (`aria-label: "Stop"`,
  `busy` true at the click, `Interrupted` in the transcript afterwards) and
  **no toast was raised** - the history still held exactly the three from
  before. That is the `interrupt()` decoration doing its job.

And for the focus gate, in a live panel and in Node:

- **The dialog's two rows behave as a pair.** Fresh profile: the parent reads
  `aria-checked="false"`, enabled, opacity 1; the dependent reads `"true"` (its
  default) but `disabled`, opacity `0.5`, `cursor: default`. Clicking the
  dependent while locked changes nothing. Turning the parent on makes it
  `disabled: false`, opacity 1, `cursor: pointer` in the same pass; toggling it
  then writes `{"v":1,"values":{"notifyOnFinish":true,"skipWhenFocused":false}}`;
  turning the parent off locks and dims it again.
- **One bit, two outcomes, everything else identical.** With
  `skipWhenFocused: true`, a real run finished (`busy` false, summary
  `Pineapple`, `pineapple` in the transcript) and **no toast appeared** - the
  Action Center still held the same 20. With the bit flipped off and nothing
  else changed, the next finished run put **`Claude finished | Pineapple`** at
  the top of that list. That is the gate, and it also proves a lab window
  reports itself focused.
- **The queue gate, driven by the real queue.** Two prompts pushed straight onto
  it with `window.__qAuto.add(...)` (`count()` 2, `paused()` false), both ran to
  completion (`beta` in the transcript, queue back to 0). With the setting
  **on**, the Action Center gained **exactly one** toast for the two runs; with
  the one bit flipped **off** and two more items queued the same way, it gained
  **two**. Counted by how many toasts carry this session's own summary: 1 -> 2
  -> 4.
- **The click, end to end, on a real toast.** Five editor windows open,
  foreground on `llama.cpp-docvoice`. A toast was raised carrying
  `launch="vscode://file/C:/Users/…/vscode-cursor-claude-code-extension-patches/"`
  and clicked by hand. Foreground afterwards:
  **`vscode-cursor-claude-code-extension-patches`**, window count still five,
  nothing opened inside it, and no console appeared at any point. The same uri
  launched directly moved the foreground from `docvoice` to the same window.
  Before the trailing slash was added, the identical uri opened an **empty new
  window** instead; pointing it at a file opened that file as a tab.
- **The launch uri itself, in Node** (`tests/notify.test.js`): built from the
  window's folder, backslashes flipped, spaces percent-encoded, and always
  slash-terminated (`C:\proj\demo app` -> `vscode://file/C:/proj/demo%20app/`);
  a window with no folder gets an empty launch, so its toast simply does
  nothing when clicked.
- **The queue gate's edge cases, in Node** (`tests/queue-gate.test.js`, 9
  assertions): a **paused** queue notifies rather than waiting for ever, a panel
  with no queue patch notifies, a `count()` or `paused()` that throws notifies,
  a queue API with no `count()` notifies, and a build with no `paused()` still
  holds while items remain.
- **The trace, against both outcomes.** A notifying run logs
  `armed busy=false` / `edge run ended` / `sent <summary>` and the toast
  appears; with the focus gate on, the same run logs
  `sent <summary> (host stays quiet if this window is focused)` and **no** toast
  appears, which is the line that keeps a host-side suppression from reading as
  a lost message.
- **The one run that never explained itself.** During this work a single run
  raised no toast with both gates open. It was chased through six targeted
  reproductions - after a reload that restored the session, after a reload that
  came back to a fresh one, after New session, as the first run on a
  freshly-opened panel, with and without evals in between - and every one of
  them notified correctly. A direct probe toast proved Windows was not
  throttling. It stays unexplained rather than explained away; the trace above
  exists so the next occurrence is one look rather than another afternoon.
- **The dialog under the rest of the panel's conditions.** The shell's Tab trap
  counts **1** focusable setting row while the parent is off and **3** once it
  is on, so a locked row really does leave the Tab order. Under `direction: rtl`
  all three rows mirror - switch at the leading edge, `text-align: start`, the
  dialog still inside the panel. After a real `Developer: Reload Window` the
  stored values come back exactly and the three rows reflect them.
- **The notifying branch, in Node** (`patches/panel-settings/tests/notify.test.js`,
  `vscode` and `child_process` stubbed): on+focused stays quiet and still
  returns `true` so the message does not fall through to the app; on+unfocused
  notifies; off+focused notifies; a message with no flag at all notifies (an
  older panel against a newer host); an unreadable `vscode` fails open and
  notifies; the title and body still reach the toast; and a foreign message is
  neither claimed nor notified. 9 assertions, all passing.
