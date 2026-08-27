// Minimal DOM/browser stubs - only what the panel script actually touches.
function mkEl(tag){
  const e={tagName:tag,nodeType:1,className:'',style:{},children:[],attrs:{},_text:'',
    isConnected:true,parentNode:null,listeners:{},
    get parentElement(){return this.parentNode&&this.parentNode.nodeType===1?this.parentNode:null;},
    appendChild(c){c.parentNode=this;this.children.push(c);return c;},
    insertBefore(c,r){
      if(c.parentNode){c.parentNode.children=c.parentNode.children.filter(x=>x!==c);}
      c.parentNode=this;
      var i=r?this.children.indexOf(r):-1;
      if(i<0){this.children.push(c);}else{this.children.splice(i,0,c);}
      return c;},
    removeChild(c){this.children=this.children.filter(x=>x!==c);c.parentNode=null;},
    addEventListener(k,f){(this.listeners[k]=this.listeners[k]||[]).push(f);},
    click(){(this.listeners.click||[]).forEach(f=>f({preventDefault(){},stopPropagation(){},target:this,currentTarget:this}));},
    all(){return this.children.reduce((a,c)=>a.concat([c],c.all?c.all():[]),[]);},
    dispatchEvent(ev){return __afDispatch(this,ev);},
    removeEventListener(k,f){if(this.listeners[k])this.listeners[k]=this.listeners[k].filter(x=>x!==f);},setAttribute(k,v){this.attrs[k]=v;},
    getAttribute(k){return this.attrs[k];},
    querySelectorAll(sel){ return __afQueryAll(sel, this); },
    querySelector(sel){
      var m=String(sel).match(/^\[class\*=["']?([^"'\]]+)["']?\]$/);
      var sub=m?m[1]:null;
      var c=String(sel).replace('.','');
      var hit=null;
      var walk=function(n){
        for(var i=0;i<n.children.length&&!hit;i++){
          var cn=String(n.children[i].className||'');
          var k=cn.split(/\s+/);
          if(sub?cn.indexOf(sub)>=0:k.indexOf(c)>=0){hit=n.children[i];return;}
          walk(n.children[i]);
        }
      };
      walk(this);return hit;},closest(){return globalThis.__form;},
    _shown:true,
    getBoundingClientRect(){return this._shown?{top:100,bottom:126,left:50,width:26,height:26}
      :{top:0,bottom:0,left:0,width:0,height:0};},
    getClientRects(){return this._shown?[{width:26,height:26}]:[];},
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
    get previousElementSibling(){
      if(!this.parentNode)return null;
      var i=this.parentNode.children.indexOf(this);
      return i>0?this.parentNode.children[i-1]:null;},
    get nextElementSibling(){
      if(!this.parentNode)return null;
      var i=this.parentNode.children.indexOf(this);
      return (i>=0&&i+1<this.parentNode.children.length)?this.parentNode.children[i+1]:null;},get offsetWidth(){return 200;},get offsetHeight(){return 120;}};
  return e;
}
const body=mkEl('body');

/* Real event dispatch, because a keyboard is the thing being tested.

   The stub had click() and nothing else, so no test could press a key - and the
   dialog turned out to be unusable without a mouse, which is the sort of thing a
   test suite exists to say out loud. */
class __AfEvent {
  constructor(type, init) {
    this.type = type;
    Object.assign(this, init || {});
    this.defaultPrevented = false;
    this._stopped = false;
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this._stopped = true; }
}
globalThis.KeyboardEvent = class extends __AfEvent {};
globalThis.MouseEvent = class extends __AfEvent {};
globalThis.Event = __AfEvent;

/* Listeners on the document are registered with capture by the dialog, so they
   run before anything in the tree. The stub runs them first for the same reason:
   Escape is handled there and nowhere else. */
const __docListeners = {};
function __afDispatch(target, ev) {
  ev.target = ev.target || target;
  for (const f of __docListeners[ev.type] || []) {
    ev.currentTarget = globalThis.document;
    f(ev);
    if (ev._stopped) return !ev.defaultPrevented;
  }
  for (let n = target; n; n = n.parentNode) {
    for (const f of (n.listeners && n.listeners[ev.type]) || []) {
      ev.currentTarget = n;
      f(ev);
      if (ev._stopped) return !ev.defaultPrevented;
    }
    if (!ev.bubbles) break;
  }
  return !ev.defaultPrevented;
}

