/* Every element of the open page styled from scratch, once: the root taken
   out of the layout and put back, a layout read after each step to force the
   pass there and then. One expression, evaluated in the page; it hands back
   how many elements the page has. */
(() => {
  const root = document.documentElement;
  const was = root.style.display;
  root.style.display = 'none';
  void root.offsetHeight;
  root.style.display = was;
  void root.offsetHeight;
  return document.getElementsByTagName('*').length;
})()
