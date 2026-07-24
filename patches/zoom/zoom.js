<script nonce="${__NONCE__}">/* ZOOM */
let _z=parseFloat(localStorage.getItem("__zoom")||"1");
document.body.style.zoom=_z;
window.addEventListener("wheel",function(e){
  if(e.ctrlKey){
    e.preventDefault();
    _z=Math.min(3,Math.max(0.5,_z+(e.deltaY<0?0.02:-0.02)));
    document.body.style.zoom=_z;
    localStorage.setItem("__zoom",_z)
  }
},{passive:false})</script>