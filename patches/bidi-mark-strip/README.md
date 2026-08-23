# Bidi mark strip

**Type:** bug fix
**Touches:** `webview/index.js`
**Guard marker:** `/* BIDIMARKS */`

An answer that contained an invisible directional mark rendered it as **printable
escape text** in the middle of the sentence - the mark was shown instead of being
applied, and it broke the very line it was meant to fix.

## Root cause (proven)

`webview/index.js` ships a Trojan-Source mitigation. In 2.1.241 it reads:

```js
var rpt=/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
function uc(e){
  if(typeof e==="string")
    return e.replace(rpt,(t)=>`\\u${t.codePointAt(0).toString(16).toUpperCase().padStart(4,"0")}`);
  ...
}
```

`uc()` recurses over every string the panel renders - message content, permission
dialogs, subagent task descriptions, action labels - and rewrites each bidi control
character into its own escape text. The character is therefore never applied by the
bidi algorithm; it is displayed. Confirmed by grepping the bundle: `uc` has 16 call
sites, among them `e.message.content...map((o)=>new jp(uc(...)))`.

The mitigation is right to neutralise these characters (CVE-2021-42574 - source that
reads differently than it executes). Rendering them as visible text is the part that
misfires here: nothing in a chat panel needs to *see* a stray mark, it just needs the
mark not to take effect.

## The fix: drop the marks, keep escaping the reordering characters

The set the mitigation covers is not uniform:

- **Implicit marks** - ALM `U+061C`, LRM `U+200E`, RLM `U+200F`. Each one only
  supplies a direction for the neutral characters beside it (UAX #9 treats them as
  ordinary strong characters). One mark cannot reorder a run, and cannot hide a
  second reading of the text.
- **Explicit formatting** - embeddings and overrides `U+202A`-`U+202E`, isolates
  `U+2066`-`U+2069`. These open a scope that lays a whole run out backwards, and they
  are the actual Trojan-Source vector.

So the patch inserts one `.replace()` **before** the mitigation that removes the three
implicit marks, and leaves the app's own class - whatever it holds in this version -
to escape everything else. The mitigation's regex is re-emitted from the capture
group rather than restated, so a version that adds a character to it keeps that
character escaped.

Result: a stray mark disappears silently, an override or isolate is still surfaced as
escape text, and no text is ever reordered by injected content.

## Why not just let the marks through

Because the panel's base direction is not a per-character question. It is decided
once per message by [`patches/message-bidi`](../message-bidi/README.md), following
the W3C guidance quoted in that README. A mark that survived would be a second,
competing direction mechanism operating one character at a time - the per-block
heuristic failure that patch exists to remove.

## Anchor

`var <rx>=/[...]/g;function <fn>(<arg>){if(typeof <arg>==="string")return
<arg>.replace(<rx>,` with a lookahead for `codePointAt` in the callback. No literal
`\u` sequence appears in the anchor, so a change to the character class does not move
it - and the class does change: 2.1.227 covers `U+200E` onwards, 2.1.241 added
`U+061C`. Matches exactly once in both. A version without the mitigation reports
`[miss]` and is left untouched.
