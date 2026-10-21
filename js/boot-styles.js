// Hojas de estilo de terceros (tipografías, mapa) que se piden sin bloquear el dibujo de la página: llegan con media="print" y acá se pasan a
// "all" cuando terminan de cargar. (Antes lo hacía un onload escrito en el HTML; sin código inline la CSP lo permite menos.)
(function () {
  var links = document.querySelectorAll('link[data-async-css]');
  Array.prototype.forEach.call(links, function (l) {
    var activar = function () { l.media = 'all'; };
    l.addEventListener('load', activar);
    setTimeout(activar, 4000);   // por si el evento ya pasó o la red falla: el estilo se aplica igual cuando llegue
  });
})();
