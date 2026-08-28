#!/usr/bin/env node
/* Records one arm of the with/without comparison, and prints the pair.
 *
 * It measures nothing and runs nothing. The seconds come from the rig and are
 * typed in; this only holds them, because until something held them the two arms
 * could not be put beside each other at all. See patches/auto-followup/CONTROL.md
 * for what an arm is and what has to be held fixed between them.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const FILE = path.join(
  process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
  'responders', '_control.json');

const read = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; } };
const write = (o) => {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(o, null, 2), 'utf8');
};

const argv = process.argv.slice(2);
const cmd = argv[0], arm = (argv[1] || '').toUpperCase();
const flag = (name) => {
  const i = argv.indexOf('--' + name);
  return i < 0 ? null : argv[i + 1];
};
const num = (name) => { const v = flag(name); return v == null ? null : Number(v); };

const usage = () => {
  console.log('  node tools/control-arm.mjs start A --base 53.8 --turns 20 [--note "..."]');
  console.log('  node tools/control-arm.mjs end   A --after 51.9 [--exchanges N --rig-runs N --machine-min N]');
  console.log('  node tools/control-arm.mjs show');
  process.exit(1);
};

const all = read();

if (cmd === 'start') {
  if (arm !== 'A' && arm !== 'B') usage();
  const base = num('base'), turns = num('turns');
  if (!(base > 0) || !(turns > 0)) usage();
  all[arm] = { base, turns, note: flag('note') || '', startedAt: new Date().toISOString() };
  write(all);
  console.log(`arm ${arm} started: base ${base} s, ${turns} turns`);
} else if (cmd === 'end') {
  if (!all[arm]) { console.log(`arm ${arm} was never started`); process.exit(1); }
  const after = num('after');
  if (!(after > 0)) usage();
  Object.assign(all[arm], {
    after,
    exchanges: num('exchanges'), rigRuns: num('rig-runs'), machineMin: num('machine-min'),
    endedAt: new Date().toISOString()
  });
  write(all);
  console.log(`arm ${arm} ended: ${all[arm].base} -> ${after} s`);
} else if (cmd === 'show') {
  const A = all.A, B = all.B;
  const line = (k, a) => {
    if (!a) return `  ${k}: not run`;
    const hrs = a.endedAt
      ? ((Date.parse(a.endedAt) - Date.parse(a.startedAt)) / 3.6e6).toFixed(1) + ' h'
      : 'open';
    const removed = a.after ? (a.base - a.after).toFixed(2) + ' s removed' : 'no end recorded';
    return `  ${k}: ${a.base} -> ${a.after ?? '?'}   ${removed}   ${hrs}` +
           `   ${a.exchanges ?? '?'} exchanges, ${a.rigRuns ?? '?'} rig runs,` +
           ` ${a.machineMin ?? '?'} machine min${a.note ? '   (' + a.note + ')' : ''}`;
  };
  console.log('\n' + line('A  responder ', A));
  console.log(line('B  control   ', B));
  if (A && B && A.after && B.after) {
    const dA = A.base - A.after, dB = B.base - B.after;
    console.log(`\n  difference: ${(dA - dB).toFixed(2)} s in favour of ${dA >= dB ? 'A' : 'B'}`);
    if (A.base !== B.base) console.log('  WARNING: the arms did not start from the same number');
    if (A.turns !== B.turns) console.log('  WARNING: the arms were not given the same budget');
    /* The comparison Huang et al. ask for is per unit of cost, not per arm. */
    if (A.machineMin && B.machineMin)
      console.log(`  per machine minute: A ${(dA / A.machineMin).toFixed(3)} s, ` +
                  `B ${(dB / B.machineMin).toFixed(3)} s`);
  } else {
    console.log('\n  both arms have to finish before there is anything to compare');
  }
  console.log('\n  ' + FILE + '\n');
} else usage();
