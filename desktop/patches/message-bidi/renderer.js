/* message-bidi (desktop): decide a message's text direction once, over the
   whole message, instead of per paragraph.

   The Code web app sets `dir` on a block from a first-strong guess, so a Hebrew
   line that opens with an English word - a path, a filename, a term - is left
   at the default LTR and reads backwards, and list items get no dir at all
   (measured on a real conversation: 31 of 40 Hebrew blocks were wrong). We
   count the Hebrew and Latin letters of the whole message, with code excluded
   from the vote, and set that one direction on every text block; code and pre
   are forced LTR. One message, one direction - the declaration the standards
   ask for, not the "very crude" per-line heuristic.

   The unit is the `[data-cds="Prose"]` block, which is one message's rendered
   body. Attribute writes are not observed by __ccWatch, so our own dir writes
   never feed back; we react to new and streaming content (childList /
   characterData) and re-apply only to the Prose blocks a batch touched. */
window.__ccd.patch("message-bidi", function () {
    var HEB = /[֐-׿]/, LAT = /[A-Za-z]/;
    var BLOCKS = "p,li,h1,h2,h3,h4,h5,h6,blockquote,ul,ol,dl,dt,dd";

    function vote(el) {
        var h = 0, l = 0;
        (function walk(n) {
            if (n.nodeType === 3) {
                var d = n.data;
                for (var i = 0; i < d.length; i++) {
                    if (HEB.test(d[i])) h++;
                    else if (LAT.test(d[i])) l++;
                }
                return;
            }
            if (n.nodeType !== 1 || n.tagName === "CODE" || n.tagName === "PRE") return;
            for (var k = n.firstChild; k; k = k.nextSibling) walk(k);
        })(el);
        return h > 0 && h >= l * 0.5 ? "rtl" : "ltr";
    }

    function apply(prose) {
        var dir = vote(prose);
        var blocks = prose.querySelectorAll(BLOCKS);
        for (var i = 0; i < blocks.length; i++) {
            if (!blocks[i].closest("code,pre")) __ccDom.setAttr(blocks[i], "dir", dir);
        }
        var code = prose.querySelectorAll("pre,code");
        for (var j = 0; j < code.length; j++) __ccDom.setAttr(code[j], "dir", "ltr");
    }

    function proseOf(node) {
        var el = node && (node.nodeType === 1 ? node : node.parentElement);
        return el && el.closest ? el.closest('[data-cds="Prose"]') : null;
    }

    function affected(records) {
        var set = new Set();
        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            var p = proseOf(r.target);
            if (p) set.add(p);
            for (var a = 0; a < r.addedNodes.length; a++) {
                var n = r.addedNodes[a];
                if (n.nodeType !== 1) continue;
                if (n.matches && n.matches('[data-cds="Prose"]')) set.add(n);
                if (n.querySelectorAll) n.querySelectorAll('[data-cds="Prose"]').forEach(function (x) { set.add(x); });
            }
        }
        return set;
    }

    document.querySelectorAll('[data-cds="Prose"]').forEach(apply);
    __ccWatch.on(function (records) { affected(records).forEach(apply); }, { chars: true });
});
