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
     the reset time passing, since no frame says that.

     Whether a given RUN was refused is a separate fact, and it is the one the
     queue acts on: the run's own result says so (is_error with
     api_error_status 429). Measured with a real 429 from a local proxy on
     2.1.292: rejected frame, then the synthetic "You've hit your session
     limit" row, then that result, then busy falls. The state alone is not
     enough - the CLI only sends a frame when the state CHANGES, so a second
     refusal at the same reset sends none, and a local command (/queue from
     the phone) is a run that ends while the state still says refused. */
  var limit = null;          /* { type, resetsAt (ms, 0 if unknown), until (ms) } */
  var runRefused = false;    /* this run's result was a 429 */
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
  function noteFrame(m) {
    if (m && m.type === "result") runRefused = !!(m.is_error && m.api_error_status === 429);
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

  /* A refused run whose refusal the state does not cover - no frame came, or
     the reset it named has gone (a server running late) - holds for a few
     minutes rather than not at all, keeping whatever type was last named. */
  function limitForRefusal(now) {
    if (limitInForce(now)) return limit;
    limit = { type: limit ? limit.type : "", resetsAt: 0, until: now + LIMIT_RETRY_MS };
    return limit;
  }

  function hookRateLimit() {
    try {
      if (decorateSession("processIncomingMessage", "__qLimitHook", noteFrame)) ccLog("queue", "usage-limit hook installed");
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

  /* What happens next, in the badge's tooltip: the continue sends by itself,
     waits for Play with the person's own items, or there is none to wait on. */
  function limitNext(r) {
    if (r && !paused) return "Claude continues by itself at " + fmtClock(r.at) + " (Settings: Continue after the session limit).";
    if (r) return "Claude continues at " + fmtClock(r.at) + ", once you press play.";
    return "The queue paused instead of sending into it. Press play to send anyway.";
  }

  /* Says why the queue is waiting for as long as the limit holds, and goes
     away by itself when it lifts: one timer for that moment, re-armed by each
     render. Empty (hidden by :empty) when the queue is not waiting on it. */
  function buildLimitBadge() {
    var b = el("span", "__qLimitBadge"), now = Date.now(), r = resumeItem();
    if (limitTimer) { clearTimeout(limitTimer); limitTimer = 0; }
    if (!limitInForce(now) || !(paused || r)) return b;
    b.textContent = "usage limit";
    b.setAttribute("title", "Stopped by the " + limitText() + ". " + limitNext(r));
    limitTimer = setTimeout(function () { limitTimer = 0; render(); }, Math.min(limit.until - now + 10, 2147483647));
    return b;
  }
