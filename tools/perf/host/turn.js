/* One working turn of the CLI, streamed the way 2.1.294 streams it (recorded
   frame by frame in the lab): the prompt echoed back, a thinking block, a Bash
   call whose input streams in, its result a moment later, two dozen more
   commands in the same turn (a long turn is where a cost per new row adds
   up), then a reply that arrives a few words at a time, and the turn's
   result. The pace is the
   recorded one in shape - deltas a frame or two apart - so the panel renders
   every chunk the way it does while Claude writes.

   window.__perfTurn(channelId, sessionId, prompt, deliver); window.__perfTurnDone
   is set to the time the result frame went out. */
(function () {
  var MODEL = 'claude-opus-5-5';
  var n = 0;
  var uid = function () { return '00000000-0000-4000-9000-' + String(++n).padStart(12, '0'); };
  var REPLY = ('The command printed the lines it was asked for, and the build is clean again. ' +
    'What changed in this turn:\n\n- the anchor captures the name instead of spelling it\n' +
    '- the guard is written once every site matched\n- a missing shape reports a miss\n\n' +
    'הבדיקה עוברת עכשיו, וההרצה השנייה מדלגת על הכול כמו שצריך. ').repeat(3);

  function assistant(msgId, block, sid) {
    return { type: 'assistant', message: { model: MODEL, id: msgId, type: 'message', role: 'assistant', content: [block],
      stop_reason: null, usage: { input_tokens: 2, output_tokens: 3 } },
      parent_tool_use_id: null, session_id: sid, uuid: uid(), timestamp: new Date().toISOString() };
  }
  function ev(event, sid) {
    return { type: 'stream_event', event: event, session_id: sid, parent_tool_use_id: null, uuid: uid() };
  }

  var OUT = 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8';

  /* One more command in the same turn: its call, then its result `wait` ms
     later - an agent's turn is mostly this, dozens of times over. */
  function command(add, sid, wait) {
    var msg = 'msg_perf_' + (++n), tool = 'toolu_perf_' + (++n);
    var cmd = { command: 'npm test -- --grep "case ' + n + '"', description: 'Run test case ' + n };
    add(16, ev({ type: 'message_start', message: { model: MODEL, id: msg, type: 'message', role: 'assistant', content: [], usage: {} } }, sid));
    add(5, ev({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: tool, name: 'Bash', input: {} } }, sid));
    add(5, ev({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(cmd) } }, sid));
    add(16, assistant(msg, { type: 'tool_use', id: tool, name: 'Bash', input: cmd, caller: { type: 'direct' } }, sid));
    add(5, ev({ type: 'content_block_stop', index: 0 }, sid));
    add(5, ev({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: {} }, sid));
    add(1, ev({ type: 'message_stop' }, sid));
    add(wait, { type: 'user', message: { role: 'user', content: [{ tool_use_id: tool, type: 'tool_result', content: OUT, is_error: false }] },
      parent_tool_use_id: null, session_id: sid, uuid: uid(), timestamp: new Date().toISOString(),
      tool_use_result: { stdout: OUT, stderr: '', interrupted: false, isImage: false } });
  }

  /* [delay before, message] */
  function frames(sid, prompt) {
    var f = [], m1 = 'msg_perf_' + (++n), m2 = 'msg_perf_' + (++n), tool = 'toolu_perf_' + (++n);
    var cmd = { command: "printf 'line %s\\n' 1 2 3 4 5 6 7 8", description: 'Print eight numbered lines' };
    var add = function (d, m) { f.push([d, m]); };
    add(0, { type: 'system', subtype: 'status', permissionMode: 'default', connectSnapshot: true });
    add(10, { type: 'system', subtype: 'init', cwd: 'C:\\work\\project', session_id: sid, tools: ['Bash', 'Read', 'Edit'],
      mcp_servers: [], model: MODEL, permissionMode: 'default', slash_commands: [], apiKeySource: 'none',
      output_style: 'default', agents: [], skills: [], plugins: [], capabilities: ['msg_lifecycle_v1'], uuid: uid() });
    add(20, Object.assign({}, prompt, { session_id: sid, isReplay: true, timestamp: new Date().toISOString() }));
    add(50, ev({ type: 'message_start', message: { model: MODEL, id: m1, type: 'message', role: 'assistant', content: [], usage: {} } }, sid));
    add(10, ev({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } }, sid));
    for (var i = 0; i < 6; i++) add(16, ev({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '', estimated_tokens: 50 * (i + 1) } }, sid));
    add(20, ev({ type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } }, sid));
    add(5, assistant(m1, { type: 'thinking', thinking: '', signature: 'sig' }, sid));
    add(5, ev({ type: 'content_block_stop', index: 0 }, sid));
    add(5, ev({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: tool, name: 'Bash', input: {} } }, sid));
    add(5, ev({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: JSON.stringify(cmd) } }, sid));
    add(30, assistant(m1, { type: 'tool_use', id: tool, name: 'Bash', input: cmd, caller: { type: 'direct' } }, sid));
    add(5, ev({ type: 'content_block_stop', index: 1 }, sid));
    add(5, ev({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: {} }, sid));
    add(1, ev({ type: 'message_stop' }, sid));
    add(400, { type: 'user', message: { role: 'user', content: [{ tool_use_id: tool, type: 'tool_result', content: OUT, is_error: false }] },
      parent_tool_use_id: null, session_id: sid, uuid: uid(), timestamp: new Date().toISOString(),
      tool_use_result: { stdout: OUT, stderr: '', interrupted: false, isImage: false } });
    for (var c = 0; c < 24; c++) command(add, sid, 32);
    add(50, ev({ type: 'message_start', message: { model: MODEL, id: m2, type: 'message', role: 'assistant', content: [], usage: {} } }, sid));
    add(10, ev({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, sid));
    var words = REPLY.split(' ');
    for (var w = 0; w < words.length; w += 3) {
      add(16, ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: words.slice(w, w + 3).join(' ') + ' ' } }, sid));
    }
    add(10, assistant(m2, { type: 'text', text: REPLY }, sid));
    add(5, ev({ type: 'content_block_stop', index: 0 }, sid));
    add(5, ev({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: {} }, sid));
    add(1, ev({ type: 'message_stop' }, sid));
    add(10, { type: 'result', subtype: 'success', is_error: false, duration_ms: 5000, duration_api_ms: 4000, num_turns: 2,
      result: REPLY, session_id: sid, total_cost_usd: 0, usage: {}, permission_denials: [], uuid: uid(), stop_reason: 'end_turn' });
    return f;
  }

  /* Every frame at its own time from the start, the way the CLI sends them: a
     busy panel does not slow the CLI down, its frames wait in the panel's
     queue. (Each one timed from the last one's delivery made the turn as long
     as the panel was slow, and the run with it.) */
  window.__perfTurn = function (channelId, sid, prompt, deliver) {
    var list = frames(sid, prompt), at = 0;
    window.__perfTurnDone = 0;
    list.forEach(function (fr, i) {
      at += fr[0];
      setTimeout(function () {
        deliver({ type: 'io_message', channelId: channelId, message: fr[1], done: false });
        if (i === list.length - 1) window.__perfTurnDone = performance.now();
      }, at);
    });
  };
})();
