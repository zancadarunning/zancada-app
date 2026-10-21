(function(){
  try{
    var pref = localStorage.getItem('zancada_theme');
    if(pref === 'light' || pref === 'dark') document.documentElement.setAttribute('data-theme', pref);
    var isLight = pref === 'light' || (pref !== 'dark' && window.matchMedia('(prefers-color-scheme: light)').matches);
    document.getElementById('theme-color-meta').setAttribute('content', isLight ? '#F2F4EC' : '#0A0A0A');
  }catch(e){}
})();
