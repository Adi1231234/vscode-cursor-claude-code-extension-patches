# panel-background

Every Claude panel on the editor's background, wherever it is open, so all the
panels of a window look the same.

## The problem

Two panels in one window could have different backgrounds. With the Darcula
theme, one sat on `#2b2b2b` and the rest on `#3c3f41`.

The app picks the colour by how the panel was opened. The host writes
`window.IS_FULL_EDITOR` into the panel's page, and it is true only for a panel
opened by `claude-vscode.primaryEditor.open` ("Open in Primary Editor", also
what an `/open?session=` link runs). Checked on 2.1.295: a panel from "Open in
New Tab" and one in the side bar both get `false`. With the flag the root
carries `editorMode` and the message list `fullEditor`, and those two classes
move five surfaces from the side bar's colour to the editor's:

```css
.root.editorMode                { background-color: var(--app-secondary-background);
                                  --app-root-background: var(--app-secondary-background) }
.editorMode .header             { background-color: var(--app-secondary-background) }
.messagesContainer.fullEditor   { background-color: var(--app-secondary-background) }
.messageGradient.fullEditor     { background: linear-gradient(..., var(--app-secondary-background)) }
.fullEditor .message.stickyHeader { --sticky-bg: var(--app-secondary-background) }
```

`--app-secondary-background` is `--vscode-editor-background`. Without the flag
the same surfaces use `--app-primary-background` / `--app-header-background`,
both `--vscode-sideBar-background`.

## What the patch does

Applies those five declarations to every panel. **Every value is the app's
own**; the patch only drops the condition. Only colour moves: the editor-mode
rules also hide the header's title and push its buttons to the end, and those
are left alone, so a side-bar panel keeps its title.

Things the app paints on the side bar's colour in *both* modes (dialogs, the
login screen, tooltips) stay as they are, so a dialog looks the same in every
panel, the way it did in an editor-mode one.

CSS only, class names filled in from the bundle's CSS-module maps
(`{{root@editorMode}}`, `{{header@editorMode}}`, `{{message@stickyHeader}}` -
five modules define a `root`, several a `header` and a `message`). Each
selector has the weight of the app's base rule and this stylesheet comes after
it, so it wins on order alone, with no `!important`.

## Checked (lab, 2.1.295, Darcula colours, 2026-10-09)

A side-bar panel and a tab panel, both without the flag: root, header, message
list and gradient all computed `rgb(43, 43, 43)` (the editor), and
`rgb(60, 63, 65)` (the side bar) with the five rules switched off.
