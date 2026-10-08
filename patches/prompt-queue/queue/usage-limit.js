  /* ---------- Is the account refused by a usage limit? ----------
     A turn refused by a usage limit ends like any other: busy falls, and the
     queue sent its next item - which was refused at once, and so on until the
     queue was empty, every item spent on "You've hit your weekly limit".
     What the queue does about it is limit-resume.js; this is only the fact.

     The CLI says when the account is refused, in its own frame: a
     rate_limit_event, sent whenever the limit state changes - a 429 included,
     before the turn's result. The store reads it (the banner, the usage
     meter) but keeps none of it where a patch could see it, and the row it
     leaves in the transcript is only "<synthetic>" text. So the frame is read
     on its way in, through the store's own processIncomingMessage.

     'rejected' is refused, unless usage credits cover it - the app's own
     reading (overageStatus allowed or allowed_warning). The state is the
     latest frame, not a sticky flag: an 'allowed' one clears it, and so does
     the reset time passing, since no frame says that. A refusal whose own
     reset time has already gone (a clock off by a little) holds for a few
     minutes rather than not at all, or the queue would drain into it. */
  var limit = null;          /* { type, resetsAt (ms, 0 if unknown), until (ms) } */
  var limitTimer = 0;
  var LIMIT_RETRY_MS = 5 * 60000;

  var LIMIT_NAMES = {
    five_hour: "session limit", seven_day: "weekly limit",
    seven_day_opus: "weekly Opus limit", seven_day_sonnet: "weekly Sonnet limit",
    seven_day_overage_included: "Fable limit", overage: "usage credit limit"
  };

  /* A change of state redraws the badge - out of the app's own frame
     handling, which is where this runs - and a refusal lifted by a frame
     tells limit-resume.js, which may be waiting on it. */
  function noteRateLimit(m) {
    if (!m || m.type !== "rate_limit_event" || !m.rate_limit_info) return;
    var i = m.rate_limit_info, now = Date.now(), was = limitInForce(now);
    var covered = i.overageStatus === "allowed" || i.overageStatus === "allowed_warning";
    if (i.status === "rejected" && !covered) {
      var at = (+i.resetsAt || 0) * 1000;
      limit = { type: i.rateLimitType || "", resetsAt: at, until: at > now ? at : now + LIMIT_RETRY_MS };
    } else {
      limit = null;
    }
    if (was === limitInForce(now)) return;
    Promise.resolve().then(function () { if (was) limitLifted(); render(); });
  }

  function limitInForce(now) {
    return !!limit && limit.until > now;
  }

  function hookRateLimit() {
    try {
      if (decorateSession("processIncomingMessage", "__qLimitHook", noteRateLimit)) ccLog("queue", "usage-limit hook installed");
    } catch (e) {
      ccLog("queue", "usage-limit hook FAILED", e && e.message);
    }
  }

  function fmtDayClock(ms) {
    return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", " + fmtClock(ms);
  }

  /* "weekly limit, resets Oct 9, 9:00 PM" - the app's own words for it. */
  function limitText() {
    var name = LIMIT_NAMES[limit.type] || "usage limit";
    return limit.resetsAt ? name + ", resets " + fmtDayClock(limit.resetsAt) : name;
  }

  /* Says why the queue is waiting for as long as the limit holds, and goes
     away by itself when it lifts: one timer for that moment, re-armed by each
     render. Empty (hidden by :empty) when the queue is not waiting on it. */
  function buildLimitBadge() {
    var b = el("span", "__qLimitBadge"), now = Date.now(), r = resumeItem();
    if (limitTimer) { clearTimeout(limitTimer); limitTimer = 0; }
    if (!limitInForce(now) || !(paused || r)) return b;
    b.textContent = "usage limit";
    b.setAttribute("title", "Stopped by the " + limitText() + ". " + (!paused && r
      ? "Claude continues by itself at " + fmtClock(r.at) + " (Settings: Continue after the session limit)."
      : "The queue paused instead of sending into it. Press play to send anyway."));
    limitTimer = setTimeout(function () { limitTimer = 0; render(); }, Math.min(limit.until - now + 10, 2147483647));
    return b;
  }
