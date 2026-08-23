/* Minimal Chrome DevTools Protocol transport.
   No dependencies: Node 18+ has fetch, Node 22 has a global WebSocket. */

export async function targets(port) {
  const r = await fetch(`http://127.0.0.1:${port}/json/list`);
  return r.json();
}

export function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const listeners = new Map();

    ws.onerror = reject;
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m);
        pending.delete(m.id);
        return;
      }
      for (const cb of listeners.get(m.method) || []) cb(m.params);
    };
    ws.onopen = () => resolve({
      send: (method, params = {}) => new Promise((res) => {
        const n = ++id;
        pending.set(n, res);
        ws.send(JSON.stringify({ id: n, method, params }));
      }),
      on: (method, cb) => {
        if (!listeners.has(method)) listeners.set(method, []);
        listeners.get(method).push(cb);
      },
      close: () => ws.close(),
    });
  });
}

/* Evaluate in a target's own (top) context - used to read a window's DOM.
   For the panel itself use evalInPanel from panels.mjs. */
export async function evaluate(target, expression, contextId) {
  const c = await connect(target.webSocketDebuggerUrl);
  const r = await c.send('Runtime.evaluate', {
    expression,
    contextId,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  c.close();
  return unwrap(r);
}

export function unwrap(r) {
  const d = r && r.result;
  if (d && d.exceptionDetails) {
    const ex = d.exceptionDetails.exception;
    return { __error: (ex && ex.description) || d.exceptionDetails.text || 'threw' };
  }
  return d && d.result ? d.result.value : undefined;
}
