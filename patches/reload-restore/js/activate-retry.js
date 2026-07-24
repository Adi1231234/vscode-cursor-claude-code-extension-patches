else if(__U__.initialSession){
  let __ra=function(k){
    return __L__.activateSessionFromServer(__U__.initialSession,__U__.initialPrompt).then((__G__)=>{
      if(__G__)return;
      if(k<10){setTimeout(function(){__ra(k+1)},1000);return}
      __L__.createSession({isExplicit:!1}).then((__V__)=>{
        if(__V__&&__U__.initialPrompt)__V__.initialPrompt.value=__U__.initialPrompt
      })
    })
  };
  __ra(0)
}