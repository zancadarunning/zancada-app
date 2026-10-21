/* zcBootDone(): retira la pantalla de arranque. Lo llama app.js cuando ya hay algo real para mostrar (la app, el
   login o el onboarding). Espera a las tipografias (maximo 500 ms) para que el texto no "salte" al destaparse, y a un
   minimo de 350 ms para que no parpadee si la carga fue instantanea. Red de seguridad: a los 12 s se retira igual. */
(function(){
  var t0 = Date.now(), done = false;
  // Si la carga tarda más de ~0,9 s, la marca da paso a un esqueleto de Inicio (más tranquilizador que una barrita).
  setTimeout(function(){ if(done) return; var b = document.getElementById('boot'); if(b) b.classList.add('zc-boot-skel'); }, 900);
  function remove(){
    var b = document.getElementById('boot'); if(!b) return;
    b.classList.add('zc-boot-out');
    setTimeout(function(){ if(b.parentNode) b.parentNode.removeChild(b); }, 420);
  }
  window.zcBootDone = function(){
    if(done) return; done = true;
    var wait = Math.max(0, 350 - (Date.now() - t0));
    var fonts = (document.fonts && document.fonts.ready) ? Promise.race([document.fonts.ready, new Promise(function(r){ setTimeout(r, 500); })]) : Promise.resolve();
    fonts.then(function(){ setTimeout(remove, wait); }, function(){ setTimeout(remove, wait); });
  };
  setTimeout(function(){ window.zcBootDone(); }, 12000);
})();
