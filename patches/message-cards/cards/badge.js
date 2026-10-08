
  /* ---------- The badge: how long a command took, or how it exited ---------- */
  function fmt(ms) {
    var s = ms / 1000;
    if (!(s >= 0)) return "";
    if (s < 10) return (Math.round(s * 10) / 10) + "s";
    if (s < 60) return Math.round(s) + "s";
    return Math.floor(s / 60) + "m " + Math.round(s % 60) + "s";
  }

  /* The store's own rows, and where each uuid sits in them - built once a pass. */
  function indexStore() {
    var s = globalThis.__ccStore && globalThis.__ccStore();
    var list = s && s.messages && Array.isArray(s.messages.value) ? s.messages.value : [];
    var at = {};
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].uuid) at[list[i].uuid] = i;
    return { list: list, at: at };
  }

  function blocks(m) {
    return (m && m.content || []).map(function (x) { return x && x.content; }).filter(Boolean);
  }

  /* The result answering a call is a later row whose block names its id; the
     time between the two rows' createdAt is how long the command took
     (measured on the store's own rows, 2.1.292). */
  function resultOf(list, i, id) {
    for (var j = i + 1; j < list.length && j < i + 200; j++) {
      var bs = blocks(list[j]);
      for (var k = 0; k < bs.length; k++) {
        if (bs[k].type === "tool_result" && bs[k].tool_use_id === id) return { msg: list[j], block: bs[k] };
      }
    }
    return null;
  }

  function resultText(b) {
    var c = b && b.content;
    if (typeof c === "string") return c;
    return Array.isArray(c) ? c.map(function (x) { return (x && x.text) || ""; }).join(NL) : "";
  }

  /* "12s", "exit 1", "failed", "running" - or nothing, when the store cannot
     say (then the badge shows its status glyph alone). */
  function badgeText(row, idx) {
    if (row.classList.contains(RUNNING)) return "running";
    var i = idx.at[row.getAttribute("data-bookmark-uuid")];
    if (i == null) return "";
    var call = blocks(idx.list[i]).filter(function (b) { return b.type === "tool_use"; })[0];
    var res = call && resultOf(idx.list, i, call.id);
    if (!res) return "";
    if (res.block.is_error || row.classList.contains(FAILED)) {
      var e = /Exit code ([0-9]+)/.exec(resultText(res.block));
      return e ? "exit " + e[1] : "failed";
    }
    return fmt(res.msg.createdAt - idx.list[i].createdAt);
  }

  /* Writes only - the word was read before the pass wrote anything. */
  function ensureBadge(row, text) {
    var b = row.querySelector(":scope > .__ccBadge");
    if (!b) {
      b = document.createElement("span");
      b.className = "__ccBadge";
      window.__ccDom.own(b);
      row.appendChild(b);
    }
    window.__ccDom.setText(b, text);
  }
