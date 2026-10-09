/* Patched against pristine, against budgets.json.

   Every limit is [ratio, slack]: the patched median may be at most
   pristine * ratio + slack; a null ratio makes slack an absolute cap on the
   patched value (for what pristine should never do at all, like work while
   idle). Medians over the rounds, so one noisy visit cannot fail a push.

   Selectors: a rule only the patched stylesheet has that got past Blink's
   ancestor filter on more than maxAttemptRatio of the elements of one full
   style pass over the open conversation (run.mjs, warmUp) is one Blink could
   not file under a class, id or tag, nor turn away by an ancestor it requires
   - it runs on every element of every style pass (CLAUDE.md: "CSS the browser
   can index"). A [class*="_"] slipped into the patched page was tried on 140%
   of them (pseudo-elements count too); the patches' own top out near 12%. */

const median = (xs) => {
  const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  return s.length ? s[(s.length - 1) >> 1] : null;
};

export function medians(visits) {
  const out = {};
  for (const v of visits) {
    for (const [phase, m] of Object.entries(v)) {
      for (const [k, x] of Object.entries(m)) {
        if (typeof x !== 'number') continue;
        ((out[phase] ||= {})[k] ||= []).push(x);
      }
    }
  }
  for (const p of Object.values(out)) for (const k of Object.keys(p)) p[k] = median(p[k]);
  return out;
}

export function checkPhases(pristine, patched, budgets) {
  const rows = [];
  for (const [phase, limits] of Object.entries(budgets.phases)) {
    for (const [metric, [ratio, slack]] of Object.entries(limits)) {
      const a = pristine[phase] && pristine[phase][metric];
      const b = patched[phase] && patched[phase][metric];
      if (b == null) continue;
      const limit = ratio == null ? slack : Math.round(a * ratio + slack);
      rows.push({ phase, metric, pristine: a, patched: b, limit, ok: b <= limit });
    }
  }
  return rows;
}

export function checkSelectors(pristineStats, patchedStats, elements, budget) {
  const known = new Set(pristineStats.map((s) => s.selector));
  const allow = new Set(budget.allow || []);
  const ours = patchedStats.filter((s) => !known.has(s.selector));
  /* Only the attempts that got past Blink's ancestor filter cost anything. */
  const rows = ours.map((s) => ({ selector: s.selector, ms: Math.round(s.us / 100) / 10, attempts: s.attempts,
    ratio: elements ? Math.round((100 * (s.attempts - (s.rejects || 0))) / elements) / 100 : 0 }));
  const bad = rows.filter((r) => r.ratio > budget.maxAttemptRatio && !allow.has(r.selector));
  const totalMs = (list) => Math.round(list.reduce((t, s) => t + s.us, 0) / 1000);
  return { rows: rows.sort((x, y) => y.ms - x.ms), bad, oursMs: totalMs(ours), allMs: totalMs(patchedStats) };
}

export function report({ version, missed, phases, selectors }) {
  const lines = [`extension ${version}${missed.length ? `  (apply.ps1: ${missed.length} miss/fail lines)` : ''}`, ''];
  const pad = (s, n) => String(s).padStart(n);
  lines.push(`${'phase'.padEnd(7)} ${'metric'.padEnd(14)} ${pad('pristine', 9)} ${pad('patched', 9)} ${pad('limit', 7)}`);
  for (const r of phases) {
    lines.push(`${r.phase.padEnd(7)} ${r.metric.padEnd(14)} ${pad(r.pristine ?? '-', 9)} ${pad(r.patched, 9)} ${pad(r.limit, 7)}  ${r.ok ? 'ok' : 'OVER'}`);
  }
  lines.push('', `patch selectors: ${selectors.oursMs} ms of ${selectors.allMs} ms selector matching in one full style pass over the conversation`);
  for (const r of selectors.rows.slice(0, 8)) lines.push(`  ${pad(r.ms, 6)} ms  tried on ${pad(Math.round(r.ratio * 100), 3)}%  ${r.selector.slice(0, 110)}`);
  for (const r of selectors.bad) lines.push(`  OVER  tried on every element: ${r.selector.slice(0, 120)}`);
  return lines.join('\n');
}
