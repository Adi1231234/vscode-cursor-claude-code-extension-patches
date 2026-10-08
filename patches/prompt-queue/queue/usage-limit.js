  /* ---------- A usage limit parks the queue ----------
     A turn refused by a usage limit ends like any other: busy falls, and the
     queue sent its next item - which was refused at once, and so on until the
     queue was empty, every item spent on "You've hit your weekly limit".

     The CLI says when the account is refused, in its own frame: a
     rate_limit_event, sent whenever the limit state changes - a 429 included,
     before the turn's result. The store reads it (the banner, the usage
     meter) but keeps none of it where a patch could see it, and the row it
     leaves in the transcript is only "<synthetic>" text. So the frame is read
     on its way in, through the store's own processIncomingMessage.

     'rejected' is refused, unless usage credits cover it - the app's own
     reading (overageStatus allowed or allowed_warning). The state is the
     latest frame, not a sticky flag: an 'allowed' one clears it, and a reset
     time that has passed clears it too, since no frame says so. */
  var limit = null;          /* { type, resetsAt (s) } while refused, else null */
  var limitTimer = 0;

  var LIMIT_NAMES = {
    five_hour: "session limit", seven_day: "weekly limit",
    seven_day_opus: "weekly Opus limit", seven_day_sonnet: "weekly Sonnet limit",
    seven_day_overage_included: "Fable limit", overage: "usage credit limit"
  };

  /* A change while paused redraws the badge - out of the app's own frame
     handling, which is where this runs. */
  function noteRateLimit(m) {
    if (!m || m.type !== "rate_limit_event" || !m.rate_limit_info) return;
    var i = m.rate_limit_info, was = limitInForce(Date.now());
    var covered = i.overageStatus === "allowed" || i.overageStatus === "allowed_warning";
    limit = i.status === "rejected" && !covered
      ? { type: i.rateLimitType || "", resetsAt: +i.resetsAt || 0 } : null;
    if (paused && was !== limitInForce(Date.now())) Promise.resolve().then(render);
  }

  function limitInForce(now) {
    return !!limit && (!limit.resetsAt || limit.resetsAt * 1000 > now);
  }

  function hookRateLimit() {
    try {
      if (decorateSession("processIncomingMessage", "__qLimitHook", noteRateLimit)) ccLog("queue", "usage-limit hook installed");
    } catch (e) {
      ccLog("queue", "usage-limit hook FAILED", e && e.message);
    }
  }

  /* "weekly limit, resets Oct 9, 9:00 PM" - the app's own words for it. */
  function limitText() {
    var name = LIMIT_NAMES[limit.type] || "usage limit", ms = limit.resetsAt * 1000;
    if (!ms) return name;
    var day = new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return name + ", resets " + day + ", " + fmtClock(ms);
  }

  /* On the run's end, like a stop from elsewhere (stop-pause.js): the busy
     callback is a microtask and the pass that would flush is a timer, so the
     queue is parked before it can send. An empty queue has nothing to park,
     and the first value after a switch of conversation is no run's end. */
  function watchUsageLimit() {
    var S = window.__ccSession;
    if (watchUsageLimit.on || !S) return;
    watchUsageLimit.on = 1;
    S.on("busy", function (busy, store, initial) {
      if (busy || initial || paused || !Q.length || !limitInForce(Date.now())) return;
      paused = true;
      render();
      ccLog("queue", "the turn ended on a usage limit (" + limitText() + ") - queue parked", "n=" + Q.length);
    });
  }

  /* Says why the queue is paused for as long as the limit holds, and goes
     away by itself at the reset: one timer for that moment, re-armed by each
     render. Empty (hidden by :empty) otherwise. */
  function buildLimitBadge() {
    var b = el("span", "__qLimitBadge"), now = Date.now();
    if (limitTimer) { clearTimeout(limitTimer); limitTimer = 0; }
    if (!paused || !limitInForce(now)) return b;
    b.textContent = "usage limit";
    b.setAttribute("title", "Paused on the " + limitText() + ". " +
      "The queue stopped instead of sending into it. Press play to send anyway.");
    if (limit.resetsAt) {
      limitTimer = setTimeout(function () { limitTimer = 0; render(); },
        Math.min(limit.resetsAt * 1000 - now + 10, 2147483647));
    }
    return b;
  }
