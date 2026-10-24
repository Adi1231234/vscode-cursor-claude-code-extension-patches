/* A CLI frame as the row the VS Code panel's store would have kept for it.

   lib/js/ccReply.js decides "did Claude answer, was the run stopped" from the
   store's message list, whose rows look like
     { type, uuid, model, isSynthetic, isSynthesizedByLoop,
       content: [{ content: { text } }] }
   The desktop app hands us the raw frames (desktop/lib/js/ipc.js) instead, so
   this builds that row from one, and ccReply is reused unchanged rather than
   written a second time against another shape.

   Only user and assistant frames make rows; every other frame (result,
   rate_limit_event, system, stream_event) answers null. The CLI's own
   "<synthetic>" model (an API error, a usage limit) is what the store calls
   isSynthesizedByLoop, and such a row carries no model: ccReply counts a
   model on a row as "a model answered". */
window.__ccdRow = window.__ccdRow || (function () {
    function texts(content) {
        if (typeof content === "string") return [content];
        if (!Array.isArray(content)) return [];
        var out = [];
        for (var i = 0; i < content.length; i++) {
            var c = content[i];
            if (c && c.type === "text" && typeof c.text === "string") out.push(c.text);
        }
        return out;
    }

    return function (frame) {
        if (!frame || (frame.type !== "user" && frame.type !== "assistant")) return null;
        var msg = frame.message || {};
        var model = frame.type === "assistant" && typeof msg.model === "string" ? msg.model : undefined;
        var loop = model === "<synthetic>";
        return {
            type: frame.type,
            uuid: frame.uuid,
            model: loop ? undefined : model,   /* only a model's own answer carries one */
            isSynthetic: !!frame.isSynthetic,
            isSynthesizedByLoop: loop,
            content: texts(msg.content).map(function (t) { return { content: { text: t } }; })
        };
    };
})();
