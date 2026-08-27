// Minimal DOM/browser stubs - only what the panel script actually touches.
function mkEl(tag){
  const e={tagName:tag,className:'',style:{},children:[],attrs:{},_text:'',
    isConnected:true,parentNode:null,listeners:{},
    appendChild(c){c.parentNode=this;this.children.push(c);return c;},
    insertBefore(c,r){c.parentNode=this;this.children.unshift(c);return c;},
    removeChild(c){this.children=this.children.filter(x=>x!==c);c.parentNode=null;},
    addEventListener(k,f){(this.listeners[k]=this.listeners[k]||[]).push(f);},
    removeEventListener(){},setAttribute(k,v){this.attrs[k]=v;},
    getAttribute(k){return this.attrs[k];},
    querySelector(){return null;},closest(){return globalThis.__form;},
    getBoundingClientRect(){return {top:100,bottom:126,left:50,width:26,height:26};},
    insertAdjacentHTML(){},focus(){},
    get textContent(){return this._text;},set textContent(v){this._text=v;},
    get innerHTML(){return '';},set innerHTML(v){this.children=[];},
    get firstChild(){return this.children[0]||null;},
    get previousElementSibling(){return null;},get offsetWidth(){return 200;},get offsetHeight(){return 120;}};
  return e;
}
const body=mkEl('body');
globalThis.document={createElement:mkEl,body,addEventListener(){},removeEventListener(){},querySelector(){return null;}};
globalThis.window={addEventListener(k,f){globalThis.__onMsg=f;},innerWidth:1200,innerHeight:800};
const store={};
globalThis.localStorage={getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
globalThis.__store=store;
globalThis.confirm=()=>true;
globalThis.sent=[];
const input=mkEl('div');
globalThis.__form=mkEl('form');
globalThis.__form.querySelector=(sel)=>sel.indexOf('__qAdd')>=0?mkEl('button'):mkEl('button');
globalThis.__ccInput=()=>input;
// ccStore caches the store object it finds, so the same object comes back every
// call - decorating interrupt() has to stick. The stub matches that.
const __theStore={
  connection:{value:{send:m=>{globalThis.sent.push(m);}}},
  sessionId:{value:'sess-1'}, cwd:{value:'C:/proj'},
  get messages(){return {value:globalThis.__msgs||[]};},
  interrupt(){globalThis.__interrupted=true;},
  busy:{value:false}
};
globalThis.__ccStore=()=>__theStore;
globalThis.__qAutoState={count:0,paused:false,busy:false};
globalThis.window.__qAuto={
  count:()=>globalThis.__qAutoState.count,
  paused:()=>globalThis.__qAutoState.paused,
  busy:()=>globalThis.__qAutoState.busy,
  panel:()=>null, log:()=>{},
  send:t=>{globalThis.__sentText=t;return Promise.resolve(true);}
};
globalThis.setInterval=(f,ms)=>{globalThis.__tick=f;return 1;};
globalThis.setTimeout=(f)=>{try{f();}catch(e){}return 1;};
