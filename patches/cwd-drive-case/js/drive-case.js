globalThis.__ccDriveCase=function(p){
  if(typeof p!=="string")return p;
  if(!/^[a-z]:[\\/]/.test(p))return p;
  return p.charAt(0).toUpperCase()+p.slice(1);
};
