/* Hands a session's own title to the CLI that runs it, so other sessions see
   it under that name (ListAgents, SendMessage).

   The CLI keeps the name others see in its session registry, apart from the
   tab title in the transcript. A rename in the panel reaches the registry only
   when the host relays it to a CLI already running that session, and a CLI the
   panel resumes never takes the name back from the transcript. So the newest
   title in the session's transcript is sent to its CLI as the same rename the
   panel sends, once per channel and session, at the first of two moments: the
   CLI has started on a session it resumed (an idle tab after a reload has no
   other), or the CLI says which session it runs (a new conversation's first
   turn, a fork). Needs ccProjects.js and ccTranscript.js. */
globalThis.__ccSessionName = globalThis.__ccSessionName || (function () {
    /* Nothing on screen changes either way, so the extension's own log says
       what was sent, or why nothing was. */
    function say(logger, text) {
        try {
            if (logger && typeof logger.log === "function") logger.log("[session-name-sync] " + text);
        } catch (e) {}
    }

    /* The newest record decides, as it does for the CLI and the panel. */
    async function titleOf(sessionId) {
        var file = await globalThis.__ccTranscript.find(sessionId);
        if (!file) return null;
        var title = null;
        await globalThis.__ccTranscript.scanBack(file, "custom-title", function (rec) {
            if (typeof rec.customTitle === "string" && rec.customTitle.trim()) title = rec.customTitle;
            return true;
        });
        return title;
    }

    async function sync(host, channel, sessionId) {
        var logger = host && host.logger;
        try {
            var title = await titleOf(sessionId);
            if (!title) {
                say(logger, sessionId + ": no title of its own, the CLI keeps the name it made up");
                return;
            }
            /* The channel may have moved on (a /clear, a fork) while the file
               was read; that session gets its own turn. */
            if (channel.sessionId !== sessionId) return;
            await channel.query.renameSession(title, sessionId);
            say(logger, sessionId + ": sent its title \"" + title + "\" to the CLI as its name");
        } catch (e) {
            /* A fork starts on the session it came from but runs a new one,
               which the CLI refuses to rename; its own id is still to come. */
            if (channel.__ccNamedSession === sessionId) channel.__ccNamedSession = undefined;
            say(logger, sessionId + ": the CLI did not take the title (" + e + ")");
        }
    }

    /* sessionId is left out where the channel already holds it. */
    return function (host, channel, sessionId) {
        if (!channel) return;
        if (sessionId === undefined) sessionId = channel.sessionId;
        if (typeof sessionId !== "string" || !sessionId) return;
        if (channel.__ccNamedSession === sessionId) return;
        channel.__ccNamedSession = sessionId;
        return sync(host, channel, sessionId);
    };
})();
