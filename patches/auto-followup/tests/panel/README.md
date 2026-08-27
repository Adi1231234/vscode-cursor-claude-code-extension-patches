# Checks that need a real panel

The unit suites run against a DOM stub, which has no layout engine and no colours
- so nothing in them can answer "does this overlap", "is this readable" or "can a
keyboard reach it". These three are run against a live panel and each returns
numbers rather than an opinion.

```
node tools/lab/lab.mjs up                     # once
node tools/lab/lab.mjs eval <this dir>/contrast.js
node tools/lab/lab.mjs eval <this dir>/layout.js
node tools/lab/lab.mjs eval <this dir>/keyboard.js
node tools/lab/lab.mjs width 340              # then run layout.js again
```

`contrast.js` blends each element's colour and its inherited opacity over the
surface it actually paints on and reports the WCAG ratio. Four of eleven text
styles failed AA when it was first run, all of them from expressing hierarchy
with opacity instead of size, weight and colour.

`layout.js` reports every section box's rectangle, which pairs of them intersect,
and which have collapsed. It is written to compare rectangles rather than tops and
heights: an earlier version compared consecutive boxes and called the side-by-side
pair an overlap, which was the instrument being wrong and not the layout.

`keyboard.js` lists the tab stops and presses Enter on the first setting to check
the dropdown actually opens. A tab stop that does nothing is worse than none: it
looks reachable and is not.

Run `layout.js` at 340px as well as full width. The narrow panel is where this
dialog was unusable - the rail held its fixed width, the edit pane collapsed to
about sixty pixels, and every field was cut mid-word.

`english-only.js` walks every string the dialog renders - text nodes, field
values, placeholders, aria-labels and titles - and reports any that carry Hebrew.
The dialog's own chrome is English; the one thing it is expected to find is the
`when:` patterns inside a responder's own `## once` section, which are the user's
content and are Hebrew on purpose: without those unit words the framing question
matched none of twelve real turning points.

The first version of it read child text nodes only and reported zero. A textarea
whose value is set from JavaScript never updates its child text node, so the box
on screen was full of text the check could not see.