/* A tree search, so a test can ask what is actually on screen.

   document.querySelector returned null for everything and querySelectorAll
   answered only the transcript, which meant no test could look at the dialog at
   all - the keyboard being unreachable and Escape closing the dialog out from
   under an open dropdown were both found by driving a real panel, because
   nothing here could see them.

   Simple selectors, plus descendant combinators: a tag, a .class, an [attr] or
   [attr="value"], several of those on one element, a space-separated chain of
   them, and a comma-separated list. No child or sibling combinators.

   The chain matters. Answering a descendant selector as if only its last part
   were written looked like an acceptable shortcut and was not: a test asking for
   '.__afPair .__afBoxHead span' got every span in the document. */
function __afMatchesOne(el, part) {
  const atoms = part.match(/^[a-zA-Z]+|\.[^.[\]]+|\[[^\]]+\]/g) || [];
  return atoms.every((a) => {
    if (a[0] === '.') return String(el.className || '').split(/\s+/).indexOf(a.slice(1)) >= 0;
    if (a[0] === '[') {
      const m = a.slice(1, -1).match(/^([^=]+)(?:="?([^"]*)"?)?$/);
      if (!m) return false;
      const v = el.getAttribute ? el.getAttribute(m[1]) : undefined;
      return m[2] === undefined ? v != null : String(v) === m[2];
    }
    return String(el.tagName || '').toLowerCase() === a.toLowerCase();
  });
}

function __afMatches(el, sel) {
  const parts = String(sel).trim().split(/\s+/);
  if (!__afMatchesOne(el, parts[parts.length - 1])) return false;
  let n = el.parentNode;
  for (let i = parts.length - 2; i >= 0; i--) {
    while (n && !__afMatchesOne(n, parts[i])) n = n.parentNode;
    if (!n) return false;
    n = n.parentNode;
  }
  return true;
}

function __afWalk(root) {
  const out = [];
  (function rec(n) {
    for (const c of n.children || []) { out.push(c); rec(c); }
  })(root);
  return out;
}

function __afQueryAll(sel, root) {
  const sels = String(sel).split(',').map((s) => s.trim()).filter(Boolean);
  return __afWalk(root || body).filter((el) => sels.some((s) => __afMatches(el, s)));
}
globalThis.document={createElement:mkEl,
  createTextNode(t){const n=mkEl('#text');n._text=String(t==null?'':t);return n;},
  documentElement:{clientHeight:800,clientWidth:1200},
  body,
  addEventListener(k,f){(__docListeners[k]=__docListeners[k]||[]).push(f);},
  removeEventListener(k,f){if(__docListeners[k])__docListeners[k]=__docListeners[k].filter(x=>x!==f);},
  dispatchEvent(ev){return __afDispatch(body,ev);},
  querySelector(sel){return __afQueryAll(sel)[0]||null;}};
/* Enough of getComputedStyle for the one property the panel reads. It is the
   zoom, and reading it is how the dialog learns the scale it is painted at -
   the quotient it used to infer that from is 1 at every zoom in the Electron
   VS Code ships. Without nodeType and parentElement above, the loop that walks
   up to find it never ran a single step, and the test that covers the zoom
   passed against a code path it never entered. */
globalThis.getComputedStyle=(n)=>({zoom:(n&&n.style&&n.style.zoom)||'',
  color:'',opacity:'',backgroundColor:'',display:'',position:''});
globalThis.window={getComputedStyle:(n)=>globalThis.getComputedStyle(n),addEventListener(k,f){if(k==='message')globalThis.__onMsg=f;
  (globalThis.__winListeners[k]=globalThis.__winListeners[k]||[]).push(f);},
  removeEventListener(k,f){if(globalThis.__winListeners[k])globalThis.__winListeners[k]=globalThis.__winListeners[k].filter(x=>x!==f);},
  innerWidth:1200,innerHeight:800};
globalThis.__winListeners={};
const store={};
globalThis.localStorage={getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
globalThis.__store=store;
globalThis.confirm=()=>true;
globalThis.sent=[];
const input=mkEl('div');
globalThis.__form=mkEl('form');
body.appendChild(globalThis.__form);
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
  if(String(sel).indexOf(CLS.msg)<0) return __afQueryAll(sel);
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
/* The panel has no clock here: its interval callback is captured so a test can
   step it, and its timeouts run at once. Anything that spawns a real process
   must hold the real timers before requiring this file - run.js arms a timeout
   that kills the child, and under this stub it fires on spawn. See
   e2e/README.md. */
globalThis.setInterval=(f,ms)=>{globalThis.__tick=f;return 1;};
globalThis.setTimeout=(f)=>{try{f();}catch(e){}return 1;};
