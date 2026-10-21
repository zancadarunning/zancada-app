(function(){
  var supported = ['es','en','pt','fr','it','de'];
  var nav = ((navigator.language || navigator.userLanguage || 'es')+'').slice(0,2).toLowerCase();
  var initial = supported.indexOf(nav) >= 0 ? nav : 'es';
  window.__ZANCADA_INITIAL_LANG__ = initial;
  document.write('<script src="/locales/' + initial + '.js"><\/script>');
})();
