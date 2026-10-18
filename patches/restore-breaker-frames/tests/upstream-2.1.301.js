/* The function this patch replaces, verbatim from the 2.1.301 webview bundle
   (Gx5 = 3000 there). Kept as the baseline the test runs beside the patch. */
var Gx5 = 3000;
function qx5($){let J,Z,X=()=>{J=void 0,Z=setTimeout($,Gx5)};if(document.visibilityState==="hidden")X();else J=requestAnimationFrame(()=>{J=requestAnimationFrame(X)});return()=>{if(J!==void 0)cancelAnimationFrame(J);clearTimeout(Z)}}
