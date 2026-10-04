// How /queue lays out text, so one reply reads well wherever it is drawn.
//
// The editor panel renders a command's output as markdown inside a <p> styled
// `white-space: pre-wrap` (read off the live DOM in the lab). Two things follow:
//   - a plain newline already breaks the line there, and markdown's own hard
//     break (two trailing spaces) emits <br> PLUS that newline - every row came
//     out double-spaced;
//   - a blank line starts a new <p>, and those have no margin - the gap between
//     groups vanished.
// And `1.` / `-` at the start of a line become a list whose markers drift away
// from their text under the rtl patch. How the Claude app draws the same text
// is not documented, so nothing here may depend on markdown at all: no markup,
// no line that starts like a list or a heading, a plain newline between lines,
// and between groups a line holding only a no-break space - markdown does not
// count it as blank, so the paragraph (and the gap) survives, and as raw text
// it simply looks empty.

const GAP = '\n \n'

// Blocks of lines -> one reply: lines one under the other, blocks apart.
export function page(blocks) {
  return blocks
    .filter((b) => b && b.length)
    .map((b) => b.join('\n'))
    .join(GAP)
}
