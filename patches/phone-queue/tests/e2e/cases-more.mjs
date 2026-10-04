/* One item: Send now, Skip / Un-skip, new text, Back, and everything under
 * More - Move (all four, a typed place, Back), Change time (each choice, both
 * holds, Back on each step), Delete (Back, Yes) - plus an own-time item and
 * closing the menu. Each case returns [ok, what] pairs. */
import { L, item, later, same, texts } from './labels.mjs';

const abc = (n) => 'abcdefgh'.slice(0, n).split('').map((text) => ({ text }));
const lane = async (t) => texts((await t.queue()).lane);

export const MORE = [
  { name: 'item: Skip, then Un-skip, then new text', run: async (t) => {
    await t.reset(abc(2));
    const r = await t.flow('/queue', [L.ITEMS(2), 0, L.SKIP]);
    const off = (await t.queue()).lane[0].off;
    const r2 = await t.flow('/queue', [L.ITEMS(2), 0, L.UNSKIP]);
    const on = !(await t.queue()).lane[0].off;
    await t.flow('/queue', [L.ITEMS(2), 1, 'b edited', L.CHANGE]);
    return [[same(r.screens[2].labels, [L.SEND, L.SKIP, L.MORE, L.BACK]), 'the item screen'],
      [off, 'skipped'], [r2.screens[2].labels[1] === L.UNSKIP && on, 'un-skipped'],
      [same(await lane(t), ['a', 'b edited']), 'text replaced']];
  } },
  { name: 'item: Back to its page, then to the first screen', run: async (t) => {
    await t.reset(abc(2));
    const r = await t.flow('/queue', [L.ITEMS(2), 0, L.BACK, L.BACK, 'v']);
    return [[same(r.screens[3].labels, [item(1, 'a'), item(2, 'b'), L.BACK]), 'its page'],
      [r.screens[4].labels[1] === L.ADD, 'the first screen']];
  } },
  { name: 'item: Send now sends it, the rest stay', run: async (t) => {
    await t.reset([{ text: 'Reply with exactly one word: ping' }, { text: 'second' }]);
    await t.flow('/queue', [L.ITEMS(2), 0, L.SEND]);
    const q = await t.queue();
    await t.idle();
    return [[same(texts(q.lane), ['second']) && q.paused, 'only that one left, the queue still paused']];
  } },
  { name: 'More: Move to the top', run: async (t) => {
    await t.reset(abc(4));
    const r = await t.flow('/queue', [L.ITEMS(4), L.NEXT, 0, L.MORE, L.MOVE, L.TOP]);
    return [[same(r.screens[4].labels, [L.MOVE, L.TIME, L.DEL, L.BACK]), 'More: Move, Change time, Delete, Back'],
      [same(r.screens[5].labels, [L.TOP, L.UP, L.DOWN, L.BACK]), 'Move from place 3'],
      [same(await lane(t), ['c', 'a', 'b', 'd']), 'c is on top']];
  } },
  { name: 'More: Move one up, one down', run: async (t) => {
    // Item 3 of 4, where "one up" is not also "to the top"; item 2 of 4 for down.
    await t.reset(abc(4));
    await t.flow('/queue', [L.ITEMS(4), L.NEXT, 0, L.MORE, L.MOVE, L.UP]);
    const up = await lane(t);
    await t.reset(abc(4));
    const r2 = await t.flow('/queue', [L.ITEMS(4), 1, L.MORE, L.MOVE, L.DOWN]);
    return [[same(up, ['a', 'c', 'b', 'd']), 'one up: ' + up], [same(await lane(t), ['a', 'c', 'b', 'd']), 'one down'],
      [same(r2.screens[4].labels, [L.TOP, L.DOWN, L.BOTTOM, L.BACK]), 'item 2: "one up" is "to the top", shown once']];
  } },
  { name: 'More: Move to the bottom, a typed place', run: async (t) => {
    await t.reset(abc(3));
    const r = await t.flow('/queue', [L.ITEMS(3), 0, L.MORE, L.MOVE, L.BOTTOM]);
    const bottom = await lane(t);
    await t.reset(abc(4));
    await t.flow('/queue', [L.ITEMS(4), 0, L.MORE, L.MOVE, '3']);
    return [[same(r.screens[4].labels, [L.DOWN, L.BOTTOM, L.BACK]), 'the first item: no top, no up'],
      [same(bottom, ['b', 'c', 'a']), 'to the bottom'], [same(await lane(t), ['b', 'c', 'a', 'd']), 'to place 3']];
  } },
  { name: 'More: Back from Move walks up to the first screen', run: async (t) => {
    await t.reset(abc(2));
    const r = await t.flow('/queue', [L.ITEMS(2), 0, L.MORE, L.MOVE, L.BACK, L.BACK, L.BACK, L.BACK, 'u']);
    const h = r.screens.map((s) => s.labels[0]);
    return [[h[5] === L.MOVE && h[6] === L.SEND && h[7] === item(1, 'a') && h[8] === L.PLAY, 'More, item, page, first: ' + h.slice(5)],
      [same(await lane(t), ['a', 'b', 'u']), 'nothing moved']];
  } },
  { name: 'Change time: In its turn clears a timer', run: async (t) => {
    await t.reset([{ text: 'a', mode: 'timer', dur: 600000 }]);
    await t.flow('/queue', [L.ITEMS(1), 0, L.MORE, L.TIME, L.TURN]);
    return [[(await t.queue()).lane[0].mode === 'queue', 'no schedule left']];
  } },
  { name: 'Change time: 10 minutes, they wait / 1 hour, they go on / a clock time', run: async (t) => {
    await t.reset(abc(1));
    const r = await t.flow('/queue', [L.ITEMS(1), 0, L.MORE, L.TIME, L.M10, L.WAIT]);
    const a = (await t.queue()).lane[0];
    await t.flow('/queue', [L.ITEMS(1), 0, L.MORE, L.TIME, L.H1, L.GO]);
    const b = (await t.queue()).scheduled[0] || {};
    const { hhmm } = later();
    const r3 = await t.flow('/queue', [L.ITEMS(1), 0, L.MORE, L.TIME, hhmm, L.WAIT]);
    const c = (await t.queue()).lane[0] || {};
    return [[same(r.screens[5].labels, [L.WAIT, L.GO, L.BACK]), 'a timer offers wait first'],
      [a.mode === 'timer' && a.hold === true, '10 minutes, holding'],
      [b.mode === 'timer' && b.hold === false, '1 hour, not holding - it moved to its own time'],
      [same(r3.screens[5].labels, [L.GO, L.WAIT, L.BACK]), 'a clock time offers go on first'],
      [c.mode === 'time' && c.hold === true, 'the clock time, holding']];
  } },
  { name: 'Change time: Back on the hold, Back on When', run: async (t) => {
    await t.reset(abc(1));
    const r = await t.flow('/queue', [L.ITEMS(1), 0, L.MORE, L.TIME, L.M10, L.BACK, L.BACK, L.BACK, L.BACK, L.BACK, 'k']);
    const h = r.screens.map((s) => s.labels[0]);
    return [[h[6] === L.TURN && h[7] === L.TIME, 'hold Back is When, When Back is More: ' + h.slice(5, 8)],
      [h[10] === L.PLAY, 'and up to the first screen'], [(await t.queue()).lane[0].mode === 'queue', 'nothing changed']];
  } },
  { name: 'Delete: Back keeps it, Yes deletes it', run: async (t) => {
    await t.reset(abc(2));
    const r = await t.flow('/queue', [L.ITEMS(2), 0, L.MORE, L.DEL, L.BACK, L.BACK, L.BACK, L.BACK, 'j']);
    const kept = await lane(t);
    await t.flow('/queue', [L.ITEMS(3), 0, L.MORE, L.DEL, L.YES]);
    return [[same(r.screens[4].labels, [L.YES, L.BACK]), 'it asks first'],
      [same(kept, ['a', 'b', 'j']), 'Back kept it'], [same(await lane(t), ['b', 'j']), 'Yes deleted it']];
  } },
  { name: 'an own-time item: no Move, Delete works', run: async (t) => {
    const { at } = later();
    await t.reset([{ text: 'a' }, { text: 'later', mode: 'time', at }]);
    const r = await t.flow('/queue', [L.ITEMS(2), 's1', L.MORE, L.DEL, L.YES]);
    return [[same(r.screens[3].labels, [L.TIME, L.DEL, L.BACK]), 'More has no Move'],
      [(await t.queue()).scheduled.length === 0, 'deleted']];
  } },
  { name: 'Skip from the phone ("[No preference]") closes every screen, nothing added', run: async (t) => {
    // The Claude app answers its Skip with this text; typed into Other it is
    // exactly what the menu receives from a phone.
    const SKIP = '[No preference]';
    await t.reset(abc(2));
    for (const script of [[SKIP], [L.ADD, L.TURN, SKIP], [L.ITEMS(2), 0, SKIP], [L.ITEMS(2), 0, L.MORE, L.DEL, SKIP]]) {
      await t.flow('/queue', script, { reply: false });
      await t.idle();
    }
    const q = await t.queue();
    return [[same(texts(q.lane), ['a', 'b']) && !q.lane.some((i) => i.off), 'the queue is exactly as it was: ' + texts(q.lane)],
      [q.paused, 'still paused - nothing was sent']];
  } },
  { name: 'closing the menu changes nothing', run: async (t) => {
    await t.reset(abc(2));
    await t.flow('/queue', [t.CLOSE], { reply: false });
    await t.idle();
    return [[same(await lane(t), ['a', 'b']), 'the queue is as it was']];
  } },
];
