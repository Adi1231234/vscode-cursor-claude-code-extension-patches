/* Samples of one responder's answer to one message - cached, and taken in
   parallel.
 *
 * A measurement here used to be forty-eight calls in a row, twenty-seven minutes,
 * for an edit that changed what three of them would say. Two facts make almost
 * all of that waiting unnecessary:
 *
 *   Nothing in the run depends on a model's reply. Which once-question fires on
 *   which moment is decided by the text of Claude's message and the ledger, both
 *   known before any call goes out - so the calls are independent and can go at
 *   once rather than in a queue.
 *
 *   The prompt is a pure function of (responder, message, question). An edit that
 *   does not change a moment's prompt cannot change its answer, so its earlier
 *   samples are still good and re-taking them measures nothing.
 *
 * Cache entries are keyed by the prompt itself, so no invalidation rule is needed
 * and none can be got wrong: a changed prompt is simply a different key. Samples
 * accumulate, so asking for four when two are on disk costs two calls.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const CACHE = join(tmpdir(), 'ccaf-samples', 'v1.json');
const LIMIT = 6;          /* twenty-four calls in a row once came back empty; this
                             is fast without being a stampede */

function load() {
  try { return JSON.parse(readFileSync(CACHE, 'utf8')); } catch { return {}; }
}
function save(db) {
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(db));
}
const keyOf = (prompt, model) => createHash('sha1').update(model + '\u0000' + prompt).digest('hex');

/* Runs `jobs` with at most LIMIT in flight. Order of results matches order in. */
async function pool(jobs, onDone) {
  const out = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(LIMIT, jobs.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= jobs.length) return;
      out[i] = await jobs[i]();
      if (onDone) onDone(out[i]);
    }
  }));
  return out;
}

/* One call, with a single backed-off retry. Twenty-four consecutive calls came
   back empty in one run and two of four sessions scored as moves never made, so a
   transient failure must cost a pause and not a measurement. */
async function once(R, resp, ctx, onRetry) {
  let r = await new Promise(res => R.run(resp, ctx, res));
  if (r.error) {
    if (onRetry) onRetry();
    await new Promise(z => setTimeout(z, 20000));
    r = await new Promise(res => R.run(resp, ctx, res));
  }
  return r;
}

/* items: [{ctx}], each sampled `runs` times. Returns [[result, ...], ...]. */
export async function sample(R, P, resp, items, runs, hooks = {}) {
  const db = load();
  const keys = items.map(it => keyOf(P.compose(resp, it.ctx), resp.model || ''));
  const have = keys.map(k => (db[k] || []).length);
  const jobs = [];
  items.forEach((it, i) => {
    for (let n = have[i]; n < runs; n++) jobs.push({ i, it });
  });
  const reused = keys.reduce((a, _, i) => a + Math.min(have[i], runs), 0);
  if (hooks.plan) hooks.plan({ total: items.length * runs, reused, calls: jobs.length });

  const done = await pool(jobs.map(j => () => once(R, resp, j.it.ctx, hooks.retry)), hooks.tick);
  done.forEach((r, n) => {
    const k = keys[jobs[n].i];
    /* A failure is not a sample. Caching one would make it permanent, and the
       next run would report it as a stable answer. */
    if (!r.error) (db[k] = db[k] || []).push(r);
    else if (hooks.fail) hooks.fail(String(r.error).slice(0, 200));
  });
  save(db);
  return keys.map(k => (db[k] || []).slice(0, runs));
}

export function cacheStats() {
  const db = load();
  const n = Object.keys(db).length;
  return { prompts: n, samples: Object.values(db).reduce((a, v) => a + v.length, 0),
           path: CACHE, exists: existsSync(CACHE) };
}
