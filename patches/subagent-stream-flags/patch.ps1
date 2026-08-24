# Subagent stream flags. The extension builds the SDK query options without
# `forwardSubagentText`, and with `agentProgressSummaries` explicitly undefined, so
# the CLI forwards only a subagent's tool calls and results (never its text or
# thinking) and never sends a rolling summary in `task_progress`. Both are plain
# init-config options; turning them on is display-only - they feed the SDK progress
# sink, not the parent's context and not the transcript.
# The replacement expression lives in js/flags.js; this file only anchors and writes.
function Invoke-Patch {
    param($Ctx)
    $js = Read-Text $Ctx.Js
    if ($js -match '/\* SUBAGENTFLAGS \*/') { Write-Skip 'already patched'; return }

    # Anchor on the pair of neighbouring keys rather than on one of them: either key
    # alone appears again in the SDK client's initialize() payload.
    $anchor = 'agentProgressSummaries:void 0,promptSuggestions:void 0'
    if (-not $js.Contains($anchor)) { Write-Miss 'SDK query options anchor not found'; return }

    $flags = (Get-InjectedJs (Join-Path $PSScriptRoot 'js/flags.js')).Trim()
    Write-Text $Ctx.Js ("/* SUBAGENTFLAGS */`n" + $js.Replace($anchor, $flags))
    Write-Ok 'subagent text + progress summaries forwarded'
}
