/* HISTDLGFIX */
/* Session-history dropdown: place and size it in the coordinate system it is
   actually rendered in.

   The panel runs under a CSS zoom (patches/zoom sets document.body.style.zoom),
   and CSS zoom splits the page into two coordinate systems. Measured across
   zoom 1 / 1.25 / 1.34 / 1.5 / 2 at a fixed panel width: window.innerWidth,
   document.documentElement.clientWidth, visualViewport.width and vw units all
   keep reporting the unzoomed viewport, while document.body.clientWidth and
   every getBoundingClientRect come back in units that are exactly 1/zoom of it.

   Upstream subtracts one from the other - documentElement.clientWidth minus the
   anchor's getBoundingClientRect().right - and caps the width with
   min(400px, 100vw - 32px), so both the offset and the width come out inflated
   by the zoom factor. The box is position:fixed, so the overflow is simply
   clipped by the viewport: no ellipsis and no scrollbar, just missing leading
   characters in every row.

   So: read the viewport in the same units as the anchor rect, and clamp the
   offset so the box keeps its 16px margin on both sides. The clamp also fixes
   the 6px overhang upstream has at zoom 1 (reproduced on a clean install of the
   unmodified VSIX): its 100vw - 32px width cap assumes a left-aligned box while
   the placement is right-aligned to the button. */
const ccPanelView = () => {
    const width = document.body.getBoundingClientRect().width
      || document.documentElement.clientWidth;
    const scale = width > 0 ? document.documentElement.clientWidth / width : 1;
    return { width: width, height: document.documentElement.clientHeight / (scale || 1) };
  },
  ccDropdownBox = (rect, view) => {
    const width = Math.min(400, view.width - 32);
    const limit = Math.max(16, view.width - width - 16);
    const box = {
      top: rect.bottom + 4 + "px",
      width: width + "px",
      maxHeight: Math.min(500, view.height / 2) + "px",
    };
    if (rect.left + rect.right < view.width) {
      box.left = Math.min(Math.max(16, rect.left), limit) + "px";
    } else {
      box.right = Math.min(Math.max(16, view.width - rect.right), limit) + "px";
    }
    return box;
  };
let __RECT__ = __REF__.current?.getBoundingClientRect(),
  __VIEW__ = ccPanelView(),
  __STYLE__ = __RECT__ ? ccDropdownBox(__RECT__, __VIEW__) : {};
