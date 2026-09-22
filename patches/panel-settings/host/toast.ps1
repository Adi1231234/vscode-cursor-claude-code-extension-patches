# Raise one Windows toast, then exit.
#
# Every value this needs arrives in the environment (CC_TOAST_APPID / _TITLE /
# _BODY), so nothing is ever interpolated into this script and no title a user
# types can break its quoting or inject anything. The host side spawns it with
# -EncodedCommand, i.e. this whole file base64'd at patch time - which is also
# why it must stay self-contained and take no arguments.
#
# It is deliberately silent: a notification that fails is not worth a dialog, so
# every failure path ends in the same empty catch. The caller does not wait for
# it and never reads its output.

$ErrorActionPreference = 'Stop'

# Only the three XML metacharacters need escaping inside a <text> node; quotes
# are safe because no attribute carries user text.
function ConvertTo-ToastText([string]$s) {
    if (-not $s) { return '' }
    $s.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;')
}

# One shortcut per folder, kept outside the extension so an editor update does
# not take it with it, and reused rather than rewritten: a toast can sit in the
# Action Center for hours, and the file it points at has to still be there.
# Returns the path, or nothing if it could not be written.
function Get-FocusShortcut([string]$folder, [string]$exe) {
    try {
        if (-not (Test-Path -LiteralPath $folder)) { return }
        if (-not (Test-Path -LiteralPath $exe)) { return }
        $dir = Join-Path $env:LOCALAPPDATA 'claude-code-patches\focus'
        if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

        # Name it after the folder so two windows never share one shortcut: the
        # leaf for a human reading the directory, a hash of the full path
        # because two checkouts can share a leaf.
        $sha = [System.Security.Cryptography.SHA256]::Create()
        $hash = ([System.BitConverter]::ToString($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($folder.ToLowerInvariant()))) -replace '-', '').Substring(0, 12)
        $leaf = [System.IO.Path]::GetFileName($folder.TrimEnd([char]92, [char]47))
        $safe = ($leaf -replace '[^A-Za-z0-9._-]', '_')
        $path = Join-Path $dir ($safe + '-' + $hash + '.lnk')

        $shell = New-Object -ComObject WScript.Shell
        $sc = $shell.CreateShortcut($path)
        if ($sc.TargetPath -ne $exe -or $sc.Arguments -ne ('"' + $folder + '"')) {
            $sc.TargetPath = $exe
            $sc.Arguments = '"' + $folder + '"'
            $sc.WorkingDirectory = $folder
            $sc.Description = 'Focus the editor window for ' + $folder
            $sc.Save()
        }
        return $path
    } catch {
    }
}

try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null

    # The editor's own AppUserModelID, so the toast carries the editor's name and
    # icon instead of PowerShell's. The host reads it out of the running editor's
    # product.json; if it could not, fall back to the PowerShell AppID, which is
    # always registered and still shows the toast.
    $appId = $env:CC_TOAST_APPID
    if (-not $appId) {
        $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
    }

    $title = ConvertTo-ToastText $env:CC_TOAST_TITLE
    $body = ConvertTo-ToastText $env:CC_TOAST_BODY

    # Clicking the toast runs a shortcut whose target is the editor and whose
    # argument is this window's folder, which makes the editor focus the window
    # already holding it. The shortcut exists so that nothing has to parse a uri
    # at click time, and because the editor is a windowed app there is no
    # console anywhere in the chain. A window with no folder gets no shortcut
    # and a toast that does nothing when clicked.
    $launch = ''
    if ($env:CC_TOAST_FOLDER -and $env:CC_TOAST_EXE) {
        $lnk = Get-FocusShortcut $env:CC_TOAST_FOLDER $env:CC_TOAST_EXE
        if ($lnk) {
            $uri = 'file:///' + $lnk.Replace([char]92, [char]47)
            $launch = ' activationType="protocol" launch="' + (ConvertTo-ToastText $uri).Replace('"', '&quot;') + '"'
        }
    }

    $xml = '<toast' + $launch + '><visual><binding template="ToastGeneric"><text>' +
        $title + '</text><text>' + $body + '</text></binding></visual></toast>'

    $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
    $doc.LoadXml($xml)
    $notification = New-Object Windows.UI.Notifications.ToastNotification $doc
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($notification)
} catch {
}
