  /* ---------- The value picker ----------
     A field and the list it opens. Split out of the edit pane, which is the
     form these fields sit in - the pane decides what is editable, this decides
     what choosing looks like. */

  function field(label, value, opts, set) {
    var f = el("span", "__afF");
    var l = el("label"); txt(l, label); f.appendChild(l);
    /* Label over value, and the chevron beside the value rather than at the far
       end of the row. It used to be one flex row with space-between, which put a
       wide and uneven gutter between a label and the thing it labels - the case
       NN/G names as the one where a side label stops being read in a single
       fixation. */
    var v = el("span", "__afFVal"); f.appendChild(v);
    var b = el("b"); txt(b, value); v.appendChild(b);
    v.insertAdjacentHTML("beforeend",
      '<svg class="__afChev" width="9" height="9" viewBox="0 0 12 12" fill="none" ' +
      'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ' +
      'stroke-linejoin="round"><path d="M3 4.5 6 7.5 9 4.5"/></svg>');
    f.setAttribute("aria-haspopup", "listbox");
    f.setAttribute("aria-label", label + ": " + value);
    press(f, function (ev) { openDrop(f, opts, value, set); });
    return f;
  }

  var dropNode = null;

  function dropOpen() { return !!dropNode; }

  function closeDrop() {
    if (dropNode && dropNode.parentNode) dropNode.parentNode.removeChild(dropNode);
    dropNode = null;
    document.removeEventListener("mousedown", onDropOutside, true);
  }

  function onDropOutside(ev) {
    if (dropNode && !dropNode.contains(ev.target)) closeDrop();
  }

  function openDrop(anchor, opts, current, set) {
    closeDrop();
    var d = el("div", "__afDrop __ccScroll");
    opts.forEach(function (o) {
      var it = el("div", "__afDItem" + (o[0] === current ? " __afDOn" : ""));
      txt(it, o[0]);
      if (o[1]) { var s = el("span"); txt(s, o[1]); it.appendChild(s); }
      press(it, function () { closeDrop(); set(o[0]); markDirty(); renderDialog(); }, "option");
      d.appendChild(it);
    });
    document.body.appendChild(d);
    /* As wide as the field it belongs to, and never wider than the dialog it
       opens inside. The 300px floor it used to carry in CSS was wider than the
       whole dialog at a narrow panel, so the list could not help but spill. */
    var box = anchor.closest ? anchor.closest(".__afDlg") : null;
    var bw = box ? box.getBoundingClientRect().width : 0;
    d.style.minWidth = Math.round(anchor.getBoundingClientRect().width) + "px";
    if (bw) d.style.maxWidth = Math.round(bw - 16) + "px";
    place(d, anchor, { bounds: box, start: true, below: true });
    dropNode = d;
    setTimeout(function () { document.addEventListener("mousedown", onDropOutside, true); }, 0);
  }
