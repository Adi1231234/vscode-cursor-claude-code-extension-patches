
  /* BGTASKS host runtime - part 2: tailing a log by byte offset.

     One fs.watch per directory rather than per file: the file may not exist yet
     when a task opens, and a directory watcher reports its creation at once.

     It does NOT report the appends, and that is the whole reason there is a timer
     here. On Windows fs.watch is ReadDirectoryChangesW, and the size and last-write
     time of a file only reach the directory entry when the writing handle is
     closed - which for a running task is when the task ends. Measured directly: a
     process appending once a second for eight seconds with its handle held grew the
     file every second (14 -> 70 bytes) while both a directory watcher AND a file
     watcher fired exactly once, at 8.4s, on close. In the panel that looked like a
     log frozen at "line 9" for twenty seconds and then jumping straight to the
     finished output - a live log that was not live.

     So this is the one place that polls, deliberately, because the push mechanism
     genuinely does not deliver here. It costs one statSync per open task per tick,
     and only while a task is actually open: readFrom returns immediately when the
     size has not moved, and the timer does not exist when nothing is being read. */

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

  /* One timer for every open task, not one each, and none at all when none are. */
  var ticker = null;

  function syncTicker() {
    var any = false;
    for (var id in openTasks) { any = true; break; }
    if (any && !ticker) {
      ticker = setInterval(function () { for (var t in openTasks) pump(t); }, POLL_MS);
      if (ticker.unref) ticker.unref();
    } else if (!any && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
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
    syncTicker();
    post(wv, { type: "__ccbg", op: "reset", taskId: taskId }, taskId);
    pump(taskId);
  }

  function closeTask(taskId) {
    var t = openTasks[taskId];
    if (!t) return;
    delete openTasks[taskId];
    releaseDir(t.dir);
    syncTicker();
  }
