# Subagent stream flags

**Type:** feature
**Touches:** `extension.js`
**Guard marker:** `/* SUBAGENTFLAGS */`

A subagent's messages already stream to the webview tagged with
`parent_tool_use_id`, but the CLI drops everything that is not a `tool_use` or a
`tool_result` unless the SDK client asked for the text:

```js
if (!forwardSubagentText && type !== "tool_use" && type !== "tool_result") continue;
```

`forwardSubagentText` and `agentProgressSummaries` are both `initialize` options.
The extension never sets the first and explicitly passes `void 0` for the second, so
today a subagent's prose and thinking never reach the panel and `task_progress`
carries no rolling `summary`. This patch turns both on.

It is display-only: the flags feed the SDK progress sink, not the parent model's
context and not the transcript. Turning `forwardSubagentText` on also stops the CLI
from forcing the subagent's thinking display to `"omitted"`.

The app's own **Agent map** (2.1.278+) is what shows it: an agent's detail pane
merges the live messages tagged with that agent's `parent_tool_use_id`, so without
`forwardSubagentText` it shows tool calls only, and `task_progress.summary` is
read into the store's `subagentTasks`, which stays empty without
`agentProgressSummaries`. Upstream still does not set either flag (checked on
2.1.284).

Anchors on the neighbouring key pair `agentProgressSummaries:void 0,promptSuggestions:void 0`,
because either key on its own also appears in the SDK client's `initialize()`
payload. The replacement expression lives in `js/flags.js`.

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`).
Idempotent and fail-safe: if its anchor isn't found it skips instead of corrupting
anything.
