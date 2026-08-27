# Tests

Plain node, no framework and no install. Run them from anywhere:

    node patches/auto-followup/tests/host.test.js     # 21 checks
    node patches/auto-followup/tests/loop.test.js     # 36 checks
    node tools/check-injected.mjs auto-followup       # the template-literal rule

**`host.test.js`** exercises the responder folder against a temporary
`CLAUDE_CONFIG_DIR`: seeding, the parser and its round trip, unknown front-matter
keys surviving a save, a file with no `##` headings, and that an id which could
escape the folder is refused rather than sanitised. It also drives `extract` and
`shape` over the outputs a model really produces - fenced JSON, prose then JSON,
pure prose, broken JSON, an empty stop string, junk in the claims array, and
braces inside the message.

**`loop.test.js`** runs the panel script itself against `dom-stubs.js` and drives
the whole loop: that it does not answer a reply which predates arming, that one
turn produces one run and never two, that the context carries what the responder's
`context` setting says and nothing more, that `autosend: false` holds the first
message until it is approved, that the user's queue and the user's pause each
block it, that `max_turns` and a stop reason and the stop button all end it, and
that a result addressed to another panel is ignored.

## One thing the stubs get right on purpose

`__ccStore()` returns the **same object** every call, because the real one caches
what it finds in the fiber tree. The stop button works by decorating that object's
`interrupt()`, so a stub that returned a fresh object each time made the stop test
fail - and the failure looked exactly like the feature being broken. It was the
stub. If a test here fails, check the stub against reality before the code.
