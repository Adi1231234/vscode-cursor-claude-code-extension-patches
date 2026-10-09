/* The editor's side of the panel protocol, inside the page - so the real panel
   (the app's index.js and every patch) runs in a plain browser.

   The panel talks to its host through acquireVsCodeApi().postMessage, and the
   host answers with window messages of type "from-extension" (2.1.294):

     panel -> host  {type:"request", requestId, request:{type, ...}}
                    {type:"launch_claude", channelId, resume, ...}
                    {type:"io_message", channelId, message}   (your prompt)
     host -> panel  {type:"response", requestId, response}
                    {type:"io_message", channelId, message}   (the CLI's stream)

   Only what opening a conversation needs is answered with data - init, the
   CLI state, the session list, the session itself (window.__perf, written by
   the server); every other request gets an empty answer of its type. A prompt
   plays turn.js. Runs before index.js. */
(function () {
  var P = window.__perf;
  var state;
  var seen = {};

  function deliver(message) {
    window.postMessage({ type: 'from-extension', message: message }, '*');
  }

  var handlers = {
    init: function () { return { type: 'init_response', state: P.init }; },
    get_claude_state: function () { return { type: 'get_claude_state_response', config: P.claude, cached: false }; },
    list_sessions_request: function () {
      return { type: 'list_sessions_response', sessions: P.sessions, folderKey: 'perf' };
    },
    get_asset_uris: function () {
      var a = function (f) { return { light: 'resources/' + f, dark: 'resources/' + f }; };
      return { type: 'asset_uris_response', assetUris: { clawd: a('clawd.svg'), 'welcome-art': a('welcome-art-dark.svg') } };
    },
    get_session_request: function (r) {
      var mine = r.sessionId === P.session.sessionId;
      return { type: 'get_session_response', messages: mine ? P.session.messages : [], liveInOtherSurface: false };
    },
  };

  function onRequest(m) {
    var r = m.request || {};
    seen[r.type] = (seen[r.type] || 0) + 1;
    var h = handlers[r.type];
    var res = h ? h(r) : { type: String(r.type).replace(/_request$/, '') + '_response' };
    setTimeout(function () { deliver({ type: 'response', requestId: m.requestId, response: res }); }, 0);
  }

  var channels = {};
  function post(m) {
    if (!m) return;
    if (m.type === 'request') return onRequest(m);
    if (m.type === 'launch_claude') { channels[m.channelId] = { resume: m.resume }; return; }
    var isPrompt = m.type === 'io_message' && m.message && m.message.type === 'user';
    if (isPrompt && window.__perfTurn) {
      var ch = channels[m.channelId] || {};
      window.__perfTurn(m.channelId, ch.resume || P.session.sessionId, m.message, deliver);
    }
  }

  window.acquireVsCodeApi = function () {
    return {
      postMessage: post,
      getState: function () { return state; },
      setState: function (s) { state = s; return s; },
    };
  };
  window.__perfHost = { requests: seen, channels: channels };
})();
