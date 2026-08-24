/* Minimal Chrome DevTools Protocol transport.
   No dependencies: Node 18+ has fetch, Node 22 has a global WebSocket. */

/* The deadline matters: while a window is reloading, the port still accepts the
   connection and can then sit on the request, and a bare `fetch` waits for ever.
   Every poll loop here is built on this call, so one stalled request would hang
   the whole tool rather than costing it one round. */
export async function targets(port) {
  const r = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) });
  return r.json();
}

const OPEN_TIMEOUT_MS = 8000;

export function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    let closed = false;
    const pending = new Map();
    const listeners = new Map();

    /* A target that is being torn down (a window mid-reload, a panel that was
       just replaced) accepts the connection attempt and then answers nothing:
       no open, no error. Without a deadline the caller waits for ever, which
       looks exactly like a hung tool. */
    const deadline = setTimeout(() => {
      try { ws.close(); } catch { /* already gone */ }
      reject(new Error(`CDP target did not answer: ${wsUrl}`));
    }, OPEN_TIMEOUT_MS);

    ws.onerror = (e) => { clearTimeout(deadline); reject(e); };
    /* A command that reloads the window kills the socket before its own reply
       comes back. Without this, that one `send` never settles and the process
       hangs on an unresolved promise instead of finishing the reload. */
    ws.onclose = () => {
      clearTimeout(deadline);
      closed = true;
      for (const res of pending.values()) res({ closed: true });
      pending.clear();
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m);
        pending.delete(m.id);
        return;
      }
      for (const cb of listeners.get(m.method) || []) cb(m.params);
    };
    ws.onopen = () => {
      clearTimeout(deadline);
      resolve({
        /* Once the socket is gone every further command answers `{closed}`
           rather than waiting for a reply that cannot come: a caller mid-way
           through a sequence (the second half of a keystroke, an Escape after
           a reload) has nothing left to talk to, and a promise parked on a
           dead socket keeps nothing alive - the process simply ends with an
           unsettled await and no explanation. */
        send: (method, params = {}) => (closed ? Promise.resolve({ closed: true }) : new Promise((res) => {
          const n = ++id;
          pending.set(n, res);
          ws.send(JSON.stringify({ id: n, method, params }));
        })),
        on: (method, cb) => {
          if (!listeners.has(method)) listeners.set(method, []);
          listeners.get(method).push(cb);
        },
        close: () => ws.close(),
      });
    };
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
