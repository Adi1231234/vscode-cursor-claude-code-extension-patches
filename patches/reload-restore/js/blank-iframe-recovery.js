let __self=this,__loaded=!1,__att=0;
let __md=__PE__.webview.onDidReceiveMessage(function(){
  __loaded=!0;
  try{__md.dispose()}catch(_){}
});
let __try=function(){
  if(__loaded||__att>=3||!__PE__.visible)return;
  __att++;
  try{__PE__.webview.html=__self.getHtmlForWebview(__PE__.webview,__PT__,__PR__,!1,__PN__)}catch(_){}
  setTimeout(__try,3000)
};
setTimeout(__try,4000);
__PE__.onDidChangeViewState(function(){
  if(!__loaded&&__PE__.visible)__try()
});