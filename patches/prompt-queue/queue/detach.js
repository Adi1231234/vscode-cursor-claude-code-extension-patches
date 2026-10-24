  /* ---------- Leaving the screen ----------
     In the editor a queue and its panel live and die together. The desktop
     app runs one queue per conversation and shows one conversation at a time,
     so the queue whose conversation leaves the screen takes down what it drew
     - the panel, its footer buttons, an open row menu - and keeps running
     without them; the queue of the conversation now shown draws its own.
     uiNodes is every footer button this queue made (add-button.js). */
  var uiNodes = [];

  function detachUi() {
    closeRowMenu();
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null;
    uiNodes.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
    uiNodes = [];
  }
