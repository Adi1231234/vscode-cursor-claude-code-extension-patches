/* A long conversation, made up, in the exact shape the host hands the panel
   (get_session_response.messages - the session's JSONL rows, measured on
   2.1.294). Nothing in it comes from a real session.

   Each turn is what a working session looks like: your prompt (Hebrew or
   English), a thinking block, a line of prose, a few commands - Bash with
   output, a failing one, a Read, an Edit, a Grep - and a reply in markdown.
   Deterministic: the same turn count always gives the same bytes, so two runs
   compare the same page. */

const SESSION = '00000000-0000-4000-8000-0000000000aa';
const MODEL = 'claude-opus-5-5';
const T0 = Date.UTC(2026, 9, 1, 9, 0, 0);

const PROMPTS = [
  'תבדוק למה הבדיקות נכשלות בענף הזה ותתקן את הסיבה',
  'Refactor the queue module so every file stays under 150 lines',
  'למה הכפתור לא מופיע כשהחלון צר? תמדוד ותתקן',
  'Add a regression test for the drive-letter case bug',
];
const REPLY = [
  'The failure came from the anchor, not from the test. What changed:',
  '',
  '- the regex now captures the identifier instead of naming it',
  '- the guard is written only after every site matched',
  '- `apply.ps1` reports a `[miss]` when the shape is gone',
  '',
  '```js',
  'const rx = /function ([\\w$]+)\\(([\\w$]+)\\)\\{/;',
  'const m = rx.exec(bundle);',
  '```',
  '',
  'הבדיקה עוברת עכשיו, וגם ההרצה השנייה מדלגת על הכול כמו שצריך.',
].join('\n');

const lines = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n');

/* The commands of one turn: [name, input, result text, is_error]. */
function commands(t) {
  const file = `src/feature-${t}/index.js`;
  return [
    ['Bash', { command: `npm test -- --grep "case ${t}"`, description: 'Run the failing test' },
      lines(14, (i) => `  ${i % 5 ? 'ok' : 'not ok'} ${i} - case ${t}.${i} ${'.'.repeat(i % 7)}`), false],
    ['Read', { file_path: `C:/work/project/${file}` }, lines(40, (i) => `${i}\tconst value${i} = compute(${i}, options);`), false],
    ['Edit', { file_path: `C:/work/project/${file}`, old_string: 'return compute(a);', new_string: 'return compute(a, { strict: true });' },
      `The file C:/work/project/${file} has been updated successfully.`, false],
    ['Grep', { pattern: `feature-${t}`, path: 'C:/work/project', output_mode: 'content' }, lines(6, (i) => `src/feature-${t}/part${i}.js:${i * 3}:import x from "feature-${t}";`), false],
    ['Bash', { command: 'node --check build/out.js', description: 'Syntax check the build' },
      t % 3 === 0 ? 'Exit code 1\nSyntaxError: Unexpected token at line 12' : '', t % 3 === 0],
  ];
}

export function conversation(turns = 60) {
  const out = [];
  let n = 0, clock = T0;
  const id = (kind) => `${kind}-${String(++n).padStart(6, '0')}`;
  const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const at = (s) => new Date((clock += s * 1000)).toISOString();
  const row = (type, message, extra) => ({ type, uuid: uuid(), session_id: SESSION, message, parent_tool_use_id: null, parent_agent_id: null, timestamp: at(2), ...extra });
  const say = (msgId, block) => row('assistant', { model: MODEL, id: msgId, type: 'message', role: 'assistant', content: [block], stop_reason: null, usage: { input_tokens: 2, output_tokens: 40 } });

  for (let t = 1; t <= turns; t++) {
    out.push(row('user', { role: 'user', content: [{ type: 'text', text: PROMPTS[t % PROMPTS.length] + ` (#${t})` }] }));
    const msgId = id('msg');
    out.push(say(msgId, { type: 'thinking', thinking: '', signature: 'sig' }));
    out.push(say(msgId, { type: 'text', text: `Looking at turn ${t} first, then the build.` }));
    for (const [name, input, result, isError] of commands(t)) {
      const tid = id('toolu');
      out.push(say(msgId, { type: 'tool_use', id: tid, name, input, caller: { type: 'direct' } }));
      out.push(row('user', { role: 'user', content: [{ tool_use_id: tid, type: 'tool_result', content: result, is_error: !!isError }] }));
    }
    out.push(say(id('msg'), { type: 'text', text: REPLY }));
  }
  return { sessionId: SESSION, messages: out };
}
