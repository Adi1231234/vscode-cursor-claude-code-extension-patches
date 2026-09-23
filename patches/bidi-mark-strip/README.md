# Bidi mark strip

**Type:** bug fix
**Touches:** `webview/index.js`
**Guard marker:** `/* BIDIMARKS */`

An answer that contained an invisible directional mark rendered it as **printable
escape text** in the middle of the sentence - the mark was shown instead of being
applied, and it broke the very line it was meant to fix.

## Root cause (proven)

`webview/index.js` ships a Trojan-Source mitigation. Up to 2.1.268 it read:

```js
var rpt=/[؜‎‏‪-‮⁦-⁩]/g;
function uc(e){
  if(typeof e==="string")
    return e.replace(rpt,(t)=>`\\u${t.codePointAt(0).toString(16).toUpperCase().padStart(4,"0")}`);
  ...
}
```

`uc()` recurses over every string the panel renders - message content, permission
dialogs, subagent task descriptions, action labels - and rewrites each bidi control
character into its own escape text. The character is therefore never applied by the
bidi algorithm; it is displayed. On 2.1.280 it has **64 call sites**, among them the
message path itself:

```js
typeof $.message.content==="string"?[new q$({type:"text",text:q5($.message.content)})]:...
```

The mitigation is right to neutralise these characters (CVE-2021-42574 - source that
reads differently than it executes). Rendering them as visible text is the part that
misfires here: nothing in a chat panel needs to *see* a stray mark, it just needs the
mark not to take effect.

The escaping is the panel's, not the CLI's: the transcript for a `‎`-printing
message holds the real characters. The line from the report reads, in `<sid>.jsonl`,
`05E9 05DC 0020 200E 0024 0032 0039 ... 200E` - two genuine U+200E either side of
`$29.99`. `extension.js` carries its own copy of the same sanitiser, but with two
call sites only, neither of them on the message path (it guards
`updatedPermissions`).

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

Only the two ends of the site are matched:

```
var <rx>=/[...]/g;  <up to 200 chars>  <recv>.replace(<rx>,(<c>)=> ... codePointAt
```

the character class declared as a `var`, and the one `.replace()` that consumes it
with an escaping callback. No literal `\u` sequence appears, so a change to the
character class does not move it - and the class does change: 2.1.227 covers
`U+200E` onwards, 2.1.241 added `U+061C`.

**What sits between the two ends is captured, not matched.** That is the lesson from
the first version of this patch, which spelled the middle out
(`function <fn>(<arg>){if(typeof <arg>==="string")return <arg>.replace(<rx>,`) and
went silent for eleven releases when it changed. Bisected against the published
win32-x64 bundles: **2.1.268 is the last version with the recursive body, 2.1.269
replaced it with a generic deep-map helper plus a callback**, and the receiver in
the `.replace()` stopped being the function's own parameter:

```js
var iP0=/[؜‎‏‪-‮⁦-⁩]/g;
function q5($){return qD($,(J)=>J.replace(iP0,(Z)=>{return`\\u${...}`}))}
function qD($,J,Z=!1){if(typeof $==="string")return J($);if(Array.isArray($))...}
```

Nothing announced it. `apply.ps1` printed `[miss] bidi sanitiser not found` in a
sixty-line run and the panel simply went back to printing `‎`.

Verified as exactly one match, parse-clean and behaviourally correct on 2.1.227,
241, 250, 257, 260, 263, 265, 266, 267, 268, 269, 270, 272, 274, 277, 278 and 280 -
both sides of the refactor. A version without the mitigation, or with more than one
match, reports `[miss]` and is left untouched.
