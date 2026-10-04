/* The rule text.js lays out by, as a check the tests share: a reply must read
 * the same whether it is drawn as raw text or as markdown in a pre-wrap <p>
 * (the editor panel). Returns what breaks it, one line each; [] when nothing. */
export function plainProblems(text) {
  const out = []
  for (const line of text.split('\n')) {
    if (/\*\*|`|__/.test(line)) out.push('markdown markup, printed as-is where raw: ' + line)
    if (/^\s*([-*+#>]|\d+[.)])(\s|$)/.test(line)) out.push('a line markdown turns into a list or heading: ' + line)
    if (/<[A-Za-z]/.test(line)) out.push('an angle bracket the panel reads as a tag: ' + line)
    if (/ {2}$/.test(line)) out.push('a hard break, which pre-wrap shows as an extra line: ' + line)
    if (line === '') out.push('an empty line, which splits the paragraph and loses the gap in the panel')
  }
  return out
}
