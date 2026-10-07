/* MESSAGETIME */
if (__MSG__.type === "assistant" && __MSG__.content.some(function (b) { return b.content.type !== "text"; })) return !0;
