  /* ---------- The plan ----------
     What is open and in what order, kept by the panel and handed back every turn.
     The graveyard next door records what is dead; this records what is live, and
     the two are opposite enough to live apart. */

  /* The plan: what is open, in the order it will be worked, item one first.

     Replaced rather than appended, which is the whole difference from the
     graveyard beside it. A responder that asks for five routes and then asks for
     something else next turn has produced a list nobody is working; the fix
     measured elsewhere is to keep the list, do item one, and refine the rest
     (Zhang et al., ReCAP, arXiv:2510.23822 - sequential prompting loses goal
     information, and re-injecting the plan is what recovers it).

     An empty return leaves the plan alone. A turn that says nothing about the
     plan has not cleared it, and the difference between those two matters more
     here than anywhere else in this file. */
  function readPlan() {
    try {
      var raw = localStorage.getItem(keyFor(PLAN_KEY));
      var v = raw ? JSON.parse(raw) : [];
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  function writePlan(items) {
    if (!items || !items.length) return;
    var keep = [];
    for (var i = 0; i < items.length && keep.length < MAX_PLAN; i++) {
      var s = String(items[i]).trim();
      if (s) keep.push(s);
    }
    if (!keep.length) return;
    try { localStorage.setItem(keyFor(PLAN_KEY), JSON.stringify(keep)); } catch (e) {}
  }

  function clearPlan() {
    try { localStorage.removeItem(keyFor(PLAN_KEY)); } catch (e) {}
  }

