
  /* BGTASKS host runtime - part 2: tailing a log by byte offset.

     One fs.watch per directory rather than per file: the file may not exist yet
     when a task opens, and a directory watcher reports both the creation and every
     later append. Push only - nothing here polls. */

  var openTasks = Object.create(null);   /* taskId -> {file, dir, offset, wv} */
  var watchers = Object.create(null);    /* dir -> {watcher, timer, refs} */

  /* A disposed webview reports the failure through the returned promise rather
     than by throwing, so a watcher would otherwise keep tailing into nothing. */
  function post(wv, msg, taskId) {
    var r;
    try { r = wv.postMessage(msg); } catch (e) { if (taskId) closeTask(taskId); return; }
    if (r && typeof r.then === "function") {
      r.then(function (ok) { if (ok === false && taskId) closeTask(taskId); },
             function () { if (taskId) closeTask(taskId); });
    }
  }

  /* Never hand back a split multi-byte character: leave its bytes for next time. */
  function wholeChars(buf) {
    var i = buf.length - 1, back = 0;
    while (i >= 0 && back < 4 && (buf[i] & 192) === 128) { i--; back++; }
    if (i < 0) return buf.length;
    var lead = buf[i], need = lead < 128 ? 1 : lead >= 240 ? 4 : lead >= 224 ? 3 : lead >= 192 ? 2 : 1;
    if (back + 1 >= need) return buf.length;
    return i;
  }

  function readFrom(file, offset, cap) {
    var st;
    try { st = fs.statSync(file); } catch (e) { return null; }
    if (!st.isFile()) return null;
    if (st.size < offset) offset = 0;            /* truncated or replaced */
    if (st.size === offset) return { text: "", next: offset, size: st.size, skipped: 0 };
    var start = offset, skipped = 0;
    if (st.size - start > cap) { skipped = st.size - start - cap; start = st.size - cap; }
    var buf = Buffer.alloc(st.size - start), fd;
    try {
      fd = fs.openSync(file, "r");
      var read = fs.readSync(fd, buf, 0, buf.length, start);
      buf = buf.subarray(0, read);
    } catch (e) {
      return { text: "", next: offset, size: st.size, skipped: 0 };   /* transient: not "gone" */
    } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch (e) {} }
    var usable = wholeChars(buf);
    return { text: buf.subarray(0, usable).toString("utf8"), next: start + usable, size: st.size, skipped: skipped };
  }

  function pump(taskId) {
    var t = openTasks[taskId];
    if (!t) return;
    var r = readFrom(t.file, t.offset, MAX_DELTA);
    if (r === null) {
      /* A task can be opened before its log exists (nothing flushed yet), so an
         absent file is only "gone" once it has been seen at least once. */
      if (t.seen) { post(t.wv, { type: "__ccbg", op: "gone", taskId: taskId }); closeTask(taskId); }
      return;
    }
    t.seen = true;
    if (r.text === "" && r.next === t.offset) return;
    t.offset = r.next;
    post(t.wv, { type: "__ccbg", op: "delta", taskId: taskId, text: r.text, skipped: r.skipped, size: r.size }, taskId);
  }

  function pumpDir(dir) {
    for (var id in openTasks) if (openTasks[id].dir === dir) pump(id);
  }

  function retainDir(dir) {
    var w = watchers[dir];
    if (w) { w.refs++; return; }
    var entry = { watcher: null, timer: null, refs: 1 };
    try {
      entry.watcher = fs.watch(dir, { persistent: false }, function () {
        if (entry.timer) return;
        entry.timer = setTimeout(function () { entry.timer = null; pumpDir(dir); }, COALESCE_MS);
        if (entry.timer.unref) entry.timer.unref();
      });
    } catch (e) { entry.watcher = null; }
    watchers[dir] = entry;
  }

  function releaseDir(dir) {
    var w = watchers[dir];
    if (!w) return;
    if (--w.refs > 0) return;
    if (w.timer) clearTimeout(w.timer);
    if (w.watcher) try { w.watcher.close(); } catch (e) {}
    delete watchers[dir];
  }

  function openTask(wv, taskId, file, fromStart) {
    if (!taskId || !file) return;
    closeTask(taskId);
    var dir = path.dirname(file);
    var size = 0;
    try { size = fs.statSync(file).size; } catch (e) {}
    var offset = fromStart ? 0 : Math.max(0, size - INITIAL_TAIL);
    openTasks[taskId] = { file: file, dir: dir, offset: offset, wv: wv, seen: size > 0 };
    retainDir(dir);
    post(wv, { type: "__ccbg", op: "reset", taskId: taskId }, taskId);
    pump(taskId);
  }

  function closeTask(taskId) {
    var t = openTasks[taskId];
    if (!t) return;
    delete openTasks[taskId];
    releaseDir(t.dir);
  }
