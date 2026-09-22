/* What the toast says underneath the title: the conversation's own summary if
   it has one yet, else the folder it is running in, else nothing. A toast that
   only says "Claude finished" is useless with three windows open.

   `unwrap` because these fields are signals, but not uniformly across versions
   - reading .value off a plain string would quietly yield undefined and cost
   the toast its only identifying line. The backslash is built rather than
   written: this file is prepended to webview/index.js today, where a literal
   one would be fine, but every other injected script in this repo lives inside
   a template literal that would eat it, and the idiom should not differ per
   file. */
function __ccSettingsSessionLabel(session) {
    try {
        var summary = __ccSettingsUnwrap(session.summary);
        if (summary) return String(summary);
        var cwd = __ccSettingsUnwrap(session.cwd);
        if (cwd) {
            var parts = String(cwd).split(String.fromCharCode(92)).join("/").split("/").filter(Boolean);
            return parts.length ? parts[parts.length - 1] : "";
        }
    } catch (e) {}
    return "";
}

function __ccSettingsUnwrap(field) {
    if (field === null || field === undefined) return undefined;
    if (typeof field === "object" && "value" in field) return field.value;
    return field;
}
