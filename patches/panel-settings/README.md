# panel-settings

A **gear in the input footer row** that opens a **settings dialog**, and the
first setting to live in it: **raise a Windows notification when a run
finishes**.

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
