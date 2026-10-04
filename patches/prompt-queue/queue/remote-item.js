  /* ---------- The phone's commands on one item (remote-api.js runs them) ----------
     Items are addressed the way the panel draws them: a lane item by the
     position number on its row ("3"), a scheduled one by its place in the
     Scheduled group, soonest first ("s1"). The phone's menu, which takes
     several taps to reach an action, addresses the item itself ("id:12"),
     because a number can point at another row by the time the tap lands -
     the one above it may have been sent meanwhile (the same reason the row
     menu is identity-based). For the same reason the menu says what it
     means rather than where it was: "up" is one up from where the item is
     now, and a skip says which way it goes. */
  function remoteItem(ref) {
    var s = String(ref || "").trim().toLowerCase();
    var byId = s.match(/^id:([0-9]+)$/);
    if (byId) return Q.filter(function (it) { return it.id === +byId[1]; })[0] || null;
    var m = s.match(/^(s?)([0-9]+)$/);
    if (!m) return null;
    var list = m[1] ? floatItems() : laneItems();
    return list[+m[2] - 1] || null;
  }

  /* A place in the order: a number, or top / up / down / bottom from where
     the item stands now. */
  function remotePlace(it, to) {
    var lane = laneItems(), at = lane.indexOf(it) + 1;
    if (to === "top") return 1;
    if (to === "bottom") return lane.length;
    if (to === "up") return Math.max(1, at - 1);
    if (to === "down") return Math.min(lane.length, at + 1);
    return +to || 1;
  }

  /* One item command: the row's own action, or why it cannot run. */
  function remoteOnItem(c, it) {
    if (c.op === "del") { removeItem(it); return ""; }
    if (c.op === "skip") {
      if (typeof c.off !== "boolean" || c.off !== !!it.off) toggleSkip(it);
      return "";
    }
    if (c.op === "when") return remoteSchedule(it, c);
    if (c.op === "edit") {
      var text = String(c.text || "").trim();
      if (!text) return "Give the new text after the number";
      it.text = text;
      render();
      return "";
    }
    if (c.op === "move") {
      if (floats(it)) return "A scheduled item has no place in the order to move to";
      moveItemTo(it, remotePlace(it, c.to));
      return "";
    }
    if (c.op === "now") {
      var why = sendBlocked(it);
      if (why) return why;
      sendNow(it);
      return "";
    }
    return "Unknown command";
  }
