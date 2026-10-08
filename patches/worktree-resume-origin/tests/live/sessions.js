/* The panel's own history list, asked from the host the way the history dialog
   asks for it. */
(async () => {
  const s = globalThis.__ccStore && globalThis.__ccStore();
  const c = s && s.connection && s.connection.value;
  if (!c || typeof c.sendRequest !== 'function') return { error: 'no connection' };
  const r = await c.sendRequest({ type: 'list_sessions_request' });
  return (r.sessions || []).map((x) => ({ id: x.id, worktree: x.worktree ? x.worktree.name : null }));
})()
