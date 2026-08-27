// Minimal DOM/browser stubs - only what the panel script actually touches.
function mkEl(tag){
  const e={tagName:tag,className:'',style:{},children:[],attrs:{},_text:'',
    isConnected:true,parentNode:null,listeners:{},
    appendChild(c){c.parentNode=this;this.children.push(c);return c;},
    insertBefore(c,r){c.parentNode=this;this.children.unshift(c);return c;},
    removeChild(c){this.children=this.children.filter(x=>x!==c);c.parentNode=null;},
    addEventListener(k,f){(this.listeners[k]=this.listeners[k]||[]).push(f);},
    click(){(this.listeners.click||[]).forEach(f=>f({preventDefault(){},stopPropagation(){},target:this,currentTarget:this}));},
    all(){return this.children.reduce((a,c)=>a.concat([c],c.all?c.all():[]),[]);},
    removeEventListener(){},setAttribute(k,v){this.attrs[k]=v;},
    getAttribute(k){return this.attrs[k];},
    querySelector(sel){var c=String(sel).replace('.','');for(var i=0;i<this.children.length;i++){if(this.children[i].className===c)return this.children[i];}return null;},closest(){return globalThis.__form;},
    getBoundingClientRect(){return {top:100,bottom:126,left:50,width:26,height:26};},
    insertAdjacentHTML(){},focus(){},
    cloneNode(){const c=mkEl(this.tagName);c.className=this.className;c._text=this._text;
      c.querySelectorAll=()=>[];return c;},
    get innerText(){return this._text;},
    get textContent(){return this._text;},set textContent(v){this._text=v;},
    get innerHTML(){return this._html||'';},
    set innerHTML(v){
      this._html=v; this.children=[];
      var re=/<span class="([^"]+)"><\/span>/g, m;
      while((m=re.exec(v))){ var c=mkEl('span'); c.className=m[1]; c.parentNode=this; this.children.push(c); }
    },
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
const __add=mkEl('button'); __add.className='__qAdd';
globalThis.__form.__afSlot=null;
globalThis.__form.querySelector=(sel)=>{
  if(sel.indexOf('__afBtn')>=0) return globalThis.__form.__afSlot;
  if(sel.indexOf('__qAdd')>=0) return __add;
  return __add;
};
__add.parentNode=globalThis.__form;
__add.parentNode.insertBefore=(c,r)=>{globalThis.__form.__afSlot=c;c.parentNode=globalThis.__form;return c;};
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

/* The transcript, the way the app really renders it: a list of .message_<hash>
   nodes, a user one carrying .userMessage_<hash> inside. The tests set
   globalThis.__msgs to [{role,content}] and this turns it into those nodes, so
   the stub models the DOM the code reads rather than a store field it does not.
   Getting this wrong once is exactly what hid a dead lastAssistant(). */
const CLS={msg:'message_X',user:'userMessage_X'};
globalThis.__msgs=[];
document.querySelectorAll=function(sel){
  if(String(sel).indexOf(CLS.msg)<0) return [];
  return (globalThis.__msgs||[]).map(function(m){
    const wrap=mkEl('div'); wrap.className=CLS.msg;
    const inner=mkEl('div');
    inner._text=typeof m.content==='string'?m.content:'';
    if(m.role==='user'){ inner.className=CLS.user; }
    wrap.children.push(inner); inner.parentNode=wrap;
    wrap.querySelector=function(q){
      if(String(q).indexOf(CLS.user)>=0) return m.role==='user'?inner:null;
      return null;
    };
    wrap.querySelectorAll=function(){return [];};
    wrap.cloneNode=function(){ const c=mkEl('div'); c._text=inner._text;
      c.querySelectorAll=function(){return [];}; return c; };
    return wrap;
  });
};
globalThis.__qAutoState={count:0,paused:false,busy:false};
globalThis.window.__qAuto={
  count:()=>globalThis.__qAutoState.count,
  paused:()=>globalThis.__qAutoState.paused,
  busy:()=>globalThis.__qAutoState.busy,
  panel:()=>null, log:()=>{}, sid:()=>'sess-1',
  send:t=>{globalThis.__sentText=t;return Promise.resolve(true);}
};
globalThis.setInterval=(f,ms)=>{globalThis.__tick=f;return 1;};
globalThis.setTimeout=(f)=>{try{f();}catch(e){}return 1;};
