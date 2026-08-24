else if(__U__.initialSession){
  __PRE__
  let __ra=function(k){
    return __L__.activateSessionFromServer(__U__.initialSession,__U__.initialPrompt).then((__G__)=>{
      if(__G__)return;
      if(k<10){setTimeout(function(){__ra(k+1)},1000);return}
      __FAIL__
      __L__.createSession({isExplicit:!1}).then((__V__)=>{
        if(__V__&&__U__.initialPrompt)__V__.initialPrompt.value=__U__.initialPrompt
      })
    }).catch(()=>{__CATCH__})
  };
  __ra(0)
}
