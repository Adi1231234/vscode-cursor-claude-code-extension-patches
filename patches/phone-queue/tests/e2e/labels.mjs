/* The button labels the e2e cases tap, spelled once - the same strings the
 * mod draws (menu.js, items.js, screens.js). */
export const L = {
  PLAY: '▶ Play', PAUSE: '⏸ Pause', ADD: '➕ Add', HELP: '❓ Help',
  ITEMS: (n) => '📋 Items (' + n + ')',
  BACK: '‹ Back', NEXT: 'Next ›', SHORTCUTS: '📖 Typed shortcuts',
  TURN: 'In its turn', M10: 'In 10 minutes', H1: 'In 1 hour', CONT: 'Continue',
  SEND: '🚀 Send now', SKIP: '⏭ Skip', UNSKIP: '↩ Un-skip', MORE: '⋯ More', CHANGE: '✏️ Yes, change it',
  MOVE: '↕ Move', TIME: '⏱ Change time', DEL: '🗑 Delete', YES: '🗑 Yes, delete it',
  TOP: '⬆ To the top', UP: '↑ One up', DOWN: '↓ One down', BOTTOM: '⬇ To the bottom',
  WAIT: '⏸ They wait for it', GO: '▶ They go on',
};

export const item = (n, text) => n + ' · ' + text;
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const texts = (list) => list.map((x) => x.text);

// "HH:MM" two hours from now, and the ms it means (today or tomorrow).
export function later() {
  const d = new Date(Date.now() + 2 * 3600000);
  const pad = (n) => (n < 10 ? '0' : '') + n;
  d.setSeconds(0, 0);
  return { hhmm: pad(d.getHours()) + ':' + pad(d.getMinutes()), at: d.getTime() };
}
