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

    $xml = '<toast><visual><binding template="ToastGeneric"><text>' +
        $title + '</text><text>' + $body + '</text></binding></visual></toast>'

    $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
    $doc.LoadXml($xml)
    $notification = New-Object Windows.UI.Notifications.ToastNotification $doc
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($notification)
} catch {
}
