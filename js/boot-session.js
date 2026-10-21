(function(){
  try{
    var hasSession = false;
    for(var i=0; i<localStorage.length && !hasSession; i++){
      var k = localStorage.key(i);
      if(k && k.indexOf('sb-') === 0 && k.indexOf('-auth-token') !== -1) hasSession = true;
    }
    for(var j=0; j<sessionStorage.length && !hasSession; j++){
      var k2 = sessionStorage.key(j);
      if(k2 && k2.indexOf('sb-') === 0 && k2.indexOf('-auth-token') !== -1) hasSession = true;
    }
    if(hasSession) document.documentElement.classList.add('zc-maybe-session');
  }catch(e){}
})();
