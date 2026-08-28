  /* ---------- Reading the file again, when asked ----------

     The saved-at line answers "when did this last change on disk", and it can
     only answer it as of the last time the panel was sent a list - which is when
     the dialog opened or something was saved. A file edited elsewhere while the
     dialog sat open did not show, and there is no honest way to make a timestamp
     that is only refreshed on an event look live.

     So the refresh is a button, and it says what it found. Three answers and no
     silent ones: the file changed and the form now holds what is on disk, the
     file changed and the form does not because there are unsaved edits in it, or
     nothing changed. A button that tells you nothing is the same as no button. */

  var pendingRefresh = null;   /* what the draft looked like when it was pressed */

  /* Identity by content, not by mtime: a save that rewrites the same bytes
     bumps the timestamp and has changed nothing, and "it changed" would then
     be a lie the first time it mattered.

     Every field the responder carries, rather than a list written out here.
     The list was written out here, first_question was not on it, and a change
     to the question a responder opens with read back as "no changes" - a
     silent wrong answer from the one control whose whole job is to answer.
     A hand-kept list of fields goes stale the first time the format grows.

     once and every are skipped because they are arrays of objects, and
     stringifying those compares nothing. They are covered exactly by
     onceText and everyText, which is what the file holds and the form edits. */
  var NOT_CONTENT = { id: 1, updated: 1, isNew: 1, once: 1, every: 1 };

  function shapeOf(r) {
    if (!r) return "";
    var keys = [], k;
    for (k in r) { if (!NOT_CONTENT[k]) keys.push(k); }
    keys.sort();
    var out = [];
    for (var i = 0; i < keys.length; i++) out.push(keys[i] + "=" + (r[keys[i]] || ""));
    return out.join(String.fromCharCode(1));
  }

  function sayRefresh(text, cls) {
    var n = document.querySelector(".__afRefreshSaid");
    if (!n) return;
    n.className = "__afRefreshSaid " + (cls || "");
    txt(n, text);
  }

  function askRefresh() {
    if (!draft) return;
    pendingRefresh = { id: draft.id, shape: shapeOf(draft), dirty: dirty, isNew: !!draft.isNew };
    sayRefresh("reading…", "");
    requestList();
  }

  /* Called when a list arrives. Only a list the button asked for is answered:
     one that came from a save of our own would otherwise report "no changes"
     onto a footer nobody was looking at. */
  function refreshArrived() {
    if (!pendingRefresh) return;
    var was = pendingRefresh;
    pendingRefresh = null;
    /* The dialog moved on while the list was in flight: answering now would be
       about a responder that is no longer on screen, and selectDraft would drag
       him back to it. */
    if (!draft || draft.id !== was.id) { sayRefresh("", ""); return; }
    var fresh = findResponder(was.id);
    if (!fresh) {
      /* Never written and never read is not the same as deleted, and the second
         reads as an accident. */
      sayRefresh(was.isNew ? "not saved yet - there is no file to read"
                           : "the file is gone", "__afRefreshWarn");
      return;
    }
    if (shapeOf(fresh) === was.shape) { sayRefresh("no changes", ""); return; }
    if (was.dirty) {
      /* Not clobbering an edit to show a fresher one: the edit is the only copy. */
      sayRefresh("changed on disk - your edits are unsaved, so the form is left alone",
                 "__afRefreshWarn");
      return;
    }
    selectDraft(was.id);
    renderDialog();
    sayRefresh("changed on disk - the form now shows the file", "__afRefreshOn");
  }
