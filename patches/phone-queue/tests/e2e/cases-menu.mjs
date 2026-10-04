/* The first screen, Help, Add, the item list and the item screen - every
 * button on them, and every Back. Each case returns [ok, what] pairs. */
import { L, item, later, same, texts } from './labels.mjs';

const MAIN = (n) => [L.PLAY, L.ADD, L.ITEMS(n), L.HELP];

export const MENU = [
  { name: 'first screen: buttons, Help, typed shortcuts', run: async (t) => {
    await t.reset([{ text: 'a' }, { text: 'b' }]);
    const r = await t.flow('/queue', [L.HELP, L.SHORTCUTS]);
    return [[same(r.screens[0].labels, MAIN(2)), 'first screen is ' + r.screens[0].labels],
      [r.screens[0].question.includes('1 · a'), 'the top lists the items'],
      [same(r.screens[1].labels, [L.SHORTCUTS, L.BACK]), 'Help has its shortcuts and Back'],
      [r.out.includes('/queue add'), 'the shortcuts are printed']];
  } },
  { name: 'Help, Back, then a message typed on the first screen', run: async (t) => {
    await t.reset([{ text: 'a' }]);
    const r = await t.flow('/queue', [L.HELP, L.BACK, 'typed after back']);
    const q = await t.queue();
    return [[same(r.screens[2].labels, MAIN(1)), 'Back from Help is the first screen'],
      [same(texts(q.lane), ['a', 'typed after back']), 'the typed text was added: ' + texts(q.lane)]];
  } },
  { name: 'Pause on a running, empty queue', run: async (t) => {
    await t.reset([]);
    await t.play();
    const r = await t.flow('/queue', [L.PAUSE]);
    const q = await t.queue();
    return [[same(r.screens[0].labels, [L.PAUSE, L.ADD, L.HELP]), 'no Items on an empty queue: ' + r.screens[0].labels],
      [q.paused === true, 'paused'], [r.out.includes('Paused'), 'the reply says so']];
  } },
  { name: 'Play sends the next message', run: async (t) => {
    await t.reset([{ text: 'Reply with exactly one word: pong' }]);
    const r = await t.flow('/queue', [L.PLAY]);
    // While the command runs the panel counts as busy, so the queue sends the
    // moment it ends - wait for that, not for the reply.
    const left = await t.until('__e2e.queue().lane.length === 0', 20000);
    const q = await t.queue();
    await t.idle();
    return [[q.paused === false, 'running'], [left === true, 'the message left the queue'],
      [r.out.includes('Running'), 'the reply says so']];
  } },
  { name: 'Add: In its turn, Continue', run: async (t) => {
    await t.reset([]);
    const r = await t.flow('/queue', [L.ADD, L.TURN, L.CONT]);
    const q = await t.queue();
    return [[same(r.screens[1].labels, [L.TURN, L.M10, L.H1, L.BACK]), 'When has its three and Back'],
      [same(r.screens[2].labels, [L.CONT, L.BACK]), 'the text screen has Continue and Back'],
      [q.lane[0] && q.lane[0].text === 'Continue' && q.lane[0].mode === 'queue', 'Continue added in its turn']];
  } },
  { name: 'Add: In 10 minutes, typed text', run: async (t) => {
    await t.reset([]);
    await t.flow('/queue', [L.ADD, L.M10, 'run the tests']);
    const it = (await t.queue()).lane[0] || {};
    return [[it.mode === 'timer' && it.hold === true, 'a holding timer'],
      [Math.abs(it.at - Date.now() - 600000) < 60000, 'about 10 minutes from now'], [it.text === 'run the tests', 'its text']];
  } },
  { name: 'Add: In 1 hour', run: async (t) => {
    await t.reset([]);
    await t.flow('/queue', [L.ADD, L.H1, 'deploy']);
    const it = (await t.queue()).lane[0] || {};
    return [[it.mode === 'timer' && it.dur === 3600000, 'an hour timer']];
  } },
  { name: 'Add: a typed clock time, a typed "tomorrow 9:00", a typed 45m', run: async (t) => {
    await t.reset([]);
    const { hhmm, at } = later();
    await t.flow('/queue', [L.ADD, hhmm, 'check mail']);
    await t.flow('/queue', [L.ADD, 'tomorrow 9:00', 'standup']);
    await t.flow('/queue', [L.ADD, '45m', 'stretch']);
    const q = await t.queue();
    const nine = new Date(); nine.setDate(nine.getDate() + 1); nine.setHours(9, 0, 0, 0);
    const own = q.scheduled, s = (x) => own.find((i) => i.text === x) || {};
    return [[s('check mail').mode === 'time' && Math.abs(s('check mail').at - at) < 60000, 'the clock time'],
      [s('standup').at === nine.getTime(), 'tomorrow 9:00'],
      [(q.lane.find((i) => i.text === 'stretch') || {}).dur === 2700000, '45 minutes']];
  } },
  { name: 'Add: a time that is not one asks again, and a typed "in 20 minutes" works', run: async (t) => {
    await t.reset([]);
    const r = await t.flow('/queue', [L.ADD, 'soonish', 'in 20 minutes', 'stretch']);
    const it = (await t.queue()).lane[0] || {};
    return [[r.screens[2].question.includes('Not a time: soonish'), 'it says why, on the same screen'],
      [it.mode === 'timer' && it.dur === 1200000 && it.text === 'stretch', 'then the typed length is taken'],
      [r.out.includes('✅ Added: ⏱ in 20m · stretch'), 'and the reply names it: ' + r.out.split('\n')[0]]];
  } },
  { name: 'first screen: a typed number opens that item', run: async (t) => {
    await t.reset([{ text: 'a' }, { text: 'b' }]);
    const r = await t.flow('/queue', ['2', L.BACK, 'z']);
    return [[r.screens[1].question.startsWith('2 · b'), 'typing 2 opened item 2'],
      [same(texts((await t.queue()).lane), ['a', 'b', 'z']), 'no message "2" was added']];
  } },
  { name: 'Add: Back on When, Back on the text', run: async (t) => {
    await t.reset([]);
    const r = await t.flow('/queue', [L.ADD, L.BACK, L.ADD, L.M10, L.BACK, L.TURN, 'final']);
    const q = await t.queue();
    return [[same(r.screens[2].labels, [L.PLAY, L.ADD, L.HELP]), 'Back on When is the first screen'],
      [r.screens[5].question.startsWith('When'), 'Back on the text is When again'],
      [same(texts(q.lane), ['final']) && q.lane[0].mode === 'queue', 'only the last choice was added']];
  } },
  { name: 'Items: three fit with Back', run: async (t) => {
    await t.reset([{ text: 'a' }, { text: 'b' }, { text: 'c' }]);
    const r = await t.flow('/queue', [L.ITEMS(3), L.BACK, 'z']);
    return [[same(r.screens[1].labels, [item(1, 'a'), item(2, 'b'), item(3, 'c'), L.BACK]), 'all three and Back'],
      [same(r.screens[2].labels, MAIN(3)), 'Back is the first screen']];
  } },
  { name: 'Items: pages of two, Next, Back page by page', run: async (t) => {
    await t.reset(['a', 'b', 'c', 'd', 'e'].map((text) => ({ text })));
    const r = await t.flow('/queue', [L.ITEMS(5), L.NEXT, L.NEXT, L.BACK, L.BACK, L.BACK, 'y']);
    const s = r.screens.map((x) => x.labels);
    return [[same(s[1], [item(1, 'a'), item(2, 'b'), L.NEXT, L.BACK]), 'page 1'],
      [same(s[2], [item(3, 'c'), item(4, 'd'), L.NEXT, L.BACK]), 'page 2'],
      [same(s[3], [item(5, 'e'), L.BACK]), 'page 3'],
      [same(s[4], s[2]) && same(s[5], s[1]), 'Back goes page 2, then page 1'],
      [same(s[6], MAIN(5)), 'then the first screen']];
  } },
  { name: 'Items: a typed number, and one that does not exist', run: async (t) => {
    await t.reset(['a', 'b', 'c', 'd'].map((text) => ({ text })));
    const r = await t.flow('/queue', [L.ITEMS(4), '4', L.BACK, L.BACK, 'w']);
    const r2 = await t.flow('/queue', [L.ITEMS(5), '9']);
    return [[r.screens[2].question.startsWith('4 · d'), 'typing 4 opens item 4'],
      [r2.out.includes('no item 9'), 'typing 9 says there is none']];
  } },
];
