# Locates the installed Claude Code extension and builds the shared context object
# that every patch receives. The context carries the three file paths plus the
# minified identifiers a few webview patches need (nonce, composer class names,
# image-preview hash) - detected once here so each patch stays single-purpose.

function Find-ClaudeExtension {
    param([string]$ExtensionsDir = "$env:USERPROFILE\.cursor\extensions")

    $latest = Get-ChildItem $ExtensionsDir -Directory -Filter "anthropic.claude-code-*" -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -First 1
    if (-not $latest) { throw "Claude Code extension not found under $ExtensionsDir" }

    $ctx = @{
        Dir                = $latest.FullName
        Name               = $latest.Name
        Js                 = Join-Path $latest.FullName "extension.js"
        WebJs              = Join-Path $latest.FullName "webview\index.js"
        Css                = Join-Path $latest.FullName "webview\index.css"
        # sensible fallbacks; overwritten by detection below
        Nonce              = 'B'
        MessageInputClass  = 'messageInput_cKsPxg'
        MentionMirrorClass = 'mentionMirror_cKsPxg'
        PvHash             = 'vRjSkQ'
        MsgHash            = '07S1Yg'
        MsgActionBtnClass  = 'actionButton_v2CdxQ'
        MdRootClass        = 'root_-a7MRw'
        ThinkingClass      = 'thinking_aHyQPQ'
        ToolUseClass       = 'toolUse_uq5aLg'
        ToolResultClass    = 'toolResult_uq5aLg'
    }

    if (Test-Path $ctx.Js) {
        $js = [System.IO.File]::ReadAllText($ctx.Js)
        if ($js -match 'nonce="\$\{([A-Za-z0-9_]+)\}"[^>]*src="\$\{[A-Za-z0-9_]+\}"[^>]*type="module"') { $ctx.Nonce = $matches[1] }
        if ($js -match 'messageInput:"(messageInput_[a-zA-Z0-9]+)"') { $ctx.MessageInputClass = $matches[1] }
        if ($js -match 'mentionMirror:"(mentionMirror_[a-zA-Z0-9]+)"') { $ctx.MentionMirrorClass = $matches[1] }
    }
    if (Test-Path $ctx.WebJs) {
        $wc = [System.IO.File]::ReadAllText($ctx.WebJs)
        if ($wc -match 'previewOverlay:"previewOverlay_([a-zA-Z0-9]+)"') { $ctx.PvHash = $matches[1] }
        # The chat CSS module: messagesContainer_<h> is unique, and message_<h> /
        # userMessageContainer_<h> share that same <h>.
        if ($wc -match 'messagesContainer:"messagesContainer_([a-zA-Z0-9]+)"') { $ctx.MsgHash = $matches[1] }
        # The round "Message actions" button beside a user bubble. Four modules
        # define an actionButton_<h>; anchor on subtleVisible_<h>, unique to this one.
        if ($wc -match 'subtleVisible:"subtleVisible_([a-zA-Z0-9]+)"') { $ctx.MsgActionBtnClass = "actionButton_$($matches[1])" }
        # Content-block kinds inside an assistant message: rendered markdown vs a
        # thinking block vs a tool call. Anchored on the unique sibling key of each
        # module ("root"/"thinking" alone are far too common to match on).
        if ($wc -match 'codeBlockWrapper:"codeBlockWrapper_([-a-zA-Z0-9]+)"') { $ctx.MdRootClass = "root_$($matches[1])" }
        if ($wc -match 'thinkingSummary:"thinkingSummary_([a-zA-Z0-9]+)"') { $ctx.ThinkingClass = "thinking_$($matches[1])" }
        if ($wc -match 'toolUse:"(toolUse_[a-zA-Z0-9]+)"') { $ctx.ToolUseClass = $matches[1] }
        if ($wc -match 'toolResult:"(toolResult_[a-zA-Z0-9]+)"') { $ctx.ToolResultClass = $matches[1] }
    }

    return $ctx
}
