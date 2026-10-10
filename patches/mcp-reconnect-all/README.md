# mcp-reconnect-all

A **Reconnect all** button in the MCP servers dialog (`/mcp`), above the filter
field. One click reconnects every server the dialog lists, instead of opening
each one and pressing its own Reconnect.

## Why

When a server's process restarts (a shared MCP host restarting, a machine
waking up), every open chat loses it. The CLI retries a dropped connection for
a while and then gives up for good, and a chat that started while the server
was down tries three times in six seconds and never again. From then on the
dialog shows the server as **Failed**, and the only way back was its own
Reconnect button, one server at a time.

An automatic reconnect before every send was tried first and turned down: the
user wants to decide when it happens. So this is a button, and it does exactly
what the dialog's own per-server Reconnect does.

## What it does

- Takes the servers the dialog itself offers a reconnect for: **Reconnect** on a
  connected or failed one, **Check connection** on a claude.ai one that needs
  auth. A disabled server, one still pending, and any other server waiting for
  auth (it only offers Authenticate) are left alone.
- Calls the same session operation, `reconnectMcpServer`, for all of them at
  once, through the same busy state: the button reads "Reconnecting all…" and
  is disabled meanwhile.
- Reports through the dialog's own message line: "Reconnected all N servers",
  or, when some fail, how many made it and which did not.
- Reads the list again afterwards, the way the per-server handler does.

## How it is anchored

Everything the button needs is read off the dialog's own Reconnect handler
(`action:"reconnect"` ... `reconnectMcpServer` ... `Reconnected to`): the call
that clears the message line, the busy setter, the session operations, the
success and error setters and the list refresh. The busy state's name comes from
the `useState(null)` that declares that setter. The button is inserted right
before the filter field (`placeholder:"Filter servers…"`), under the same
condition (servers loaded, none selected), and wears the dialog's own
`actionButton` class, found from the empty-state line next to it. Any of these
missing is a `[miss]` and nothing is written.

## Look

Measured in the lab against the dialog's own **Add server** button: same
width, height, font, colours, border and radius, and the same 8px gap
(`--app-spacing-medium`) that the dialog leaves above Add server.
