  /* ---------- Saved queues: the store ----------
     A queue you built once and want again in the next chat. Unlike the live
     queue (ccq:<sessionId>, one per conversation) this is ONE list shared by
     every session in the webview - that is the whole point: you save it here
     and pick it up there. Key "ccq:saved", shape:
       {v:1, list:[{id, name, ts, items:[{t, o?, md?, du?}]}]}

     What a saved item keeps, and why it is not simply the queue item:
       - text and the skipped flag (o) - a template of prompts, some of them
         parked on purpose so they are loaded but not sent.
       - a RELATIVE schedule only ('timer' / 'after' plus its duration). An
         at-time is a commitment to one wall-clock moment; replaying it next
         week is meaningless, so it is saved as a plain queue item.
       - no attachments. A data URL would sit in localStorage forever for a
         file the next chat has no reason to still want, and the queue's own
         save already falls back to text-only when that quota bites. */
  var SKEY = "ccq:saved";
  var SMAX = 60;

  function savedRead() {
    try {
      var d = JSON.parse(localStorage.getItem(SKEY) || "null");
      return (d && d.list && d.list.length) ? d.list : [];
    } catch (e) { ccLog("saved", "read ERR", e.message); return []; }
  }

  function savedWrite(list) {
    try { localStorage.setItem(SKEY, JSON.stringify({ v: 1, list: list.slice(0, SMAX) })); return true; }
    catch (e) { ccLog("saved", "write ERR", e.message); return false; }
  }

  function savedItemOf(it) {
    var o = { t: it.text || "" };
    if (it.off) o.o = 1;
    if (it.mode === "timer" || it.mode === "after") { o.md = it.mode; o.du = it.dur || 0; }
    return o;
  }

  /* The reverse, and the draft shape the editor works on. A saved 'timer'
     restores exactly as a restart restores one - inactive, "Restart Nm", one
     click to run it from now - because its origin was never saved and a loaded
     queue is held anyway; a due timer is the one thing that fires THROUGH the
     hold (see firstSendableIndex), so arming it here would send behind the
     user's back. 'after' needs no origin: it arms itself by position. */
  function queueItemOf(o) {
    var it = {
      id: ++idc, text: o.t || "", off: !!o.o, files: [],
      mode: "queue", at: null, start: null, dur: null, missed: false, rearm: false, auto: false
    };
    if (o.md === "timer") { it.mode = "timer"; it.dur = o.du || 0; it.rearm = true; }
    else if (o.md === "after") { it.mode = "after"; it.dur = o.du || 0; }
    return it;
  }

  function savedAdd(name, items) {
    var l = savedRead();
    l.unshift({
      id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name, ts: Date.now(), items: items
    });
    ccLog("saved", "add", name, "n=" + items.length);
    return savedWrite(l);
  }

  function savedPut(id, name, items) {
    var l = savedRead(), i;
    for (i = 0; i < l.length; i++) {
      if (l[i].id === id) { l[i].name = name; l[i].items = items; l[i].ts = Date.now(); return savedWrite(l); }
    }
    return false;
  }

  function savedDrop(id) {
    return savedWrite(savedRead().filter(function (e) { return e.id !== id; }));
  }

  /* Loading is a bulk explicit add, so it parks the queue exactly as one typed
     add does (commitComposerToQueue's idle hold): N prompts must never start
     firing the moment they land - the user releases them with the play button. */
  function loadSavedInto(en) {
    var items = en.items || [];
    items.forEach(function (o) { Q.push(queueItemOf(o)); });
    if (items.length && !isBusy()) paused = true;
    ccLog("saved", "load", en.name, "n=" + items.length);
    render();
    return items.length;
  }

  function countLabel(n) { return n + (n === 1 ? " message" : " messages"); }

  /* A name to start from: the first prompt, on one line, trimmed short. */
  function suggestSavedName() {
    var t = (Q.length ? Q[0].text : "") || "";
    t = t.split(NL).join(" ").replace(/[ ]+/g, " ").trim();
    return t.length > 42 ? t.slice(0, 42).trim() + "..." : t;
  }
