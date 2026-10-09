/* A trace of one phase, and what the page's main thread did in it.

   Recorded on the browser target, so it holds every process; the page's own
   renderer is the one its tab's main frame lives in. What
   is counted, all on that renderer's main thread:

     busyMs / longestTaskMs  top-level tasks - what the person waits on
     styleMs, layoutMs, paintMs, scriptMs  self time by kind
     styleElements           elements whose style was recomputed
     forced / forcedInline   style or layout a script forced (it carries a JS
                             stack); inline = from a <script> in the page, which
                             is where the patches' scripts live
     selectors               with { selectors: true }: Blink's per-selector
                             stats (attempts, matches, time), summed

   Only the categories DevTools' own Performance panel reads: a task is its
   RunTask, style is its Recalculate Style. `toplevel`, `blink` and
   `v8.execute` were three quarters of every trace - every task of every
   process, and Blink's inner steps - and the time spent recording and
   handing them over was most of a visit; no number above needs them (measured:
   the counters came out identical, busyMs within 1%). */
import { connect } from '../cdp/client.mjs';

const BASE = ['devtools.timeline', 'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.stack', '__metadata'];

export async function startTrace(browserWs, { selectors = false, extra = [] } = {}) {
  const c = await connect(browserWs);
  const events = [];
  let done;
  const finished = new Promise((r) => (done = r));
  c.on('Tracing.dataCollected', (p) => { for (const e of p.value) events.push(e); });
  c.on('Tracing.tracingComplete', () => done());
  const cats = [...BASE, ...(selectors ? ['disabled-by-default-blink.debug'] : []), ...extra];
  await c.send('Tracing.start', { transferMode: 'ReportEvents',
    traceConfig: { recordMode: 'recordAsMuchAsPossible', includedCategories: cats, excludedCategories: ['*'] } });
  return async () => { await c.send('Tracing.end'); await finished; c.close(); return events; };
}

const KIND = [
  ['style', /UpdateLayoutTree|RecalcStyle|recalcStyle|StyleEngine|StyleInvalidator|ForFontUpdates/],
  ['layout', /Layout|ShapeText/],
  ['paint', /Paint|Layerize|Composit|CullRect|Raster|PrePaint/],
  ['script', /FunctionCall|EvaluateScript|V8\.|TimerFire|FireAnimationFrame|EventDispatch|GC|RunMicrotasks/],
];
const kindOf = (name) => (KIND.find(([, rx]) => rx.test(name)) || ['other'])[0];

/* The renderer the page lives in: the process whose events name the tab's main
   frame (a tab's target id is its main frame's id). Not by url - the tab just
   closed can still be alive under the same one - and not by
   TracingStartedInBrowser, which this Chrome leaves empty. */
function pagePid(events, frameId) {
  const votes = new Map();
  for (const e of events) {
    const d = e.args && (e.args.data || e.args.beginData);
    if (d && d.frame === frameId) votes.set(e.pid, (votes.get(e.pid) || 0) + 1);
  }
  const pid = [...votes].sort((a, b) => b[1] - a[1]).map(([p]) => p)[0];
  if (pid === undefined) throw new Error(`no event in the trace names the tab's frame ${frameId}`);
  return pid;
}

/* pid: the renderer, once known (a quiet phase may hold no event naming the
   frame - the process is the one the page loaded into). */
function pageThread(events, frameId, pid = pagePid(events, frameId)) {
  const main = events.find((e) => e.ph === 'M' && e.name === 'thread_name' && e.args.name === 'CrRendererMain' && e.pid === pid);
  if (!main) throw new Error('the page renderer was not in the trace');
  return { pid: main.pid, tid: main.tid };
}

export function summarize(events, frameId, knownPid) {
  const { pid, tid } = pageThread(events, frameId, knownPid);
  const mine = events.filter((e) => e.pid === pid && e.tid === tid && e.ph === 'X' && e.dur != null)
    .sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const out = { busyMs: 0, longestTaskMs: 0, styleMs: 0, layoutMs: 0, paintMs: 0, scriptMs: 0, otherMs: 0,
    styleElements: 0, recalcs: 0, layouts: 0, forced: 0, forcedInline: 0 };
  let end = -1;
  const stack = [];
  for (const e of mine) {
    if (e.name === 'RunTask') {
      const s = Math.max(e.ts, end), f = e.ts + e.dur;
      if (f > s) { out.busyMs += (f - s) / 1000; end = f; }
      out.longestTaskMs = Math.max(out.longestTaskMs, e.dur / 1000);
    }
    while (stack.length && stack[stack.length - 1].ts + stack[stack.length - 1].dur <= e.ts) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) out[kindOf(parent.name) + 'Ms'] -= e.dur / 1000;
    out[kindOf(e.name) + 'Ms'] += e.dur / 1000;
    stack.push(e);
    if (e.name === 'UpdateLayoutTree') { out.recalcs++; out.styleElements += (e.args.elementCount ?? (e.args.data || {}).elementCount) || 0; }
    if (e.name === 'Layout') out.layouts++;
    if (e.name === 'Layout' || e.name === 'UpdateLayoutTree') {
      const st = (e.args.beginData && e.args.beginData.stackTrace) || (e.args.data && e.args.data.stackTrace);
      if (st && st.length) {
        out.forced++;
        if (String(st[0].url).split('?')[0].endsWith('/panel.html')) out.forcedInline++;
      }
    }
  }
  for (const k of Object.keys(out)) if (k.endsWith('Ms')) out[k] = Math.round(out[k]);
  return Object.defineProperty(out, 'pid', { value: pid, enumerable: false });
}

/* Blink's selector stats over a trace: [{ selector, us, attempts, rejects,
   matches }]. rejects are the attempts Blink's ancestor filter turned away
   before matching - a rule whose required ancestor is absent costs nothing. */
export function selectorStats(events) {
  const agg = new Map();
  for (const e of events) {
    const st = e.args && (e.args.selector_stats || (e.args.data && e.args.data.selector_stats));
    for (const s of (st && st.selector_timings) || []) {
      const a = agg.get(s.selector) || { selector: s.selector, us: 0, attempts: 0, rejects: 0, matches: 0 };
      a.us += s['elapsed (us)'] ?? s.elapsed ?? 0;
      a.attempts += s.match_attempts || 0;
      a.rejects += s.fast_reject_count || 0;
      a.matches += s.match_count || 0;
      agg.set(s.selector, a);
    }
  }
  return [...agg.values()].sort((a, b) => b.us - a.us);
}
