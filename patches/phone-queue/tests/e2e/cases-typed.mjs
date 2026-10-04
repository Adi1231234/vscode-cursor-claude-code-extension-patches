/* Every typed shortcut, from the composer - the path that also works while
 * Claude is busy. Each case returns [ok, what] pairs. */
import { later, same, texts } from './labels.mjs';

const abc = (n) => 'abcd'.slice(0, n).split('').map((text) => ({ text }));
const typed = (t, cmd) => t.flow(cmd, []);

export const TYPED = [
  { name: 'typed: list, help, ?, a typo', run: async (t) => {
    await t.reset(abc(2));
    const list = (await typed(t, '/queue list')).out;
    const help = (await typed(t, '/queue help')).out;
    const q = (await typed(t, '/queue ?')).out;
    const typo = (await typed(t, '/queue pasue')).out;
    return [[list.includes('1 · a') && list.includes('/queue help'), 'list prints the items and the hint'],
      [help.includes('typed shortcuts'), 'help'], [q.includes('typed shortcuts'), '? is help'],
      [typo.includes('Unknown') && typo.includes('/queue help'), 'a typo is refused with the hint']];
  } },
  { name: 'typed: pause and play', run: async (t) => {
    await t.reset([]);
    await typed(t, '/queue play');
    const playing = !(await t.queue()).paused;
    await typed(t, '/queue pause');
    return [[playing, 'play'], [(await t.queue()).paused, 'pause']];
  } },
  { name: 'typed: add, in, at with hold and nohold, after', run: async (t) => {
    await t.reset([]);
    const { hhmm } = later();
    await typed(t, '/queue add hello there');
    await typed(t, '/queue add in 10m run tests');
    await typed(t, '/queue add at ' + hhmm + ' nohold own time');
    await typed(t, '/queue add at ' + hhmm + ' hold holds');
    await typed(t, '/queue add after 5m afterwards');
    const q = await t.queue(), by = (x) => [...q.lane, ...q.scheduled].find((i) => i.text === x) || {};
    return [[by('hello there').mode === 'queue', 'plain'], [by('run tests').mode === 'timer', 'in 10m'],
      [q.scheduled.some((i) => i.text === 'own time'), 'at, nohold: its own time'],
      [by('holds').mode === 'time' && by('holds').hold, 'at, hold: in the order'],
      [by('afterwards').mode === 'after' && by('afterwards').dur === 300000, 'after 5m']];
  } },
  { name: 'typed: del, skip, move, edit, del s1, an unknown number', run: async (t) => {
    const { at } = later();
    await t.reset([...abc(4), { text: 'later', mode: 'time', at }]);
    await typed(t, '/queue del 2');
    await typed(t, '/queue skip 1');
    await typed(t, '/queue move 3 1');
    await typed(t, '/queue edit 2 a2');
    await typed(t, '/queue del s1');
    const nine = (await typed(t, '/queue del 9')).out;
    const two = (await typed(t, '/queue del 1 2')).out;
    const q = await t.queue();
    return [[same(texts(q.lane), ['d', 'a2', 'c']), 'del 2, move 3 1, edit 2: ' + texts(q.lane)],
      [q.lane[1].off, 'skip 1 skipped a'], [q.scheduled.length === 0, 'del s1'], [nine.includes('no item 9'), 'del 9 is refused'],
      [/one item at a time/i.test(two), 'del of two items is refused, not done to the first']];
  } },
  { name: 'typed: the reply names the item, and a time is read whole', run: async (t) => {
    await t.reset(abc(2));
    const del = (await typed(t, '/queue del 1')).out;
    const { hhmm } = later();
    await typed(t, '/queue add at ' + hhmm + ' tomorrow nohold standup');
    const it = (await t.queue()).scheduled[0] || {};
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    return [[del.startsWith('queue: ✅ Deleted: a') || del.includes('✅ Deleted: a'), 'del names what it deleted: ' + del.split('\n')[0]],
      [it.text === 'standup' && new Date(it.at).toDateString() === tomorrow.toDateString(), '"tomorrow" after the time: ' + it.text]];
  } },
  { name: 'typed: now sends that one', run: async (t) => {
    await t.reset([{ text: 'first' }, { text: 'Reply with exactly one word: typed' }]);
    await typed(t, '/queue now 2');
    const q = await t.queue();
    await t.idle();
    return [[same(texts(q.lane), ['first']), 'only item 2 left the queue']];
  } },
];
