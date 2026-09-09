/* Se actualiza a mano cada vez que se sube una versión nueva — se usa para detectar
   si hay una versión más nueva del index.html publicada y recargar sola la app. */
const APP_VERSION = '2026-09-09T16:50:00Z';
/* ================= NOVEDADES ("qué hay de nuevo") =================
   APP_VERSION cambia con CADA build (varias veces por día mientras iteramos),
   así que no sirve como versión "de release" para mostrarle algo al usuario --
   compararíamos contra un timestamp que cambió por un fix de un pixel y le
   mostraríamos "novedades" vacías todo el tiempo. Esta lista es manual y
   curada a propósito: cada entrada es un cambio real que vale la pena contarle
   a alguien que ya tiene la app instalada. El id de cada entrada es para
   siempre -- una vez publicada una entrada, no se le cambia el id ni se borra
   (si el cambio queda obsoleto, se deja de agregar entradas nuevas nomás). El
   texto en sí vive en los locales (changelog_<algo> en cada idioma), como el
   resto de los textos de la app. */
const CHANGELOG = [
  {id:'2026-09-gpx-export', key:'changelog_gpx_export'},
  {id:'2026-09-pace-calc', key:'changelog_pace_calc'},
  {id:'2026-09-achievements', key:'changelog_achievements'},
  {id:'2026-09-social', key:'changelog_social'},
  {id:'2026-09-redesign', key:'changelog_redesign'},
  {id:'2026-09-profile-redesign', key:'changelog_profile_redesign'},
  {id:'2026-09-achievements-pr', key:'changelog_achievements_pr'},
  {id:'2026-09-cancel-session', key:'changelog_cancel_session'},
  {id:'2026-09-trainby', key:'changelog_trainby'},
  {id:'2026-09-weather', key:'changelog_weather'},
  {id:'2026-09-autopause', key:'changelog_autopause'},
  {id:'2026-09-reschedule-weather', key:'changelog_reschedule_weather'},
  {id:'2026-09-race-phase', key:'changelog_race_phase'},
  {id:'2026-09-event-plan-decouple', key:'changelog_event_plan_decouple'},
  {id:'2026-09-preserve-custom-days', key:'changelog_preserve_custom_days'},
  {id:'2026-09-weekly-volume-fix', key:'changelog_weekly_volume_fix'},
  {id:'2026-09-preserve-cancelled-days', key:'changelog_preserve_cancelled_days'},
  {id:'2026-09-persist-race-fix', key:'changelog_persist_race_fix'},
  {id:'2026-09-coach-schedule-undo', key:'changelog_coach_schedule_undo'},
  {id:'2026-09-reschedule-skip-cancelled', key:'changelog_reschedule_skip_cancelled'},
  {id:'2026-09-run-recovery-duration-fix', key:'changelog_run_recovery_duration_fix'},
];
function maybeShowWhatsNew(){
  if(!state.onboarded) return;
  let lastSeen;
  try{ lastSeen = localStorage.getItem('zancada_last_seen_changelog'); }catch(e){ lastSeen = null; }
  if(lastSeen === null || lastSeen === undefined){
    // No hay nada guardado -- puede ser una instalación nueva (no tiene sentido
    // mostrarle "novedades" a alguien que recién está conociendo la app) o
    // alguien que ya la usaba de antes de que existiera este sistema (tampoco
    // le podemos mostrar de golpe todo el historial pasado como si fuera nuevo).
    // En los dos casos, arrancamos "al día" desde ahora en silencio.
    try{ localStorage.setItem('zancada_last_seen_changelog', CHANGELOG[CHANGELOG.length-1].id); }catch(e){}
    return;
  }
  const lastSeenIdx = CHANGELOG.findIndex(c=>c.id===lastSeen);
  const unseen = lastSeenIdx>=0 ? CHANGELOG.slice(lastSeenIdx+1) : CHANGELOG;
  if(!unseen.length) return;
  document.getElementById('whats-new-list').innerHTML = unseen.map(c=>`<li>${t(c.key)}</li>`).join('');
  document.getElementById('whats-new-modal').style.display = 'block';
}
function closeWhatsNew(){
  document.getElementById('whats-new-modal').style.display = 'none';
  try{ localStorage.setItem('zancada_last_seen_changelog', CHANGELOG[CHANGELOG.length-1].id); }catch(e){}
}
/* I18N ahora vive en /locales/*.js (cargados antes que este archivo, ver index.html) — window.I18N ya está armado para cuando llegamos acá. */
/* Cuando la app corre empaquetada nativa (Capacitor, iOS), el HTML/JS vive adentro del
   binario -- no hay un servidor propio sirviendo /api/* como pasa en la PWA web, así que
   hay que pegarle directo al dominio real. window.Capacitor lo inyecta solo el runtime
   nativo al arrancar; en el navegador/PWA no existe, y ahí seguimos usando rutas relativas
   como siempre (mismo origen, sin necesidad de CORS). Envolver cada fetch a /api/ con
   apiUrl(...) es lo único que hace falta para que el mismo app.js sirva a los dos casos. */
function apiUrl(path){
  const native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  return native ? ('https://zancada.org' + path) : path;
}
const LANG_NAMES={es:"español",en:"English",pt:"português",fr:"français",it:"italiano",de:"Deutsch"};
// Nombres de idioma capitalizados, como aparecen en las opciones del selector -- LANG_NAMES
// de arriba está en minúscula a propósito (se usa dentro de una frase del prompt del coach).
const LANG_DISPLAY={es:"Español",en:"English",pt:"Português",fr:"Français",it:"Italiano",de:"Deutsch"};
const LOCALE_MAP={es:"es-AR",en:"en-US",pt:"pt-BR",fr:"fr-FR",it:"it-IT",de:"de-DE"};
function detectInitialLang(){
  const supported = ['es','en','pt','fr','it','de'];
  const nav = ((navigator.language || navigator.userLanguage || 'es')+'').slice(0,2).toLowerCase();
  return supported.includes(nav) ? nav : 'es';
}
let lang = detectInitialLang();
function t(key, vars){
  let s = (I18N[lang]&&I18N[lang][key]) || I18N.es[key] || key;
  if(vars) Object.keys(vars).forEach(k=>{ s = s.replace('{'+k+'}', vars[k]); });
  return s;
}
function applyStaticTranslations(){
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el=>{ el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>{ el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el=>{ el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.querySelectorAll('a[href^="/privacy.html"]').forEach(el=>{ el.href = apiUrl('/privacy.html?lang=' + lang); });
  document.querySelectorAll('a[href^="/terms.html"]').forEach(el=>{ el.href = apiUrl('/terms.html?lang=' + lang); });
  document.getElementById('pauseBtn').textContent = tracker.running ? t('run_pause') : t('run_resume');
  [...document.getElementById('perfil-lang-choice').children].forEach(c=>c.classList.toggle('active', c.dataset.v===lang));
  const langSummaryEl = document.getElementById('perfil-lang-summary');
  if(langSummaryEl) langSummaryEl.textContent = LANG_DISPLAY[lang] || lang;
}
function setLang(code){
  lang = code; state.lang = code;
  applyStaticTranslations();
  populateOnboardDays();
  if(state.onboarded){ renderAll(); renderHistory(); renderZones(); renderPerfilDays(); persist(); }
}
document.getElementById('perfil-lang-choice').addEventListener('click', e=>{
  const c = e.target.closest('.choice'); if(!c) return;
  setLang(c.dataset.v);
});


/* ================= ICONS ================= */
const ICONS = {
  bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.45 1 1.2 1 2.1h5c0-.9.4-1.65 1-2.1A6 6 0 0 0 12 3z"/></svg>',
  coach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5.5h16v11H8l-4 4v-4H4z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
  faceBad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9.5"/><path d="M8.5 15.5c1-1.3 2.2-2 3.5-2s2.5.7 3.5 2"/><circle cx="9" cy="9.5" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="9.5" r="1" fill="currentColor" stroke="none"/></svg>',
  faceGood: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9.5"/><path d="M8 14c1.2 1.3 2.6 2 4 2s2.8-.7 4-2"/><circle cx="9" cy="9.5" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="9.5" r="1" fill="currentColor" stroke="none"/></svg>',
  faceGreat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9.5"/><path d="M7.5 13.5c1.4 2 2.9 3 4.5 3s3.1-1 4.5-3"/><path d="M7.7 9.2a2 2 0 0 1 2.6 0M13.7 9.2a2 2 0 0 1 2.6 0"/></svg>',
  // Silueta de zapatilla "chunky" (suela alta, estilo Vomero) rellena de un solo color --
  // elegida a mano probando varias iteraciones con el usuario hasta que la silueta se
  // pareciera de verdad a una zapatilla de running y no a una figura abstracta.
  shoe: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M3.3 15.2 C2.6 13 2.8 10.5 3.6 9.3 C4 9 4.2 8.8 4.6 9 C5.2 9.3 5.8 9.8 6.2 10.4 C6.9 9.9 7.7 9.2 8.6 9 C11 9.6 15 11 18.5 13.6 C19.6 14.3 20.4 15 20.8 16 L21 16 Q22.3 16 22.3 17.2 L22.3 18 Q22.3 19.3 21 19.3 L2.8 19.3 Q1.6 19.3 1.6 18 L1.6 16.4 Q1.6 15.2 2.8 15.2 Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
  empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12a8 8 0 1 0 3-6.3"/><path d="M4 5v4h4"/><path d="M12 8v4l3 2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6.5 9 17.5l-5-5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5 2 20.5h20L12 3.5z"/><line x1="12" y1="9.5" x2="12" y2="14"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/></svg>',
  chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 5 8 12 15 19"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 5 16 12 9 19"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3.5 4.5 6.3V11c0 5 3.2 8.6 7.5 10.2 4.3-1.6 7.5-5.2 7.5-10.2V6.3L12 3.5z"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"/><path d="M5 4.5s2-1.3 4.5-1.3 3.5 1.5 6 1.5 3.5-1 3.5-1v9s-1.5 1-3.5 1-3.5-1.5-6-1.5-4.5 1.3-4.5 1.3z"/></svg>',
  // Mismo ícono que usa el tab "Plan" de la tabbar (index.html) -- lo reusamos acá para
  // que "agregar al calendario" se lea visualmente como la misma acción en toda la app.
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17M8 3v3M16 3v3"/></svg>',
  cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><line x1="12" y1="11" x2="12" y2="16.5"/><circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.8 21.8 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a21.8 21.8 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
  medal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 2.5 10.5 8M15.5 2.5 13.5 8"/><circle cx="12" cy="14.5" r="6.5"/><path d="M12 11.2l1.1 2.2 2.4.35-1.75 1.7.4 2.4-2.15-1.15-2.15 1.15.4-2.4-1.75-1.7 2.4-.35z" fill="currentColor" stroke="none"/></svg>',
  locate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="M15.5 10.2l6-3.2v10l-6-3.2z"/></svg>',
  stopwatch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6M12 2v2"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-10-9.3C.4 8 1.8 4.5 5 3.5c2-.6 4 .2 5.2 2C11.4 3.7 13.4 2.9 15.4 3.5c3.2 1 4.6 4.5 3 7.7-2.5 4.7-10 9.3-10 9.3z"/></svg>',
  heartFilled: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 20.5s-7.5-4.6-10-9.3C.4 8 1.8 4.5 5 3.5c2-.6 4 .2 5.2 2C11.4 3.7 13.4 2.9 15.4 3.5c3.2 1 4.6 4.5 3 7.7-2.5 4.7-10 9.3-10 9.3z"/></svg>'
};

/* ================= FEEDBACK: toast / confirm / haptics ================= */
function haptic(pattern){
  // En la app nativa (Capacitor) usamos el plugin Haptics -- iOS nunca soportó la
  // Vibration API del navegador, así que sin esto no vibraba nunca ahí. El plugin
  // se registra solo como Capacitor.Plugins.Haptics apenas corre nativo, sin
  // necesitar import ni bundler (ver mobile/README para el detalle).
  try{
    const Haptics = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
    if(Haptics){ Haptics.impact({ style: 'MEDIUM' }); return; }
  }catch(e){}
  try{ if(navigator.vibrate) navigator.vibrate(pattern); }catch(e){}
}
/* ---- Micro-festejo (confetti) ----
   Los dos únicos momentos donde ya existía un showToast('success') atado a algo que el
   corredor realmente LOGRÓ (no un guardado de rutina): una marca personal nueva y llegar
   a la meta semanal. Son justo los disparadores correctos para un festejo visual chiquito
   -- nada de librerías, un puñado de <span> con los mismos colores de la paleta de la
   app, cayendo con una animación CSS y sacándose solos del DOM al terminar. Respeta
   prefers-reduced-motion (no todos quieren cosas moviéndose por la pantalla). */
function celebrate(){
  try{
    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const layer = document.createElement('div');
    layer.className = 'confetti-layer';
    document.body.appendChild(layer);
    const colors = ['#D6FF3F','#4ADE80','#FACC15','#FB923C','#5B9BFF','#FF6B5D'];
    for(let i=0;i<26;i++){
      const piece = document.createElement('span');
      piece.className = 'confetti-piece';
      const size = 6 + Math.random()*6;
      piece.style.left = Math.random()*100+'%';
      piece.style.width = size+'px';
      piece.style.height = (size*0.4)+'px';
      piece.style.background = colors[i % colors.length];
      piece.style.animationDuration = (1.1 + Math.random()*0.7)+'s';
      piece.style.animationDelay = (Math.random()*0.25)+'s';
      layer.appendChild(piece);
    }
    setTimeout(()=>{ layer.remove(); }, 2200);
  }catch(e){}
}
// Escapa texto libre (nombres, mensajes de chat, etc.) antes de insertarlo
// en el HTML. Sin esto, alguien podía poner algo como <img onerror=...> como
// nombre de perfil, de evento, o incluso como nombre de una actividad de
// Strava, y ese código se ejecutaba cada vez que se mostraba en la app.
function escapeHtml(str){
  if(str===null || str===undefined) return '';
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function sysMsgWithIcon(icon, text){
  return `<span class="icon-sq" style="width:12px; height:12px; vertical-align:-1px; margin-right:4px;">${icon}</span>${text}`;
}
// El coach a veces usa **negrita** al estilo markdown para resaltar algo, y a veces
// arma listas con líneas que arrancan en "- ". Escapamos el texto primero (por
// seguridad) y recién ahí convertimos ambas cosas, para no abrir la puerta a que
// texto manipulado inyecte HTML.
function formatCoachText(text){
  const withBold = escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const lines = withBold.split('\n');
  const parts = [];
  let listBuf = [];
  const flushList = () => { if(listBuf.length){ parts.push('<ul class="msg-list">'+listBuf.map(li=>`<li>${li}</li>`).join('')+'</ul>'); listBuf = []; } };
  lines.forEach(line=>{
    const m = line.match(/^-\s+(.+)$/);
    if(m){ listBuf.push(m[1]); }
    else { flushList(); parts.push(line); }
  });
  flushList();
  return parts.join('\n');
}
const countUpTimers = new WeakMap();
function animateCountUp(el, target, decimals, duration){
  if(!el) return;
  decimals = decimals || 0;
  duration = duration || 650;
  const prevTimer = countUpTimers.get(el);
  if(prevTimer) cancelAnimationFrame(prevTimer);
  if(!(target > 0)){ el.textContent = (0).toFixed(decimals); return; }
  const start = performance.now();
  function tick(now){
    const p = Math.min(1, (now-start)/duration);
    const eased = 1 - Math.pow(1-p, 3);
    el.textContent = (target*eased).toFixed(decimals);
    if(p < 1){ countUpTimers.set(el, requestAnimationFrame(tick)); }
    else { el.textContent = target.toFixed(decimals); countUpTimers.delete(el); }
  }
  countUpTimers.set(el, requestAnimationFrame(tick));
}
let toastHideTimer = null;
function showToast(message, type){
  type = type || 'info';
  let wrap = document.getElementById('toast-wrap');
  if(!wrap){
    wrap = document.createElement('div');
    wrap.id = 'toast-wrap'; wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const icon = type==='error' ? ICONS.warn : type==='success' ? ICONS.check : '';
  // escapeHtml() acá porque el mensaje puede traer texto libre del usuario
  // interpolado (por ejemplo el nombre de una zapatilla, vía
  // t('shoe_wear_alert_msg', {name:...})). Ningún llamado a showToast()
  // necesita insertar HTML de verdad, así que escapar siempre acá adentro
  // es más seguro que confiar en que cada call-site se acuerde de escapar
  // los datos del usuario que le pasa.
  wrap.innerHTML = `<div class="toast ${type}" id="toast-el">${icon?`<span class="icon-sq" style="width:16px; height:16px; flex-shrink:0;">${icon}</span>`:''}<span>${escapeHtml(message)}</span></div>`;
  const el = document.getElementById('toast-el');
  requestAnimationFrame(()=>el.classList.add('show'));
  if(type==='error') haptic(35);
  clearTimeout(toastHideTimer);
  toastHideTimer = setTimeout(()=>{
    el.classList.remove('show');
    setTimeout(()=>{ if(wrap) wrap.innerHTML = ''; }, 250);
  }, 3200);
}
function showConfirm(message, opts){
  opts = opts || {};
  return new Promise(resolve=>{
    let backdrop = document.getElementById('confirm-backdrop');
    if(!backdrop){
      backdrop = document.createElement('div');
      backdrop.id = 'confirm-backdrop'; backdrop.className = 'confirm-backdrop';
      document.body.appendChild(backdrop);
    }
    const confirmText = opts.confirmText || t('confirm_yes');
    const cancelText = opts.cancelText || t('cancel_word');
    const danger = !!opts.danger;
    backdrop.innerHTML = `<div class="confirm-card"><p>${message}</p><div class="confirm-actions">
      <button class="btn btn-outline" id="confirm-cancel-btn">${cancelText}</button>
      <button class="btn ${danger?'btn-danger':'btn-primary'}" id="confirm-ok-btn">${confirmText}</button>
    </div></div>`;
    backdrop.classList.add('show');
    haptic(15);
    const cleanup = (result)=>{
      backdrop.classList.remove('show');
      setTimeout(()=>{ if(backdrop) backdrop.innerHTML = ''; }, 180);
      resolve(result);
    };
    document.getElementById('confirm-cancel-btn').onclick = ()=>cleanup(false);
    document.getElementById('confirm-ok-btn').onclick = ()=>{ haptic(20); cleanup(true); };
    backdrop.onclick = (e)=>{ if(e.target===backdrop) cleanup(false); };
  });
}

/* ================= STATE ================= */
let state = {onboarded:false, profile:{}, plan:[], runs:[], shoes:[], event:null, chat:[], lang:lang, painLog:[], readinessLog:[]};
let pendingEmail = '';
let currentUserId = null;
// Nombre de usuario para la parte social (usernames + seguir amigos + feed + likes).
// Vive en su propia tabla de Supabase (no adentro de app_state) porque hace falta
// poder buscarlo entre usuarios sin exponer el resto del perfil -- ver sql/social.sql.
let myUsername = null;
/* ---- pantalla de "confirmá tu mail", con reintento automático de login mientras se espera ---- */
let confirmEmailAddr = '';
let confirmEmailPw = '';
let confirmEmailPollTimer = null;
let confirmEmailResendCooldown = false;
const DAY_KEYS = ['mon','tue','wed','thu','fri','sat','sun'];
const ZONE_COLORS = {1:'#5B9BFF',2:'#4ADE80',3:'#FACC15',4:'#FB923C',5:'#FF6B5D'};
const MI_PER_KM = 0.621371, KM_PER_MI = 1.609344;
function isImperial(){ return state.profile && state.profile.units === 'imperial'; }
function distUnit(){ return isImperial() ? 'mi' : 'km'; }
function fmtDist(km, decimals=2){
  const val = isImperial() ? km * MI_PER_KM : km;
  return val.toFixed(decimals);
}
function fmtPace(minPerKm){
  if(!minPerKm || minPerKm<=0) return '—';
  const val = isImperial() ? minPerKm * KM_PER_MI : minPerKm;
  return `${Math.floor(val)}:${String(Math.round((val%1)*60)).padStart(2,'0')}`;
}

/* ---- Supabase: cuentas y datos reales, sincronizados entre dispositivos ---- */
const SUPABASE_URL = 'https://smcicgaraqlvalxvdriz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__JlJqs3dTRRxBcR0QhkUpA_sSPPOW6j';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---- Notificaciones push ---- */
const VAPID_PUBLIC_KEY = 'BLBsiej6FgDHLt2S5DvrDfYU9_jf1_qfIzRswRgjcvLvMTPT1lDnVo9NUu8lRfYSVobM_zI80R9KWDbfb-tZXfU';
// El service worker es para la PWA web (offline + detectar versión nueva). Adentro del
// wrapper nativo (Capacitor) no tiene sentido -- ahí las actualizaciones llegan por la
// tienda, no por la red, y registrar un SW sobre los archivos empaquetados solo suma
// riesgo de comportamiento raro de caché sin ningún beneficio real.
if('serviceWorker' in navigator && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())){
  navigator.serviceWorker.register('/sw.js').catch(e=>console.error('SW registration failed', e));
}
function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g,'+').replace(/_/g,'/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for(let i=0; i<rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
async function updatePushStatusDisplay(){
  const el = document.getElementById('push-status');
  const toggle = document.getElementById('push-toggle');
  if(!el) return;
  if(!('serviceWorker' in navigator) || !('PushManager' in window)){ el.textContent = t('push_not_supported'); if(toggle) toggle.disabled = true; return; }
  try{
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    el.textContent = sub ? t('push_enabled') : t('push_disabled');
    if(toggle) toggle.checked = !!sub;
  }catch(e){ el.textContent = t('push_disabled'); if(toggle) toggle.checked = false; }
}
async function handlePushToggle(checked){
  if(checked) await enablePushNotifications();
  else await disablePushNotifications();
}
async function enablePushNotifications(){
  try{
    if(!('serviceWorker' in navigator) || !('PushManager' in window)){ showToast(t('push_not_supported'),'error'); await updatePushStatusDisplay(); return; }
    if(Notification.permission === 'default'){
      const proceed = await showConfirm(t('push_soft_ask'), { confirmText: t('push_soft_ask_confirm'), cancelText: t('push_soft_ask_cancel') });
      if(!proceed){ await updatePushStatusDisplay(); return; }
    }
    const reg = await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if(permission !== 'granted'){ showToast(t('push_denied'),'error'); await updatePushStatusDisplay(); return; }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
    await supabaseClient.from('push_subscriptions').upsert({ user_id: currentUserId, subscription: sub.toJSON() });
    await updatePushStatusDisplay();
  }catch(e){ console.error(e); showToast(t('push_error'),'error'); await updatePushStatusDisplay(); }
}
async function disablePushNotifications(){
  try{
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if(sub) await sub.unsubscribe();
    if(currentUserId) await supabaseClient.from('push_subscriptions').delete().eq('user_id', currentUserId);
    await updatePushStatusDisplay();
  }catch(e){ console.error(e); }
}

/* ---- Respaldo local (para no perder una carrera si se guarda sin conexión) ---- */
function pendingBackupKey(uid){ return 'zancada_pending_'+uid; }
function savePendingBackup(){
  if(!currentUserId) return;
  try{ localStorage.setItem(pendingBackupKey(currentUserId), JSON.stringify({data:state, ts:Date.now()})); }catch(e){}
}
function clearPendingBackup(){
  if(!currentUserId) return;
  try{ localStorage.removeItem(pendingBackupKey(currentUserId)); }catch(e){}
}
function readPendingBackup(uid){
  try{ const raw = localStorage.getItem(pendingBackupKey(uid)); return raw ? JSON.parse(raw) : null; }catch(e){ return null; }
}
function hasPendingBackup(){
  if(!currentUserId) return false;
  return !!readPendingBackup(currentUserId);
}
function updateSyncBadge(){
  const badge = document.getElementById('sync-pending-badge');
  if(!badge) return;
  if(hasPendingBackup()){ badge.style.display = 'inline-flex'; }
  else { badge.style.display = 'none'; }
}
let loadedStateVersion = null;
// persist() guarda SIEMPRE el objeto `state` completo (todo: plan, chat, perfil...) en un
// solo upsert -- y se llama muchas veces seguidas en una sola interacción (por ejemplo, cada
// herramienta que usa el coach en el chat llama a persist() por su cuenta, y al final sendChat
// llama a persist() de nuevo con la respuesta ya agregada al historial). Sin coordinación, esas
// llamadas viajan como pedidos de red INDEPENDIENTES y pueden llegar a Supabase en cualquier
// orden -- si la primera (con menos datos: por ejemplo, sin el mensaje final del coach) tarda
// más que la segunda y la "pisa" al llegar después, el resultado guardado termina siendo una
// versión más vieja que la que el corredor vio en pantalla. Reportado por el usuario: le pidió
// un cambio al coach, cerró la app sin querer apenas se aplicó el cambio, y al reabrirla el
// cambio de plan estaba pero el mensaje del chat (el suyo y el del coach) habían desaparecido.
// Un solo guardado "en vuelo" por vez, con a lo sumo un guardado más encolado (que siempre
// termina mandando el `state` más actual al momento de salir, no una copia vieja), evita esa
// carrera: nunca hay dos pedidos de red compitiendo por llegar último.
let persistInFlight = false;
let persistQueued = false;
async function persist(){
  if(!currentUserId) return;
  if(persistInFlight){ persistQueued = true; return; }
  persistInFlight = true;
  try{
    const nowIso = new Date().toISOString();
    await supabaseClient.from('app_state').upsert({ user_id: currentUserId, data: state, updated_at: nowIso });
    loadedStateVersion = nowIso; // este guardado ya es la versión más nueva que conocemos
    clearPendingBackup();
  }catch(e){
    console.error('persist error', e);
    savePendingBackup(); // sin conexión: lo guardamos en el teléfono y reintentamos más tarde
  }
  updateSyncBadge();
  persistInFlight = false;
  if(persistQueued){ persistQueued = false; persist(); } // había un pedido más pendiente -- lo mandamos ahora con el `state` más actual
}
/* ---- aviso de conflicto entre dispositivos -----
   Antes, el "último que guarda gana" a ciegas: si abrís la app en el celu y la tablet
   casi al mismo tiempo, el segundo guardado pisaba al primero sin avisar nada, aunque
   tuviera cambios reales adentro (una carrera cargada, una molestia, lo que sea).
   Esto no arma un merge real (sería un cambio mucho más grande) pero al menos detecta
   la situación y le avisa al corredor ANTES de que pierda algo, dándole la opción de
   recargar los datos más nuevos en vez de seguir de largo con lo que tiene en pantalla. */
let checkingRemoteConflict = false;
async function checkForRemoteConflict(){
  if(!currentUserId || checkingRemoteConflict || document.visibilityState !== 'visible') return;
  checkingRemoteConflict = true;
  try{
    const { data, error } = await supabaseClient.from('app_state').select('updated_at').eq('user_id', currentUserId).maybeSingle();
    if(error || !data || !data.updated_at) return;
    if(loadedStateVersion && new Date(data.updated_at).getTime() > new Date(loadedStateVersion).getTime()){
      const reload = await showConfirm(t('sync_conflict_text'), {confirmText:t('sync_conflict_reload'), cancelText:t('sync_conflict_dismiss')});
      if(reload){ location.reload(); return; }
      // si el corredor prefiere seguir acá, no le repetimos el mismo aviso mil veces --
      // adoptamos la versión remota como "conocida" para no comparar contra algo viejo,
      // aunque el contenido en pantalla siga siendo el local hasta que guarde de nuevo.
      loadedStateVersion = data.updated_at;
    }
  }catch(e){ console.error('conflict check error', e); }
  finally{ checkingRemoteConflict = false; }
}
if(typeof document !== 'undefined'){
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') checkForRemoteConflict(); });
  window.addEventListener('focus', checkForRemoteConflict);
}
function flushPendingBackup(){
  if(!currentUserId || (typeof navigator!=='undefined' && navigator.onLine===false)) return;
  if(hasPendingBackup()) persist();
}
if(typeof window !== 'undefined'){
  window.addEventListener('online', flushPendingBackup);
  setInterval(flushPendingBackup, 25000);
}
/* ---- offline banner ---- */
function updateOfflineBanner(){
  const el = document.getElementById('offline-banner');
  if(!el) return;
  el.classList.toggle('show', typeof navigator!=='undefined' && navigator.onLine===false);
}
if(typeof window !== 'undefined'){
  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);
  document.addEventListener('DOMContentLoaded', updateOfflineBanner);
}
async function loadUserAndEnter(user, isRetry){
  currentUserId = user.id;
  try{
    const { data, error } = await supabaseClient.from('app_state').select('data, updated_at').eq('user_id', user.id).maybeSingle();
    if(error) throw error;
    if(data && data.data && Object.keys(data.data).length){
      state = data.data; lang = state.lang || 'es';
      loadedStateVersion = data.updated_at || null;
      const pending = readPendingBackup(user.id);
      if(pending && pending.data && (pending.data.runs||[]).length > (state.runs||[]).length){
        // había una carrera guardada en el teléfono que no llegó a subirse la última vez -> la recuperamos
        state = pending.data; lang = state.lang || lang;
        persist();
      }
      // Al mantener profile.tz al día en cada apertura (no solo en el onboarding)
      // cubrimos tanto a corredores que ya venían usando la app antes de que
      // existiera este campo (lo tienen undefined) como a alguien que viaja y abre
      // la app desde otro huso horario -- así el recordatorio diario del servidor
      // siempre le llega a la hora local de donde esté HOY, no de donde se registró.
      const deviceTz = detectDeviceTz();
      if(deviceTz && state.profile && state.profile.tz !== deviceTz){
        state.profile.tz = deviceTz;
        persist();
      }
      if(!state.chat || !state.chat.length) seedCoachGreeting(); else renderChat();
      enterApp();
      return;
    }
    // la consulta funcionó y confirmó que no hay datos guardados -> recién registrado, onboarding real
    pendingEmail = user.email;
    document.getElementById('splash').style.display='none';
    document.getElementById('login').style.display='none';
    document.getElementById('onboard').style.display='block';
    resetOnboardSteps();
  }catch(e){
    console.error('load error', e);
    // OJO: nunca caemos al onboarding por un error de red/consulta — si lo hiciéramos, un usuario
    // con historial real podría terminar viendo la pantalla de "usuario nuevo" y, al completarla,
    // pisar sus datos guardados. Reintentamos una vez y, si sigue fallando, mostramos un error real.
    if(!isRetry){ setTimeout(()=>loadUserAndEnter(user, true), 1500); return; }
    const retry = await showConfirm(t('load_error_text'), {confirmText:t('load_error_retry'), cancelText:t('perfil_logout')});
    if(retry) loadUserAndEnter(user);
    else { await supabaseClient.auth.signOut(); location.reload(); }
  }
}
function isPasswordStrong(pw){
  // Requisito mínimo para cualquier contraseña nueva (alta de cuenta o "olvidé mi
  // contraseña"): 8 caracteres, al menos una mayúscula, una minúscula y un número. Esto
  // se valida acá en el cliente ANTES de mandarla a Supabase -- Supabase solo exige un
  // mínimo de caracteres, no complejidad, así que sin este chequeo una contraseña como
  // "12345678" pasaría sin problema.
  return typeof pw === 'string' && pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw);
}
function translateAuthError(error){
  const msg = (error && error.message) || '';
  if(msg.includes('Invalid login')) return t('login_err_wrong_password');
  if(msg.includes('already registered') || msg.includes('User already registered')) return t('login_err_exists');
  if(msg.includes('Password should be')) return t('login_err_password');
  return msg || t('login_err');
}
function togglePasswordVisibility(inputId, btn){
  const input = document.getElementById(inputId);
  if(!input) return;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  btn.innerHTML = `<span class="icon-sq" style="width:18px; height:18px;">${showing ? ICONS.eye : ICONS.eyeOff}</span>`;
  btn.setAttribute('aria-label', t(showing ? 'aria_show_password' : 'aria_hide_password'));
}
function setBtnBusy(btnId, busy, loadingLabel){
  const btn = document.getElementById(btnId);
  if(!btn) return;
  if(busy){
    if(btn.disabled) return;
    btn.dataset.originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.style.opacity = '.65';
    btn.innerHTML = `<span class="icon-sq spin-icon" style="width:14px; height:14px; margin-right:6px; vertical-align:-2px;">${ICONS.refresh}</span>${loadingLabel}`;
  } else {
    btn.disabled = false;
    btn.style.opacity = '';
    if(btn.dataset.originalHtml){ btn.innerHTML = btn.dataset.originalHtml; delete btn.dataset.originalHtml; }
  }
}

/* ================= LOGIN / ONBOARD ================= */
function goLogin(){ document.getElementById('splash').style.display='none'; document.getElementById('login').style.display='block'; }
function goSignup(){ document.getElementById('login').style.display='none'; document.getElementById('signup').style.display='block'; }
function goBackToLogin(){ document.getElementById('signup').style.display='none'; document.getElementById('login').style.display='block'; }
function goToLoginFromSignup(){
  // Le pasamos el email ya tipeado a la pantalla de login para que no tenga que
  // volver a escribirlo -- viene del cartel de "ya existe una cuenta con ese email".
  document.getElementById('login-email').value = document.getElementById('signup-email').value;
  goBackToLogin();
}
async function handleGoogleSignIn(btnId){
  setBtnBusy(btnId, true, t('google_loading'));
  try{
    const { error } = await supabaseClient.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: window.location.origin } });
    if(error){ console.error(error); showToast(t('login_err'),'error'); }
  }finally{ setBtnBusy(btnId, false); }
}
// "Sign in with Apple" -- solo se usa en la app nativa de iOS (ver toggle de visibilidad
// de los botones en init(), más abajo). Usa el plugin @capawesome/capacitor-apple-sign-in,
// que se registra solo como Capacitor.Plugins.AppleSignIn apenas corre nativo, sin
// necesitar import ni bundler (mismo patrón que haptic() más arriba). TODO: falta probar
// este flujo en un dispositivo real una vez armado el proyecto Xcode -- ver mobile/README.md.
async function handleAppleSignIn(btnId){
  setBtnBusy(btnId, true, t('google_loading'));
  try{
    const AppleSignIn = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AppleSignIn;
    if(!AppleSignIn){ showToast(t('login_err'),'error'); return; }
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const result = await AppleSignIn.signIn({ scopes: ['email', 'fullName'], nonce });
    const idToken = result && result.idToken;
    if(!idToken) throw new Error('Apple sign-in: no idToken en la respuesta');
    const { error } = await supabaseClient.auth.signInWithIdToken({ provider:'apple', token: idToken, nonce });
    if(error){ console.error(error); showToast(t('login_err'),'error'); }
  }catch(e){
    console.error(e);
    showToast(t('login_err'),'error');
  }finally{ setBtnBusy(btnId, false); }
}

/* ---- Strava ---- */
const STRAVA_CLIENT_ID = '276715';
async function connectStrava(){
  // Pedimos un "state" firmado por el backend antes de mandar al usuario a
  // Strava, en vez de mandar el user_id suelto — así el callback puede
  // verificar que la conexión realmente corresponde a quien inició sesión,
  // y no a un link armado a mano con el user_id de otra persona.
  try{
    const { data: { session } } = await supabaseClient.auth.getSession();
    if(!session){ showToast(t('strava_connect_error'),'error'); return; }
    const res = await fetch(apiUrl('/api/strava-init'), {
      method:'POST',
      headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}`}
    });
    if(!res.ok) throw new Error('strava-init failed');
    const { state } = await res.json();
    // El redirect_uri tiene que ser SIEMPRE este link fijo a zancada.org -- nunca algo
    // armado con window.location.origin. Strava solo acepta un redirect_uri cuyo dominio
    // coincida exactamente con el "Authorization Callback Domain" configurado en el panel
    // de la app (zancada.org), y window.location.origin puede ser cualquier otra cosa
    // según desde dónde se haya cargado la página: capacitor://localhost o
    // https://localhost en la app nativa, o el dominio crudo de Vercel
    // (zancada-app.vercel.app) si alguien entra por ahí en vez de por zancada.org -- en
    // cualquiera de esos casos Strava rechazaba todo con "redirect_uri invalid". Como el
    // backend (api/strava-auth.js) vive en el mismo proyecto sin importar qué dominio usó
    // el usuario para llegar hasta acá, no hace falta que coincida con el origin real.
    const redirectUri = 'https://zancada.org/api/strava-auth';
    const url = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=activity:read_all&state=${encodeURIComponent(state)}&approval_prompt=force`;
    window.location.href = url;
  }catch(e){
    console.error(e);
    showToast(t('strava_connect_error'),'error');
  }
}
async function updateStravaStatusDisplay(){
  const el = document.getElementById('strava-status');
  const btn = document.getElementById('strava-connect-btn');
  const note = document.getElementById('strava-sync-note');
  if(!el || !currentUserId) return;
  try{
    const { data } = await supabaseClient.from('strava_connections').select('athlete_id').eq('user_id', currentUserId).maybeSingle();
    if(data){
      el.textContent = t('perfil_strava_connected'); el.className = 'tag tag-asfalto';
      if(btn){ btn.textContent = t('perfil_strava_disconnect'); btn.onclick = disconnectStrava; }
      // Mismo aviso que el cartel de Historial (ver getStravaSyncIssue), pero acá como
      // nota corta -- este es justo el lugar donde ya está el botón para reconectar.
      const issue = getStravaSyncIssue();
      if(note){
        if(issue){ note.textContent = issue.title; note.style.color = issue.severity==='error' ? 'var(--danger)' : 'var(--clay)'; note.style.display = 'block'; }
        else { note.style.display = 'none'; }
      }
    } else {
      el.textContent = t('perfil_native'); el.className = 'tag tag-asfalto';
      if(btn){ btn.textContent = t('perfil_strava_connect'); btn.onclick = connectStrava; }
      if(note) note.style.display = 'none';
    }
  }catch(e){}
}
async function disconnectStrava(){
  if(!currentUserId) return;
  try{
    const { data: { session } } = await supabaseClient.auth.getSession();
    if(session){
      // le pedimos al backend que revoque el permiso del lado de Strava, no solo
      // que borre la conexión de nuestra base (si esto falla, borramos igual la
      // fila local desde acá para no dejar al usuario con el botón trabado).
      const res = await fetch(apiUrl('/api/strava-disconnect'), {
        method:'POST',
        headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}`}
      });
      if(!res.ok) throw new Error('strava-disconnect failed');
    } else {
      await supabaseClient.from('strava_connections').delete().eq('user_id', currentUserId);
    }
  }catch(e){
    console.error(e);
    try{ await supabaseClient.from('strava_connections').delete().eq('user_id', currentUserId); }catch(e2){}
  }
  // El backend ya borró las carreras importadas de Strava de app_state.data.runs --
  // pero acá en memoria seguían estando. Si no las sacamos también de state.runs,
  // el próximo persist() (por cualquier otra acción del usuario) las manda de
  // vuelta al servidor y deshace el borrado. Recalculamos el km de las zapatillas
  // igual que hace el backend, sumando solo las carreras que quedan.
  if(state.runs && state.runs.some(r=>r.source==='strava')){
    state.runs = state.runs.filter(r=>r.source!=='strava');
    if(state.shoes){
      state.shoes.forEach(shoe=>{
        shoe.km = state.runs.filter(r=>String(r.shoeId)===String(shoe.id)).reduce((a,r)=>a+(r.distanceKm||0),0);
      });
    }
    renderHistory(); renderHome(); renderPerfil(); persist();
  }
  await updateStravaStatusDisplay();
}
async function handleSignIn(){
  if(document.getElementById('login-submit-btn')?.disabled) return;
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const err = document.getElementById('login-err');
  err.style.display='none';
  if(!email || !email.includes('@')){ err.textContent = t('login_err'); err.style.display='block'; return; }
  if(!password){ err.textContent = t('login_err_password'); err.style.display='block'; return; }
  setBtnBusy('login-submit-btn', true, t('login_loading'));
  try{
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if(error){ err.textContent = translateAuthError(error); err.style.display='block'; return; }
    await loadUserAndEnter(data.user);
  }finally{ setBtnBusy('login-submit-btn', false); }
}
async function handleSignUp(){
  if(document.getElementById('signup-submit-btn')?.disabled) return;
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const err = document.getElementById('signup-err');
  err.style.display='none';
  if(!email || !email.includes('@')){ err.textContent = t('login_err'); err.style.display='block'; return; }
  if(!password || !isPasswordStrong(password)){ err.textContent = t('login_err_password_weak'); err.style.display='block'; return; }
  setBtnBusy('signup-submit-btn', true, t('signup_loading'));
  try{
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if(error){ err.textContent = translateAuthError(error); err.style.display='block'; return; }
    // Supabase, por diseño, no devuelve un error cuando el email ya tiene una cuenta
    // confirmada -- para no dejar que cualquiera use el formulario de registro para
    // "probar" qué emails existen (email enumeration), responde como si el alta
    // hubiera sido exitosa y necesitara confirmación, sin mandar ningún mail real.
    // Lo detectamos igual revisando identities: viene vacío solo en este caso puntual
    // (cuenta ya existente Y ya confirmada); para una cuenta recién creada, o una
    // todavía sin confirmar, identities trae al menos un elemento.
    if(data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0){
      err.innerHTML = `${t('login_err_exists')} <button type="button" class="small-link" style="padding:0; font-size:inherit; vertical-align:baseline;" onclick="goToLoginFromSignup()">${t('login_go_signin_short')}</button>`;
      err.style.display='block'; return;
    }
    if(!data.session){ showConfirmEmailScreen(email, password); return; }
    pendingEmail = email;
    currentUserId = data.user.id;
    document.getElementById('signup').style.display='none';
    document.getElementById('onboard').style.display='block';
    resetOnboardSteps();
  }finally{ setBtnBusy('signup-submit-btn', false); }
}
function showConfirmEmailScreen(email, password){
  confirmEmailAddr = email;
  confirmEmailPw = password;
  document.getElementById('signup').style.display = 'none';
  document.getElementById('confirm-email').style.display = 'block';
  // Resaltamos el email en negrita/color dentro de la frase, en vez de mostrarlo como texto plano.
  // Escapamos el email vía textContent->innerHTML (truco seguro) por si contuviera caracteres especiales.
  const marker = '';
  const escapeHtml = (str)=>{ const d = document.createElement('span'); d.textContent = str; return d.innerHTML; };
  const template = t('confirm_email_lead', {email: marker});
  document.getElementById('confirm-email-lead').innerHTML = template.split(marker)
    .map(escapeHtml)
    .join(`<strong>${escapeHtml(email)}</strong>`);
  startConfirmEmailPolling();
}
function stopConfirmEmailPolling(){
  if(confirmEmailPollTimer){ clearInterval(confirmEmailPollTimer); confirmEmailPollTimer = null; }
}
function startConfirmEmailPolling(){
  stopConfirmEmailPolling();
  /* Mientras el usuario tiene esta pantalla abierta, probamos loguearlo cada pocos segundos.
     El login solo va a funcionar una vez que confirme el mail (Supabase rechaza el login con
     "Email not confirmed" hasta ese momento) — así detectamos la confirmación sin importar si
     abrió el link de otra pestaña, del celular, o de otra compu, sin depender de que el link de
     confirmación vuelva a esta misma pestaña. */
  confirmEmailPollTimer = setInterval(async ()=>{
    if(document.visibilityState !== 'visible') return;
    try{
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email: confirmEmailAddr, password: confirmEmailPw });
      if(!error && data.session){
        stopConfirmEmailPolling();
        const user = data.user;
        confirmEmailPw = '';
        document.getElementById('confirm-email').style.display = 'none';
        await loadUserAndEnter(user);
      }
    }catch(e){ /* todavía no confirmó, seguimos esperando */ }
  }, 4000);
}
function goBackFromConfirmEmail(){
  stopConfirmEmailPolling();
  confirmEmailPw = '';
  document.getElementById('confirm-email').style.display = 'none';
  document.getElementById('signup').style.display = 'block';
}
async function handleResendConfirmation(){
  if(confirmEmailResendCooldown) return;
  confirmEmailResendCooldown = true;
  setBtnBusy('confirm-email-resend-btn', true, t('signup_loading'));
  try{
    const { error } = await supabaseClient.auth.resend({ type:'signup', email: confirmEmailAddr });
    if(error){ showToast(translateAuthError(error), 'error'); return; }
    showToast(t('confirm_email_resent_toast'), 'success');
  } finally {
    setBtnBusy('confirm-email-resend-btn', false);
    setTimeout(()=>{ confirmEmailResendCooldown = false; }, 30000);
  }
}
async function handleForgotPassword(){
  if(document.getElementById('login-forgot-btn')?.disabled) return;
  const email = document.getElementById('login-email').value.trim();
  const err = document.getElementById('login-err');
  err.style.display='none';
  if(!email || !email.includes('@')){ err.textContent = t('login_err'); err.style.display='block'; return; }
  setBtnBusy('login-forgot-btn', true, t('forgot_loading'));
  try{
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.href.split('#')[0] });
    if(error){ err.textContent = translateAuthError(error); err.style.display='block'; return; }
    err.style.color = 'var(--hivis)';
    err.textContent = t('login_recovery_sent'); err.style.display='block';
  }finally{ setBtnBusy('login-forgot-btn', false); }
}
supabaseClient.auth.onAuthStateChange((event, session)=>{
  if(event === 'PASSWORD_RECOVERY'){
    document.getElementById('splash').style.display='none';
    document.getElementById('login').style.display='none';
    document.getElementById('onboard').style.display='none';
    document.getElementById('recovery-set-password').style.display='block';
  }
});
async function submitNewPassword(){
  if(document.getElementById('recovery-submit-btn')?.disabled) return;
  const newPw = document.getElementById('recovery-new-pw').value;
  const err = document.getElementById('recovery-new-pw-err');
  err.style.display='none';
  if(!newPw || !isPasswordStrong(newPw)){ err.textContent = t('login_err_password_weak'); err.style.display='block'; return; }
  setBtnBusy('recovery-submit-btn', true, t('login_loading'));
  try{
    const { error } = await supabaseClient.auth.updateUser({ password: newPw });
    if(error){ err.textContent = translateAuthError(error); err.style.display='block'; return; }
    const { data: { user } } = await supabaseClient.auth.getUser();
    document.getElementById('recovery-set-password').style.display='none';
    await loadUserAndEnter(user);
  }finally{ setBtnBusy('recovery-submit-btn', false); }
}
document.getElementById('ob-terrain').addEventListener('click', e=>{
  const c=e.target.closest('.choice'); if(!c) return;
  [...document.getElementById('ob-terrain').children].forEach(x=>x.classList.remove('active')); c.classList.add('active');
});
document.getElementById('ob-trainby').addEventListener('click', e=>{
  const c=e.target.closest('.choice'); if(!c) return;
  [...document.getElementById('ob-trainby').children].forEach(x=>x.classList.remove('active')); c.classList.add('active');
});
document.getElementById('perfil-trainby-toggle').addEventListener('click', e=>{
  const c=e.target.closest('.choice'); if(!c) return;
  [...document.getElementById('perfil-trainby-toggle').children].forEach(x=>x.classList.remove('active')); c.classList.add('active');
  state.profile.trainBy = c.dataset.v;
  renderAll(); renderHistory(); persist();
});
document.getElementById('ob-runnertype').addEventListener('click', e=>{
  const c=e.target.closest('.choice'); if(!c) return;
  [...document.getElementById('ob-runnertype').children].forEach(x=>x.classList.remove('active')); c.classList.add('active');
  const isActive = c.dataset.v==='active';
  document.getElementById('ob-currentkm-wrap').style.display = isActive?'block':'none';
  document.getElementById('ob-newrunner-note').style.display = isActive?'none':'block';
});
// Los divs clickeables (choice chips, day-pill, cards con onclick, toggles de "mas info")
// no tenian equivalente de teclado en ningun lado de la app (a diferencia de
// swipe-action-delete, que si tiene role="button"/tabindex) -- un usuario que navega solo
// con teclado o lector de pantalla no podia completar el onboarding, tocar el check-in de
// "como te sentis", ni abrir ningun panel de ayuda/tips. Selector generico ([onclick] que
// no sea ya un elemento nativamente focuseable) en vez de listar clase por clase, para que
// cubra tambien los que se agreguen a futuro sin repetir este tratamiento cada vez.
function makeClickablesFocusable(root){
  (root||document).querySelectorAll('[onclick]:not(button):not(a):not(input):not(select):not(textarea)').forEach(el=>{
    if(!el.hasAttribute('tabindex')) el.setAttribute('tabindex','0');
    if(!el.hasAttribute('role')) el.setAttribute('role','button');
  });
}
makeClickablesFocusable();
document.querySelectorAll('.choice, .day-pill').forEach(el=>{
  if(!el.hasAttribute('tabindex')) el.setAttribute('tabindex','0');
  if(!el.hasAttribute('role')) el.setAttribute('role','button');
});
document.addEventListener('keydown', e=>{
  if(e.key!=='Enter' && e.key!==' ') return;
  const el = e.target;
  if(!el.hasAttribute || (!el.hasAttribute('onclick') && !(el.classList && (el.classList.contains('choice') || el.classList.contains('day-pill'))))) return;
  e.preventDefault();
  el.click();
});
document.getElementById('voice-toggle').addEventListener('click', e=>{
  const c=e.target.closest('.choice'); if(!c) return;
  [...document.getElementById('voice-toggle').children].forEach(x=>x.classList.remove('active')); c.classList.add('active');
  state.voiceEnabled = c.dataset.v === 'on';
  persist();
});
document.getElementById('units-toggle').addEventListener('click', e=>{
  const c=e.target.closest('.choice'); if(!c) return;
  [...document.getElementById('units-toggle').children].forEach(x=>x.classList.remove('active')); c.classList.add('active');
  state.profile.units = c.dataset.v;
  renderAll(); renderHistory(); persist();
});
document.getElementById('ob-days').addEventListener('click', e=>{
  const c=e.target.closest('.day-pill'); if(!c) return;
  c.classList.toggle('active');
});
document.getElementById('perfil-days').addEventListener('click', e=>{
  const c=e.target.closest('.day-pill'); if(!c) return;
  c.classList.toggle('active');
  markPerfilDirty('days'); // toggle de clase, no dispara 'change' -- hay que marcarlo a mano
});
function populateOnboardDays(){
  document.querySelectorAll('#ob-days .day-pill').forEach(el=>{ el.textContent = t('day_'+el.dataset.v).slice(0,3); });
}
function renderPerfilDays(){
  const selected = state.profile.trainingDays || [];
  document.getElementById('perfil-days').innerHTML = DAY_KEYS.map(d=>
    `<div class="day-pill${selected.includes(d)?' active':''}" data-v="${d}" role="button" tabindex="0">${t('day_'+d).slice(0,3)}</div>`).join('');
  const daysSummaryEl = document.getElementById('perfil-days-summary');
  if(daysSummaryEl) daysSummaryEl.textContent = DAY_KEYS.filter(d=>selected.includes(d)).map(d=>t('day_'+d)).join(', ');
}
function preserveLivedDays(oldPlan, newPlan){
  if(!oldPlan || !oldPlan.length) return newPlan;
  const todayIdx = (new Date().getDay()+6)%7;
  // Ojo: antes esto preservaba TODOS los días hasta hoy del plan viejo, sin
  // chequear si ese día realmente se "vivió" (hecho o salteado). Eso hacía
  // que, al cambiar los días de entrenamiento (o el evento, o el perfil),
  // un día que pasó a ser descanso en el plan nuevo se pisara con la
  // versión vieja -- que todavía tenía terreno/zona/distancia de cuando
  // era día de entrenamiento -- y apareciera con el cartel de zona
  // colgado en un día de descanso. Ahora solo preservamos los días que de
  // verdad se marcaron como hechos o salteados; el resto toma el plan
  // nuevo, que es el que refleja el cambio que acaba de hacer el usuario.
  return newPlan.map((newDay,i)=>{
    const old = oldPlan[i];
    if(i<=todayIdx && old && (old.status==='done'||old.status==='skipped')) return old;
    // Un día que ya pasó (antes de hoy) y que NO se vivió (ni se hizo ni se marcó
    // salteado todavía) no puede recibir, encima, un entrenamiento nuevo del plan
    // recién generado -- sería asignarle retroactivamente un ejercicio a un día
    // de la semana que ya terminó, lo cual no tiene sentido (reportado por el
    // usuario: "hoy miércoles, no me puede aparecer un ejercicio el martes").
    // Lo dejamos como descanso, que es lo que de hecho pasó ese día.
    if(i<todayIdx) return {day:newDay.day, typeKey:'rest', dist:0, terrain:null, zone:null, beginner:newDay.beginner};
    // Un día de hoy en adelante que el corredor ya personalizó a mano por el chat del coach
    // (modificar_sesion / ajustar_volumen_semana, ver d.custom) tampoco se pisa acá -- si no,
    // cualquier guardado que dispare una regeneración del plan (datos personales, objetivo,
    // días de entreno, una carrera en Próximos Eventos) le borraba en silencio un ajuste
    // puntual que el corredor había pedido a propósito, reemplazándolo por lo que el
    // algoritmo generaría de cero (reportado por el usuario: tenía 3 sesiones de 5km puestas
    // a mano y, al cargar una carrera en Próximos Eventos, se le reemplazaron solas por el
    // plan genérico, sin avisar).
    // Un día CANCELADO a propósito (cancelar_sesion, ver d.cancelled) tiene el mismo problema
    // aunque no sea "custom": a propósito queda con la misma pinta que un día de descanso
    // cualquiera (sin sesión inventada de reemplazo), pero justamente por eso, sin este chequeo,
    // cualquier regeneración posterior lo "resucitaba" con una sesión nueva del algoritmo -- el
    // día seguía formando parte de los días de entreno del perfil, así que el generador no tenía
    // forma de saber que ese día en particular se había cancelado a pedido explícito del
    // corredor. Reportado por el usuario: canceló martes y viernes, dejó miércoles y jueves en
    // 6km cada uno, y al rato martes y viernes volvieron a aparecer con un entrenamiento nuevo.
    if(old && (old.custom || old.cancelled)) return old;
    return newDay;
  });
}
// Un día queda "cerrado" (no editable, ni por el usuario ni por el coach en el chat)
// apenas ya pasó cronológicamente dentro de la semana actual, o ya se vivió (hecho o
// salteado) -- no tiene sentido que se le asigne ahora, retroactivamente, un
// entrenamiento distinto a un día de esta semana que ya terminó.
function isDayLocked(dayKey){
  const idx = DAY_KEYS.indexOf(dayKey);
  if(idx === -1) return false;
  const todayIdx = (new Date().getDay()+6)%7;
  if(idx < todayIdx) return true;
  const d = state.plan.find(x=>x.day===dayKey);
  return !!(d && (d.status==='done' || d.status==='skipped'));
}
function relinkTodayRun(){
  const todayIdx = (new Date().getDay()+6)%7;
  const today = state.plan[todayIdx];
  if(!today) return false;
  const alreadyLinked = today.linkedRunId && state.runs.some(r=>r.id===today.linkedRunId);
  if(alreadyLinked) return false;
  const now = new Date();
  const todayRun = (state.runs||[]).find(r=>{
    const d = new Date(r.date);
    return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth() && d.getDate()===now.getDate();
  });
  if(todayRun){ today.status = 'done'; today.linkedRunId = todayRun.id; return true; }
  return false;
}
/* ---- Botones "Guardar" de Perfil: ocultos hasta que hay algo sin guardar ----
   Antes cada sección de Perfil (Datos personales, Metas, Días, Zonas) tenía su botón
   "Guardar" siempre visible, lo que generaba dudas sobre si un cambio ya estaba guardado
   o no. Ahora el botón de cada sección arranca oculto (ver .perfil-save-btn en el CSS) y
   solo aparece cuando el usuario modifica algo dentro de esa tarjeta; al tocarlo, se pide
   una confirmación rápida antes de aplicar el cambio, y el botón vuelve a ocultarse una
   vez guardado (dentro de flashSaved, más abajo).
   markPerfilDirty() se llama tanto desde los listeners delegados de abajo (inputs/selects
   nativos) como a mano desde los pocos lugares que cambian estos campos sin disparar un
   evento nativo (elegir terreno/días con un click en un .choice/.day-pill, o elegir fecha
   de carrera desde el calendario). */
const PERFIL_SAVE_SECTIONS = {
  personal: { cardId: 'perfil-personal-card', btnId: 'save-personal-btn', run: savePersonalData },
  goals:    { cardId: 'perfil-goals-card',    btnId: 'save-goals-btn',    run: saveGoals },
  days:     { cardId: 'perfil-days-card',     btnId: 'save-days-btn',     run: saveTrainingDays },
  zones:    { cardId: 'perfil-zones-card',    btnId: 'save-zones-btn',    run: saveCustomZones },
};
function markPerfilDirty(key){
  const cfg = PERFIL_SAVE_SECTIONS[key];
  const btn = cfg && document.getElementById(cfg.btnId);
  if(btn) btn.classList.add('dirty');
}
function wirePerfilDirtyTracking(){
  Object.keys(PERFIL_SAVE_SECTIONS).forEach(key=>{
    const card = document.getElementById(PERFIL_SAVE_SECTIONS[key].cardId);
    if(!card) return;
    ['input','change'].forEach(evt=>card.addEventListener(evt, ()=>markPerfilDirty(key)));
  });
}
wirePerfilDirtyTracking();
async function confirmAndSave(key){
  const cfg = PERFIL_SAVE_SECTIONS[key];
  if(!cfg) return;
  if(!(await showConfirm(t('perfil_save_confirm_msg')))) return;
  cfg.run();
}
function saveTrainingDays(){
  const selected = [...document.querySelectorAll('#perfil-days .day-pill.active')].map(el=>el.dataset.v);
  if(selected.length===0){ showToast(t('perfil_days_empty_err'),'error'); return; }
  state.profile.trainingDays = DAY_KEYS.filter(d=>selected.includes(d));
  state.plan = preserveLivedDays(state.plan, generatePlan(state.profile, state.weekNumber||1));
  renderAll(); renderZones(); persist();
  flashSaved('save-days-btn');
}
function flashSaved(btnId){
  const btn = document.getElementById(btnId);
  if(!btn) return;
  if(btn.dataset.flashing) return; // evita solapar si tocan varias veces seguidas
  btn.dataset.flashing = '1';
  const original = btn.innerHTML;
  btn.innerHTML = `<span class="icon-sq" style="width:14px; height:14px; margin-right:5px; vertical-align:-2px;">${ICONS.check}</span>${t('save_confirmed')}`;
  btn.classList.add('btn-saved-flash');
  setTimeout(()=>{
    btn.innerHTML = original;
    btn.classList.remove('btn-saved-flash');
    btn.classList.remove('dirty'); // ya se guardó -- el botón vuelve a ocultarse hasta el próximo cambio
    delete btn.dataset.flashing;
  }, 1400);
}
/* ---- cuándo aplicar un cambio de perfil/objetivo que afecta el plan ----
   Editar datos personales o el objetivo semanal puede cambiar el plan de la semana
   ACTUAL de golpe -- lo cual no siempre es lo que el corredor quiere si, por ejemplo,
   ya viene cumpliendo los primeros días de esta semana con el plan viejo y prefiere
   arrancar el ajuste recién el lunes que viene. Por eso, en vez de regenerar el plan
   directo al guardar, primero preguntamos y dejamos el guardado pendiente de esa
   respuesta -- cada opción vive en su propia función (aplicar ahora / aplicar desde
   la semana que viene) en vez de una única función con un if genérico adentro. */
let pendingPlanChangeContext = null; // 'personal' | 'goals'
function openPlanChangeTimingModal(ctx){
  pendingPlanChangeContext = ctx;
  document.getElementById('plan-change-timing-modal').style.display = 'block';
}
function resolvePlanChangeTiming(choice){
  document.getElementById('plan-change-timing-modal').style.display = 'none';
  const ctx = pendingPlanChangeContext;
  pendingPlanChangeContext = null;
  if(ctx === 'personal'){
    if(choice === 'now') applyPersonalDataChangeNow(); else applyPersonalDataChangeNextWeek();
    finishPersonalDataSave();
  } else if(ctx === 'goals'){
    if(choice === 'now') applyGoalsChangeNow(); else applyGoalsChangeNextWeek();
    finishGoalsSave();
  }
}
// --- Datos personales: apartado "a partir de ahora" ---
function applyPersonalDataChangeNow(){
  state.plan = preserveLivedDays(state.plan, generatePlan(state.profile, state.weekNumber||1));
  state.nextWeekOverrides = {}; // el perfil cambió de base -> los cambios puntuales que hubiera para la semana que viene ya no aplican sobre el plan nuevo
}
// --- Datos personales: apartado "desde la semana que viene" ---
function applyPersonalDataChangeNextWeek(){
  // No tocamos state.plan: el plan de ESTA semana queda exactamente como estaba. Las
  // semanas futuras (getNextWeekPlan()/getWeekData() para offset>=1) ya se calculan
  // en el momento a partir de state.profile -- como el perfil ya quedó actualizado
  // arriba, esas semanas van a reflejar el cambio solas a partir del lunes que viene,
  // sin necesidad de guardar nada "pendiente" aparte.
  state.nextWeekOverrides = {}; // esos ajustes puntuales se calcularon sobre el perfil viejo -> ya no aplican
}
function finishPersonalDataSave(){
  renderAll(); renderPerfil(); persist();
  flashSaved('save-personal-btn');
}
function savePersonalData(){
  const weight = parseFloat(document.getElementById('perfil-weight').value);
  const height = parseFloat(document.getElementById('perfil-height').value);
  const terrainChoice = document.querySelector('#perfil-terrain-choice .choice.active');
  const goal = document.getElementById('perfil-goal').value;
  const raceDate = document.getElementById('perfil-racedate').value || null;
  const currentKmInput = document.getElementById('perfil-current-km');
  if(weight>0) state.profile.weight = weight;
  if(height>0) state.profile.height = height;
  if(terrainChoice) state.profile.terrain = terrainChoice.dataset.v;
  if(goal) state.profile.goal = goal;
  state.profile.raceDate = raceDate;
  if(currentKmInput && currentKmInput.value !== ''){
    state.profile.currentWeeklyKm = parseFloat(currentKmInput.value) || 0;
    state.profile.runnerType = 'active';
  }
  state.profile.weeklyKm = calcWeeklyKm(state.profile);
  openPlanChangeTimingModal('personal');
}
// --- Objetivo/meta semanal: apartado "a partir de ahora" ---
function applyGoalsChangeNow(){
  // la meta semanal ahora es un input real del plan (acotado por seguridad en generatePlan),
  // no solo un número decorativo para la barra de progreso -- así que hay que regenerar
  // el plan de la semana y avisarle al coach para que quede todo conectado
  state.plan = preserveLivedDays(state.plan, generatePlan(state.profile, state.weekNumber||1));
  if(state.profile.weeklyGoalKm > 0){
    state.chat.push({role:'coach', text: t('coach_weekly_goal_updated', {km: state.profile.weeklyGoalKm}), ts:Date.now()});
    renderChat();
  }
}
// --- Objetivo/meta semanal: apartado "desde la semana que viene" ---
function applyGoalsChangeNextWeek(){
  // Igual que en datos personales: no tocamos el plan de esta semana, la que viene ya
  // se calcula sola con el perfil actualizado.
  if(state.profile.weeklyGoalKm > 0){
    state.chat.push({role:'coach', text: t('coach_weekly_goal_updated_next_week', {km: state.profile.weeklyGoalKm}), ts:Date.now()});
    renderChat();
  }
}
function finishGoalsSave(){
  renderAll(); persist();
  flashSaved('save-goals-btn');
}
function saveGoals(){
  const weeklyGoal = parseFloat(document.getElementById('perfil-weekly-goal').value) || 0;
  const goalNote = document.getElementById('perfil-goal-note').value.trim();
  const goalChanged = (state.profile.weeklyGoalKm||0) !== weeklyGoal;
  state.profile.weeklyGoalKm = weeklyGoal;
  state.profile.goalNote = goalNote;
  if(goalChanged){
    openPlanChangeTimingModal('goals');
  } else {
    // la meta no cambió de verdad (guardaron solo la nota, por ejemplo) -- no hay nada
    // que el timing pueda afectar, así que no tiene sentido preguntar
    finishGoalsSave();
  }
}
document.getElementById('perfil-terrain-choice').addEventListener('click', e=>{
  const c=e.target.closest('.choice'); if(!c) return;
  [...document.getElementById('perfil-terrain-choice').children].forEach(x=>x.classList.remove('active')); c.classList.add('active');
  markPerfilDirty('personal'); // toggle de clase, no dispara 'change' -- hay que marcarlo a mano
});
function ageFromBirth(dateStr){ const b=new Date(dateStr); return Math.max(10, Math.floor((Date.now()-b.getTime())/(365.25*24*3600*1000))); }
const dateBoxUpdaters = {};
function setupDateBox(inputId, textId, placeholderKey){
  const input = document.getElementById(inputId);
  const text = document.getElementById(textId);
  if(!input || !text) return;
  const update = ()=>{
    if(input.value){
      const d = new Date(input.value+'T00:00:00');
      text.textContent = d.toLocaleDateString(LOCALE_MAP[lang], {day:'numeric', month:'short', year:'numeric'});
      text.classList.remove('placeholder');
    } else {
      text.textContent = placeholderKey ? t(placeholderKey) : '';
      text.classList.add('placeholder');
    }
  };
  update();
  dateBoxUpdaters[inputId] = update;
}
let calTargetInputId = null, calViewDate = new Date(), calSelectedDate = null;
let calViewMode = 'days', calYearsRangeStart = 1995;
function openCalendar(inputId){
  calTargetInputId = inputId;
  const input = document.getElementById(inputId);
  calSelectedDate = input.value ? new Date(input.value+'T00:00:00') : null;
  calViewDate = calSelectedDate ? new Date(calSelectedDate) : new Date();
  renderCalendar();
  document.getElementById('calendar-modal').style.display = 'block';
}
function closeCalendar(){
  document.getElementById('calendar-modal').style.display = 'none';
}
function calNavigate(delta){
  /* El significado de las flechas cambia según qué grilla se esté mostrando: un mes a la
     vez en la vista de días, un año a la vez en la de meses, y un bloque de 16 años en la
     de años — así no hay que ir de a un paso para saltos grandes (ver calShowYears). */
  if(calViewMode === 'years'){ calYearsRangeStart += delta*16; renderCalYears(); return; }
  if(calViewMode === 'months'){ calViewDate.setFullYear(calViewDate.getFullYear() + delta); renderCalMonths(); return; }
  calViewDate.setMonth(calViewDate.getMonth() + delta);
  renderCalendar();
}
function calShowYears(){
  calYearsRangeStart = Math.floor(calViewDate.getFullYear() / 16) * 16;
  renderCalYears();
}
function calShowMonths(year){
  calViewDate.setFullYear(year);
  renderCalMonths();
}
function calSelectMonth(monthIndex){
  calViewDate.setMonth(monthIndex);
  renderCalendar();
}
function renderCalMonths(){
  calViewMode = 'months';
  document.getElementById('cal-grid').style.display = 'none';
  document.getElementById('cal-weekdays').style.display = 'none';
  document.getElementById('cal-years-grid').style.display = 'none';
  document.getElementById('cal-months-grid').style.display = 'grid';
  const y = calViewDate.getFullYear();
  document.getElementById('cal-month-label').textContent = y;
  const today = new Date();
  const selMonth = (calSelectedDate && calSelectedDate.getFullYear()===y) ? calSelectedDate.getMonth() : null;
  document.getElementById('cal-months-grid').innerHTML = Array.from({length:12}, (_,m)=>{
    const label = new Date(y,m,1).toLocaleDateString(LOCALE_MAP[lang], {month:'short'});
    const isCurrent = today.getFullYear()===y && today.getMonth()===m;
    const isSelected = selMonth===m;
    return `<div class="cal-cell ${isCurrent?'current':''} ${isSelected?'selected':''}" onclick="calSelectMonth(${m})">${label}</div>`;
  }).join('');
}
function renderCalYears(){
  calViewMode = 'years';
  document.getElementById('cal-grid').style.display = 'none';
  document.getElementById('cal-weekdays').style.display = 'none';
  document.getElementById('cal-months-grid').style.display = 'none';
  document.getElementById('cal-years-grid').style.display = 'grid';
  document.getElementById('cal-month-label').textContent = `${calYearsRangeStart}–${calYearsRangeStart+15}`;
  const curYear = new Date().getFullYear();
  const selYear = calSelectedDate ? calSelectedDate.getFullYear() : null;
  document.getElementById('cal-years-grid').innerHTML = Array.from({length:16}, (_,i)=>{
    const yr = calYearsRangeStart + i;
    const isCurrent = yr===curYear;
    const isSelected = yr===selYear;
    return `<div class="cal-cell ${isCurrent?'current':''} ${isSelected?'selected':''}" onclick="calShowMonths(${yr})">${yr}</div>`;
  }).join('');
}
function renderCalendar(){
  calViewMode = 'days';
  document.getElementById('cal-grid').style.display = 'grid';
  document.getElementById('cal-weekdays').style.display = 'grid';
  document.getElementById('cal-months-grid').style.display = 'none';
  document.getElementById('cal-years-grid').style.display = 'none';
  const y = calViewDate.getFullYear(), m = calViewDate.getMonth();
  document.getElementById('cal-month-label').textContent = new Date(y,m,1).toLocaleDateString(LOCALE_MAP[lang], {month:'long', year:'numeric'});

  const weekdayBase = new Date(2024,0,1); // lunes
  const weekdayLabels = [];
  for(let i=0;i<7;i++){ const d = new Date(weekdayBase); d.setDate(weekdayBase.getDate()+i); weekdayLabels.push(d.toLocaleDateString(LOCALE_MAP[lang], {weekday:'short'}).slice(0,2)); }
  document.getElementById('cal-weekdays').innerHTML = weekdayLabels.map(w=>`<div>${w}</div>`).join('');

  let startOffset = new Date(y,m,1).getDay() - 1; if(startOffset < 0) startOffset = 6;
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const daysInPrevMonth = new Date(y, m, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);
  const selectedTime = calSelectedDate ? new Date(calSelectedDate.getFullYear(), calSelectedDate.getMonth(), calSelectedDate.getDate()).getTime() : null;

  let cells = [];
  for(let i=startOffset; i>0; i--) cells.push({day: daysInPrevMonth-i+1, other:true});
  for(let d=1; d<=daysInMonth; d++) cells.push({day:d, other:false});
  while(cells.length % 7 !== 0) cells.push({day: cells.length, other:true});

  document.getElementById('cal-grid').innerHTML = cells.map(c=>{
    if(c.other) return `<div class="cal-day other-month">${c.day}</div>`;
    const cellDate = new Date(y,m,c.day);
    const isToday = cellDate.getTime()===today.getTime();
    const isSelected = selectedTime!==null && cellDate.getTime()===selectedTime;
    return `<div class="cal-day ${isToday?'today':''} ${isSelected?'selected':''}" onclick="calSelectDay(${c.day})">${c.day}</div>`;
  }).join('');
}
function calSelectDay(day){
  const y = calViewDate.getFullYear(), m = calViewDate.getMonth();
  const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const input = document.getElementById(calTargetInputId);
  input.value = dateStr;
  dateBoxUpdaters[calTargetInputId] && dateBoxUpdaters[calTargetInputId]();
  if(calTargetInputId === 'perfil-racedate') markPerfilDirty('personal'); // set vía JS, no dispara 'change'
  closeCalendar();
}
setupDateBox('ob-birth','ob-birth-text','date_placeholder');
setupDateBox('ob-racedate','ob-racedate-text','date_placeholder');
setupDateBox('perfil-racedate','perfil-racedate-text','date_placeholder');
setupDateBox('man-date','man-date-text');
setupDateBox('edit-run-date','edit-run-date-text');
setupDateBox('ev-date','ev-date-text','date_placeholder');
/* Fórmula de Tanaka (208 - 0.7*edad) en vez de la clásica 220-edad: la de Tanaka viene de un
   metaanálisis con miles de personas y tiene bastante menos error, sobre todo a medida que
   sube la edad -- 220-edad tiende a subestimar la FC máxima real de gente mayor. Sigue siendo
   una estimación (no reemplaza un test real), pero es la mejor estimación posible sin
   necesidad de ningún test ni equipamiento. */
function estimateHrMax(age){ return Math.round(208 - 0.7*age); }
function computeZones(hrmax){
  return {1:{min:Math.round(hrmax*0.50),max:Math.round(hrmax*0.60)},2:{min:Math.round(hrmax*0.60)+1,max:Math.round(hrmax*0.70)},
    3:{min:Math.round(hrmax*0.70)+1,max:Math.round(hrmax*0.80)},4:{min:Math.round(hrmax*0.80)+1,max:Math.round(hrmax*0.90)},
    5:{min:Math.round(hrmax*0.90)+1,max:hrmax}};
}
const OB_STEP_COUNT = 5;
let obCurrentStep = 1;
function resetOnboardSteps(){
  obCurrentStep = 1;
  obGotoStep(1);
}
function obGotoStep(n){
  obCurrentStep = n;
  document.querySelectorAll('.ob-step').forEach(el=>el.classList.toggle('active', parseInt(el.dataset.step,10)===n));
  document.getElementById('ob-progress-fill').style.width = ((n/OB_STEP_COUNT)*100)+'%';
  document.getElementById('ob-back-btn').style.display = n>1 ? 'flex' : 'none';
  document.getElementById('onboard').scrollTop = 0;
}
function obNextStep(){
  haptic(10);
  if(obCurrentStep < OB_STEP_COUNT) obGotoStep(obCurrentStep+1);
}
function obPrevStep(){
  haptic(10);
  if(obCurrentStep > 1) obGotoStep(obCurrentStep-1);
}
async function finishOnboard(){
  const name = document.getElementById('ob-name').value.trim() || 'Runner';
  const weight = parseFloat(document.getElementById('ob-weight').value) || 70;
  const height = parseFloat(document.getElementById('ob-height').value) || 170;
  const birth = document.getElementById('ob-birth').value || '1995-01-01';
  const runnerType = document.querySelector('#ob-runnertype .choice.active').dataset.v;
  const currentWeeklyKm = runnerType==='active' ? (parseFloat(document.getElementById('ob-currentkm').value) || 0) : 0;
  const terrain = document.querySelector('#ob-terrain .choice.active').dataset.v;
  const trainBy = document.querySelector('#ob-trainby .choice.active').dataset.v;
  const trainingDays = DAY_KEYS.filter(d => document.querySelector(`#ob-days .day-pill[data-v="${d}"]`).classList.contains('active'));
  const goal = document.getElementById('ob-goal').value;
  const raceDate = document.getElementById('ob-racedate').value || null;
  const age = ageFromBirth(birth);
  const hrMax = estimateHrMax(age);
  const hrKnown = false;

  // profile.tz guarda el huso horario del CELULAR del corredor (ej. "America/New_York"
  // para un amigo en Estados Unidos, distinto al nuestro en Argentina) -- lo usa el
  // recordatorio diario del lado del servidor (api/send-reminders.js) para mandar el
  // aviso a la hora local de cada uno, no a una sola hora fija para todo el mundo.
  // detectDeviceTz() está definida más abajo, junto al resto de fecha/hora.
  // createdAt guarda la fecha (YYYY-MM-DD, hora local) en que esta persona terminó el
  // onboarding y arrancó el plan -- lo usa autoSkipPastDays() y computeDailyTrend() para
  // no marcar como "no entrenó" ningún día ANTERIOR a que la cuenta existiera. Antes de
  // esto, alguien que se sumaba un martes con lunes/miércoles/viernes como días de
  // entrenamiento veía el lunes (e incluso el domingo previo) ya marcado como sesión
  // perdida, cuando en realidad todavía ni tenía cuenta esos días.
  state.profile = {email:pendingEmail, name, weight, height, birth, terrain, trainBy, trainingDays: trainingDays.length?trainingDays:['tue','thu','sun'], goal, raceDate, runnerType, currentWeeklyKm, hrMax, hrKnown, hrZones:computeZones(hrMax), tz:detectDeviceTz(), createdAt: todayLocalISO()};
  state.profile.weeklyKm = calcWeeklyKm(state.profile);
  state.weekNumber = 1;
  state.weekStart = getMondayISO(new Date());
  state.plan = generatePlan(state.profile, state.weekNumber);
  state.onboarded = true;
  state.lang = lang;
  state.voiceEnabled = true;
  state.nextWeekOverrides = {};
  document.getElementById('onboard').style.display='none';
  document.getElementById('perfil-name').value = name;
  seedCoachGreeting();
  await persist();
  enterApp();
}
function syncTabbarHeight(){
  const bar = document.getElementById('tabbar');
  if(!bar) return;
  const h = bar.offsetHeight;
  if(h>0) document.documentElement.style.setProperty('--tabbar-h', h+'px');
}
window.addEventListener('resize', syncTabbarHeight);
// BUG NUEVO encontrado por el usuario apenas se probó el cambio anterior: #app usaba
// min-height:100dvh -- eso hacía que la tabbar bajara "escalonado" siguiendo la
// animación del teclado (arreglado pasando a 100svh, un valor FIJO que no se anima).
// Pero svh asume el PEOR caso (todo el chrome del navegador ya expandido) -- así que
// cuando ese chrome está minimizado, o en standalone donde la pantalla real es más
// alta que ese peor caso, #app queda MÁS CHICO que la pantalla real de verdad. Ahí no
// hay nada nuestro pintado -- se ve la barra gris que pinta el propio navegador/
// WebView por fuera del documento (reportada en captura real). Ni dvh (sigue de más,
// vuelve el escalonado) ni svh (se queda corto, vuelve la barra gris) alcanzan solos.
// La solución es la misma que ya usamos para el chat (syncCoachChatLayout): medir
// nosotros mismos window.innerHeight, que en iOS NO se mueve con el teclado (nunca
// vuelve el escalonado) pero SÍ refleja la altura real disponible cuando cambia de
// verdad el chrome del navegador (nunca vuelve el hueco/barra gris). Se guarda en la
// variable CSS --app-min-h; #app la usa como min-height, con 100svh de respaldo por
// si este script todavía no corrió (ver el CSS de #app en index.html).
//
// SEGUNDA VUELTA de este mismo bug, encontrada con una captura real: el fix de arriba
// (medir con JS) no alcanzaba solo -- seguía apareciendo la barra gris, pero SOLO en
// la pantalla del chat con el coach, nunca en las demás. La razón: window.innerHeight,
// leído acá UNA sola vez ni bien corre el script (primerísimo tick), puede todavía no
// reflejar la altura FINAL de verdad -- en iOS, sobre todo en modo standalone, la
// altura utilizable puede "asentarse" un instante después del primer pintado (mismo
// fenómeno ya documentado junto a #splash), sin que eso dispare ningún evento
// "resize" que nos avise para volver a medir. Si esa primera lectura queda un poco
// corta, --app-min-h se congela en ese valor de menos para siempre (nada más lo
// vuelve a tocar salvo un resize real) -- y #app termina más bajo que la pantalla.
// En la mayoría de las pantallas esto no se nota, porque su CONTENIDO real (tarjetas,
// listas) ya es más alto que esa altura de menos y estira #app de todos modos. Pero
// #view-coach es distinta: su único contenido de verdad, #coachChatWrap, es
// position:fixed y por lo tanto no aporta NADA de alto real al flujo (ver el
// comentario junto a flex:1 1 auto en index.html) -- ahí #app queda pegado
// exactamente al valor (corto) de --app-min-h, sin nada de contenido real que lo
// fuerce más alto, y aparece el hueco/barra gris justo debajo de la tabbar. Por eso
// es un bug que se ve SOLO en el chat del coach: no es que esa pantalla tenga algo mal
// puntual, es la única lo bastante "vacía" en el flujo como para exponer el problema
// de fondo. Arreglo en dos partes: (1) re-medir varias veces después de cargar (no
// solo una vez), para agarrar el valor ya asentado aunque no dispare resize, y (2)
// nunca DEJAR CHICA la variable una vez medida más grande (Math.max) -- así una
// medición vieja y corta nunca puede pisar a una más nueva y más alta.
function syncAppMinHeight(){
  const h = window.innerHeight;
  const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-min-h')) || 0;
  document.documentElement.style.setProperty('--app-min-h', Math.max(h, current) + 'px');
}
syncAppMinHeight();
// Reintentos cortos después de la carga inicial, para agarrar el "asentamiento" tardío
// de window.innerHeight en iOS standalone sin depender de que dispare un resize.
[150, 400, 900, 1800].forEach(ms => setTimeout(syncAppMinHeight, ms));
window.addEventListener('resize', syncAppMinHeight);
// Al volver de segundo plano (el usuario cambió de app y volvió) iOS puede haber
// recalculado el chrome disponible sin que haya un resize real que avisarnos.
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) syncAppMinHeight(); });
window.addEventListener('pageshow', syncAppMinHeight);
function enterApp(){
  document.getElementById('splash').style.display='none';
  document.getElementById('login').style.display='none';
  document.getElementById('onboard').style.display='none';
  document.getElementById('mainHeader').style.display='flex';
  document.getElementById('tabbar').style.display='flex';
  document.getElementById('coach-fab-wrap').style.display='block';
  syncTabbarHeight();
  applyStaticTranslations();
  document.getElementById('perfil-name').value = state.profile.name;
  checkWeekRollover();
  autoSkipPastDays();
  autoClearPastEvent();
  repairCorruptedCustomDays();
  checkProactiveCoachNudge();
  checkInactivityCheckin();
  checkPainCheckins();
  refreshEstimatedHrMax();
  checkHrMaxFromRuns();
  updateChatBadge(); // por si algún mensaje del coach se agregó recién arriba (ajuste automático, aviso proactivo) sin pasar por renderChat
  if(relinkTodayRun()) persist();
  [...document.getElementById('voice-toggle').children].forEach(c=>c.classList.toggle('active', c.dataset.v === (state.voiceEnabled===false?'off':'on')));
  [...document.getElementById('units-toggle').children].forEach(c=>c.classList.toggle('active', c.dataset.v === (state.profile.units==='imperial'?'imperial':'metric')));
  [...document.getElementById('perfil-trainby-toggle').children].forEach(c=>c.classList.toggle('active', c.dataset.v === (state.profile.trainBy==='time'?'time':'distance')));
  renderPerfilDays();
  renderAll(); renderHistory(); renderZones();
  showView('inicio');
  setTimeout(checkPendingRating, 600);
  setTimeout(maybeShowInstallBanner, 1200);
  setTimeout(maybeShowWhatsNew, 1800);
  loadMyUsername().then(()=>renderPerfil());
}
async function logout(){ await supabaseClient.auth.signOut(); location.reload(); }
async function resetApp(){
  if(!(await showConfirm(t('reset_confirm_text'), {danger:true, confirmText:t('delete_word')}))) return;
  if(currentUserId){
    try{ await supabaseClient.from('app_state').delete().eq('user_id', currentUserId); }catch(e){}
  }
  await supabaseClient.auth.signOut();
  location.reload();
}
async function deleteAccount(){
  if(!(await showConfirm(t('delete_account_confirm_text'), {danger:true, confirmText:t('delete_account_confirm_btn')}))) return;
  try{
    const { data: { session } } = await supabaseClient.auth.getSession();
    if(!session){ showToast(t('delete_account_error'),'error'); return; }
    const res = await fetch(apiUrl('/api/delete-account'), {
      method:'POST',
      headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}`}
    });
    if(!res.ok) throw new Error('delete-account failed');
    await supabaseClient.auth.signOut();
    location.reload();
  }catch(e){
    showToast(t('delete_account_error'),'error');
  }
}
(async function init(){
  // "Sign in with Apple" solo tiene sentido en la app nativa de iOS (Apple lo exige ahí
  // porque ya ofrecemos login con Google) -- en la web/PWA y en Android el botón queda oculto.
  if(window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'ios'){
    ['login-apple-btn','signup-apple-btn'].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.style.display = '';
    });
  }
  const { data: { session } } = await supabaseClient.auth.getSession();
  if(session && session.user){ await loadUserAndEnter(session.user); }
})();

/* ================= PLAN GENERATION (con progresión semana a semana) ================= */
// Fecha de HOY en formato YYYY-MM-DD usando los componentes LOCALES del Date (año/mes/día
// tal como los ve el celular del usuario) -- a propósito no usa toISOString(), que convierte
// a UTC primero y puede correr la fecha un día para atrás en husos horarios positivos
// (ej. Japón, UTC+9): medianoche local del 1/9 ahí es 31/8 15:00 UTC.
function todayLocalISO(){
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function getMondayISO(d){
  const dt = new Date(d);
  const day = dt.getDay();
  dt.setDate(dt.getDate() + (day===0 ? -6 : 1-day));
  dt.setHours(0,0,0,0);
  return dt.toISOString().slice(0,10);
}
function isCutbackWeek(n){ return n % 4 === 0; }
const GOAL_PEAK_KM = {start:18, '5k':25, '10k':35, '15k':42, '21k':50, '42k':65, ultra:75, lifestyle:15};
function calcWeeklyKm(profile){
  const peak = GOAL_PEAK_KM[profile.goal] || 20;
  if(profile.runnerType==='active' && profile.currentWeeklyKm>0){
    return Math.round(profile.currentWeeklyKm); // arranca desde su realidad actual, no de una fórmula genérica
  }
  const base = peak / 1.8; // punto de partida que, con la progresión normal, llega al pico
  if(profile.raceDate){
    const weeksLeft = Math.round((new Date(profile.raceDate) - new Date()) / (7*86400000));
    if(weeksLeft > 0 && weeksLeft < 12){
      // poco tiempo hasta la carrera: arrancar más cerca del pico, sin margen para una progresión larga
      const urgency = Math.min(1, Math.max(0, (12-weeksLeft)/12));
      return Math.round(base + (peak-base)*urgency);
    }
  }
  return Math.round(base);
}
function weekMultiplier(n, caution){
  n = n || 1;
  const growthSteps = n - Math.floor(n/4) - 1;
  // corredores con más cautela (mayor edad y/o contextura) progresan más despacio
  // semana a semana y con un techo de volumen más bajo, en vez de la misma curva para todos
  const growthRate = caution && caution.level>=2 ? 1.04 : caution && caution.level>=1 ? 1.05 : 1.06;
  const cap = caution && caution.level>=2 ? 1.5 : caution && caution.level>=1 ? 1.65 : 1.8;
  let mult = Math.pow(growthRate, Math.max(0, growthSteps));
  if(isCutbackWeek(n)) mult *= 0.75;
  return Math.min(mult, cap);
}
function taperMultiplier(p, weekStartDate){
  // baja el volumen a propósito en las semanas justo antes de la carrera OBJETIVO (la fecha
  // cargada en Perfil > Metas) -- puesta a punto gradual en las últimas 3 semanas. A propósito
  // YA NO considera la carrera cargada en "Próximos eventos": esa es informativa (nombre,
  // cuenta regresiva, calendario, calculadora de ritmo) y por sí sola no debe reprogramar
  // semanas de anticipación -- si el corredor carga ahí una carrera del mes que viene, no
  // queremos que le reordene de golpe todo el plan de las próximas semanas. La semana puntual
  // de esa carrera sí baja el volumen igual (ver isEventRaceWeek/eventRaceWeekMultiplier en
  // generatePlan), y la semana siguiente entra en recuperación por su cuenta (isRecoveryWeek) --
  // pero ninguna de esas dos cosas empieza semanas antes como sí hace este taper gradual.
  if(!weekStartDate || !p || !p.raceDate) return 1;
  const start = new Date(weekStartDate+'T00:00:00');
  const raceDate = new Date(p.raceDate+'T00:00:00');
  if(isNaN(start.getTime()) || isNaN(raceDate.getTime())) return 1;
  const daysToRace = Math.round((raceDate - start) / 86400000);
  if(daysToRace < 0) return 1; // esa carrera ya pasó
  const weeksToRace = daysToRace / 7;
  if(weeksToRace < 1) return 0.55;
  if(weeksToRace < 2) return 0.7;
  if(weeksToRace < 3) return 0.85;
  return 1;
}
function isRecoveryWeek(weekStartDate){
  // La semana de recuperación es la que arranca el lunes siguiente a una carrera cargada
  // en "Próximos eventos", pero SOLO cuando esa carrera cayó en domingo -- así nos
  // aseguramos de que sea de verdad "la semana entera después de correrla" (lunes a
  // domingo) y no una carrera entre semana, donde "la semana que sigue" ya arranca con
  // días de por medio y el criterio sería más ambiguo. Usamos state.lastEventDate además
  // de state.event.date porque autoClearPastEvent() borra state.event apenas pasó la
  // fecha -- sin este respaldo, perderíamos el dato justo cuando más lo necesitamos (el
  // lunes después de la carrera, la propia recarga de la app dispara ese borrado antes
  // de que el resto de la semana pueda seguir mostrando la recuperación).
  if(!weekStartDate) return false;
  const eventDateStr = (state.event && state.event.date) || state.lastEventDate;
  if(!eventDateStr) return false;
  const start = new Date(weekStartDate+'T00:00:00');
  const raceDate = new Date(eventDateStr+'T00:00:00');
  if(isNaN(start.getTime()) || isNaN(raceDate.getTime())) return false;
  if(raceDate.getDay() !== 0) return false; // 0 = domingo
  const daysSinceRace = Math.round((start - raceDate) / 86400000);
  return daysSinceRace === 1;
}
function recoveryMultiplier(weekStartDate){
  return isRecoveryWeek(weekStartDate) ? 0.6 : 1;
}
function isEventRaceWeek(weekStartDate){
  // La carrera cargada en "Próximos eventos" es informativa (nombre, cuenta regresiva,
  // calendario, calculadora de ritmo) y a propósito YA NO reprograma el plan con semanas
  // de anticipación (eso solo lo dispara la carrera OBJETIVO de Perfil > Metas, ver
  // taperMultiplier) -- cargar acá una carrera del mes que viene no debería reordenarte
  // de golpe todo el plan de las próximas semanas. Lo único que sí hace, puntualmente, es
  // bajar el volumen la semana EXACTA en la que cae esa carrera (una semana de descarga
  // más, igual que isCutbackWeek) para no llegar reventado a correrla -- y la semana
  // siguiente entra en recuperación por su cuenta (ver isRecoveryWeek).
  if(!state.event || !state.event.date || !weekStartDate) return false;
  const start = new Date(weekStartDate+'T00:00:00');
  const raceDate = new Date(state.event.date+'T00:00:00');
  if(isNaN(start.getTime()) || isNaN(raceDate.getTime())) return false;
  const diffDays = Math.round((raceDate - start) / 86400000);
  return diffDays >= 0 && diffDays <= 6;
}
function eventRaceWeekMultiplier(weekStartDate){
  return isEventRaceWeek(weekStartDate) ? 0.75 : 1;
}
function autoSkipPastDays(){
  if(!state.onboarded || !state.weekStart) return;
  const todayIdx = (new Date().getDay()+6)%7;
  // createdAt (si existe -- cuentas viejas de antes de este cambio no lo tienen, y ahí
  // seguimos el comportamiento de siempre) marca el primer día que esta cuenta pudo haber
  // entrenado. Sin este chequeo, alguien que se sumó un martes con lunes/miércoles/viernes
  // como días de entrenamiento veía el lunes de ESA MISMA semana (día en el que la cuenta
  // ni existía) marcado como sesión perdida, apenas terminaba el onboarding.
  const createdAt = state.profile && state.profile.createdAt;
  const weekStartDate = new Date(state.weekStart+'T00:00:00');
  let changed = false;
  state.plan.forEach((d,i)=>{
    if(i >= todayIdx || !(d.dist>0) || d.status) return;
    if(createdAt){
      const dayDate = new Date(weekStartDate); dayDate.setDate(dayDate.getDate()+i);
      const dayIso = `${dayDate.getFullYear()}-${String(dayDate.getMonth()+1).padStart(2,'0')}-${String(dayDate.getDate()).padStart(2,'0')}`;
      if(dayIso < createdAt) return; // la cuenta todavía no existía ese día -- no cuenta como perdida
    }
    d.status = 'skipped'; changed = true;
  });
  if(changed) persist();
}
function autoClearPastEvent(){
  // el evento cargado en "Próximos eventos" es justamente eso, PRÓXIMO -> una vez que pasó
  // el día de la carrera, se saca solo de esa tarjeta (no tiene sentido seguir mostrando una
  // cuenta regresiva negativa de algo que ya corriste)
  if(!state.event || !state.event.date) return;
  const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
  const eventDate = new Date(state.event.date+'T00:00:00');
  if(!isNaN(eventDate.getTime()) && eventDate.getTime() < todayMidnight.getTime()){
    // Guardamos la fecha antes de borrar el evento -- isRecoveryWeek() la sigue
    // necesitando toda la semana de recuperación, después de que esta limpieza ya corrió.
    state.lastEventDate = state.event.date;
    state.event = null;
    persist();
  }
}
function repairCorruptedCustomDays(){
  if(!state.plan) return;
  let changed = false;
  state.plan.forEach(d=>{
    if(d.custom && !d.type){ d.custom = false; changed = true; }
  });
  if(changed) persist();
}
async function syncTodayNow(){
  const btn = document.getElementById('sync-today-btn');
  if(btn){ btn.disabled = true; btn.innerHTML = `<span class="icon-sq spin-icon" style="width:14px; height:14px;">${ICONS.refresh}</span> ${t('plan_syncing')}`; }
  let syncResult = null;
  try{
    const { data: { session } } = await supabaseClient.auth.getSession();
    if(session && session.access_token){
      const controller = new AbortController();
      const timeoutId = setTimeout(()=>controller.abort(), 12000);
      const res = await fetch(apiUrl('/api/strava-sync-now'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      syncResult = await res.json().catch(()=>null);
    }
  }catch(e){ console.error('sync-now error', e); syncResult = {error: e.message}; }
  await refreshStateFromServer();
  if(relinkTodayRun()) persist();
  renderPlan(); renderHome(); renderHistory();
  if(syncResult && !syncResult.synced){
    const reasonMsg = syncResult.error ? `Error: ${syncResult.error}` : syncResult.reason==='not_connected' ? 'Tu cuenta no está conectada a Strava.' : syncResult.reason==='no_new_activity' ? 'No encontramos actividades nuevas en las últimas 24 horas en tu Strava.' : 'No se encontró nada nuevo.';
    showToast(reasonMsg,'error');
  }
  if(btn){ btn.disabled = false; btn.innerHTML = `<span class="icon-sq" style="width:14px; height:14px;">${ICONS.refresh}</span> ${t('plan_sync_button')}`; }
  setTimeout(checkPendingRating, 300);
}
function computeWeekAdjustment(plan){
  // Mismo criterio de siempre (antes vivía adentro de checkWeekRollover): si calificaste mal
  // o saltaste 2+ sesiones, baja un poco el volumen; si calificaste excelente sin ningún "mal",
  // lo sube un poco. Separado en su propia función para poder usarlo también al PREVISUALIZAR
  // la semana que sigue (getNextWeekPlan), no solo en el momento exacto del cambio de semana
  // -> así lo que ves antes del lunes ya es lo que vas a tener el lunes, sin sorpresas.
  if(!plan || !plan.length) return {factor:1, note:null};
  const rated = plan.filter(d=>d.rating);
  const badCount = rated.filter(d=>d.rating==='mal').length;
  const excellentCount = rated.filter(d=>d.rating==='excelente').length;
  const skippedCount = plan.filter(d=>d.status==='skipped').length;
  if(badCount>=2 || skippedCount>=2) return {factor:0.9, note:t('coach_week_adjusted_down')};
  if(excellentCount>=3 && badCount===0 && skippedCount===0) return {factor:1.05, note:t('coach_week_adjusted_up')};
  return {factor:1, note:null};
}
function getNextWeekPlan(){
  // La semana que sigue a la actual: se calcula con el mismo ajuste automático que se aplicaría
  // si la semana actual terminara ahora mismo (según lo que ya calificaste/salteaste), y respeta
  // cualquier cambio puntual que el coach haya hecho por chat (state.nextWeekOverrides). Es una
  // función pura de estado ya guardado -> se puede llamar tantas veces como haga falta (para
  // mostrarla en Plan, dársela de contexto al coach, o promoverla al cambiar de semana) y da
  // siempre el mismo resultado mientras no cambien tus calificaciones o tu perfil.
  const wn = (state.weekNumber||1) + 1;
  const nextStart = new Date(state.weekStart || getMondayISO(new Date()));
  nextStart.setDate(nextStart.getDate() + 7);
  const nextStartIso = nextStart.toISOString().slice(0,10);
  const adj = computeWeekAdjustment(state.plan);
  const previewProfile = Object.assign({}, state.profile, {weeklyKm: Math.max(5, (state.profile.weeklyKm||0) * adj.factor)});
  const base = generatePlan(previewProfile, wn, nextStartIso);
  const overrides = state.nextWeekOverrides || {};
  // Un override de cancelar_sesion (cancelled:true) tiene que verse EXACTAMENTE como un día de
  // descanso normal, igual que ya pasa en la semana actual (ver applyCancelSession) -- no como
  // custom:true, que planLabel muestra distinto (usa d.type/d.desc en vez de derivarlo de
  // typeKey) y que, al llegar el lunes y promoverse a semana actual (checkWeekRollover), quedaba
  // marcado como "personalizado" en vez de "cancelado" -- una inconsistencia interna que no se
  // notaba en pantalla (el texto guardado en el override ya decía "Descanso") pero sí importaba
  // para cualquier lógica futura que mire d.cancelled en vez de d.custom.
  const plan = base.map(d => {
    const ov = overrides[d.day];
    if(!ov) return d;
    if(ov.cancelled) return Object.assign({}, d, ov, {custom:false, cancelled:true, typeKey:'rest', type:undefined, desc:undefined, interval:undefined});
    return Object.assign({}, d, ov, {custom:true});
  });
  return { plan, weekNumber: wn, weekStart: nextStartIso };
}
function buildWeeklyRecapMessage(weekPlan, weekStartIso){
  // Resumen factual de la semana que se cierra, sin juicio de valor (eso ya lo cubren
  // el ajuste automático y el aviso proactivo) -- así el corredor tiene noticias del
  // coach todas las semanas, no solo cuando algo anda mal.
  const doneCount = weekPlan.filter(d=>d.status==='done').length;
  const plannedCount = weekPlan.filter(d=>d.dist>0).length;
  const weekRuns = (state.runs||[]).filter(r => getMondayISO(new Date(r.date)) === weekStartIso);
  const km = weekRuns.reduce((s,r)=>s+r.distanceKm, 0);
  let msg = t('coach_weekly_recap', {km: km.toFixed(1), done:doneCount, planned:plannedCount});
  // Racha de constancia: cuenta semanas seguidas cumpliendo (al menos 70%) lo planeado.
  // Se corta apenas una semana no llega a ese umbral. Solo la mencionamos a partir de
  // la segunda semana seguida, para no sonar como un contador vacío en la primera.
  const metGoal = plannedCount>0 && (doneCount/plannedCount) >= 0.7;
  state.streakWeeks = metGoal ? (state.streakWeeks||0)+1 : 0;
  // Guardamos también la racha más larga alcanzada alguna vez (no solo la actual) --
  // la usa la pantalla de Logros para no perder un hito ya conseguido cuando la racha
  // en curso se corta.
  state.bestStreakWeeks = Math.max(state.bestStreakWeeks||0, state.streakWeeks);
  if(state.streakWeeks >= 2){
    msg += ' ' + t('coach_streak_line', {n: state.streakWeeks});
  }
  return msg;
}
function checkGoalUpsell(){
  // Si el objetivo es "empezar a correr desde cero" y ya lleva varias semanas seguidas
  // cumpliendo el plan (misma racha que usamos en el recap), el coach sugiere pasar a
  // un objetivo concreto -- una sola vez, no en cada rollover, para no ser repetitivo.
  // Si el corredor acepta, se lo cuenta al coach por el chat y ese flujo ya sabe
  // actualizar state.profile.goal (igual que cualquier otro cambio de objetivo hablado).
  if(state.goalUpsellShown) return null;
  if(state.profile.goal !== 'start') return null;
  if((state.streakWeeks||0) < 4) return null;
  state.goalUpsellShown = true;
  return t('coach_goal_upsell');
}
function detectTrainingGapWeeks(){
  // Hace cuántas semanas fue la última carrera REGISTRADA -- a diferencia de diffWeeks
  // (que solo mide cuánto tiempo de calendario pasó desde que se abrió la app la última
  // vez), esto mide si el corredor realmente dejó de entrenar. Alguien puede entrenar
  // puntual sin abrir la app todos los días -> eso no es una pausa real.
  if(!state.runs || !state.runs.length) return 0;
  let lastRunMs = 0;
  state.runs.forEach(r=>{ const d = new Date(r.date).getTime(); if(!isNaN(d) && d>lastRunMs) lastRunMs = d; });
  if(!lastRunMs) return 0;
  return Math.max(0, Math.floor((Date.now() - lastRunMs) / (7*86400000)));
}
function computeReturnFromBreakAdjustment(gapWeeks){
  // Volver de una pausa real (viaje, lesión, lo que sea) retomando el plan justo donde
  // había quedado significa saltar de golpe a un volumen que el cuerpo ya no sostiene.
  // Antes eso pasaba tal cual: el plan avanzaba "semanas de calendario" sin fijarse si
  // esas semanas tuvieron carreras de verdad, así que alguien que volvía después de un
  // mes sin correr se encontraba con el plan más avanzado que cuando se fue. Acá se
  // retoma más abajo y se vuelve a subir de a poco, en vez de fingir que la pausa no pasó.
  if(gapWeeks < 2) return null;
  if(gapWeeks < 4) return { gapWeeks, kmFactor: 0.8, weekNumberReset: null };
  if(gapWeeks < 7) return { gapWeeks, kmFactor: 0.65, weekNumberReset: 2 };
  return { gapWeeks, kmFactor: 0.5, weekNumberReset: 1 };
}
function checkWeekRollover(){
  if(!state.onboarded) return;
  const currentMonday = getMondayISO(new Date());
  if(state.weekStart !== currentMonday){
    if(!state.planHistory) state.planHistory = [];
    const prevMonday = new Date(state.weekStart || currentMonday);
    const diffWeeks = Math.max(1, Math.round((new Date(currentMonday) - prevMonday)/(7*86400000)));
    let adjustNote = null, recapMsg = null, goalUpsellMsg = null, breakMsg = null;
    let promotedPlan = null, promotedWeekNumber = (state.weekNumber||1) + diffWeeks, promotedWeekStart = currentMonday;
    const breakAdj = computeReturnFromBreakAdjustment(detectTrainingGapWeeks());
    if(state.weekStart && state.plan && state.plan.length){
      state.planHistory.push({weekNumber: state.weekNumber||1, weekStart: state.weekStart, plan: state.plan});
      recapMsg = buildWeeklyRecapMessage(state.plan, state.weekStart);
      goalUpsellMsg = checkGoalUpsell();
      if(diffWeeks === 1 && !breakAdj){
        // exactamente la semana que ya veníamos mostrando como "la que sigue" (con el ajuste
        // automático y los cambios del coach ya adentro) -> pasa a ser la actual tal cual
        // (si hay una pausa real detectada, esa semana "ya armada" no sirve -- se recalcula
        // desde cero más abajo, con el volumen reducido)
        const nw = getNextWeekPlan();
        promotedPlan = nw.plan; promotedWeekNumber = nw.weekNumber; promotedWeekStart = nw.weekStart;
      }
      if(breakAdj){
        state.profile.weeklyKm = Math.max(5, Math.round(state.profile.weeklyKm * breakAdj.kmFactor));
        if(breakAdj.weekNumberReset) promotedWeekNumber = breakAdj.weekNumberReset;
        breakMsg = t('coach_return_from_break', {weeks: breakAdj.gapWeeks});
      } else {
        // el ajuste semanal de siempre (sesiones salteadas/mal calificadas) solo aplica
        // cuando NO hubo una pausa real -- si la hubo, ya está cubierto (y mejor explicado)
        // por el mensaje de arriba, y aplicar los dos juntos sería redundante
        const adj = computeWeekAdjustment(state.plan);
        if(adj.factor !== 1){
          state.profile.weeklyKm = Math.max(5, Math.round(state.profile.weeklyKm*adj.factor));
          adjustNote = adj.note;
        }
      }
    }
    state.weekNumber = promotedWeekNumber;
    state.weekStart = promotedWeekStart;
    state.plan = promotedPlan || generatePlan(state.profile, state.weekNumber);
    state.nextWeekOverrides = {};
    // Un snapshot de deshacer_cambio guardado en la semana anterior queda atado a esa semana
    // (mismo array de 7 días, pero representando otras fechas) -- restaurarlo después de un
    // cambio de semana pisaría el plan nuevo con el de la semana pasada. Se invalida acá para
    // que "deshacer" nunca cruce un rollover semanal.
    state.coachUndoSnapshot = null;
    if(recapMsg) state.chat.push({role:'coach', text: recapMsg, ts:Date.now()});
    if(breakMsg) state.chat.push({role:'coach', text: breakMsg, ts:Date.now()});
    if(adjustNote) state.chat.push({role:'coach', text: adjustNote, ts:Date.now()});
    if(goalUpsellMsg) state.chat.push({role:'coach', text: goalUpsellMsg, ts:Date.now()});
    if(recapMsg || breakMsg || adjustNote || goalUpsellMsg) renderChat();
    persist();
  }
}
function hardSessionRotation(goal, caution){
  // Antes el "día fuerte" solo alternaba entre series y ritmo medio, semana tras
  // semana, sin importar el objetivo -> con el tiempo se volvía siempre el mismo
  // entrenamiento clonado. Ahora rotamos entre varios estímulos de calidad reales,
  // con más peso en velocidad para objetivos cortos (5k/10k) y más peso en
  // resistencia a la fatiga (progresivos, cuestas) para objetivos largos.
  const shortGoal = goal==='5k' || goal==='10k';
  let rotation = shortGoal
    ? ['intervals','fartlek','tempo','hills']
    : ['tempo','hills','progression','intervals'];
  if(caution && caution.level>=2){
    // para el perfil más conservador (edad/contextura), sacamos de la rotación los
    // estímulos de más impacto (series en llano y cuestas) y dejamos solo los de
    // esfuerzo controlado, sin volver todo siempre igual
    rotation = rotation.filter(t=>t!=='intervals' && t!=='hills');
    if(!rotation.length) rotation = ['tempo'];
  }
  return rotation;
}
function checkProactiveCoachNudge(){
  // El coach antes solo hablaba si le escribías. Acá lo hacemos un poco proactivo:
  // si la semana viene con varias sesiones salteadas o calificadas "mal" ANTES de
  // que termine (no hay que esperar al ajuste automático del lunes), le manda un
  // mensaje al corredor para que no tenga que darse cuenta solo. Se avisa una sola
  // vez por semana, para no ser pesado.
  if(!state.onboarded || !state.plan || !state.plan.length) return;
  if(state.proactiveNudgeFor === state.weekStart) return;
  const rated = state.plan.filter(d=>d.rating);
  const badCount = rated.filter(d=>d.rating==='mal').length;
  const skippedCount = state.plan.filter(d=>d.status==='skipped').length;
  let key = null;
  if(skippedCount>=2) key = 'coach_nudge_skipped';
  else if(badCount>=2) key = 'coach_nudge_bad_ratings';
  if(!key) return;
  state.proactiveNudgeFor = state.weekStart;
  state.chat.push({role:'coach', text: t(key), ts:Date.now()});
  renderChat();
  persist();
}
/* ---- "che, hace unos días que no te veo" -- reenganche por inactividad ----
   A diferencia de checkWeekRollover (que mide semanas SIN CARRERAS REGISTRADAS, y
   ajusta el plan hacia abajo, pero solo corre al cruzar un lunes), esto mide días
   sin ABRIR LA APP -- sin importar si siguió entrenando (por ej. alguien que
   sincroniza todo por Strava puede seguir corriendo sin entrar nunca acá). Es
   justo el tipo de abandono silencioso que un mensaje corto y humano puede
   frenar: a nadie le gusta sentir que "la app lo dejó ir" sin decir nada. Se
   guarda como state.lastAppOpenTs y se pisa en CADA apertura (se lee el valor
   viejo antes de pisarlo) -- así el mensaje sale como mucho una vez por ausencia,
   nunca dos veces seguidas para la misma vuelta. */
function checkInactivityCheckin(){
  const now = Date.now();
  const last = state.lastAppOpenTs;
  state.lastAppOpenTs = now;
  if(!state.onboarded) return;
  if(!last) return; // primera vez que existe este campo (usuario nuevo, o ya usaba la app antes de este cambio) -- nada todavía con qué comparar
  const daysSince = Math.floor((now - last) / 86400000);
  if(daysSince >= 4){
    state.chat.push({role:'coach', text: t('coach_inactivity_checkin', {days: daysSince}), ts: now});
    renderChat();
  }
  persist();
}
function pickSpacedDays(days, count){
  // Elige `count` días del array (ya en orden cronológico lunes->domingo) tratando
  // de separarlos lo más posible entre sí -- antes se tomaban siempre los primeros
  // `count` días de la lista, así que en un plan de 4 días las dos sesiones fuertes
  // podían caer en días seguidos (ej. series martes + tempo miércoles), sin un día
  // de por medio para absorber la carga.
  if(count>=days.length) return days.slice();
  if(count<=1) return days.slice(0,1);
  const idx = d => DAY_KEYS.indexOf(d);
  let best = null, bestScore = -1;
  const combo = (start, chosen) => {
    if(chosen.length===count){
      let minGap = Infinity;
      for(let i=1;i<chosen.length;i++) minGap = Math.min(minGap, idx(chosen[i])-idx(chosen[i-1]));
      if(minGap>bestScore){ bestScore = minGap; best = chosen.slice(); }
      return;
    }
    for(let i=start;i<days.length;i++){ chosen.push(days[i]); combo(i+1, chosen); chosen.pop(); }
  };
  combo(0, []);
  return best;
}
function distributeSessionTypes(trainingDays, beginner, weekNumber, caution, isCutback, goal){
  if(!trainingDays.length) return {};
  const pref = ['sun','sat','fri','thu','wed','tue','mon'];
  let longDay = trainingDays[trainingDays.length-1];
  for(const d of pref){ if(trainingDays.includes(d)){ longDay = d; break; } }
  const remaining = trainingDays.filter(d=>d!==longDay);
  const sessions = {}; sessions[longDay] = 'long';
  if(beginner || !remaining.length){
    remaining.forEach(d=>{ sessions[d]='easy'; });
    return sessions;
  }
  // Regla 80/20: cuántos días "fuertes" por semana tolera bien esta frecuencia de
  // entrenamiento. Con pocos días de running no hay volumen suave suficiente para
  // absorber dos sesiones duras Y la tirada larga en la misma semana -> antes esto
  // se hacía siempre igual sin importar cuántos días corría la persona, lo cual mete
  // demasiada intensidad a un plan de 3 días. Un perfil de más cautela (edad/
  // contextura) baja este límite todavía más, sin eliminar la calidad del todo.
  const wn = weekNumber || 1;
  const rotation = hardSessionRotation(goal, caution);
  let maxHardDays, hardOccurrence;
  if(remaining.length<=2){
    if(caution.level>=2){
      // el día fuerte aparece cada dos semanas en vez de todas para el perfil más
      // conservador -> se sigue sumando estímulo de calidad sin el impacto repetido
      // de un esfuerzo exigente semana tras semana. Contamos OCURRENCIAS de día
      // fuerte (1ra, 2da, 3ra...) y no el número de semana en sí para rotar el tipo
      // -- si usáramos la semana directamente, como el día fuerte cae siempre en
      // semana par, la rotación quedaría siempre en el mismo tipo.
      maxHardDays = wn % 2 === 0 ? 1 : 0;
      hardOccurrence = Math.ceil(wn/2);
    } else {
      maxHardDays = 1;
      hardOccurrence = wn;
    }
  } else {
    maxHardDays = caution.level>=2 ? 1 : Math.min(2, remaining.length-1);
    hardOccurrence = wn;
  }
  if(isCutback) maxHardDays = Math.max(0, maxHardDays-1); // semana de descarga: también baja la intensidad, no solo el volumen
  if(maxHardDays<=0){
    remaining.forEach(d=>{ sessions[d]='easy'; });
    return sessions;
  }
  // La rotación avanza una posición por cada ocurrencia de día fuerte, así que el
  // estímulo de calidad va variando en vez de repetir siempre el mismo tipo de sesión.
  if(maxHardDays===1){
    const hardType = rotation[(hardOccurrence-1) % rotation.length];
    remaining.forEach((d,i)=>{ sessions[d] = i===0 ? hardType : 'easy'; });
    return sessions;
  }
  const first = rotation[(hardOccurrence-1) % rotation.length];
  let second = rotation[hardOccurrence % rotation.length];
  if(second === first) second = 'tempo';
  const [dayA, dayB] = pickSpacedDays(remaining, 2);
  remaining.forEach(d=>{ sessions[d] = d===dayA ? first : d===dayB ? second : 'easy'; });
  return sessions;
}
function buildIntervalStructure(qualityKm, caution, weekNumber){
  // Antes había una única distancia de repetición fija por rango de km, así que si tu
  // volumen de series no cambiaba mucho de una semana a otra, te tocaba literalmente
  // la misma sesión clonada. Ahora hay un par de estructuras válidas por rango y se
  // rota según el número de semana, para variar el estímulo real.
  let options;
  if(qualityKm <= 3) options = [{repMeters:300, recoveryMin:1}, {repMeters:200, recoveryMin:1}];
  else if(qualityKm <= 5) options = [{repMeters:400, recoveryMin:2}, {repMeters:300, recoveryMin:1}];
  else if(qualityKm <= 7) options = [{repMeters:600, recoveryMin:2}, {repMeters:400, recoveryMin:2}];
  else options = [{repMeters:1000, recoveryMin:3}, {repMeters:800, recoveryMin:2}];
  const wn = weekNumber || 1;
  const { repMeters, recoveryMin } = options[(wn-1) % options.length];
  // con más edad o más masa corporal, el impacto de cada repetición pesa más sobre
  // articulaciones y tendones -> capamos la cantidad de repeticiones aunque el volumen
  // "en papel" pediría más, en vez de tratar a todos los corredores igual
  const maxReps = caution && caution.level>=2 ? 8 : caution && caution.level>=1 ? 10 : 12;
  const totalMeters = qualityKm * 1000;
  const reps = Math.max(4, Math.min(maxReps, Math.round(totalMeters / repMeters)));
  return { reps, repMeters, recoveryMin };
}
function buildHillStructure(qualityKm, caution){
  // Repeticiones en subida, en distancia (no en tiempo): antes esta función fijaba
  // effortSec/baseReps por tiers SIN relación con qualityKm, así que el total
  // mostrado ("9.0 km") podía quedar totalmente desconectado de la sesión descripta
  // (ej: "10 subidas de 90 segundos" no suma ningún 9km reconocible). Ahora, igual
  // que buildIntervalStructure, reps sale de dividir qualityKm por un repMeters fijo
  // por tier, así el texto y el total siempre son consistentes entre sí.
  let repMeters;
  if(qualityKm <= 4) repMeters = 150;
  else if(qualityKm <= 7) repMeters = 250;
  else repMeters = 400;
  const maxReps = caution && caution.level>=2 ? 5 : caution && caution.level>=1 ? 7 : 10;
  const totalMeters = qualityKm * 1000;
  const reps = Math.max(4, Math.min(maxReps, Math.round(totalMeters / repMeters)));
  return { reps, repMeters };
}
function calcBmi(p){
  if(!p || !p.weight || !p.height) return null;
  const h = p.height/100;
  if(!(h>0)) return null;
  return p.weight / (h*h);
}
function trainingCaution(p){
  // Perfil de "cautela" del corredor: junta edad y contextura física para moderar
  // cuántas sesiones fuertes por semana tolera bien y qué tan rápido puede subir
  // volumen, en vez de armar el mismo plan para un chico de 20 años y 60kg que para
  // alguien de 60 años y 90kg. No es un diagnóstico médico, es sólo una heurística
  // conservadora de carga de entrenamiento (nunca se muestra al usuario).
  const age = ageFromBirth(p.birth);
  const bmi = calcBmi(p);
  let level = 0;
  if(age >= 60) level = Math.max(level, 2);
  else if(age >= 45) level = Math.max(level, 1);
  if(bmi !== null){
    if(bmi >= 30) level = Math.max(level, 2);
    else if(bmi >= 27) level = Math.max(level, 1);
  }
  // una molestia activa (registrada en los últimos 21 días y todavía sin marcar como
  // resuelta) también sube la cautela -- menos sesiones de impacto (series/cuestas, ver
  // hardSessionRotation) y una progresión de volumen más lenta (ver weekMultiplier),
  // hasta que el corredor la marque como resuelta desde Perfil.
  if(activePainEntries(21).length) level = Math.max(level, 1);
  return { age, bmi, level };
}
function generatePlan(p, weekNumber, weekStartDate){
  weekNumber = weekNumber || 1;
  weekStartDate = weekStartDate || state.weekStart;
  const caution = trainingCaution(p);
  const isRecovery = isRecoveryWeek(weekStartDate);
  const mult = weekMultiplier(weekNumber, caution) * taperMultiplier(p, weekStartDate) * recoveryMultiplier(weekStartDate) * eventRaceWeekMultiplier(weekStartDate);
  const beginner = p.weeklyKm === 0 || p.goal === 'start' || p.runnerType === 'new';
  // si el corredor puso una meta semanal propia, la usamos como referencia de volumen en vez
  // del cálculo genérico -- pero acotada para no saltar de golpe a algo que podría lesionarlo
  let effectiveWeeklyKm = p.weeklyKm;
  if(p.weeklyGoalKm > 0 && !beginner){
    const maxWk = Math.max(p.weeklyKm * 1.3, p.weeklyKm + 5);
    const minWk = p.weeklyKm * 0.7;
    effectiveWeeklyKm = Math.min(maxWk, Math.max(minWk, p.weeklyGoalKm));
  }
  const zoneMap = {easy:beginner?1:2, intervals:4, tempo:3, long:2, fartlek:3, hills:4, progression:3};
  const defaultDays = beginner ? ['tue','thu','sun'] : ['tue','wed','fri','sun'];
  const trainingDays = DAY_KEYS.filter(d => (p.trainingDays && p.trainingDays.length ? p.trainingDays : defaultDays).includes(d));
  const sessionMap = distributeSessionTypes(trainingDays, beginner, weekNumber, caution, isCutbackWeek(weekNumber), p.goal);
  if(isRecovery){
    // En la semana de recuperación evitamos series/tempo/cuestas/fartlek/progresivo/rodaje
    // largo -- todo eso suma carga justo cuando el cuerpo todavía está absorbiendo el
    // esfuerzo de la carrera. Se reemplaza por rodaje suave (o descanso, si ese día ya
    // no tenía sesión) hasta la semana siguiente, que retoma el plan normal.
    const heavyTypes = ['intervals','tempo','fartlek','hills','progression','long'];
    Object.keys(sessionMap).forEach(day=>{ if(heavyTypes.includes(sessionMap[day])) sessionMap[day] = 'easy'; });
  }
  // Reparto del volumen semanal entre las sesiones que de verdad va a tener esta semana, en
  // vez de calcular cada tipo de sesión por separado con una proporción fija (0.85x a 1.5x)
  // de un "per" que no tenía en cuenta cuántas sesiones había esa semana. Esa cuenta vieja
  // hacía que el total real de la semana sumara bastante más que el kilometraje semanal
  // (calculado o puesto a mano en Perfil): con un plan de 4 días, por ejemplo, terminaba
  // ~35-40% arriba -- una meta de 25km/semana podía terminar en un plan de 34km, algo que no
  // tenía ningún sentido para alguien que cargó ese número esperando que el plan apuntara ahí.
  // Ahora el total de la semana coincide (salvo redondeo) con effectiveWeeklyKm * mult, sin
  // importar cuántas sesiones fuertes/suaves le toquen esa semana en particular. El caso
  // principiante queda con su fórmula fija de siempre (no depende de ningún kilometraje
  // puesto o calculado, así que este ajuste no le cambia nada).
  const RATIO = {easy:0.9, intervals:1.15, tempo:0.85, long:beginner?1.3:1.5, fartlek:1.0, hills:0.9, progression:1.0};
  let distMap;
  if(beginner){
    const per = 2.5 * mult;
    distMap = {};
    Object.keys(RATIO).forEach(type=>{ distMap[type] = Math.round(per * RATIO[type]); });
  } else {
    const usedTypes = trainingDays.map(d=>sessionMap[d]).filter(Boolean);
    const weightSum = usedTypes.reduce((a,type)=> a + (RATIO[type]||1), 0);
    const targetTotal = Math.max(9, effectiveWeeklyKm) * mult;
    const perUnit = weightSum>0 ? targetTotal/weightSum : 0;
    distMap = {};
    Object.keys(RATIO).forEach(type=>{ distMap[type] = Math.round(perUnit * RATIO[type]); });
  }
  // La carrera cargada en "Próximos eventos" ya NO le saca la sesión propia al día en el que
  // cae (antes ese día quedaba fijo en descanso porque "la carrera era la sesión") -- ahora es
  // un dato informativo nada más, así que ese día recibe una sesión de entrenamiento normal
  // como cualquier otro (ver isEventRaceWeek/eventRaceWeekMultiplier más arriba para el único
  // efecto real que sigue teniendo sobre el plan: bajar el volumen esa semana puntual).
  return DAY_KEYS.map((day)=>{
    const typeKey = sessionMap[day];
    if(!typeKey) return {day, typeKey:'rest', dist:0, terrain:null, zone:null, beginner};
    const terrain = typeKey==='intervals' ? 'asfalto' : p.terrain;
    const dayObj = {day, typeKey, dist:distMap[typeKey], terrain, zone:zoneMap[typeKey], beginner};
    if(typeKey==='intervals' && !beginner) dayObj.interval = buildIntervalStructure(distMap[typeKey], caution, weekNumber);
    if(typeKey==='hills' && !beginner) dayObj.interval = buildHillStructure(distMap[typeKey], caution);
    return dayObj;
  });
}
/* ---- entrenar por distancia vs. por tiempo -----
   Por defecto todo el plan es 100% en km (generatePlan, buildIntervalStructure, etc. no
   cambian). Si el corredor eligió "por tiempo" en el onboarding o en el Perfil, en vez de
   tocar el motor de generación convertimos el km ya calculado a una duración estimada
   usando su ritmo propio (de sus corridas reales, o si no hay suficientes, de su PR, o
   si no hay nada, un valor por defecto según si es principiante). Así el plan interno
   sigue siendo el mismo para todos, y solo cambia lo que se le muestra/pide al corredor. */
function isTimeMode(){ return state.profile.trainBy === 'time'; }
function estimateBasePaceMinPerKm(profile){
  profile = profile || state.profile;
  const recent = (state.runs||[]).filter(r=>r.distanceKm>0.5 && r.durationSec>0).slice(-10);
  if(recent.length>=3){
    const paces = recent.map(r=>(r.durationSec/60)/r.distanceKm);
    return paces.reduce((a,b)=>a+b,0)/paces.length;
  }
  const anyPR = Object.values(getPersonalRecords())[0];
  if(anyPR && anyPR.distanceKm>0 && anyPR.durationSec>0){
    return (anyPR.durationSec/60)/anyPR.distanceKm + 1.3;
  }
  const beginner = profile.weeklyKm === 0 || profile.goal === 'start' || profile.runnerType === 'new';
  return beginner ? 7.5 : 6.2;
}
function planDurationMin(d, profile){
  if(!(d.dist>0)) return 0;
  const pace = estimateBasePaceMinPerKm(profile);
  return Math.max(5, Math.round((d.dist*pace)/5)*5);
}
function fmtDurationShort(sec){
  sec = Math.max(15, Math.round(sec/15)*15);
  if(sec < 60) return `${sec} ${t('time_unit_sec')}`;
  return `${Math.max(1, Math.round(sec/60))} ${t('time_unit_min')}`;
}
function repDurationSec(repMeters, profile){
  const pace = estimateBasePaceMinPerKm(profile);
  return (repMeters/1000) * pace * 60;
}
function planAmountText(d){
  if(!(d.dist>0)) return '';
  return isTimeMode() ? `${planDurationMin(d)} ${t('time_unit_min')}` : `${fmtDist(d.dist,1)} ${distUnit()}`;
}
function planLabel(d){
  if(d.raceDay) return {type: t('plan_race_day_type'), desc: t('plan_race_day_desc', {name: escapeHtml(d.raceEventName || '')})};
  if(d.custom){
    // Una sesión "custom" es texto libre que el coach (IA) escribió a partir de un pedido
    // del usuario (modificar_sesion) -- pero sigue siendo una sesión de running como
    // cualquier otra, así que también lleva la estructura de entrada en calor / vuelta a
    // la calma cuando tiene distancia (antes se mostraba SOLO el texto del coach, sin esa
    // estructura, lo que hacía que un día editado por chat se viera "distinto" al resto
    // del plan).
    const desc = d.dist>0 ? `${t('desc_warmup_prefix')}\n${d.desc}\n${t('desc_cooldown_suffix')}` : d.desc;
    return {type:d.type, desc};
  }
  const timeMode = isTimeMode();
  const suf = d.beginner && (d.typeKey==='easy'||d.typeKey==='long'||d.typeKey==='rest') ? '_beginner' : '';
  let desc = t('desc_'+d.typeKey+suf);
  if(d.typeKey==='intervals' && d.interval){
    desc = timeMode
      ? t('desc_intervals_detail_time', {reps:d.interval.reps, dur:fmtDurationShort(repDurationSec(d.interval.repMeters)), rest:d.interval.recoveryMin, zone:d.zone})
      : t('desc_intervals_detail', {reps:d.interval.reps, meters:d.interval.repMeters, rest:d.interval.recoveryMin, zone:d.zone});
  } else if(d.typeKey==='hills' && d.interval){
    desc = timeMode
      ? t('desc_hills_detail_time', {reps:d.interval.reps, dur:fmtDurationShort(repDurationSec(d.interval.repMeters)), zone:d.zone})
      : t('desc_hills_detail', {reps:d.interval.reps, meters:d.interval.repMeters, zone:d.zone});
  } else if(d.typeKey==='progression' && d.dist>0){
    desc = timeMode
      ? t('desc_progression_detail_time', {dur: `${Math.max(1, Math.round(planDurationMin(d)/3))} ${t('time_unit_min')}`})
      : t('desc_progression_detail', {third: Math.max(1, Math.round(d.dist/3))});
  } else if(d.zone && d.dist>0 && d.typeKey!=='intervals' && d.typeKey!=='fartlek'){
    // el fartlek ya es alternar ritmos por sensación -- decirle "mantenete en zona X
    // durante el tramo principal" encima se contradice con la sesión misma
    desc += t('desc_zone_suffix', {zone:d.zone});
  }
  // Entrada en calor y vuelta a la calma para toda sesión que implique correr (no en
  // días de descanso). Antes era una frase agregada al final ("...y sumale 5 a 15 min
  // de trote suave al principio y al final"); ahora el pedido es una ESTRUCTURA fija de
  // 3 partes -- entrada en calor, el detalle de la sesión, vuelta a la calma, cada una
  // en su propio párrafo -- con 10 minutos fijos en vez de un rango. El \n se ve como
  // salto de línea real en todos los lugares donde se muestra esto (home, plan, correr)
  // gracias a white-space:pre-line en .muted y .day-detail.
  if(d.dist>0) desc = `${t('desc_warmup_prefix')}\n${desc}\n${t('desc_cooldown_suffix')}`;
  return {type:t('type_'+d.typeKey), desc};
}

/* ---- exportar la semana como archivo .ics -----
   Para que el corredor vea sus sesiones en Google/Apple Calendar sin depender de abrir
   la app. Son eventos de día completo (sin hora fija, porque el plan no define una) --
   así evitamos meternos con huso horario y cada uno lo agenda a la hora que le sirva. */
function icsEscape(str){
  return String(str||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
}
function icsDateStamp(dateObj){
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth()+1).padStart(2,'0');
  const d = String(dateObj.getDate()).padStart(2,'0');
  return `${y}${m}${d}`;
}
function generateWeekICS(){
  const monday = new Date(state.weekStart+'T00:00:00');
  const nowStamp = icsDateStamp(new Date());
  const events = state.plan.filter(d=>d.dist>0).map(d=>{
    const idx = DAY_KEYS.indexOf(d.day);
    const date = new Date(monday); date.setDate(monday.getDate()+idx);
    const nextDate = new Date(date); nextDate.setDate(date.getDate()+1);
    const lbl = planLabel(d);
    const summary = `${lbl.type} · ${planAmountText(d)}`;
    const uid = `zancada-${state.weekStart}-${d.day}@zancada.app`;
    return ['BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${nowStamp}T000000Z`,
      `DTSTART;VALUE=DATE:${icsDateStamp(date)}`,
      `DTEND;VALUE=DATE:${icsDateStamp(nextDate)}`,
      `SUMMARY:${icsEscape(summary)}`,
      `DESCRIPTION:${icsEscape(lbl.desc)}`,
      'END:VEVENT'].join('\r\n');
  });
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Zancada//Plan Semanal//ES','CALSCALE:GREGORIAN',
    ...events,'END:VCALENDAR'].join('\r\n');
}
function exportWeekToCalendar(){
  if(!state.plan.some(d=>d.dist>0)){ showToast(t('plan_export_ics_empty'),'error'); return; }
  const blob = new Blob([generateWeekICS()], {type:'text/calendar;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zancada-semana-${state.weekStart}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
}

/* ================= RENDER ================= */
function renderAll(){ renderHome(); renderPlan(); renderPerfil(); }

const DAILY_TIPS = {
  es: ["Cada kilómetro cuenta, aunque sea lento.","El descanso también es parte del entrenamiento.","Los días difíciles construyen corredores fuertes.","Correr suave hoy es correr mejor mañana.","Escuchá a tu cuerpo — el dolor no es lo mismo que la incomodidad.","La constancia le gana a la intensidad, casi siempre.","El mejor ritmo es el que podés sostener y disfrutar.","Un buen calentamiento evita una mala lesión.","Dormí bien: es el entrenamiento invisible.","La motivación te hace empezar, el hábito te hace terminar.","No compares tu progreso con el de otro corredor.","Tu peor día corriendo sigue siendo mejor que uno en el sillón.","No necesitás motivación todos los días, necesitás un hábito.","El cuerpo se adapta a lo que le pedís, dale tiempo.","Correr bajo la lluvia también cuenta — y te vas a acordar de ese día.","Cada carrera que terminás te hace un poco más fuerte que ayer.","La zapatilla más rápida es la que ya te pusiste.","No hace falta correr rápido todos los días, hace falta correr seguido.","El primer kilómetro siempre cuesta más que el último.","Progresar no es lineal: hay semanas de subida y semanas de meseta.","Nadie corrió un maratón sin antes correr un metro.","La disciplina te lleva a donde la motivación no llega sola.","Un mal entrenamiento no borra diez buenos.","Correr es la única carrera donde ganás simplemente por terminar.","Tu ritmo de hoy no tiene que ser el de ayer, ni el de mañana.","El aire frío de la mañana es gratis y funciona mejor que cualquier café.","A veces el logro más grande del día es haber salido a la calle.","Cada gota de sudor es una decisión que tomaste por vos mismo.","Correr no te cambia el cuerpo primero, te cambia la cabeza primero.","Nadie te va a aplaudir en el kilómetro 3 de un martes cualquiera, y está bien: es tuyo.","El descanso de hoy es la velocidad de mañana.","No corrés contra nadie, corrés con vos de antes.","Los kilómetros lentos de hoy son los que te bancan en el kilómetro 30.","Ponerte las zapatillas ya es el 50% del entrenamiento.","El clima no decide si salís a correr, vos decidís.","Cada semana que sumás kilómetros es una inversión en la versión futura de vos.","No es magia, es constancia disfrazada de kilómetros.","Cuando dudes si podés, acordate de todas las veces que ya pudiste.","El running no perdona la impaciencia, pero premia la paciencia siempre.","Tu peor excusa de hoy es más débil que tu peor entrenamiento.","Un rodaje suave bien hecho vale más que uno rápido mal hecho.","Correr te enseña a estar incómodo sin entrar en pánico — eso sirve para todo lo demás también.","No hay atajos para la resistencia, solo kilómetros acumulados.","Cada carrera empieza con la decisión de salir por la puerta.","El corredor de hoy agradece al corredor que decidió empezar.","La meta no es correr sin parar, es no dejar de intentarlo.","Los días que menos ganas tenés son los que más te enseñan.","Vas a tener entrenamientos malos — no son el final, son parte del camino.","Cuidar el cuerpo hoy es poder seguir corriendo mañana.","Cada corredor que ves en la calle también tuvo un primer día difícil."],
  en: ["Every kilometer counts, even a slow one.","Rest is part of training too.","Hard days build strong runners.","Running easy today means running better tomorrow.","Listen to your body — pain isn't the same as discomfort.","Consistency beats intensity, almost always.","The best pace is the one you can sustain and enjoy.","A good warm-up prevents a bad injury.","Sleep well: it's the invisible training.","Motivation gets you started, habit gets you finished.","Don't compare your progress to another runner's.","Your worst day running still beats a day on the couch.","You don't need motivation every day, you need a habit.","Your body adapts to what you ask of it — give it time.","Running in the rain counts too — and you'll remember that day.","Every run you finish makes you a little stronger than yesterday.","The fastest shoe is the one you already put on.","You don't need to run fast every day, you need to run often.","The first kilometer always feels harder than the last.","Progress isn't linear: there are weeks of climbing and weeks on a plateau.","No one ran a marathon without first running a single step.","Discipline takes you where motivation alone can't.","One bad workout doesn't erase ten good ones.","Running is the only race where you win just by finishing.","Today's pace doesn't have to be yesterday's, or tomorrow's.","Cold morning air is free and works better than any coffee.","Sometimes the biggest win of the day is just getting out the door.","Every drop of sweat is a decision you made for yourself.","Running doesn't change your body first — it changes your mind first.","No one's going to cheer for you at kilometer 3 on a random Tuesday, and that's fine: it's yours.","Today's rest is tomorrow's speed.","You're not racing anyone else, you're racing the you from before.","The slow kilometers today are what carry you at kilometer 30.","Putting on your shoes is already 50% of the workout.","The weather doesn't decide if you run — you do.","Every week you add kilometers is an investment in your future self.","It's not magic, it's consistency disguised as kilometers.","When you doubt you can, remember every time you already did.","Running never forgives impatience, but it always rewards patience.","Your worst excuse today is weaker than your worst workout.","A well-run easy day beats a badly-run fast one.","Running teaches you to be uncomfortable without panicking — that helps with everything else too.","There are no shortcuts to endurance, only accumulated kilometers.","Every run starts with the decision to walk out the door.","Today's runner is grateful to the runner who decided to start.","The goal isn't to never stop running, it's to never stop trying.","The days you feel like it least are the ones that teach you the most.","You'll have bad workouts — they're not the end, they're part of the journey.","Taking care of your body today means you get to keep running tomorrow.","Every runner you see on the street had a hard first day too."],
  pt: ["Cada quilômetro conta, mesmo que seja devagar.","O descanso também faz parte do treino.","Os dias difíceis constroem corredores fortes.","Correr leve hoje é correr melhor amanhã.","Escute seu corpo — dor não é o mesmo que desconforto.","A constância vence a intensidade, quase sempre.","O melhor ritmo é aquele que você consegue manter e curtir.","Um bom aquecimento evita uma lesão ruim.","Durma bem: é o treino invisível.","A motivação te faz começar, o hábito te faz terminar.","Não compare seu progresso com o de outro corredor.","Seu pior dia correndo ainda é melhor que um dia no sofá.","Você não precisa de motivação todo dia, precisa de um hábito.","O corpo se adapta ao que você pede dele — dê tempo a ele.","Correr na chuva também conta — e você vai lembrar desse dia.","Cada corrida que você termina te deixa um pouco mais forte que ontem.","O tênis mais rápido é o que você já calçou.","Não precisa correr rápido todo dia, precisa correr sempre.","O primeiro quilômetro sempre pesa mais que o último.","Progresso não é linear: tem semanas de subida e semanas de platô.","Ninguém correu uma maratona sem antes correr um metro.","A disciplina te leva aonde só a motivação não chega.","Um treino ruim não apaga dez bons.","Correr é a única prova em que você ganha só por terminar.","Seu ritmo de hoje não precisa ser o de ontem, nem o de amanhã.","O ar frio da manhã é de graça e funciona melhor que qualquer café.","Às vezes a maior conquista do dia é ter saído de casa.","Cada gota de suor é uma decisão que você tomou por si mesmo.","Correr não muda seu corpo primeiro, muda sua cabeça primeiro.","Ninguém vai te aplaudir no quilômetro 3 de uma terça qualquer, e tudo bem: é seu.","O descanso de hoje é a velocidade de amanhã.","Você não corre contra ninguém, corre contra quem você era antes.","Os quilômetros lentos de hoje são os que te sustentam no quilômetro 30.","Calçar o tênis já é 50% do treino.","O clima não decide se você corre, você decide.","Cada semana que você soma quilômetros é um investimento na sua versão futura.","Não é mágica, é constância disfarçada de quilômetros.","Quando duvidar que consegue, lembre de todas as vezes que já conseguiu.","O running não perdoa a impaciência, mas sempre recompensa a paciência.","Sua pior desculpa de hoje é mais fraca que seu pior treino.","Um rodagem leve bem feito vale mais que um rápido mal feito.","Correr te ensina a ficar desconfortável sem entrar em pânico — isso serve pra tudo o mais também.","Não existe atalho para a resistência, só quilômetros acumulados.","Toda corrida começa com a decisão de sair pela porta.","O corredor de hoje agradece ao corredor que decidiu começar.","A meta não é nunca parar de correr, é nunca parar de tentar.","Os dias em que você tem menos vontade são os que mais ensinam.","Você vai ter treinos ruins — eles não são o fim, são parte do caminho.","Cuidar do corpo hoje é poder continuar correndo amanhã.","Todo corredor que você vê na rua também teve um primeiro dia difícil."],
  fr: ["Chaque kilomètre compte, même lent.","Le repos fait aussi partie de l'entraînement.","Les jours difficiles forgent des coureurs solides.","Courir doucement aujourd'hui, c'est mieux courir demain.","Écoute ton corps — la douleur n'est pas l'inconfort.","La régularité bat l'intensité, presque toujours.","La meilleure allure est celle que tu peux tenir et apprécier.","Un bon échauffement évite une mauvaise blessure.","Dors bien : c'est l'entraînement invisible.","La motivation te fait démarrer, l'habitude te fait finir.","Ne compare pas ta progression à celle d'un autre coureur.","Ta pire journée de course vaut mieux qu'une journée sur le canapé.","Tu n'as pas besoin de motivation tous les jours, tu as besoin d'une habitude.","Le corps s'adapte à ce que tu lui demandes — laisse-lui le temps.","Courir sous la pluie compte aussi — et tu te souviendras de ce jour-là.","Chaque course terminée te rend un peu plus fort qu'hier.","La chaussure la plus rapide est celle que tu as déjà enfilée.","Pas besoin de courir vite tous les jours, il faut courir souvent.","Le premier kilomètre est toujours plus dur que le dernier.","Le progrès n'est pas linéaire : il y a des semaines de montée et des semaines de plateau.","Personne n'a couru un marathon sans avoir d'abord couru un mètre.","La discipline t'emmène là où la motivation seule n'arrive pas.","Un mauvais entraînement n'efface pas dix bons.","Courir est la seule course où tu gagnes juste en terminant.","Ton allure d'aujourd'hui n'a pas à être celle d'hier, ni celle de demain.","L'air frais du matin est gratuit et marche mieux que n'importe quel café.","Parfois, la plus grande victoire du jour, c'est juste d'être sorti.","Chaque goutte de sueur est une décision que tu as prise pour toi-même.","Courir ne change pas d'abord ton corps, ça change d'abord ta tête.","Personne ne t'applaudira au 3e kilomètre d'un mardi comme un autre, et c'est très bien : c'est le tien.","Le repos d'aujourd'hui, c'est la vitesse de demain.","Tu ne cours pas contre les autres, tu cours contre toi d'avant.","Les kilomètres lents d'aujourd'hui sont ceux qui te portent au 30e kilomètre.","Enfiler tes chaussures, c'est déjà 50 % de l'entraînement.","La météo ne décide pas si tu cours, c'est toi qui décides.","Chaque semaine où tu ajoutes des kilomètres est un investissement dans ta future version.","Ce n'est pas de la magie, c'est de la régularité déguisée en kilomètres.","Quand tu doutes de pouvoir, souviens-toi de toutes les fois où tu as déjà pu.","La course à pied ne pardonne pas l'impatience, mais elle récompense toujours la patience.","Ta pire excuse d'aujourd'hui est plus faible que ton pire entraînement.","Une sortie facile bien faite vaut mieux qu'une rapide mal faite.","Courir t'apprend à être inconfortable sans paniquer — ça sert pour tout le reste aussi.","Il n'y a pas de raccourci vers l'endurance, seulement des kilomètres accumulés.","Chaque course commence par la décision de sortir par la porte.","Le coureur d'aujourd'hui remercie celui qui a décidé de commencer.","L'objectif n'est pas de ne jamais s'arrêter de courir, c'est de ne jamais arrêter d'essayer.","Les jours où tu en as le moins envie sont ceux qui t'apprennent le plus.","Tu auras de mauvais entraînements — ce n'est pas la fin, ça fait partie du chemin.","Prendre soin de ton corps aujourd'hui, c'est pouvoir continuer à courir demain.","Chaque coureur que tu vois dans la rue a aussi eu un premier jour difficile."],
  it: ["Ogni chilometro conta, anche se lento.","Anche il riposo fa parte dell'allenamento.","I giorni difficili costruiscono corridori forti.","Correre piano oggi significa correre meglio domani.","Ascolta il tuo corpo — il dolore non è lo stesso del disagio.","La costanza batte l'intensità, quasi sempre.","Il ritmo migliore è quello che riesci a sostenere e goderti.","Un buon riscaldamento evita un brutto infortunio.","Dormi bene: è l'allenamento invisibile.","La motivazione ti fa iniziare, l'abitudine ti fa finire.","Non confrontare i tuoi progressi con quelli di un altro corridore.","La tua peggiore giornata di corsa batte comunque una sul divano.","Non serve motivazione ogni giorno, serve un'abitudine.","Il corpo si adatta a quello che gli chiedi — dagli tempo.","Correre sotto la pioggia conta anche — e ti ricorderai di quel giorno.","Ogni corsa che finisci ti rende un po' più forte di ieri.","La scarpa più veloce è quella che hai già indossato.","Non serve correre veloce ogni giorno, serve correre spesso.","Il primo chilometro pesa sempre più dell'ultimo.","Il progresso non è lineare: ci sono settimane in salita e settimane di stallo.","Nessuno ha corso una maratona senza prima aver corso un metro.","La disciplina ti porta dove la sola motivazione non arriva.","Un allenamento negativo non cancella dieci positivi.","Correre è l'unica gara in cui vinci semplicemente finendola.","Il tuo ritmo di oggi non deve essere quello di ieri, né quello di domani.","L'aria fresca del mattino è gratis e funziona meglio di qualsiasi caffè.","A volte il traguardo più grande della giornata è essere usciti di casa.","Ogni goccia di sudore è una decisione che hai preso per te stesso.","Correre non cambia prima il corpo, cambia prima la testa.","Nessuno ti applaudirà al terzo chilometro di un martedì qualunque, e va bene così: è tuo.","Il riposo di oggi è la velocità di domani.","Non stai correndo contro nessuno, stai correndo contro te stesso di prima.","I chilometri lenti di oggi sono quelli che ti reggono al trentesimo.","Allacciarti le scarpe è già il 50% dell'allenamento.","Il tempo non decide se corri, decidi tu.","Ogni settimana in cui aggiungi chilometri è un investimento nella tua versione futura.","Non è magia, è costanza travestita da chilometri.","Quando dubiti di potercela fare, ricorda tutte le volte in cui ce l'hai già fatta.","La corsa non perdona l'impazienza, ma premia sempre la pazienza.","La tua peggior scusa di oggi è più debole del tuo peggior allenamento.","Un rodaggio lento fatto bene vale più di uno veloce fatto male.","Correre ti insegna a stare scomodo senza andare nel panico — utile anche per tutto il resto.","Non ci sono scorciatoie per la resistenza, solo chilometri accumulati.","Ogni corsa comincia con la decisione di uscire dalla porta.","Il corridore di oggi ringrazia quello che ha deciso di iniziare.","L'obiettivo non è non fermarsi mai, è non smettere mai di provarci.","I giorni in cui hai meno voglia sono quelli che ti insegnano di più.","Avrai allenamenti negativi — non sono la fine, fanno parte del percorso.","Prenderti cura del corpo oggi ti permette di continuare a correre domani.","Ogni corridore che vedi per strada ha avuto anche lui un primo giorno difficile."],
  de: ["Jeder Kilometer zählt, auch ein langsamer.","Erholung ist auch Teil des Trainings.","Harte Tage machen starke Läufer.","Heute locker laufen heißt morgen besser laufen.","Hör auf deinen Körper — Schmerz ist nicht dasselbe wie Unbehagen.","Beständigkeit schlägt fast immer Intensität.","Das beste Tempo ist das, was du durchhalten und genießen kannst.","Ein gutes Aufwärmen verhindert eine schlechte Verletzung.","Schlaf gut: das ist das unsichtbare Training.","Motivation lässt dich anfangen, Gewohnheit lässt dich fertig werden.","Vergleiche deinen Fortschritt nicht mit dem anderer Läufer.","Dein schlechtester Lauftag schlägt immer noch einen Tag auf dem Sofa.","Du brauchst nicht jeden Tag Motivation, du brauchst eine Gewohnheit.","Der Körper passt sich an das an, was du von ihm verlangst — gib ihm Zeit.","Laufen im Regen zählt auch — und du wirst dich an diesen Tag erinnern.","Jeder Lauf, den du beendest, macht dich ein bisschen stärker als gestern.","Der schnellste Schuh ist der, den du schon anhast.","Du musst nicht jeden Tag schnell laufen, du musst regelmäßig laufen.","Der erste Kilometer fühlt sich immer schwerer an als der letzte.","Fortschritt verläuft nicht geradlinig: es gibt Wochen bergauf und Wochen auf der Stelle.","Niemand ist einen Marathon gelaufen, ohne vorher einen Meter gelaufen zu sein.","Disziplin bringt dich dorthin, wo Motivation allein nicht hinreicht.","Ein schlechtes Training löscht nicht zehn gute aus.","Laufen ist der einzige Wettkampf, bei dem du schon durchs Ankommen gewinnst.","Dein heutiges Tempo muss nicht das von gestern oder morgen sein.","Kalte Morgenluft ist gratis und wirkt besser als jeder Kaffee.","Manchmal ist der größte Erfolg des Tages einfach, rausgegangen zu sein.","Jeder Schweißtropfen ist eine Entscheidung, die du für dich selbst getroffen hast.","Laufen verändert nicht zuerst den Körper, es verändert zuerst den Kopf.","Niemand wird dich bei Kilometer 3 an einem x-beliebigen Dienstag anfeuern, und das ist okay: der gehört dir.","Die Erholung von heute ist die Geschwindigkeit von morgen.","Du läufst gegen niemanden, du läufst gegen dein früheres Ich.","Die langsamen Kilometer von heute tragen dich bei Kilometer 30.","Die Laufschuhe anzuziehen ist schon 50 % des Trainings.","Nicht das Wetter entscheidet, ob du läufst, sondern du.","Jede Woche, in der du Kilometer sammelst, ist eine Investition in dein zukünftiges Ich.","Das ist keine Magie, das ist Beständigkeit, verkleidet als Kilometer.","Wenn du zweifelst, ob du es schaffst, erinnere dich an jedes Mal, als du es schon geschafft hast.","Laufen verzeiht keine Ungeduld, belohnt aber immer Geduld.","Deine schlechteste Ausrede heute ist schwächer als dein schlechtestes Training.","Ein gut gelaufener lockerer Lauf ist mehr wert als ein schlecht gelaufener schneller.","Laufen lehrt dich, unangenehme Situationen ohne Panik auszuhalten — das hilft auch bei allem anderen.","Es gibt keine Abkürzung zur Ausdauer, nur angesammelte Kilometer.","Jeder Lauf beginnt mit der Entscheidung, aus der Tür zu gehen.","Der heutige Läufer ist dem Läufer dankbar, der sich entschieden hat anzufangen.","Das Ziel ist nicht, nie mit dem Laufen aufzuhören, sondern nie aufzuhören, es zu versuchen.","Die Tage, an denen du am wenigsten Lust hast, lehren dich am meisten.","Du wirst schlechte Trainings haben — sie sind nicht das Ende, sie gehören zum Weg dazu.","Dich heute um deinen Körper zu kümmern bedeutet, morgen weiterlaufen zu können.","Jeder Läufer, den du auf der Straße siehst, hatte auch einen schweren ersten Tag."]
};
function renderDailyTip(){
  const today = localDateISO();
  const pool = DAILY_TIPS[lang] || DAILY_TIPS.es;
  if(state.dailyTipDate !== today || typeof state.dailyTipIndex !== 'number'){
    state.dailyTipDate = today;
    state.dailyTipIndex = Math.floor(Math.random()*pool.length);
  }
  const el = document.getElementById('daily-tip-text');
  if(el) el.textContent = pool[state.dailyTipIndex % pool.length];
}
// Tips específicos del día de carrera (estrategia, nutrición, logística) -- a propósito
// separados de DAILY_TIPS (que son de entrenamiento en general), en la card que antes
// tenía el mensaje fijo de "hablar con tu coach".
const RACE_TIPS = {
  es: ["Probá la ropa y las zapatillas que vas a usar el día de la carrera en algún entrenamiento antes — nunca estrenes nada el día de la carrera.","Los 2-3 días previos a la carrera, bajá el volumen y priorizá dormir bien en vez de meter kilómetros de más.","Definí tu estrategia de ritmo antes de largar: es más fácil acelerar al final que recuperarte de haber salido demasiado rápido.","Si la carrera es de 10K o más, sumá un poco más de carbohidratos los dos días previos.","Hidratate bien los días antes de la carrera, no solo la mañana de la prueba.","En la salida, dejá que el grupo se vaya si arranca más rápido de lo que planeaste — el ritmo lo elegís vos, no la euforia del pelotón.","Practicá en los entrenamientos largos lo que vas a comer o tomar durante la carrera — el día de la prueba no es momento para probar algo nuevo.","Llegá con tiempo de sobra al lugar de largada — el apuro de último momento suma un estrés que no hace falta.","En las bajadas, aflojá el paso y dejate llevar — frenar de más cansa más que bajarlas relajado.","Guardate algo de energía para el último tramo: es mejor terminar acelerando que quedarte sin nada a dos kilómetros del final."],
  en: ["Try out the clothes and shoes you'll wear on race day during a training run first — never wear anything new on race day.","In the 2-3 days before the race, cut back on volume and prioritize sleep instead of squeezing in extra kilometers.","Decide your pacing strategy before the start — it's easier to speed up at the end than to recover from starting too fast.","If the race is 10K or longer, add a bit more carbs in the two days before it.","Stay well hydrated in the days before the race, not just the morning of.","At the start, let the pack go if it takes off faster than you planned — you choose the pace, not the crowd's excitement.","Practice during your long runs whatever you'll eat or drink during the race — race day is not the time to try something new.","Get to the start line with plenty of time to spare — last-minute rushing adds stress you don't need.","On downhills, relax your stride and let gravity help — braking too much tires you out more than running them loose.","Save some energy for the final stretch — it's better to finish accelerating than to run out of gas two kilometers from the end."],
  pt: ["Experimente a roupa e o tênis que vai usar no dia da prova em algum treino antes — nunca estreie nada no dia da corrida.","Nos 2-3 dias antes da prova, reduza o volume e priorize dormir bem em vez de acrescentar mais quilômetros.","Defina sua estratégia de ritmo antes da largada — é mais fácil acelerar no final do que se recuperar de ter saído rápido demais.","Se a prova for de 10K ou mais, aumente um pouco os carboidratos nos dois dias anteriores.","Hidrate-se bem nos dias antes da prova, não só na manhã da corrida.","Na largada, deixe o pelotão ir se sair mais rápido do que o planejado — o ritmo é seu, não da euforia do grupo.","Treine nos rodagens longos o que vai comer ou beber durante a prova — o dia da corrida não é hora de testar algo novo.","Chegue com tempo de sobra no local de largada — a pressa de última hora só soma um estresse desnecessário.","Nas descidas, relaxe a passada e deixe o corpo levar — frear demais cansa mais do que descer solto.","Guarde energia para o trecho final: é melhor terminar acelerando do que ficar sem nada a dois quilômetros do fim."],
  fr: ["Essaie pendant un entraînement les vêtements et les chaussures que tu porteras le jour de la course — ne porte jamais rien de neuf le jour J.","Les 2-3 jours avant la course, réduis le volume et privilégie le sommeil plutôt que d'ajouter des kilomètres.","Définis ta stratégie d'allure avant le départ — il est plus facile d'accélérer à la fin que de récupérer d'un départ trop rapide.","Si la course fait 10 km ou plus, augmente un peu les glucides les deux jours précédents.","Hydrate-toi bien dans les jours qui précèdent la course, pas seulement le matin même.","Au départ, laisse le peloton partir s'il va plus vite que prévu — c'est toi qui choisis l'allure, pas l'euphorie du groupe.","Entraîne-toi pendant tes sorties longues à manger ou boire ce que tu prendras pendant la course — le jour J n'est pas le moment d'essayer quelque chose de nouveau.","Arrive avec de la marge au point de départ — se précipiter au dernier moment ajoute un stress inutile.","Dans les descentes, détends ta foulée et laisse-toi porter — trop freiner fatigue plus que descendre relâché.","Garde de l'énergie pour la dernière ligne droite : mieux vaut finir en accélérant que se retrouver sans jus à deux kilomètres de l'arrivée."],
  it: ["Prova durante un allenamento i vestiti e le scarpe che userai il giorno della gara — non indossare mai nulla di nuovo il giorno della corsa.","Nei 2-3 giorni prima della gara, riduci il volume e dai priorità al sonno invece di aggiungere altri chilometri.","Definisci la tua strategia di ritmo prima della partenza — è più facile accelerare alla fine che recuperare da una partenza troppo veloce.","Se la gara è di 10K o più, aumenta leggermente i carboidrati nei due giorni precedenti.","Idratati bene nei giorni prima della gara, non solo la mattina stessa.","Alla partenza, lascia andare il gruppo se parte più veloce del previsto — il ritmo lo scegli tu, non l'euforia del gruppo.","Allenati nelle uscite lunghe a mangiare o bere quello che userai durante la gara — il giorno della corsa non è il momento di provare qualcosa di nuovo.","Arriva con largo anticipo al punto di partenza — la fretta dell'ultimo minuto aggiunge uno stress inutile.","In discesa, rilassa la falcata e lasciati andare — frenare troppo stanca più che scendere sciolti.","Conserva un po' di energia per il tratto finale: è meglio finire accelerando che restare senza forze a due chilometri dal traguardo."],
  de: ["Probiere die Kleidung und Schuhe, die du am Renntag tragen willst, vorher bei einem Training aus — trag am Renntag nie etwas Neues.","In den 2-3 Tagen vor dem Rennen: Volumen runterfahren und Schlaf priorisieren, statt noch mehr Kilometer reinzuquetschen.","Leg deine Pace-Strategie vor dem Start fest — am Ende schneller zu werden ist leichter, als sich von einem zu schnellen Start zu erholen.","Bei einem Rennen ab 10 km: in den zwei Tagen davor etwas mehr Kohlenhydrate essen.","Trink in den Tagen vor dem Rennen ausreichend, nicht nur am Morgen selbst.","Lass beim Start das Feld ziehen, wenn es schneller startet als geplant — du bestimmst dein Tempo, nicht die Euphorie der Gruppe.","Übe bei deinen langen Läufen, was du während des Rennens essen oder trinken wirst — der Renntag ist nicht der Moment, um etwas Neues auszuprobieren.","Komm mit reichlich Zeitpuffer zum Startbereich — Last-Minute-Hektik bringt unnötigen Stress.","Lauf Abfahrten locker und lass dich tragen — zu viel Bremsen ermüdet mehr als eine entspannte Abfahrt.","Heb dir Energie für die Schlussphase auf: lieber beschleunigend ins Ziel als zwei Kilometer vorher ohne Kraft dazustehen."]
};
function renderRaceTip(){
  const today = localDateISO();
  const pool = RACE_TIPS[lang] || RACE_TIPS.es;
  // Índice propio (raceTipDate/raceTipIndex), separado del de DAILY_TIPS, para que las
  // dos cards no muestren "el tip número 3 de cada pool" siempre en simultáneo -- se ven
  // como dos fuentes independientes de consejos aunque roten el mismo día.
  if(state.raceTipDate !== today || typeof state.raceTipIndex !== 'number'){
    state.raceTipDate = today;
    state.raceTipIndex = Math.floor(Math.random()*pool.length);
  }
  const el = document.getElementById('race-tip-text');
  if(el) el.textContent = pool[state.raceTipIndex % pool.length];
}
// Tocando el título de la card se ve la lista completa de tips de carrera, no solo el
// que rotó hoy -- reutiliza el mismo pool que renderRaceTip().
function openRaceTipsInfo(){
  const pool = RACE_TIPS[lang] || RACE_TIPS.es;
  document.getElementById('race-tips-info-body').innerHTML = pool.map(tip=>`
    <div style="display:flex; gap:10px; align-items:flex-start;">
      <span class="icon-sq" style="width:15px; height:15px; color:var(--hivis-text); flex-shrink:0; margin-top:3px;">${ICONS.check}</span>
      <p class="muted" style="margin:0; font-size:13.5px; line-height:1.5;">${tip}</p>
    </div>`).join('');
  document.getElementById('race-tips-info-modal').style.display = 'block';
}
function closeRaceTipsInfo(){ document.getElementById('race-tips-info-modal').style.display = 'none'; }

/* ================= CLIMA: aviso antes de entrenar =====================
   Antes de una sesión con distancia (en Inicio y en Correr), avisamos si el pronóstico
   de HOY trae lluvia/tormenta, mucho calor o mucho frío -- para que el corredor decida
   si reprograma o se prepara distinto (hidratación, abrigo, paraguas). Es 100% opcional
   y silencioso: si no hay geolocalización, se niega el permiso, o falla la consulta,
   la app sigue funcionando exactamente igual, sin mostrar nada y sin insistir en el
   permiso más de una vez por sesión de uso. Usamos Open-Meteo (gratis, sin API key,
   ver https://open-meteo.com/en/docs) directo desde el navegador del corredor -- no
   pasa por nuestro backend. El resultado se cachea en localStorage por día calendario
   para no repetir la consulta en cada render ni cada vez que se abre la app.
*/
let weatherFetchInFlight = false;
function weatherCacheKey(){ return 'zancada_weather_'+todayLocalISO(); }
function getCachedWeatherWarning(){
  try{
    const raw = localStorage.getItem(weatherCacheKey());
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
function setCachedWeatherWarning(data){
  try{ localStorage.setItem(weatherCacheKey(), JSON.stringify(data)); }catch(e){}
}
function classifyWeatherCode(code, precipProb, tempMax, tempMin){
  const stormCodes = [95,96,99];
  const rainCodes = [51,53,55,56,57,61,63,65,66,67,80,81,82];
  if(stormCodes.includes(code)) return 'storm';
  if(rainCodes.includes(code) || precipProb>=60) return 'rain';
  if(tempMax>=30) return 'heat';
  if(tempMin<=3) return 'cold';
  return null;
}
function fmtWeatherTemp(celsius){
  const val = isImperial() ? Math.round(celsius*9/5+32) : Math.round(celsius);
  return `${val}°${isImperial()?'F':'C'}`;
}
function getCachedGeo(){
  try{
    const raw = localStorage.getItem('zancada_geo');
    if(!raw) return null;
    const geo = JSON.parse(raw);
    if(geo.denied) return geo;
    if(Date.now() - geo.ts > 6*3600000) return null; // refrescar la ubicación cada 6hs
    return geo;
  }catch(e){ return null; }
}
function ensureWeatherFetched(){
  if(weatherFetchInFlight || getCachedWeatherWarning()) return;
  const geo = getCachedGeo();
  if(geo && geo.denied) return; // ya dijo que no antes -- no insistimos
  if(geo){ weatherFetchInFlight = true; fetchWeatherForecast(geo.lat, geo.lon); return; }
  if(!navigator.geolocation) return;
  weatherFetchInFlight = true;
  navigator.geolocation.getCurrentPosition(
    pos => {
      try{ localStorage.setItem('zancada_geo', JSON.stringify({lat:pos.coords.latitude, lon:pos.coords.longitude, ts:Date.now()})); }catch(e){}
      fetchWeatherForecast(pos.coords.latitude, pos.coords.longitude);
    },
    () => {
      weatherFetchInFlight = false;
      try{ localStorage.setItem('zancada_geo', JSON.stringify({denied:true, ts:Date.now()})); }catch(e){}
    },
    {timeout:8000, maximumAge:3600000}
  );
}
async function fetchWeatherForecast(lat, lon){
  try{
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=1`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('weather http '+res.status);
    const json = await res.json();
    const d = json.daily;
    if(!d || !d.time || !d.time.length) throw new Error('sin datos de clima');
    const tempMax = d.temperature_2m_max[0], tempMin = d.temperature_2m_min[0];
    const precipProb = d.precipitation_probability_max ? d.precipitation_probability_max[0] : 0;
    const level = classifyWeatherCode(d.weather_code[0], precipProb, tempMax, tempMin);
    const vars = level==='rain' ? {prob: Math.round(precipProb)}
      : level==='heat' ? {temp: fmtWeatherTemp(tempMax)}
      : level==='cold' ? {temp: fmtWeatherTemp(tempMin)}
      : {};
    setCachedWeatherWarning({level, vars});
  }catch(e){
    console.error('fetchWeatherForecast error', e);
    setCachedWeatherWarning({level:null}); // no insistir el resto del día si falló
  }finally{
    weatherFetchInFlight = false;
    renderHome();
    renderRunTodayCard();
  }
}
/* ================= WIDGET de pantalla de inicio (iOS/Android) =====================
   Le pasa a un plugin nativo LOCAL (WidgetBridge -- no es un plugin de npm, vive
   directo en el proyecto de Xcode/Android Studio, ver mobile/widget-setup/) un
   resumen chiquito de la sesión de HOY, para que el widget de la pantalla de inicio
   lo pueda mostrar sin depender del WebView (que el widget no tiene). En la web/PWA
   el plugin no existe, así que esto no hace nada -- mismo patrón que haptic() y
   handleAppleSignIn() para detectar plugins nativos sin romper la versión web. */
function updateHomeWidget(day, lbl){
  try{
    const WidgetBridge = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.WidgetBridge;
    if(!WidgetBridge) return;
    WidgetBridge.save({
      type: lbl.type,
      amount: planAmountText(day),
      zone: (day && day.dist>0 && day.zone) ? String(day.zone) : '',
      dateISO: todayLocalISO()
    });
  }catch(e){}
}
function renderWeatherWarning(elId, day, alreadyDone){
  const el = document.getElementById(elId);
  if(!el) return;
  if(alreadyDone || !(day && day.dist>0)){ el.style.display = 'none'; return; }
  const cached = getCachedWeatherWarning();
  if(!cached){ el.style.display = 'none'; ensureWeatherFetched(); return; }
  if(!cached.level){ el.style.display = 'none'; return; }
  el.className = 'weather-chip weather-'+cached.level;
  el.style.display = 'flex';
  el.innerHTML = `<div class="weather-chip-row"><span class="icon-sq" style="width:15px; height:15px; flex-shrink:0;">${ICONS.warn}</span><span>${t('weather_'+cached.level+'_warning', cached.vars)}</span></div><button class="weather-chip-action" onclick="openRescheduleModal()">${t('weather_reschedule_btn')}</button>`;
}
/* ---- Reprogramar la sesión de hoy por mal clima ----
   Botón directo en el aviso de clima (renderWeatherWarning) para mover la sesión de HOY a
   otro día LIBRE de la misma semana, sin tener que ir manualmente a la pestaña Plan. Un
   "día libre" es un día de descanso (typeKey==='rest', sin distancia) que todavía no pasó
   ni está bloqueado (ver isDayLocked) y que no es el día de una carrera cargada
   (raceDay) -- ahí no tiene sentido meterle un entrenamiento encima. Tampoco puede ser un
   día que el corredor canceló a propósito por chat (d.cancelled): a simple vista es
   indistinguible de un descanso normal (mismo typeKey:'rest', sin distancia -- ver
   applyCancelSession), pero significa "no puedo entrenar este día", así que ofrecerlo acá
   para meterle la sesión de hoy que se movió por lluvia contradiría justo lo que el
   corredor pidió. Si no hay ningún día así en lo que queda de la semana, el modal lo dice
   en vez de mostrar una lista vacía.
*/
function getReschedulableDays(){
  const todayIdx = (new Date().getDay()+6)%7;
  const options = [];
  for(let i=todayIdx+1; i<7; i++){
    const d = state.plan[i];
    if(d && d.typeKey==='rest' && !d.raceDay && !d.cancelled && !isDayLocked(d.day)) options.push(d.day);
  }
  return options;
}
function openRescheduleModal(){
  const listEl = document.getElementById('reschedule-day-list');
  const options = getReschedulableDays();
  listEl.innerHTML = options.length ? options.map(dayKey=>
    `<button class="btn btn-outline" style="width:100%;" onclick="rescheduleToday('${dayKey}')">${t('day_'+dayKey)}</button>`
  ).join('') : `<p class="muted" style="margin:0;">${t('reschedule_no_days')}</p>`;
  document.getElementById('reschedule-modal').style.display = 'block';
}
function closeRescheduleModal(){ document.getElementById('reschedule-modal').style.display = 'none'; }
// Intercambia el CONTENIDO de la sesión (tipo, distancia, terreno, zona, estructura de
// series, y también si es una sesión "custom" escrita por el coach vía chat) entre dos
// días del plan -- cada objeto conserva su propio "day" (la clave del día de la semana no
// se mueve, lo que se mueve es qué entrenamiento le toca a cada uno). La usan tanto
// rescheduleToday (botón del aviso de clima) como applyMoveSession (herramienta
// mover_sesion del coach) -- antes cada una reimplementaba el intercambio por su cuenta,
// y quedaban chances de que una de las dos se olvidara de algún campo (fue justo lo que
// pasó con el coach: modificar_sesion arrastraba tipo/distancia/zona pero no terreno).
function swapPlanDaySessions(dayA, dayB){
  const fields = ['typeKey','dist','terrain','zone','interval','custom','cancelled','type','desc'];
  const aCopy = {};
  fields.forEach(f=>{ aCopy[f] = dayA[f]; });
  fields.forEach(f=>{ if(dayB[f]===undefined) delete dayA[f]; else dayA[f] = dayB[f]; });
  fields.forEach(f=>{ if(aCopy[f]===undefined) delete dayB[f]; else dayB[f] = aCopy[f]; });
}
function rescheduleToday(targetDayKey){
  const todayIdx = (new Date().getDay()+6)%7;
  const targetIdx = DAY_KEYS.indexOf(targetDayKey);
  if(targetIdx===-1 || targetIdx===todayIdx) return;
  const todayPlan = state.plan[todayIdx];
  const targetPlan = state.plan[targetIdx];
  if(!todayPlan || !targetPlan) return;
  swapPlanDaySessions(todayPlan, targetPlan);
  closeRescheduleModal();
  persist();
  renderPlan();
  renderHome();
  renderRunTodayCard();
  showToast(t('reschedule_success', {day: t('day_'+targetDayKey)}), 'success');
}
function renderHome(){
  renderDailyTip();
  renderRaceTip();
  // La card de tips de carrera solo tiene sentido si hay una carrera cargada -- antes se
  // mostraba siempre, incluso para quien eligio un objetivo "salud y estilo de vida" sin
  // fecha puntual, dandole consejos de "que comer 2 dias antes de tu carrera" a alguien
  // que no tiene ninguna.
  document.getElementById('home-race-tips-card').style.display = state.event ? '' : 'none';
  // install-help-card (el acordeon de "como instalar la app") no tenia gating: quedaba
  // visible para siempre, incluso ya instalada y corriendo en modo standalone -- mismo
  // chequeo que ya usa install-banner mas arriba (isRunningStandalone()).
  // Se oculta también cuando hay un prompt nativo de instalación disponible (Chrome/Android):
  // ahí el banner de arriba ya tiene un botón "Instalar" de un solo toque -- mostrar además
  // el acordeón con los pasos manuales es redundante en ese caso. En iOS (sin prompt nativo
  // posible) el banner es solo un aviso de texto, así que ahí esta card sigue siendo la única
  // fuente real de instrucciones paso a paso, y se mantiene.
  const installHelpCard = document.getElementById('install-help-card');
  if(installHelpCard) installHelpCard.style.display = (isRunningStandalone() || !!deferredInstallPrompt) ? 'none' : '';
  document.getElementById('home-name').textContent = state.profile.name;
  document.getElementById('headerDate').textContent = new Date().toLocaleDateString(LOCALE_MAP[lang],{weekday:'short',day:'numeric',month:'short'});

  // Carrera cargada en "Próximos eventos" (Perfil) -- se muestra también acá en Inicio
  // (no solo en Perfil) porque es justo el tipo de dato que el corredor quiere ver de
  // entrada al abrir la app, no algo que tenga que ir a buscar. Se recalcula entera en
  // cada render a partir de state.event, así que sigue apareciendo sin importar qué
  // otra cosa se haya editado (datos personales, objetivo, etc.) -- ninguno de esos
  // guardados toca state.event.
  const raceCard = document.getElementById('home-race-card');
  if(state.event){
    raceCard.style.display = 'block';
    document.getElementById('home-race-name').textContent = state.event.name;
    const raceTag = document.getElementById('home-race-type-tag');
    raceTag.className = 'tag tag-' + (state.event.type==='ruta' ? 'asfalto' : state.event.type==='trail' ? 'trail' : 'mixto');
    raceTag.textContent = t('ev_type_'+state.event.type);
    const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
    const daysToRace = Math.round((new Date(state.event.date+'T00:00:00') - todayMidnight) / 86400000);
    document.getElementById('home-race-days').textContent = Math.max(0, daysToRace);
    // Fase de entrenamiento respecto a esta carrera -- mismos cortes que usa taperMultiplier()
    // (menos de 1 semana = puesta a punto final, menos de 3 semanas = puesta a punto ya en
    // marcha, el resto = fase de carga normal) para que lo que se ve acá en Inicio sea
    // siempre coherente con el volumen que el plan realmente le está aplicando esta semana.
    const phaseTag = document.getElementById('home-race-phase-tag');
    const phaseNote = document.getElementById('home-race-phase-note');
    let phaseKey, noteKey;
    if(daysToRace < 7){ phaseKey = 'home_race_phase_taper_final'; noteKey = 'home_race_phase_taper_final_note'; }
    else if(daysToRace < 21){ phaseKey = 'home_race_phase_taper'; noteKey = 'home_race_phase_taper_note'; }
    else { phaseKey = 'home_race_phase_build'; noteKey = null; }
    phaseTag.textContent = t(phaseKey);
    phaseTag.style.display = 'inline-block';
    if(noteKey){ phaseNote.textContent = t(noteKey); phaseNote.style.display = 'block'; }
    else { phaseNote.style.display = 'none'; }
  } else {
    raceCard.style.display = 'none';
  }

  // Racha de semanas seguidas cumpliendo el plan (≥70%) -- ver buildWeeklyRecapMessage().
  // La mostramos acá recién a partir de la 2da semana seguida, igual que en el chat del
  // coach, para no mostrar un badge "1" que se sienta como un contador vacío recién
  // arrancado.
  const streakBadge = document.getElementById('home-streak-badge');
  if((state.streakWeeks||0) >= 2){
    streakBadge.style.display = 'inline-flex';
    streakBadge.textContent = t('home_streak_badge', {n: state.streakWeeks});
  } else {
    streakBadge.style.display = 'none';
  }
  const idx = (new Date().getDay()+6)%7;
  const today = state.plan[idx];
  const lbl = planLabel(today);
  document.getElementById('home-next-title').textContent = lbl.type;
  // lbl.desc trae saltos de línea reales (entrada en calor / sesión / vuelta a la calma,
  // ver planLabel) -- se listan como viñetas breves en vez de un párrafo corrido. En un día
  // "custom" el texto del medio lo escribió el coach (IA) a partir de la charla, así que se
  // escapa antes de insertarlo como HTML -- mismo criterio que ya usa renderPlan().
  const nextDescLines = (today.custom ? escapeHtml(lbl.desc) : lbl.desc).split('\n').filter(Boolean);
  document.getElementById('home-next-desc').innerHTML = nextDescLines.map(line=>`<div class="next-session-bullet">${line}</div>`).join('');
  document.getElementById('home-next-dist').textContent = planAmountText(today);
  document.getElementById('home-next-zone').innerHTML = (today.dist>0 && today.zone) ? `<span class="zone-chip zone-${today.zone}">${t('zone_word')} ${today.zone}</span>` : '';
  updateHomeWidget(today, lbl);

  // Si ya corrimos hoy, mostramos el resumen de esa sesión en lugar del cartel de
  // "próxima sesión" -- ver getTodayRun().
  const todayRun = getTodayRun();
  const doneBlock = document.getElementById('home-session-done-block');
  const nextSessionBlock = document.getElementById('home-next-session');
  const cardTitleEl = document.getElementById('home-next-card-title');
  if(todayRun){
    cardTitleEl.textContent = t('home_session_done_title');
    nextSessionBlock.style.display = 'none';
    // El "pop" de reconocimiento (mismo keyframe que ya usa confirm-card) solo se dispara la
    // primera vez que este bloque pasa de oculto a visible -- renderHome() se re-llama seguido
    // (cambio de pestaña, cualquier cambio de estado) mientras la carrera de hoy sigue cargada,
    // así que sin este chequeo la animación se repetiría en cada render en vez de sentirse
    // como el momento puntual de "recién terminaste".
    const justRevealed = doneBlock.style.display !== 'block';
    doneBlock.style.display = 'block';
    doneBlock.style.animation = justRevealed ? 'confirmPop .25s ease' : 'none';
    const paceMin = todayRun.distanceKm>0.02 ? (todayRun.durationSec/60)/todayRun.distanceKm : 0;
    document.getElementById('home-session-done-sub').textContent = t('home_session_done_sub', {type: lbl.type});
    document.getElementById('home-done-dist').textContent = fmtDist(todayRun.distanceKm);
    document.getElementById('home-done-dist-label').textContent = distUnit();
    document.getElementById('home-done-time').textContent = fmtTime(todayRun.durationSec);
    document.getElementById('home-done-pace').textContent = fmtPace(paceMin);
    document.getElementById('home-done-pace-label').textContent = t('run_pace');
  } else {
    cardTitleEl.textContent = t('home_next');
    nextSessionBlock.style.display = '';
    doneBlock.style.display = 'none';
  }
  renderWeatherWarning('home-weather-warning', today, !!todayRun);

  const weekRuns = (state.runs||[]).filter(r => getMondayISO(new Date(r.date)) === state.weekStart);
  const doneKm = weekRuns.reduce((a,r)=>a+r.distanceKm, 0);
  const weekKm = state.plan.reduce((a,d)=>a+d.dist,0);
  if(isTimeMode()){
    const doneMin = weekRuns.reduce((a,r)=>a+(r.durationSec||0),0)/60;
    const plannedMin = state.plan.reduce((a,d)=>a+planDurationMin(d),0);
    animateCountUp(document.getElementById('home-week-done-km'), doneMin, 0);
    animateCountUp(document.getElementById('home-week-km'), plannedMin, 0);
  } else {
    const doneKmDisplay = isImperial() ? doneKm * MI_PER_KM : doneKm;
    const weekKmDisplay = isImperial() ? weekKm * MI_PER_KM : weekKm;
    animateCountUp(document.getElementById('home-week-done-km'), doneKmDisplay, 1);
    animateCountUp(document.getElementById('home-week-km'), weekKmDisplay, 1);
  }
  animateCountUp(document.getElementById('home-week-sessions'), state.plan.filter(d=>d.dist>0).length, 0);
  document.getElementById('home-runs-count').textContent = weekRuns.length;

  const goalWrap = document.getElementById('goal-progress-wrap');
  if(state.profile.weeklyGoalKm > 0){
    goalWrap.style.display = 'block';
    const rawPct = (doneKm / state.profile.weeklyGoalKm) * 100;
    const pct = Math.min(100, Math.round(rawPct));
    document.getElementById('goal-progress-pct').textContent = pct + '%';
    document.getElementById('goal-progress-bar').style.width = pct + '%';
    if(rawPct >= 100 && state.weekStart && state.lastGoalCelebratedWeek !== state.weekStart){
      state.lastGoalCelebratedWeek = state.weekStart;
      haptic([15,40,15,40,25]);
      showToast(t('goal_reached_msg'), 'success');
      celebrate();
      persist();
    }
  } else {
    goalWrap.style.display = 'none';
  }

  // Tira de días L-D: un trazo vertical fino por día (chico en descanso, alto y lima
  // según el volumen planeado en entrenamiento), con el día de hoy remarcado --
  // mini gráfico de barras en vez de la fila de puntos/barras gruesas de antes.
  const todayIdx = (new Date().getDay()+6)%7;
  const maxPlanDist = Math.max(...state.plan.map(d=>d.dist||0), 1);
  const barsEl = document.getElementById('home-week-bars');
  barsEl.innerHTML = state.plan.map((d,i)=>{
    const isRest = d.dist===0;
    const isToday = i===todayIdx;
    const h = isRest ? 4 : Math.max(10, Math.round((d.dist/maxPlanDist)*44));
    return `<div class="wd-col ${isRest?'rest':'training'} ${isToday?'today':''}">
      <div class="wd-bar-wrap"><div class="wd-bar" style="height:${h}px"></div></div>
      <div class="wd-lbl">${t('day_'+d.day).slice(0,2)}</div>
    </div>`;
  }).join('');


  renderReadinessCard();

  const loadCard = document.getElementById('load-card');
  const load = calcTrainingLoad();
  if(load){
    loadCard.style.display = 'block';
    const tagClassMap = {low:'tag-soon', optimal:'tag-asfalto', caution:'tag-load-caution', risk:'tag-load-risk'};
    const tag = document.getElementById('load-tag');
    tag.className = 'tag ' + tagClassMap[load.level];
    tag.textContent = t('home_load_'+load.level);
    document.getElementById('load-hint').textContent = t('home_load_hint_'+load.level);
  } else {
    loadCard.style.display = 'none';
  }
  updateSyncBadge();
}
// Busca la carrera más reciente registrada HOY -- se usa para mostrar el resumen de
// "sesión completada" tanto en Inicio como en la pestaña Correr, en vez del cartel de
// "próxima sesión"/círculo de arrancar como si no hubiésemos corrido nada todavía.
function getTodayRun(){
  // r.date es un timestamp completo en UTC (new Date().toISOString(), con hora) -- cortar
  // los primeros 10 caracteres a mano daba la fecha calendario en UTC, no la fecha LOCAL
  // en la que el corredor realmente corrió (ver el comentario largo junto a localDateISO).
  const today = todayISO();
  const todays = (state.runs||[]).filter(r => r.date && localDateISO(r.date) === today);
  if(!todays.length) return null;
  return todays.reduce((a,b) => (a.id > b.id ? a : b));
}
function renderRunTodayCard(){
  const idx = (new Date().getDay()+6)%7;
  const today = state.plan[idx];
  const card = document.getElementById('run-today-card');
  const doneCard = document.getElementById('run-done-today-card');
  const todayRun = getTodayRun();
  if(todayRun){
    const paceMin = todayRun.distanceKm>0.02 ? (todayRun.durationSec/60)/todayRun.distanceKm : 0;
    document.getElementById('run-done-dist').textContent = fmtDist(todayRun.distanceKm);
    document.getElementById('run-done-dist-label').textContent = distUnit();
    document.getElementById('run-done-time').textContent = fmtTime(todayRun.durationSec);
    document.getElementById('run-done-pace').textContent = fmtPace(paceMin);
    document.getElementById('run-done-pace-label').textContent = t('run_pace');
    doneCard.style.display = 'block';
    // El cartel de "sesión completada" reemplaza al de "tu sesión de hoy" (no tiene
    // sentido mostrar los dos juntos, uno diciendo lo que tocaba y otro confirmando que
    // ya se hizo) -- antes esto solo se decía en el comentario de arriba, pero el código
    // nunca llegaba a ocultar `card`, así que quedaban las dos tarjetas apiladas.
    card.style.display = 'none';
    renderWeatherWarning('run-weather-warning', today, true);
    return;
  }
  doneCard.style.display = 'none';
  if(!today){ card.style.display = 'none'; renderWeatherWarning('run-weather-warning', today, false); return; }
  const lbl = planLabel(today);
  document.getElementById('run-today-title').textContent = lbl.type;
  document.getElementById('run-today-desc').textContent = lbl.desc;
  document.getElementById('run-today-dist').textContent = planAmountText(today);
  document.getElementById('run-today-zone').innerHTML = (today.dist>0 && today.zone) ? `<span class="zone-chip zone-${today.zone}">${t('zone_word')} ${today.zone}</span>` : '';
  card.style.display = 'block';
  renderWeatherWarning('run-weather-warning', today, false);
}
function getPlanStartDate(){
  // la fecha más vieja de weekStart que tengamos registrada (historial de semanas + la semana actual)
  // marca desde cuándo existe ESTE plan, sin importar si hay carreras de Strava de antes importadas.
  const starts = (state.planHistory||[]).map(w=>w.weekStart).filter(Boolean);
  if(state.weekStart) starts.push(state.weekStart);
  if(!starts.length) return null;
  return starts.reduce((min,s)=> (s < min ? s : min), starts[0]);
}
function calcTrainingLoad(){
  const runs = state.runs || [];
  if(!runs.length) return null;
  const planStart = getPlanStartDate();
  if(!planStart) return null;
  const now = Date.now();
  const daysSincePlan = (now - new Date(planStart).getTime()) / 86400000;
  if(daysSincePlan < 14) return null; // hace menos de 2 semanas que existe este plan: todavía no hay con qué comparar de forma confiable
  const kmWithin = days => runs.reduce((a,r)=>{
    const diff = now - new Date(r.date).getTime();
    return (diff >= 0 && diff <= days*86400000) ? a + r.distanceKm : a;
  }, 0);
  const acuteKm = kmWithin(7);
  // el promedio "crónico" se divide por las semanas que lleva este plan (hasta 4), no siempre por 4, y la ventana
  // nunca mira más atrás de cuándo arrancó el plan -> las carreras de Strava importadas de antes no lo distorsionan.
  const chronicWindowDays = Math.min(28, daysSincePlan);
  const chronicWeeks = chronicWindowDays / 7;
  const chronicWeeklyAvg = kmWithin(chronicWindowDays) / chronicWeeks;
  if(chronicWeeklyAvg < 1) return null; // todavía no hay suficiente volumen para comparar
  const ratio = acuteKm / chronicWeeklyAvg;
  let level;
  if(ratio < 0.8) level = 'low';
  else if(ratio <= 1.3) level = 'optimal';
  else if(ratio <= 1.5) level = 'caution';
  else level = 'risk';
  return { ratio, level, acuteKm, chronicWeeklyAvg };
}

let viewingWeekOffset = 0;
function navigateWeek(delta){
  viewingWeekOffset += delta;
  haptic(10);
  renderPlan();
  const list = document.getElementById('plan-list');
  list.classList.remove('plan-slide-left','plan-slide-right');
  void list.offsetWidth;
  list.classList.add(delta > 0 ? 'plan-slide-left' : 'plan-slide-right');
}
function getWeekData(offset){
  const wn = (state.weekNumber||1) + offset;
  if(offset === 0) return { plan: state.plan, weekNumber: wn, editable: true, exists: true, mode:'current', weekStart: state.weekStart };
  if(offset < 0){
    const found = (state.planHistory||[]).find(w => w.weekNumber === wn);
    if(found) return { plan: found.plan, weekNumber: wn, editable: false, exists: true, mode:'past', weekStart: found.weekStart };
    return { plan: [], weekNumber: wn, editable: false, exists: false, mode:'past', weekStart: null };
  }
  if(offset === 1){
    // la semana que sigue ya no es "una estimación más" como el resto de las semanas futuras:
    // se calcula igual que la va a recibir el lunes (con el ajuste automático ya adentro) y el
    // coach del chat la puede editar -> se muestra como un plan firme, sin la etiqueta de estimado
    const nw = getNextWeekPlan();
    return { plan: nw.plan, weekNumber: nw.weekNumber, editable: false, exists: true, mode:'next', weekStart: nw.weekStart };
  }
  const futureStart = new Date(state.weekStart);
  futureStart.setDate(futureStart.getDate() + offset*7);
  const futureStartIso = futureStart.toISOString().slice(0,10);
  if(offset > 12) return { plan: [], weekNumber: wn, editable: false, exists: false, mode:'future', weekStart: futureStartIso };
  return { plan: generatePlan(state.profile, wn, futureStartIso), weekNumber: wn, editable: false, exists: true, mode:'future', weekStart: futureStartIso };
}
function renderPlan(){
  const z = state.profile.hrZones;
  const wd = getWeekData(viewingWeekOffset);
  const wn = wd.weekNumber;

  document.getElementById('plan-prev-btn').disabled = !getWeekData(viewingWeekOffset-1).exists;
  document.getElementById('plan-next-btn').disabled = !(viewingWeekOffset < 12);

  // Semana en la que cae la carrera cargada en "Próximos eventos" (si hay una) -- baja el
  // volumen igual que una semana de descarga común, así que reusa la misma etiqueta visual
  // (ver isEventRaceWeek/eventRaceWeekMultiplier), pero con su propio texto aclaratorio abajo
  // para que quede claro que es por esa carrera puntual y no por el ciclo de descarga normal.
  const isEventWeek = wd.exists && wd.mode!=='future' && wd.mode!=='past' && wd.weekStart && isEventRaceWeek(wd.weekStart);
  // La descarga PERIÓDICA (cada 3-4 semanas, ver isCutbackWeek/weekMultiplier) es un ciclo
  // normal del plan, sin relación con ninguna carrera cargada -- antes no tenía ningún texto
  // aclaratorio (a diferencia de taper/recuperación/carrera), así que un corredor que la veía
  // aparecer no tenía forma de saber por qué, y podía confundirla con un efecto de una carrera
  // que tuviera cargada. isEventWeek manda si coinciden las dos (el motivo puntual de esa
  // carrera es más específico que "le toca descarga por ciclo").
  const isPlainCutbackWeek = wd.exists && wd.mode!=='future' && isCutbackWeek(wn) && !isEventWeek;
  let label = t('plan_week_label',{n:wn});
  if(wd.exists && (isCutbackWeek(wn) || isEventWeek) && wd.mode!=='future') label += ` · <span class="tag tag-asfalto">${t('plan_cutback')}</span>`;
  if(wd.mode==='future') label += ` · <span class="tag tag-soon">${t('plan_estimate')}</span>`;
  if(wd.mode==='past') label += ` · <span class="tag tag-soon">${t('plan_past')}</span>`;
  const taperMult = (wd.exists && wd.mode!=='past' && wd.weekStart) ? taperMultiplier(state.profile, wd.weekStart) : 1;
  const isTapering = taperMult < 1;
  // el aviso de taper (etiqueta + mensaje) solo se muestra en semanas "firmes" (actual y la que
  // sigue) -- en una semana "estimado, puede ajustarse" no tiene sentido afirmar algo puntual
  // como "acá empieza tu puesta a punto" sobre una proyección que todavía puede cambiar entera
  const showTaperUi = isTapering && wd.mode!=='future';
  if(showTaperUi) label += ` · <span class="tag tag-asfalto">${t('plan_taper_tag')}</span>`;
  // La semana de recuperación se recalcula siempre en base a wd.weekStart -- no depende de
  // que state.event siga cargado (isRecoveryWeek() ya contempla que se haya limpiado solo
  // al pasar la fecha, ver autoClearPastEvent()), así que se puede mostrar toda la semana,
  // no solo el día del rollover.
  const showRecoveryUi = wd.exists && wd.mode!=='past' && wd.mode!=='future' && wd.weekStart && isRecoveryWeek(wd.weekStart);
  if(showRecoveryUi) label += ` · <span class="tag tag-asfalto">${t('plan_recovery_tag')}</span>`;
  document.getElementById('plan-week-info').innerHTML = label;
  const taperNote = document.getElementById('plan-taper-note');
  if(showTaperUi){
    taperNote.style.display='block';
    taperNote.textContent = taperMult <= 0.55 ? t('plan_taper_note_final') : t('plan_taper_note_early');
  } else {
    taperNote.style.display='none';
  }
  const eventWeekNote = document.getElementById('plan-event-week-note');
  if(isEventWeek && state.event){
    eventWeekNote.style.display='block';
    eventWeekNote.textContent = t('plan_event_week_note', {name: state.event.name});
  } else {
    eventWeekNote.style.display='none';
  }
  const cutbackNote = document.getElementById('plan-cutback-note');
  if(isPlainCutbackWeek){
    cutbackNote.style.display='block';
    cutbackNote.textContent = t('plan_cutback_note');
  } else {
    cutbackNote.style.display='none';
  }
  const recoveryNote = document.getElementById('plan-recovery-note');
  if(showRecoveryUi){
    recoveryNote.style.display='block';
    recoveryNote.textContent = t('plan_recovery_note');
  } else {
    recoveryNote.style.display='none';
  }

  if(!wd.exists){
    document.getElementById('plan-list').innerHTML = `<div style="text-align:center; padding:24px 0;"><svg viewBox="0 0 60 14" style="width:80px; height:19px; margin:0 auto 12px; display:block; opacity:.6;"><polyline points="0,12 10,12 16,4 22,10 28,2 34,9 40,12 60,12" fill="none" stroke="#C06A2E" stroke-width="1.6"/></svg><p class="muted" style="margin:0;">${t('plan_no_data')}</p></div>`;
    renderPastWeeks();
    return;
  }

  const todayIdx = (new Date().getDay()+6)%7;
  document.getElementById('plan-list').innerHTML = wd.plan.map((d,i)=>{
    const lbl = planLabel(d);
    // d.custom viene de texto libre que el coach (IA) escribió a partir de un pedido del
    // usuario (modificar_sesion / ajuste de volumen) -- a diferencia de las descripciones
    // fijas de las traducciones o el nombre del evento (que ya se escapa en planLabel), acá
    // nunca escapamos antes, así que hay que hacerlo recién en este punto, al insertarlo
    // como HTML, para no habilitar un XSS guardado en el plan.
    const lblType = d.custom ? escapeHtml(lbl.type) : lbl.type;
    const lblDesc = d.custom ? escapeHtml(lbl.desc) : lbl.desc;
    let dateLbl = '', dayIso = null;
    if(wd.weekStart){
      const dt = new Date(wd.weekStart+'T00:00:00'); dt.setDate(dt.getDate()+i);
      dateLbl = `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
      dayIso = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    }
    const isToday = wd.mode==='current' && i===todayIdx;
    const isPastDay = wd.mode==='current' && i<todayIdx;
    const canEdit = wd.editable && !isPastDay;
    // La carrera cargada en "Próximos eventos" ya no le saca la sesión de entrenamiento al
    // día en el que cae (ver generatePlan) -- pero igual queremos que se VEA en el calendario
    // del Plan, así que se marca acá con un chip aparte, comparando la fecha real de este día
    // (dayIso) contra state.event.date en el momento del render. Al comparar por fecha (y no
    // por un flag guardado en el día, como antes) no hay riesgo de que una carrera cargada más
    // adelante le pise el cartel a un día de una semana ya vivida -- solo coincide si de verdad
    // es la fecha de la carrera cargada ahora mismo.
    const isEventDay = !!(state.event && dayIso && dayIso === state.event.date);
    // Los chips de terreno/zona (y el de la carrera, si corresponde) van agrupados al final de
    // la fila, junto al ícono de estado -- no repetidos como subtítulo del tipo de sesión (un
    // día de descanso ya dice "Descanso" en el título; no hace falta repetirlo como chip).
    let meta = '';
    if(d.raceDay && d.raceEventName){
      // Compatibilidad con planes ya generados antes de este cambio, donde ese día todavía
      // quedó fijo en descanso con el flag raceDay -- se van regenerando solos con el tiempo.
      meta = `<span class="tag tag-mixto">${escapeHtml(d.raceEventName)}</span>`;
    } else {
      if(d.dist>0){
        // d.dist>0 acá es a propósito, no solo d.terrain/d.zone: un día de
        // descanso nunca debería mostrar cartel de terreno/zona, ni siquiera
        // si por algún dato viejo esos campos quedaran seteados.
        if(d.terrain) meta += `<span class="tag tag-${d.terrain}">${t('ob_terrain_'+d.terrain)}</span>`;
        if(d.zone) meta += `<span class="zone-chip zone-${d.zone}">${t('zone_word')} ${d.zone}</span>`;
      }
      if(isEventDay) meta += `<span class="tag tag-mixto">${escapeHtml(state.event.name)}</span>`;
    }
    const isRestDay = !(d.dist>0) && !d.raceDay;
    const statusIcon = d.status==='done' ? `<div class="icon-sq" style="width:16px; height:16px; color:var(--hivis);">${ICONS.check}</div>` : d.status==='skipped' ? `<div class="icon-sq" style="width:16px; height:16px; color:var(--danger);">${ICONS.cross}</div>` : '';
    const zoneDetail = d.zone ? `<br><br><span class="zone-chip zone-${d.zone}">${t('zone_word')} ${d.zone}</span> <span class="mono muted">${z[d.zone].min}-${z[d.zone].max} bpm</span>` : '';
    let statusBlock = '';
    if(d.status==='done'){
      const run = d.linkedRunId ? state.runs.find(r=>r.id===d.linkedRunId) : null;
      let doneText = t('plan_status_done');
      if(run){
        const pMin = run.distanceKm>0.02 ? (run.durationSec/60)/run.distanceKm : 0;
        doneText += `: ${fmtDist(run.distanceKm)}${distUnit()} · ${fmtPace(pMin)}/${distUnit()}`;
      }
      statusBlock = canEdit ? `<p style="color:var(--hivis); font-weight:700; margin-top:12px;">${doneText} · <button class="small-link" onclick="markSession(${i},null)">${t('plan_undo')}</button></p>` : `<p style="color:var(--hivis); font-weight:700; margin-top:12px;">${doneText}${isPastDay?' · '+t('plan_locked'):''}</p>`;
    }
    else if(d.status==='skipped') statusBlock = canEdit ? `<p style="color:var(--danger); font-weight:700; margin-top:12px;">${t('plan_status_skipped')} · <button class="small-link" onclick="markSession(${i},null)">${t('plan_undo')}</button></p>` : `<p style="color:var(--danger); font-weight:700; margin-top:12px;">${t('plan_status_skipped')}${isPastDay?' · '+t('plan_locked'):''}</p>`;
    else if(d.dist>0 && canEdit){
      statusBlock = `<div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;"><button class="btn btn-outline btn-sm" onclick="markSession(${i},'done')"><span class="icon-sq" style="width:14px; height:14px;">${ICONS.check}</span> ${t('plan_mark_done')}</button><button class="btn btn-outline btn-sm" onclick="markSession(${i},'skipped')"><span class="icon-sq" style="width:14px; height:14px;">${ICONS.cross}</span> ${t('plan_mark_skipped')}</button>${isToday?`<button class="btn btn-outline btn-sm" id="sync-today-btn" onclick="syncTodayNow()"><span class="icon-sq" style="width:14px; height:14px;">${ICONS.refresh}</span> ${t('plan_sync_button')}</button>`:''}</div>`;
    }
    return `<div>
      <div class="day-row ${isRestDay?'day-row-rest':''} ${isToday?'day-row-today':''}" onclick="toggleDay(${i})">
        <div class="day-badge"><div class="d">${t('day_'+d.day).slice(0,3)}</div>${dateLbl?`<div class="mono muted" style="font-size:10px; margin-top:2px;">${dateLbl}</div>`:''}</div>
        <div class="day-info">
          <div class="day-info-title-row"><span class="t">${lblType}</span>${d.dist>0?`<span class="day-km-inline">${planAmountText(d)}</span>`:''}</div>
          ${meta?`<div class="day-row-chips">${meta}</div>`:''}
        </div>
        <div class="day-row-end">${statusIcon}</div>
      </div>
      <div class="day-detail" id="detail-${i}">${lblDesc}${zoneDetail}${statusBlock}</div>
    </div>`;
  }).join('');
  renderPastWeeks();
}
function renderPastWeeks(){
  const card = document.getElementById('past-weeks-card');
  if(!state.planHistory || state.planHistory.length===0){ card.style.display='none'; return; }
  card.style.display='block';
  document.getElementById('past-weeks-list').innerHTML = state.planHistory.slice().reverse().map(w=>{
    const doneCount = w.plan.filter(d=>d.status==='done').length;
    const totalSessions = w.plan.filter(d=>d.dist>0).length;
    const plannedAmount = isTimeMode() ? `${w.plan.reduce((a,d)=>a+planDurationMin(d),0)} ${t('time_unit_min')}` : `${w.plan.reduce((a,d)=>a+d.dist,0)}km`;
    const offset = w.weekNumber - (state.weekNumber||1);
    return `<div style="padding:10px 0; border-bottom:1px solid var(--asphalt-3); cursor:pointer;" onclick="viewingWeekOffset=${offset}; renderPlan();">
      <div style="display:flex; justify-content:space-between;"><span style="font-weight:700;">${t('plan_week_label',{n:w.weekNumber})}</span><span class="muted mono" style="font-size:11.5px;">${w.weekStart}</span></div>
      <p class="muted" style="margin-top:4px; font-size:12.5px;">${doneCount}/${totalSessions} ${t('home_sessions').toLowerCase()} · ${plannedAmount} ${t('home_km_planned').toLowerCase()}</p>
    </div>`;
  }).join('');
}
function toggleDay(i){ if(planSwipeSuppressClick) return; document.getElementById('detail-'+i).classList.toggle('open'); }
function markSession(i, status){
  state.plan[i].status = status;
  if(!status) state.plan[i].linkedRunId = null;
  renderPlan(); renderHome(); persist();
  if(status === 'done'){
    haptic([15,40,15]);
    showToast(t('session_done_msg'), 'success');
  }
}

const ZONE_PCT = {1:'50–60%', 2:'60–70%', 3:'70–80%', 4:'80–90%', 5:'90–100%'};
function renderZones(){
  const z = state.profile.hrZones;
  // hrKnown distingue si la FC máxima es una estimación por edad o si el corredor la
  // confirmó (por chat, con el coach) -- antes este flag no se usaba en ningún lado, y
  // el texto de acá siempre decía "se calcula según tu edad" aunque ya hubiera una FC
  // máxima real cargada. Las claves perfil_zones_estimated/perfil_zones_tested ya
  // existían traducidas a los 6 idiomas pero nunca se usaban.
  const statusText = state.profile.hrKnown ? t('perfil_zones_tested') : t('perfil_zones_estimated');
  const statusEl = document.getElementById('zones-status');
  if(statusEl) statusEl.textContent = statusText;
  const zonesSummaryEl = document.getElementById('perfil-zones-summary');
  if(zonesSummaryEl) zonesSummaryEl.textContent = statusText;
  document.getElementById('zones-list').innerHTML = [1,2,3,4,5].map(n=>`
    <div class="zone-row">
      <div><span class="zone-chip zone-${n}">${t('zone_word')} ${n}</span><div class="zd">${t('zdesc_'+n)} · ${ZONE_PCT[n]}</div></div>
      <div style="display:flex; align-items:center; gap:6px;">
        <input type="number" id="zone-${n}-min" value="${z[n].min}" style="width:52px; background:var(--asphalt-3); border:1.5px solid var(--asphalt-4); color:var(--chalk); padding:6px 4px; border-radius:6px; text-align:center; font-size:13px;">
        <span class="muted">–</span>
        <input type="number" id="zone-${n}-max" value="${z[n].max}" style="width:52px; background:var(--asphalt-3); border:1.5px solid var(--asphalt-4); color:var(--chalk); padding:6px 4px; border-radius:6px; text-align:center; font-size:13px;">
      </div>
    </div>`).join('');
}
function saveCustomZones(){
  const newZones = {};
  for(let n=1;n<=5;n++){
    newZones[n] = {
      min: parseInt(document.getElementById(`zone-${n}-min`).value) || 0,
      max: parseInt(document.getElementById(`zone-${n}-max`).value) || 0
    };
  }
  state.profile.hrZones = newZones;
  renderZones(); renderPlan(); persist();
  flashSaved('save-zones-btn');
}

/* ---- registro de molestias/lesiones ----
   Antes, "Me duele algo" era un chip que solo mandaba un mensaje de chat que se perdía
   en la conversación -- no quedaba ningún registro, y una molestia mencionada hace tres
   semanas no tenía forma de seguir influyendo en el plan. Ahora queda guardada con fecha
   y zona del cuerpo, se puede ver y marcar como resuelta desde Perfil, y mientras esté
   activa (ver activePainEntries) sube la "cautela" del plan -- ver trainingCaution() --
   y se le avisa al coach en cada mensaje (ver buildContext). */
const PAIN_BODY_PARTS = ['rodilla','tobillo','pantorrilla','isquios','cadera','espalda','pie','cuadriceps','otro'];
document.getElementById('readiness-choice').addEventListener('click', e=>{
  const c=e.target.closest('.choice'); if(!c) return;
  haptic(15);
  logReadiness(c.dataset.v);
});
document.getElementById('pain-body-choice').addEventListener('click', e=>{
  const c=e.target.closest('.choice'); if(!c) return;
  [...document.getElementById('pain-body-choice').children].forEach(x=>x.classList.remove('active')); c.classList.add('active');
});
function openPainOverlay(){ document.getElementById('pain-overlay').classList.add('overlay-open'); }
function closePainOverlay(){ document.getElementById('pain-overlay').classList.remove('overlay-open'); }
function openPainModal(){
  document.getElementById('pain-note').value = '';
  [...document.getElementById('pain-body-choice').children].forEach(c=>c.classList.remove('active'));
  document.getElementById('pain-modal').style.display = 'block';
}
function closePainModal(){ document.getElementById('pain-modal').style.display = 'none'; }
function openPainInfo(){ document.getElementById('pain-info-modal').style.display = 'block'; }
function closePainInfo(){ document.getElementById('pain-info-modal').style.display = 'none'; }
async function savePainLog(){
  const chosen = document.querySelector('#pain-body-choice .choice.active');
  if(!chosen){ showToast(t('pain_body_required_err'), 'error'); return; }
  const bodyPart = chosen.dataset.v;
  const note = document.getElementById('pain-note').value.trim().slice(0,200);
  if(!state.painLog) state.painLog = [];
  state.painLog.push({id:Date.now(), date:localDateISO(), bodyPart, note, active:true, checkinSent:false});
  closePainModal();
  renderPainLog();
  await persist();
  // le avisamos al coach en el momento -- arma el mensaje como si el corredor lo hubiera
  // escrito, así la respuesta que llega ya trae consejo específico para esa molestia, en
  // vez de quedar solo como un dato guardado que nadie comenta.
  const label = t('pain_body_'+bodyPart);
  const chatInput = document.getElementById('chatInput');
  chatInput.value = note ? `Me duele: ${label}. ${note}` : `Me duele: ${label}.`;
  sendChat();
  if(await showConfirm(t('rating_lower_intensity_confirm'))){
    lowerRemainingIntensity(-15);
    await persist();
  }
}
function resolvePainLog(id){
  const entry = (state.painLog||[]).find(p=>String(p.id)===String(id));
  if(!entry) return;
  entry.active = false;
  entry.resolvedDate = localDateISO();
  renderPainLog(); persist();
}
async function deletePainLog(id){
  if(!(await showConfirm(t('confirm_delete'), {danger:true, confirmText:t('delete_word')}))) return;
  state.painLog = (state.painLog||[]).filter(p=>String(p.id)!==String(id));
  renderPainLog(); persist();
}
function activePainEntries(withinDays){
  // molestias activas -- opcionalmente solo las de los últimos N días, que es lo que
  // importa para subir la cautela del plan (una molestia de hace 3 meses ya resuelta,
  // o vieja y nunca actualizada, no debería seguir bajando el volumen para siempre)
  const cutoff = withinDays ? Date.now() - withinDays*86400000 : 0;
  return (state.painLog||[]).filter(p => p.active && new Date(p.date+'T00:00:00').getTime() >= cutoff);
}
function checkPainCheckins(){
  // Una molestia cargada y nunca marcada como resuelta es una señal de que puede ser
  // algo más que una simple sobrecarga pasajera -- a las 2 semanas el coach pregunta
  // solo, en vez de depender de que el corredor se acuerde de volver a Perfil a
  // actualizarla. checkinSent evita mandar el mismo mensaje de nuevo en cada carga de
  // la app una vez que ya se avisó por esa molestia puntual.
  if(!state.painLog || !state.painLog.length) return;
  let sentAny = false;
  state.painLog.forEach(p=>{
    if(!p.active || p.checkinSent) return;
    const ageDays = (Date.now() - new Date(p.date+'T00:00:00').getTime()) / 86400000;
    if(ageDays < 14) return;
    p.checkinSent = true;
    sentAny = true;
    state.chat.push({role:'coach', text: t('coach_pain_checkin', {part: t('pain_body_'+p.bodyPart)}), ts:Date.now()});
  });
  if(sentAny){ renderChat(); persist(); }
}
function renderPainLog(){
  const el = document.getElementById('pain-log-list');
  const entries = (state.painLog||[]).slice().reverse();
  const activeCount = entries.filter(p=>p.active).length;
  const summaryEl = document.getElementById('perfil-pain-summary');
  if(summaryEl) summaryEl.textContent = !entries.length ? t('perfil_pain_summary_empty') : (activeCount ? t('perfil_pain_summary_active', {n: activeCount}) : t('perfil_pain_summary_none_active'));
  if(!el) return;
  if(!entries.length){ el.innerHTML = `<p class="muted" style="text-align:center; padding:8px 0;">${t('pain_list_empty')}</p>`; return; }
  el.innerHTML = entries.map(p=>{
    const dateStr = new Date(p.date+'T00:00:00').toLocaleDateString(LOCALE_MAP[lang], {day:'numeric', month:'short'});
    return `<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:10px 0; border-bottom:1px solid var(--asphalt-3);">
      <div style="min-width:0;">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <span style="font-weight:700; font-size:13.5px;">${t('pain_body_'+p.bodyPart)}</span>
          <span class="tag tag-${p.active?'load-caution':'asfalto'}">${p.active ? t('pain_active_tag') : t('pain_resolved_tag')}</span>
        </div>
        <div class="muted" style="font-size:12px; margin-top:2px;">${dateStr}${p.note?' · '+escapeHtml(p.note):''}</div>
      </div>
      <div style="display:flex; align-items:center; gap:10px; flex-shrink:0;">
        ${p.active ? `<button class="small-link" onclick="resolvePainLog(${p.id})" style="font-size:11.5px; padding:4px 2px;">${t('pain_resolve_btn')}</button>` : ''}
        <button onclick="deletePainLog(${p.id})" aria-label="${t('aria_delete')}" style="background:none; border:none; color:var(--mist-dim); cursor:pointer; padding:4px; display:flex;"><span class="icon-sq" style="width:16px; height:16px;">${ICONS.trash}</span></button>
      </div>
    </div>`;
  }).join('');
}

/* ---- check-in de sueño/energía ----
   Antes, "¿Cómo dormiste anoche?" era solo un mensaje decorativo que rotaba en la
   pantalla de Inicio -- aunque el corredor contestara en el chat, esa respuesta no
   quedaba guardada en ningún lado ni afectaba nada. Ahora es un check-in real: se
   responde con un toque (mal/regular/bien), queda guardado por día, se lo pasamos al
   coach en cada mensaje, y si la noche fue mala se le ofrece al corredor bajar un poco
   la sesión de HOY puntual (no toda la semana, que sería una sobrecorrección por una
   sola mala noche). */
// BUG REAL encontrado a partir de un reporte del usuario ("ya corrí hoy y la tarjeta de
// inicio sigue mostrando la próxima sesión, no lo que ya corrí"): todayISO() usaba
// new Date().toISOString().slice(0,10) -- eso da la fecha calendario en UTC, NO la
// fecha calendario local del corredor. Para un huso horario negativo como el de
// Argentina (UTC-3), el calendario en UTC ya pasó a "mañana" durante las últimas 3
// horas de cada día local (entre las 21:00 y las 23:59) -- si el corredor corre a la
// tarde/noche y después mira la app pasadas las 21:00, todayISO() devuelve la fecha de
// MAÑANA mientras que la carrera se guardó con la fecha (en UTC) de HOY, así que dejan
// de coincidir y la tarjeta "ya corriste hoy" nunca se activa. localDateISO() arma la
// fecha a mano con los componentes LOCALES de la fecha (año/mes/día), nunca se va para
// el otro lado del huso horario. todayISO() ahora es un caso particular de esto (hoy
// = "la fecha local de este instante").
// Devuelve el huso horario IANA del dispositivo (ej. "America/Argentina/Buenos_Aires",
// "America/New_York") tal como lo tiene configurado el sistema operativo -- no hace
// falta preguntarle nada al corredor, el navegador ya lo sabe. Se guarda en
// state.profile.tz para que el recordatorio diario del servidor (que no tiene forma de
// saber en qué huso horario está cada celular) le mande el aviso a la hora local de
// cada uno, sea cual sea el país. undefined en navegadores viejísimos que no soportan
// Intl -- ahí el servidor cae a un huso por default en vez de romperse.
function detectDeviceTz(){
  try{ return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; }
  catch(e){ return undefined; }
}
function localDateISO(d){
  const dt = d ? new Date(d) : new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,'0');
  const day = String(dt.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function todayISO(){ return localDateISO(); }
function todayReadinessEntry(){
  return (state.readinessLog||[]).find(r=>r.date === todayISO());
}
function renderReadinessCard(){
  const card = document.getElementById('readiness-card');
  if(!card) return;
  card.style.display = (state.onboarded && !todayReadinessEntry()) ? 'block' : 'none';
}
function lowerTodaySession(pct){
  const idx = (new Date().getDay()+6)%7;
  const today = state.plan[idx];
  if(!today || today.dist<=0 || today.status) return false;
  const factor = 1 + (pct/100);
  today.dist = Math.max(1, Math.round(today.dist*factor));
  renderPlan(); renderHome();
  return true;
}
async function logReadiness(quality){
  if(!state.readinessLog) state.readinessLog = [];
  state.readinessLog = state.readinessLog.filter(r=>r.date !== todayISO());
  state.readinessLog.push({date: todayISO(), quality});
  // no hace falta guardar esto para siempre -- alcanza con una ventana razonable
  if(state.readinessLog.length > 60) state.readinessLog = state.readinessLog.slice(-60);
  renderReadinessCard();
  await persist();
  if(quality === 'mal'){
    const idx = (new Date().getDay()+6)%7;
    const today = state.plan[idx];
    const hasSessionToday = today && today.dist>0 && !today.status;
    if(hasSessionToday && await showConfirm(t('readiness_lower_confirm'))){
      lowerTodaySession(-15);
      await persist();
    }
    // le avisamos al coach en el momento, tenga o no sesión hoy -- así puede
    // tenerlo en cuenta si le preguntan algo en la charla.
    const chatInput = document.getElementById('chatInput');
    if(chatInput){ chatInput.value = t('readiness_chat_bad'); sendChat(); }
  }
}

let editingShoeId = null;
function renderPerfil(){
  const p = state.profile;
  document.getElementById('perfil-initial').textContent = (p.name[0]||'?').toUpperCase();
  document.getElementById('perfil-sub').textContent = `${p.weeklyKm}km/sem · ${t('ob_goal_'+p.goal)}`;
  const avatarImg = document.getElementById('perfil-avatar-img');
  const avatarInitial = document.getElementById('perfil-initial');
  const removeBtn = document.getElementById('perfil-remove-photo');
  if(p.avatarPhoto){
    avatarImg.src = p.avatarPhoto;
    avatarImg.style.display = 'block';
    avatarInitial.style.display = 'none';
    removeBtn.style.display = 'block';
  }else{
    avatarImg.style.display = 'none';
    avatarImg.removeAttribute('src');
    avatarInitial.style.display = '';
    removeBtn.style.display = 'none';
  }
  renderPainLog();

  const achSummaryEl = document.getElementById('perfil-ach-summary');
  if(achSummaryEl){
    const {unlockedCount, totalCount} = getAchievementSections();
    achSummaryEl.textContent = t('ach_unlocked_count', {unlocked:unlockedCount, total:totalCount});
  }
  renderSocialSection();

  const editingPersonal = ['perfil-weight','perfil-height','perfil-racedate','perfil-current-km'].includes(document.activeElement && document.activeElement.id);
  if(!editingPersonal){
    document.getElementById('perfil-weight').value = p.weight || '';
    document.getElementById('perfil-height').value = p.height || '';
    document.getElementById('perfil-current-km').value = p.currentWeeklyKm || '';
    document.getElementById('perfil-goal').value = p.goal || 'start';
    document.getElementById('perfil-racedate').value = p.raceDate || '';
    dateBoxUpdaters['perfil-racedate'] && dateBoxUpdaters['perfil-racedate']();
    [...document.getElementById('perfil-terrain-choice').children].forEach(c=>c.classList.toggle('active', c.dataset.v===p.terrain));
  }
  const editingGoals = ['perfil-weekly-goal','perfil-goal-note'].includes(document.activeElement && document.activeElement.id);
  if(!editingGoals){
    document.getElementById('perfil-weekly-goal').value = p.weeklyGoalKm || '';
    document.getElementById('perfil-goal-note').value = p.goalNote || '';
  }

  const list = document.getElementById('shoe-list');
  list.innerHTML = state.shoes.length===0 ? `<div style="text-align:center; padding:18px 0;"><div class="icon-sq" style="width:26px; height:26px; margin:0 auto 8px; color:var(--mist-dim);">${ICONS.shoe}</div><p class="muted" style="margin:0; font-size:13px;">${t('perfil_no_shoes')}</p></div>` : state.shoes.map(s=>{
    if(s.id === editingShoeId){
      return `<div class="shoe-item">
        <div class="shoe-icon">${ICONS.shoe}</div>
        <div class="shoe-info" style="display:flex; flex-direction:column; gap:6px;">
          <input type="text" id="edit-shoe-name-${s.id}" value="${escapeHtml(s.name)}" style="background:var(--asphalt-3); border:1.5px solid var(--asphalt-4); color:var(--chalk); padding:9px; border-radius:8px; font-size:13.5px;">
          <select id="edit-shoe-terrain-${s.id}" style="background:var(--asphalt-3); border:1.5px solid var(--asphalt-4); color:var(--chalk); padding:9px; border-radius:8px; font-size:13.5px;">
            <option value="asfalto" ${s.terrain==='asfalto'?'selected':''}>${t('ob_terrain_asfalto')}</option>
            <option value="trail" ${s.terrain==='trail'?'selected':''}>${t('ob_terrain_trail')}</option>
            <option value="mixto" ${s.terrain==='mixto'?'selected':''}>${t('ob_terrain_mixto')}</option>
          </select>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-primary btn-sm" onclick="saveEditShoe(${s.id})">${t('save_word')}</button>
            <button class="btn btn-outline btn-sm" onclick="cancelEditShoe()">${t('cancel_word')}</button>
          </div>
        </div>
      </div>`;
    }
    const threshold = s.terrain==='trail'?400:s.terrain==='mixto'?500:600;
    const pct = Math.min(100,(s.km/threshold)*100);
    return `<div class="shoe-row">
      <div class="shoe-icon">${ICONS.shoe}</div>
      <div class="swipe-item">
        <div class="swipe-action-delete" role="button" tabindex="0" aria-label="${t('aria_delete')}" onclick="deleteShoe(${s.id})"><span class="icon-sq" style="width:20px; height:20px;">${ICONS.trash}</span></div>
        <div class="swipe-content"><div class="shoe-info">
          <div class="n">${escapeHtml(s.name)} <span class="tag tag-${s.terrain}" style="margin-left:4px;">${t('ob_terrain_'+s.terrain)}</span></div>
          <div class="muted mono" style="font-size:11.5px; margin-top:2px;">${s.km.toFixed(0)} / ${threshold} km</div>
          <div class="wearbar ${pct>80?'warn':''}"><div style="width:${pct}%;"></div></div></div>
          <button class="small-link" style="display:inline-flex;" aria-label="${t('aria_edit')}" onclick="startEditShoe(${s.id})"><span class="icon-sq" style="width:15px; height:15px;">${ICONS.edit}</span></button>
        </div>
      </div>
    </div>`;
  }).join('');

  const evBox = document.getElementById('event-box');
  if(state.event){
    const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
    const days = Math.round((new Date(state.event.date+'T00:00:00')-todayMidnight)/86400000);
    // Ritmo objetivo estimado (fórmula de Riegel) a partir de la marca personal más cercana
    // en distancia a la meta -- preferimos la distancia puntual de este evento (si la cargó)
    // por sobre la distancia genérica del objetivo de entrenamiento, porque puede no coincidir
    // (ej: el objetivo del plan es "10k" pero esta carrera puntual es de 15km).
    const goalKm = (state.event.distanceKm > 0) ? state.event.distanceKm : getGoalRaceKm();
    const prediction = goalKm ? predictRaceTime(goalKm) : null;
    const paceBlock = prediction ? `<div style="margin-top:14px; padding-top:14px; border-top:1px solid var(--asphalt-3);">
      <p class="muted" style="margin:0 0 6px; font-size:12px;">${t('perfil_predicted_pace_label')} · ${fmtDist(goalKm,1)} ${distUnit()}</p>
      <p class="mono" style="font-size:20px; font-weight:800; color:var(--hivis); margin:0;">${fmtPace((prediction.predictedSec/60)/goalKm)} /${distUnit()}</p>
      <p class="muted" style="margin:6px 0 0; font-size:11.5px;">${t('perfil_predicted_pace_note', {ref: fmtDist(prediction.refDistanceKm,1)+' '+distUnit(), time: fmtTime(Math.round(prediction.predictedSec))})}</p>
    </div>` : '';
    evBox.innerHTML = `<p style="font-size:14.5px; font-weight:700;">${escapeHtml(state.event.name)} <span class="tag tag-${state.event.type==='ruta'?'asfalto':state.event.type==='trail'?'trail':'mixto'}">${t('ev_type_'+state.event.type)}</span></p>
      <p class="display" style="font-size:34px; color:var(--hivis); margin-top:4px;">${Math.max(0,days)} <span style="font-size:13px; font-family:Inter; color:var(--mist);">${t('perfil_event_days')}</span></p>
      <div style="display:flex; align-items:center; gap:14px; margin-top:6px; flex-wrap:wrap;">
        <button class="small-link" style="display:flex; align-items:center; gap:5px;" onclick="downloadEventIcs()"><span class="icon-sq" style="width:14px; height:14px;">${ICONS.calendar}</span>${t('add_to_calendar')}</button>
        <button class="small-link" style="color:var(--danger);" onclick="deleteEvent()">${t('delete_event')}</button>
      </div>
      ${paceBlock}`;
    document.getElementById('ev-name').value = state.event.name;
    document.getElementById('ev-distance').value = state.event.distanceKm || '';
    document.getElementById('ev-date').value = state.event.date;
    dateBoxUpdaters['ev-date'] && dateBoxUpdaters['ev-date']();
    document.getElementById('ev-type').value = state.event.type;
  } else { evBox.innerHTML = `<div style="text-align:center; padding:10px 0;"><div class="icon-sq" style="width:24px; height:24px; margin:0 auto 8px; color:var(--mist-dim);">${ICONS.flag}</div><p class="muted" style="margin:0; font-size:13px;">${t('perfil_no_event')}</p></div>`; }

  const shoesSummaryEl = document.getElementById('perfil-shoes-summary');
  if(shoesSummaryEl) shoesSummaryEl.textContent = state.shoes.length ? t('perfil_shoes_count', {n: state.shoes.length}) : t('perfil_no_shoes');

  const eventSummaryEl = document.getElementById('perfil-event-summary');
  if(eventSummaryEl){
    if(state.event){
      const todayMid = new Date(); todayMid.setHours(0,0,0,0);
      const daysLeft = Math.round((new Date(state.event.date+'T00:00:00')-todayMid)/86400000);
      eventSummaryEl.textContent = `${state.event.name} · ${Math.max(0,daysLeft)} ${t('perfil_event_days')}`;
    } else {
      eventSummaryEl.textContent = t('perfil_no_event');
    }
  }

  updateCredits();
}
/* ---- apartados del perfil (datos personales / objetivos / zapatillas / evento) que
   antes eran tarjetas siempre abiertas en la pantalla de Perfil, y ahora son botones
   que abren un overlay de pantalla completa -- mismo patrón que openAchievements(). No
   hace falta reconstruir el HTML de adentro (a diferencia de logros): los inputs ya
   existen siempre en el DOM y renderPerfil() los mantiene al día estén o no visibles. */
function openPersonalDataOverlay(){ document.getElementById('personal-data-overlay').classList.add('overlay-open'); }
function closePersonalDataOverlay(){ document.getElementById('personal-data-overlay').classList.remove('overlay-open'); }
function openGoalsOverlay(){ document.getElementById('goals-overlay').classList.add('overlay-open'); }
function closeGoalsOverlay(){ document.getElementById('goals-overlay').classList.remove('overlay-open'); }
function openShoesOverlay(){ document.getElementById('shoes-overlay').classList.add('overlay-open'); }
function closeShoesOverlay(){ document.getElementById('shoes-overlay').classList.remove('overlay-open'); }
function openEventOverlay(){ document.getElementById('event-overlay').classList.add('overlay-open'); }
function closeEventOverlay(){ document.getElementById('event-overlay').classList.remove('overlay-open'); }
function openLangOverlay(){ document.getElementById('lang-overlay').classList.add('overlay-open'); }
function closeLangOverlay(){ document.getElementById('lang-overlay').classList.remove('overlay-open'); }
function openDaysOverlay(){ document.getElementById('days-overlay').classList.add('overlay-open'); }
function closeDaysOverlay(){ document.getElementById('days-overlay').classList.remove('overlay-open'); }
function openZonesOverlay(){ document.getElementById('zones-overlay').classList.add('overlay-open'); }
function closeZonesOverlay(){ document.getElementById('zones-overlay').classList.remove('overlay-open'); }
/* ---- Overlays "hoja" de Perfil/Logros: arrastrar hacia abajo para cerrar -----
   Antes estos overlays (Datos personales, Objetivos, Zapatillas, Evento, Idioma, Días,
   Zonas, Molestias, Logros) aparecían y desaparecían de un salto y solo se podían cerrar
   tocando la flecha de arriba a la izquierda. Ahora entran/salen con un deslizamiento +
   fade (ver .overlay-sheet en el CSS) y además se pueden cerrar arrastrando el dedo hacia
   abajo, como una hoja modal nativa -- pero solo si ya se llegó al tope del scroll interno
   del overlay, para no interferir con el scroll normal de su contenido. Un solo listener
   delegado en document sirve para los nueve overlays: todos comparten la clase
   .overlay-sheet y el mismo criterio de "cerrar" (sacar la clase overlay-open), así que no
   hace falta cablear el gesto overlay por overlay. */
(function wireOverlaySheetSwipe(){
  let dragEl = null, startY = 0, lastDy = 0, dragging = false;
  const CLOSE_THRESHOLD = 90;
  document.addEventListener('touchstart', e=>{
    const sheet = e.target.closest('.overlay-sheet.overlay-open');
    if(!sheet || sheet.scrollTop > 0){ dragEl = null; return; }
    dragEl = sheet; startY = e.touches[0].clientY; lastDy = 0; dragging = false;
  }, {passive:true});
  document.addEventListener('touchmove', e=>{
    if(!dragEl) return;
    if(dragEl.scrollTop > 0){ dragEl.style.transition = ''; dragEl.style.transform = ''; dragEl = null; return; }
    const dy = e.touches[0].clientY - startY;
    if(dy <= 0){ lastDy = 0; dragEl.style.transition = ''; dragEl.style.transform = ''; return; }
    dragging = true; lastDy = dy;
    dragEl.style.transition = 'none';
    dragEl.style.transform = `translateY(${dy}px)`;
  }, {passive:true});
  document.addEventListener('touchend', ()=>{
    if(!dragEl) return;
    const el = dragEl, dy = lastDy; dragEl = null;
    el.style.transition = '';
    el.style.transform = '';
    if(dragging && dy > CLOSE_THRESHOLD) el.classList.remove('overlay-open');
    dragging = false;
  }, {passive:true});
})();
// El bloque "Recordá que..." de la sección de Strava era una lista siempre visible --
// ahora arranca colapsada detrás de este botón, para no abrumar la tarjeta de Strava con
// texto largo apenas se entra a Perfil. Nada de esto se persiste: siempre arranca cerrado.
function toggleStravaRemember(e){
  const list = document.getElementById('strava-remember-list');
  const chevron = document.getElementById('strava-remember-chevron');
  if(!list) return;
  const show = list.style.display === 'none';
  list.style.display = show ? 'block' : 'none';
  if(chevron) chevron.style.transform = show ? 'rotate(180deg)' : 'rotate(0deg)';
  const btn = e && e.currentTarget;
  if(btn) btn.setAttribute('aria-expanded', show ? 'true' : 'false');
}
// ---- Foto de perfil -----
// Se guarda como JPEG chico (200x200, recorte centrado tipo "cover") codificado en
// base64 dentro de state.profile.avatarPhoto -- así no hace falta un bucket de
// almacenamiento nuevo en Supabase, viaja con el resto del estado en app_state.
function handleAvatarPhotoChange(e){
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if(!file || !file.type || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = function(ev){
    const img = new Image();
    img.onload = function(){
      const size = 200;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(size/img.width, size/img.height);
      const w = img.width*scale, h = img.height*scale;
      ctx.drawImage(img, (size-w)/2, (size-h)/2, w, h);
      state.profile.avatarPhoto = canvas.toDataURL('image/jpeg', 0.6);
      renderPerfil();
      persist();
    };
    img.onerror = function(){ showToast(t('perfil_photo_error'), 'error'); };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}
function removeAvatarPhoto(e){
  if(e) e.stopPropagation();
  delete state.profile.avatarPhoto;
  renderPerfil();
  persist();
}
function updateCredits(){
  document.getElementById('credits-text').textContent = t('perfil_credits');
  // Versión visible del build cargado -- sin esto, no había forma de que el usuario
  // (ni nosotros, por lo que nos cuenta) confirmara si ya estaba probando la versión
  // nueva o todavía una vieja cacheada, lo que hizo perder tiempo varias veces
  // diagnosticando bugs ya arreglados en una versión que el celular no había tomado.
  const versionEl = document.getElementById('app-version-text');
  if(versionEl) versionEl.textContent = 'v' + APP_VERSION;
}
document.getElementById('perfil-name').addEventListener('input', ()=>{ updateCredits(); });
document.getElementById('perfil-name').addEventListener('change', ()=>{
  state.profile.name = document.getElementById('perfil-name').value.trim() || state.profile.name;
  persist();
});

/* ================= NAV ================= */
async function refreshStateFromServer(){
  if(!currentUserId) return;
  try{
    const { data } = await supabaseClient.from('app_state').select('data').eq('user_id', currentUserId).maybeSingle();
    if(data && data.data && Object.keys(data.data).length){
      const incomingRuns = (data.data.runs||[]).length;
      const currentRuns = (state.runs||[]).length;
      if(incomingRuns < currentRuns){
        // el servidor tiene menos carreras que las que ya tenemos acá (por ejemplo, una que se guardó sin
        // conexión y todavía no se sincronizó) -> no pisamos lo que ya tenemos, reintentamos guardarlo
        persist();
      } else {
        const prevRunIds = new Set((state.runs||[]).map(r=>String(r.id)));
        state = data.data;
        checkShoeWearAlerts();
        checkHrMaxFromRuns();
        // Las carreras que llegan nuevas por la sincronización con Strava también pueden ser récord.
        const newRuns = (state.runs||[]).filter(r=>!prevRunIds.has(String(r.id)));
        if(newRuns.length){ newRuns.forEach(checkNewPR); persist(); }
      }
    }
  }catch(e){ console.error('refresh error', e); }
}
let pullStartY = 0, pullTriggered = false, pullActive = false;
document.addEventListener('touchstart', e=>{
  // El chat tiene su propio scroll interno (#chatLog) y la página en sí no se mueve
  // mientras esa vista está activa -- sin este chequeo, cualquier arrastre hacia
  // abajo dentro del chat se interpretaba como "pull to refresh" de toda la app.
  if(e.target.closest && e.target.closest('#coachChatWrap')){ pullActive = false; return; }
  const scroller = document.scrollingElement || document.documentElement;
  if(scroller.scrollTop <= 0 && document.getElementById('tabbar').style.display!=='none'){
    pullStartY = e.touches[0].clientY;
    pullTriggered = false;
    pullActive = true;
  } else { pullActive = false; }
}, {passive:true});
document.addEventListener('touchmove', e=>{
  if(!pullActive || pullTriggered) return;
  const scroller = document.scrollingElement || document.documentElement;
  if(scroller.scrollTop > 0) return;
  const delta = e.touches[0].clientY - pullStartY;
  if(delta > 90){
    pullTriggered = true;
    doPullRefresh();
  }
}, {passive:true});
document.addEventListener('touchend', ()=>{ pullActive = false; }, {passive:true});

/* ---- swipe-to-delete (history + shoes list) ---- */
let swipeStartX = 0, swipeStartY = 0, swipeContentEl = null, swipeDragging = false, swipeBaseX = 0, swipeLastX = 0, swipeSuppressClick = false;
let swipeRafPending = false;
const SWIPE_REVEAL = 78;
function swipeSetX(el, x){
  el.style.transform = `translate3d(${Math.round(x)}px,0,0)`;
}
function swipeCloseAll(except){
  document.querySelectorAll('.swipe-content.swipe-open').forEach(el=>{
    if(el === except) return;
    el.classList.add('swipe-anim');
    swipeSetX(el, 0);
    el.classList.remove('swipe-open');
  });
}
document.addEventListener('touchstart', e=>{
  const item = e.target.closest ? e.target.closest('.swipe-item') : null;
  if(!item){ swipeCloseAll(); swipeContentEl = null; return; }
  swipeContentEl = item.querySelector('.swipe-content');
  swipeCloseAll(swipeContentEl);
  swipeStartX = e.touches[0].clientX;
  swipeStartY = e.touches[0].clientY;
  swipeDragging = false;
  swipeBaseX = swipeContentEl.classList.contains('swipe-open') ? -SWIPE_REVEAL : 0;
  swipeLastX = swipeBaseX;
  swipeContentEl.classList.remove('swipe-anim');
}, {passive:true});
document.addEventListener('touchmove', e=>{
  if(!swipeContentEl) return;
  const dx = e.touches[0].clientX - swipeStartX;
  const dy = e.touches[0].clientY - swipeStartY;
  if(!swipeDragging){
    if(Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)){
      swipeDragging = true;
    } else if(Math.abs(dy) > 6){
      swipeContentEl = null;
      return;
    } else {
      return;
    }
  }
  let x = swipeBaseX + dx;
  x = Math.max(-SWIPE_REVEAL - 12, Math.min(0, x));
  swipeLastX = x;
  if(!swipeRafPending){
    swipeRafPending = true;
    requestAnimationFrame(()=>{
      swipeRafPending = false;
      if(swipeContentEl) swipeSetX(swipeContentEl, swipeLastX);
    });
  }
  e.preventDefault();
}, {passive:false});
document.addEventListener('touchend', ()=>{
  if(!swipeContentEl){ return; }
  if(swipeDragging){
    const el = swipeContentEl;
    el.classList.add('swipe-anim');
    if(swipeLastX < -SWIPE_REVEAL/2){
      swipeSetX(el, -SWIPE_REVEAL);
      el.classList.add('swipe-open');
      haptic(10);
    } else {
      swipeSetX(el, 0);
      el.classList.remove('swipe-open');
    }
    swipeSuppressClick = true;
    setTimeout(()=>{ swipeSuppressClick = false; }, 300);
  }
  swipeContentEl = null;
  swipeDragging = false;
}, {passive:true});

/* ---- deslizar el plan semanal para cambiar de semana (como las fotos de Instagram) ---- */
let planSwipeStartX = 0, planSwipeStartY = 0, planSwipeDragging = false, planSwipeActive = false;
let planSwipeSuppressClick = false;
const PLAN_SWIPE_THRESHOLD = 55;
document.addEventListener('touchstart', e=>{
  const list = e.target.closest ? e.target.closest('#plan-list') : null;
  planSwipeActive = !!list;
  if(!planSwipeActive) return;
  planSwipeStartX = e.touches[0].clientX;
  planSwipeStartY = e.touches[0].clientY;
  planSwipeDragging = false;
}, {passive:true});
document.addEventListener('touchmove', e=>{
  if(!planSwipeActive) return;
  const dx = e.touches[0].clientX - planSwipeStartX;
  const dy = e.touches[0].clientY - planSwipeStartY;
  if(!planSwipeDragging){
    if(Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)*1.3){
      planSwipeDragging = true;
    } else if(Math.abs(dy) > 8){
      planSwipeActive = false;
      return;
    } else {
      return;
    }
  }
  e.preventDefault();
}, {passive:false});
document.addEventListener('touchend', e=>{
  if(!planSwipeActive){ return; }
  if(planSwipeDragging){
    const dx = (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : planSwipeStartX) - planSwipeStartX;
    if(dx <= -PLAN_SWIPE_THRESHOLD){
      const nextBtn = document.getElementById('plan-next-btn');
      if(nextBtn && !nextBtn.disabled) navigateWeek(1);
    } else if(dx >= PLAN_SWIPE_THRESHOLD){
      const prevBtn = document.getElementById('plan-prev-btn');
      if(prevBtn && !prevBtn.disabled) navigateWeek(-1);
    }
    planSwipeSuppressClick = true;
    setTimeout(()=>{ planSwipeSuppressClick = false; }, 300);
  }
  planSwipeActive = false;
  planSwipeDragging = false;
}, {passive:true});

/* ---- alto y posición real de #coachChatWrap (fix para iOS Safari / PWA standalone) ----
   Intentos anteriores dejaban la barra de escribir con "position:fixed" independiente
   y le calculaban un "bottom" a mano (con CSS, o midiendo con getBoundingClientRect).
   Los dos fallaban en el iPhone real por el mismo motivo de fondo: en iOS, cuando
   aparece el teclado, el "layout viewport" (window.innerHeight, y todo lo que dependa
   de él) NO se achica -- sobre todo en modo standalone/agregado a inicio -- sigue
   midiendo la pantalla completa como si el teclado no existiera. Entonces cualquier
   "bottom:0" quedaba tapado por el teclado, dejando ver contenido del chat detrás.
   Además, escuchar el evento "scroll" del visualViewport para volver a calcular
   posición hacía que la barra se reacomodara (y por lo tanto pareciera "moverse")
   mientras el usuario scrolleaba los mensajes.
   La solución de fondo: en vez de una barra "fixed" flotando sola, todo el chat
   (título + mensajes + barra de escribir) vive DENTRO de #coachChatWrap, un único
   contenedor flex-column cuyo alto se fija explícitamente por JS usando
   window.visualViewport (la única fuente que sabe cuánta pantalla está realmente
   visible arriba del teclado en iOS). La barra de escribir es simplemente el último
   hijo del flex-column -- no tiene posición propia que calcular ni que se pueda
   desincronizar, así que no puede "flotar mal" ni moverse al hacer scroll interno
   del chat (ese scroll queda contenido en #chatLog, no en la página ni en el
   visualViewport). Solo se vuelve a medir cuando el teclado realmente abre/cierra
   (evento resize) o cuando la ventana cambia de tamaño -- nunca durante el scroll. */
// Alto del teclado nativo en píxeles, reportado por el plugin Keyboard de Capacitor
// (ver el IIFE más abajo) -- 0 cuando está cerrado. Solo tiene sentido en la app nativa.
let nativeKeyboardHeightPx = 0;
function syncCoachChatLayout(){
  const wrap = document.getElementById('coachChatWrap');
  const header = document.getElementById('mainHeader');
  const tabbar = document.getElementById('tabbar');
  const chatBar = document.getElementById('chatBar');
  const scrollBtnWrap = document.getElementById('chatScrollBtnWrap');
  if(!wrap) return;
  const kbOpen = document.body.classList.contains('chat-kb-open');
  const isNativeApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  let viewportH, viewportOffsetTop;
  if(isNativeApp){
    // App nativa (Capacitor/WKWebView): NO usamos window.visualViewport acá. Dentro del
    // WKWebView de Capacitor, visualViewport es conocido por comportarse de forma poco
    // confiable (a veces no dispara resize al abrir/cerrar el teclado, a veces se queda
    // con un valor viejo pegado) -- exactamente los síntomas que veníamos persiguiendo
    // sin poder resolver del todo. En su lugar, el plugin nativo Keyboard nos avisa con
    // eventos reales (keyboardWillShow/Hide) y nos da el alto exacto del teclado, que
    // guardamos en nativeKeyboardHeightPx -- restamos eso de window.innerHeight, que en
    // la app nativa SÍ es estable y no se ve afectado por el teclado.
    viewportH = window.innerHeight - (kbOpen ? nativeKeyboardHeightPx : 0);
    viewportOffsetTop = 0;
  } else {
    // Versión web (Safari / PWA agregada a inicio): acá visualViewport sí es la fuente
    // correcta mientras el teclado está realmente abierto. Con el teclado cerrado (blur
    // ya disparado) usamos window.innerHeight -- en iOS standalone, visualViewport puede
    // quedar "pegado" en el valor con teclado abierto y no volver solo a su tamaño real.
    const vv = window.visualViewport;
    viewportH = (kbOpen && vv) ? vv.height : window.innerHeight;
    viewportOffsetTop = (kbOpen && vv) ? vv.offsetTop : 0;
  }
  const headerH = (header && header.style.display !== 'none') ? header.offsetHeight : 0;
  const bottomGap = kbOpen ? 0 : 8;
  const top = Math.round(viewportOffsetTop + headerH);
  // con el teclado cerrado, el chat termina justo arriba de la tabbar (con un pequeño
  // margen); con el teclado abierto, la tabbar ya está oculta y el chat baja pegado
  // directamente al borde del teclado, sin hueco. En vez de RECONSTRUIR a mano dónde
  // termina la tabbar (sumando alto + padding + el hueco que deja flotando, como se
  // hacía antes) medimos su posición real en pantalla con getBoundingClientRect() --
  // así, si el día de mañana cambia el CSS de la tabbar (padding, si vuelve a flotar,
  // etc.), esto se sigue ajustando solo, sin volver a romperse por quedar desincronizado
  // con constantes escritas a mano (que es justo lo que pasó más de una vez acá).
  const tabbarVisible = !kbOpen && tabbar && tabbar.style.display !== 'none';
  const bottomLimit = tabbarVisible
    ? Math.round(tabbar.getBoundingClientRect().top) - bottomGap
    : Math.round(viewportOffsetTop + viewportH) - bottomGap;
  const height = Math.max(0, bottomLimit - top);
  // OJO con el orden acá: chatBar.offsetHeight se lee ACÁ, ANTES de tocar wrap.style,
  // a propósito. Leerlo después (como estaba antes) fuerza un reflow síncrono EXTRA --
  // escribir wrap.style.top/height ensucia el layout, y la siguiente lectura de
  // offsetHeight obliga al navegador a recalcularlo todo de nuevo ahí mismo, en vez de
  // dejarlo para el próximo frame de pintado normal. Juntando todas las lecturas antes
  // que las escrituras evitamos ese "layout thrashing" -- que se nota especialmente
  // acá porque esta función se llama muchas veces seguidas durante la animación de
  // apertura/cierre del teclado (ver reapplyDuringAnimation), compitiendo por tiempo
  // de frame justo cuando más importa que no haya trabajo de más.
  const chatBarH = (scrollBtnWrap && chatBar) ? chatBar.offsetHeight : 0;
  wrap.style.top = top + 'px';
  wrap.style.height = height + 'px';
  if(scrollBtnWrap && chatBar) scrollBtnWrap.style.bottom = (chatBarH + 14) + 'px';
}
window.addEventListener('resize', syncCoachChatLayout);
if(window.visualViewport){
  window.visualViewport.addEventListener('resize', syncCoachChatLayout);
  // El scroll del visualViewport (que en iOS puede dispararse solo por tener el
  // teclado abierto, sin que el usuario haya tocado nada) se escucha con un
  // pequeño debounce -- corrige cualquier desvío real una vez que el gesto
  // terminó, pero nunca reposiciona nada MIENTRAS el usuario está scrolleando.
  let vvScrollDebounce = null;
  window.visualViewport.addEventListener('scroll', ()=>{
    clearTimeout(vvScrollDebounce);
    vvScrollDebounce = setTimeout(syncCoachChatLayout, 150);
  });
}
/* ---- hide tab bar while the chat keyboard is open (avoids the squished bottom bar) ---- */
(function(){
  const chatInputEl = document.getElementById('chatInput');
  const tabbarEl = document.getElementById('tabbar');
  if(!chatInputEl) return;
  const isNativeApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const nativeKeyboard = isNativeApp && window.Capacitor.Plugins && window.Capacitor.Plugins.Keyboard;
  function openKeyboardUI(){
    if(tabbarEl) tabbarEl.style.display = 'none';
    document.body.classList.add('chat-kb-open');
  }
  function closeKeyboardUI(){
    if(tabbarEl && document.getElementById('view-coach').classList.contains('active')) tabbarEl.style.display = 'flex';
    document.body.classList.remove('chat-kb-open');
  }
  if(nativeKeyboard){
    // App nativa (Capacitor): acá sí tenemos una fuente confiable para saber cuándo
    // aparece y desaparece el teclado -- el plugin oficial @capacitor/keyboard, que
    // manda estos eventos directo desde el sistema operativo, con el alto exacto del
    // teclado en píxeles. Esto reemplaza por completo la vieja estrategia de "adivinar"
    // con window.visualViewport + reintentos, que dentro del WKWebView de Capacitor
    // resultó no ser confiable (de ahí que el hueco vacío pasara siempre, no a veces).
    //
    // IMPORTANTE: esto requiere que la app nativa tenga instalado @capacitor/keyboard
    // (ver mobile/package.json) y se haya vuelto a compilar con Xcode -- actualizar
    // solo estos archivos JS no alcanza para que este plugin exista en la app.
    nativeKeyboard.addListener('keyboardWillShow', (info) => {
      nativeKeyboardHeightPx = (info && typeof info.keyboardHeight === 'number') ? info.keyboardHeight : 0;
      openKeyboardUI();
      syncCoachChatLayout();
    });
    nativeKeyboard.addListener('keyboardDidShow', (info) => {
      nativeKeyboardHeightPx = (info && typeof info.keyboardHeight === 'number') ? info.keyboardHeight : nativeKeyboardHeightPx;
      syncCoachChatLayout();
    });
    nativeKeyboard.addListener('keyboardWillHide', () => {
      closeKeyboardUI();
      nativeKeyboardHeightPx = 0;
      syncCoachChatLayout();
    });
    nativeKeyboard.addListener('keyboardDidHide', () => {
      nativeKeyboardHeightPx = 0;
      syncCoachChatLayout();
      // WKWebView es motor WebKit igual que Safari, así que el mismo bug de "elementos
      // position:fixed que quedan congelados tras el teclado" podría darse acá también
      // -- este empujoncito de scroll es barato y no rompe nada, así que lo dejamos
      // como red de seguridad aunque ahora el tamaño/posición ya se calculen bien.
      forceFixedLayoutReflow();
    });
    return; // no hace falta nada de lo que sigue -- eso es solo para la versión web
  }
  // A partir de acá, todo lo que sigue es la estrategia para la versión WEB (Safari /
  // PWA agregada a inicio), donde sí corresponde usar window.visualViewport.
  //
  // El teclado de iOS tarda unos cientos de ms en aparecer/desaparecer y el evento
  // visualViewport.resize llega de forma asincrónica durante esa animación -- volvemos a
  // medir varias veces mientras se mueve, en vez de confiar en una sola lectura inmediata
  // que probablemente todavía esté midiendo el estado anterior (sin teclado).
  //
  // Antes esto era una lista fija de reintentos (50/120/220/350/500ms) que asumía que la
  // animación siempre dura menos de medio segundo. En un teléfono real, con el sistema
  // ocupado o la animación de cierre del teclado más lenta, el último reintento podía
  // disparar ANTES de que visualViewport.height terminara de volver a su tamaño real --
  // y como nada vuelve a medir después de eso, la barra de escribir quedaba con el alto
  // calculado para el teclado (ya cerrado), es decir "flotando" arriba, con un hueco
  // vacío debajo hasta la tabbar. Por eso ahora remedimos sin condición cada 80ms durante
  // una ventana de 2 segundos completos después de cada foco/blur -- no tratamos de
  // "detectar" cuándo terminó la animación (eso puede fallar si el navegador no dispara
  // ningún evento intermedio), simplemente insistimos el tiempo suficiente como para
  // cubrir cualquier animación real, por lenta que sea.
  //
  // Segunda causa del mismo síntoma, distinta a la anterior: cuando el input del chat
  // recibe foco, iOS Safari (más notorio todavía en modo standalone/PWA) puede scrollear
  // el DOCUMENTO ENTERO hacia arriba por su cuenta para "asegurarse" de que el input
  // quede visible arriba del teclado -- aunque #coachChatWrap ya es position:fixed y se
  // reacomoda solo, sin necesitar ese scroll. Ese scroll del documento no siempre se
  // deshace solo al cerrar el teclado, y como #app no ocupa más que 100dvh, quedar
  // scrolleado deja ver, debajo de la tabbar, el fondo vacío que hay más allá del final
  // de #app -- exactamente el hueco vacío "de más" que se ve en capturas reales. Por eso,
  // en cada re-medición forzamos también el scroll del documento de vuelta a 0.
  // BUG NUEVO encontrado con un video real: al TOCAR para escribir, la barra de
  // escribir (con el cursor titilando) queda flotando en el aire, con un hueco negro
  // vacío entre ella y el teclado -- y ese hueco NO se corrige solo, se queda así
  // mientras el teclado sigue abierto (se confirmó viendo el video cuadro por cuadro:
  // sigue exactamente igual varios segundos después, mucho más de lo que dura la
  // animación). No es que nuestra medición (syncCoachChatLayout, basada en
  // visualViewport) esté mal en sí -- es que iOS Safari, al enfocar un <input>, hace
  // POR SU CUENTA un scroll del documento para "asegurarse" de que el campo quede
  // visible arriba del teclado (el mismo mecanismo de scroll-into-view automático de
  // siempre) -- pero como acá el layout entero es a medida (elementos position:fixed
  // + altura calculada por JS, no scroll normal de página), ese scroll automático no
  // solo es innecesario, sino que directamente desalinea nuestros elementos fijos del
  // viewport visual real, dejando ese hueco fantasma.
  // Ya habíamos probado (más abajo, resetDocumentScroll) forzar el scroll de vuelta a
  // 0 en cada re-medición mientras se abre -- pero eso peleaba con la animación
  // PROPIA de iOS a mitad de camino y producía otro glitch distinto (un salto con
  // hueco negro ARRIBA). La diferencia acá es de raíz, no de timing: en vez de dejar
  // que el documento scrollee y despues tratar de corregirlo, le sacamos a iOS la
  // posibilidad de scrollear el documento EN ABSOLUTO mientras el teclado del chat
  // está abierto -- el truco estándar de "bloqueo de scroll del body" que usan la
  // mayoría de las apps web mobile para este mismo problema: durante el foco, <body>
  // pasa a position:fixed anclado exactamente en el scroll actual (visualmente nada
  // se mueve), así que no queda nada que el scroll-into-view de iOS pueda mover. Al
  // cerrar el teclado, se restaura tal cual estaba.
  let lockedScrollY = 0;
  function lockBodyScroll(){
    lockedScrollY = window.scrollY || (document.scrollingElement || document.documentElement).scrollTop || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = (-lockedScrollY) + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
  }
  function unlockBodyScroll(){
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    (document.scrollingElement || document.documentElement).scrollTop = lockedScrollY;
  }
  let animationPollId = null;
  function resetDocumentScroll(){
    const scroller = document.scrollingElement || document.documentElement;
    if(scroller.scrollTop !== 0) scroller.scrollTop = 0;
    if(window.scrollY) window.scrollTo(0, 0);
  }
  // resetScroll=true SOLO tiene que pasarse al cerrar el teclado (blur). Un video real
  // que mandó el usuario mostró un glitch nuevo, distinto al que esto venía resolviendo:
  // JUSTO AL ABRIRSE el teclado, toda la pantalla (encabezado incluido, no solo el
  // chat) se corre hacia abajo un instante dejando un hueco negro arriba, y se
  // acomoda sola en menos de medio segundo. Eso es exactamente la marca de dos cosas
  // peleándose por el scroll al mismo tiempo: iOS anima su propio scroll para
  // asegurarse de que el input quede visible arriba del teclado, y ACÁ, cada 80ms
  // durante esa misma animación, forzábamos el scroll de vuelta a 0 -- interrumpiendo
  // esa animación nativa a mitad de camino y produciendo el salto visible. Por eso
  // ahora resetDocumentScroll() solo se llama al CERRAR el teclado (que es cuando de
  // verdad puede quedar un scroll viejo pegado), nunca mientras se abre.
  // pinChatBottom=true (solo al ABRIR) además re-clava el scroll del #chatLog al
  // fondo en cada re-medición. Bug real encontrado repasando el código de nuevo:
  // #coachChatWrap es flex-column con #chatLog como único hijo flex:1 -- cuando el
  // teclado se abre, wrap.style.height se achica (ver syncCoachChatLayout) y por lo
  // tanto #chatLog TAMBIÉN se achica, pero su scrollTop (un valor absoluto en px) se
  // queda como estaba. Si justo antes el chat estaba scrolleado hasta el fondo (el
  // caso normal: leíste el último mensaje y tocás para escribir), ese mismo scrollTop
  // ya NO llega al fondo del #chatLog más chico -- queda un colchón vacío abajo y el
  // último mensaje visualmente "para arriba", justo el síntoma reportado ("el chat no
  // sube, queda abajo, tengo que bajar yo para ver lo último"). No es un bug de iOS,
  // es nuestro: nunca reacomodábamos el scroll interno del chat cuando el contenedor
  // cambiaba de tamaño. scrollChatToBottom() ya existe (se usa después de cada mensaje
  // nuevo); acá la reusamos en cada tick de la apertura para que seguir pegado al
  // fondo mientras el contenedor se va achicando.
  function reapplyDuringAnimation(resetScroll, pinChatBottom){
    // Antes esto remedía con setInterval cada 80ms durante 900ms -- un temporizador que
    // no tiene ninguna relación con el ritmo real al que el navegador pinta frames.
    // Eso significaba que buena parte de esas ~11 remediciones caían A MtAD DE un frame
    // que el propio SISTEMA estaba usando para animar el cierre del teclado -- justo el
    // trabajo de layout de más, en el momento menos oportuno, que se ve como "trabado".
    // requestAnimationFrame en cambio SIEMPRE corre justo ANTES de que el navegador
    // pinte el próximo frame, nunca compitiendo a mitad de uno -- así que hacemos la
    // misma cantidad de remediciones (cubriendo la misma ventana de ~900ms, de sobra
    // para los 250-300ms que tarda la animación real del teclado en iOS) pero cada una
    // cae en un momento en el que el navegador de cualquier forma iba a hacer trabajo
    // de layout/paint, en vez de forzarlo aparte.
    if(animationPollId) cancelAnimationFrame(animationPollId);
    const deadline = performance.now() + 900;
    function tick(){
      syncCoachChatLayout();
      if(pinChatBottom) scrollChatToBottom();
      if(resetScroll) resetDocumentScroll();
      if(performance.now() < deadline){
        animationPollId = requestAnimationFrame(tick);
      } else {
        animationPollId = null;
      }
    }
    tick();
  }
  chatInputEl.addEventListener('focus', ()=>{
    if(tabbarEl) tabbarEl.style.display = 'none';
    // lockBodyScroll() ANTES que nada más, en el mismo tick síncrono del foco --
    // así, para cuando iOS decide hacer su scroll-into-view automático (que dispara
    // a partir de este mismo evento), el documento ya no tiene nada que mover.
    lockBodyScroll();
    document.body.classList.add('chat-kb-open');
    reapplyDuringAnimation(false, true);
  });
  chatInputEl.addEventListener('blur', ()=>{
    if(tabbarEl && document.getElementById('view-coach').classList.contains('active')) tabbarEl.style.display = 'flex';
    unlockBodyScroll();
    document.body.classList.remove('chat-kb-open');
    reapplyDuringAnimation(true, false);
    forceFixedLayoutReflow();
  });
  // Tercera causa posible del mismo síntoma: en iOS hay un bug de WebKit bastante
  // conocido donde, después de que el teclado se abre y se cierra, los elementos
  // position:fixed (como la tabbar) se quedan "congelados" en la posición vieja a
  // nivel del motor de renderizado -- no es que el CSS o el JS estén mal, es que
  // WebKit directamente no vuelve a calcular dónde va el elemento fijo hasta que
  // pasa OTRA cosa que fuerce ese recálculo.
  //
  // El primer intento acá scrolleaba la página 1px y volvía a 0 -- pero en esta
  // pantalla #app medía justo lo que mide la pantalla (sin overflow), así que ese
  // scroll nunca tenía nada real para mover y por lo tanto nunca forzaba ningún
  // recálculo. Por eso el segundo intento lo reemplazó por completo con un truco de
  // reflow síncrono (esconder y volver a mostrar <body> con display:none/offsetHeight).
  // Ese cambio fue el error: investigando de nuevo el bug (que seguía intacto después
  // de OCHO intentos distintos) encontramos reportes públicos confirmados -- incluyendo
  // un bug abierto de WebKit y varios hilos del foro de Apple Developer -- de que en
  // iOS 26 específicamente, window.visualViewport.height/offsetTop no siempre vuelven
  // del todo a su valor real inmediatamente al cerrar el teclado (afecta incluso a
  // apple.com; Apple lo reconoció y lo mejoró parcialmente recién en beta de iOS 26.1).
  // La causa es a nivel de compositor: WebKit no vuelve a "anclar" los elementos
  // position:fixed contra el viewport visual hasta que ocurre un scroll DE VERDAD --
  // un reflow de layout (como el truco de display:none) no alcanza, porque no es un
  // problema de layout sino de dónde el compositor cree que está el viewport visual.
  // Por eso ahora volvemos al scroll de 1px real, pero arreglando la razón por la que
  // había fallado la primera vez: agregamos un spacer invisible al final de #app
  // (#scrollNudgeSpacer en index.html) que garantiza siempre unos pocos px de overflow
  // real en el documento, así este scroll SIEMPRE tiene algo para mover de verdad.
  //
  // El truco de esconder/mostrar <body> (display:none -> offsetHeight -> display
  // original) que estuvo acá antes SÍ conseguía la posición correcta, pero fuerza un
  // reflow + repaint + recomposición de TODA la página -- carísimo -- y al dispararse
  // varias veces en el primer segundo después de cerrar el teclado (justo cuando el
  // propio teclado todavía está animando su salida) le robaba frames a esa animación,
  // dando el efecto de "baja trabado". Como el scroll de 1px real (mucho más barato:
  // dos escrituras de una sola propiedad, nada de reflow de página completa) ya
  // soluciona el problema por sí solo, se saca el truco de display:none por completo.
  function forceFixedLayoutReflow(){
    const scroller = document.scrollingElement || document.documentElement;
    const restingTop = scroller.scrollTop; // normalmente 0
    scroller.scrollTop = restingTop + 2;
    scroller.scrollTop = restingTop;
    syncCoachChatLayout();
  }
  // Una sola pasada de más, 400ms después del blur (cubre teclados que tardan un poco
  // más en cerrarse en un teléfono real que en el simulador) -- ya no hace falta
  // insistir tanto como antes porque el scroll de 1px, al ser barato, no necesita
  // "varios intentos" para que alguno caiga en el momento justo: alcanza con no
  // dispararlo demasiado pronto.
  chatInputEl.addEventListener('blur', ()=> setTimeout(forceFixedLayoutReflow, 400));
  // Red de seguridad extra para la barra gris reportada en el chat del coach (solo en
  // modo standalone/agregado a inicio, solo en esta pantalla): ya se sacó de raíz la
  // causa más probable (la barra de sugerencias predictivas de iOS, ver el atributo
  // autocorrect="off" etc. en el <input> de index.html), pero por si algún resto de
  // capa del compositor sobrevive igual en algún iOS puntual, forzamos ACÁ un reflow
  // más agresivo (esconder y volver a mostrar <body>, que fuerza recomposición de toda
  // la página) UNA sola vez, bien al final -- recién a los 1000ms, después de que la
  // ventana de reapplyDuringAnimation (900ms) y el forceFixedLayoutReflow de los 400ms ya
  // terminaron del todo. Antes se había probado este mismo truco disparándolo VARIAS
  // veces durante esos primeros 900ms y eso competía con la animación de cierre del
  // teclado (se sentía "trabado", ver el comentario más arriba) -- disparado una sola
  // vez y recién cuando ya no hay ninguna animación en curso, el costo no se nota.
  function forceHardRepaint(){
    const prevDisplay = document.body.style.display;
    document.body.style.display = 'none';
    // eslint-disable-next-line no-unused-expressions
    document.body.offsetHeight; // fuerza el reflow síncrono antes de volver a mostrar
    document.body.style.display = prevDisplay;
  }
  chatInputEl.addEventListener('blur', ()=> setTimeout(forceHardRepaint, 1000));
  // Este bug de WebKit no es exclusivo del chat: CUALQUIER campo de texto de la app
  // (login, onboarding, Perfil -- peso, altura, fecha de nacimiento, km semanales,
  // nota del objetivo, etc.) abre el mismo teclado de iOS, y al cerrarse puede dejar
  // el mismo rastro en CUALQUIER elemento position:fixed que esté en pantalla en ese
  // momento -- no solo la tabbar. Por ejemplo, el botón "Comenzar" de la pantalla de
  // bienvenida vive dentro de #splash, que es position:fixed; inset:0; el modal de
  // "ahora vs. semana que viene" y el resto de los overlays (login, onboarding) son
  // igual de position:fixed. En vez de repetir el arreglo campo por campo, escuchamos
  // el cierre de teclado de forma genérica en toda la app: cualquier <input>/<textarea>
  // que pierde el foco dispara el mismo scroll de 1px real (foco genérico, no fixed a
  // #coachChatWrap, así que llamar a syncCoachChatLayout() de más acá no molesta -- esa
  // función ya se sale sola si el elemento no existe).
  document.addEventListener('focusout', (e)=>{
    const t = e.target;
    // chatInputEl ya tiene su propio manejo completo arriba (con reapplyDuringAnimation
    // y su propio forceFixedLayoutReflow a los 400ms) -- sumar esto de nuevo acá sería
    // trabajo repetido justo durante la misma ventana de animación, aportando al jank.
    if(t && t !== chatInputEl && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')){
      forceFixedLayoutReflow();
      setTimeout(forceFixedLayoutReflow, 400);
    }
  });
})();
/* ---- detectar version nueva y recargar la app sola (sin tener que cerrarla) ---- */
let appUpdateChecking = false;
async function checkForAppUpdate(){
  // Adentro del wrapper nativo no hay nada que "detectar" -- app.js viene empaquetado
  // en el binario y las actualizaciones llegan por la tienda, no recargando la página.
  if(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return false;
  if(appUpdateChecking) return false;
  appUpdateChecking = true;
  try{
    /* Antes esto pedía index.html y buscaba `const APP_VERSION` ahí adentro — funcionaba
       porque todo el JS vivía inline en index.html. Desde que se separó el código a
       app.js, index.html ya no contiene esa constante, así que el regex nunca matcheaba
       y el aviso de actualización dejó de aparecer (en cualquier plataforma, no solo
       en el celular — simplemente nadie lo notó en desktop todavía). Hay que pedir
       app.js, que es donde vive ahora. */
    const res = await fetch('/app.js?_v=' + Date.now(), { cache:'no-store' });
    if(!res.ok) return false;
    const text = await res.text();
    const m = text.match(/const APP_VERSION\s*=\s*'([^']+)'/);
    if(m && m[1] && m[1] !== APP_VERSION){
      haptic([10,30,10]);
      showToast(t('update_found_msg'), 'success');
      /* location.reload() puede volver a servir una copia vieja de la caché del navegador —
         navegar a una URL con un parámetro único fuerza a pedirla de nuevo al servidor. */
      setTimeout(()=>{ location.href = location.pathname + '?_r=' + Date.now(); }, 700);
      return true;
    }
    return false;
  }catch(e){ console.error('update check failed', e); return false; }
  finally{ appUpdateChecking = false; }
}
if(typeof document !== 'undefined'){
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState === 'visible') checkForAppUpdate();
  });
}
async function doPullRefresh(){
  const indicator = document.getElementById('pull-refresh-indicator');
  if(indicator) indicator.style.display = 'flex';
  const updating = await checkForAppUpdate();
  if(updating) return;
  await refreshStateFromServer();
  autoSkipPastDays();
  autoClearPastEvent();
  renderAll(); renderHistory();
  if(indicator) setTimeout(()=>{ indicator.style.display='none'; }, 500);
  setTimeout(checkPendingRating, 400);
}
async function showView(v){
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
  document.getElementById('view-'+v).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.view===v));
  // El botón flotante del coach abre esa misma vista -- de pie sobre ella no aporta nada
  // (taparía el chat), así que se esconde mientras ya estamos adentro.
  document.getElementById('coach-fab-wrap').style.display = (v==='coach') ? 'none' : 'block';
  document.getElementById('chatBar').classList.toggle('active', v==='coach');
  (document.scrollingElement || document.documentElement).scrollTop = 0;
  // syncAppMinHeight() acá también: #view-coach es la única vista sin contenido real
  // en el flujo (ver el comentario largo junto a syncAppMinHeight) -- si --app-min-h
  // quedó corta por cualquier motivo, es justo ENTRAR a esta vista el momento en que
  // eso se nota (barra gris debajo de la tabbar). Volver a medir acá autocorrige el
  // caso aunque los reintentos de la carga inicial no hayan alcanzado.
  if(v==='coach'){ syncAppMinHeight(); syncCoachChatLayout(); scrollChatToBottom(); state.lastSeenChatTs = Date.now(); persist(); updateChatBadge(); } else { updateChatScrollBtn(); }
  if(v==='inicio'){ await refreshStateFromServer(); renderHome(); renderPlan(); }
  if(v==='history'){ await refreshStateFromServer(); renderHistory(); }
  if(v==='plan'){ await refreshStateFromServer(); viewingWeekOffset = 0; renderPlan(); }
  if(v==='perfil'){ renderPerfilDays(); updatePushStatusDisplay(); updateStravaStatusDisplay(); }
  if(v==='correr'){ renderRunTodayCard(); }
}
function goCoachWithPrompt(prefill){
  showView('coach');
  if(prefill){ document.getElementById('chatInput').value = prefill; }
  document.getElementById('chatInput').focus();
}

/* ================= SHOES / EVENT ================= */
function addShoe(){
  const name = document.getElementById('shoe-name').value.trim(); if(!name) return;
  state.shoes.push({id:Date.now(), name, terrain:document.getElementById('shoe-terrain').value, km:0});
  document.getElementById('shoe-name').value='';
  renderPerfil(); persist();
}
function startEditShoe(id){ editingShoeId = id; renderPerfil(); }
function cancelEditShoe(){ editingShoeId = null; renderPerfil(); }
function saveEditShoe(id){
  const name = document.getElementById('edit-shoe-name-'+id).value.trim();
  if(!name) return;
  const shoe = state.shoes.find(s=>s.id===id);
  shoe.name = name; shoe.terrain = document.getElementById('edit-shoe-terrain-'+id).value;
  editingShoeId = null;
  renderPerfil(); persist();
}
async function deleteShoe(id){
  if(!(await showConfirm(t('confirm_delete'), {danger:true, confirmText:t('delete_word')}))) return;
  state.shoes = state.shoes.filter(s=>s.id!==id);
  renderPerfil(); persist();
}
function checkShoeWearAlerts(){
  (state.shoes||[]).forEach(s=>{
    const threshold = s.terrain==='trail'?400:s.terrain==='mixto'?500:600;
    const pct = (s.km/threshold)*100;
    if(pct>80 && !s.wearAlerted){
      s.wearAlerted = true;
      haptic(20);
      showToast(t('shoe_wear_alert_msg', {name:s.name}), 'error');
    } else if(pct<=80 && s.wearAlerted){
      s.wearAlerted = false;
    }
  });
}
function refreshEstimatedHrMax(){
  /* Los perfiles armados antes de este cambio quedaron con la fórmula vieja (220-edad)
     guardada tal cual en hrMax -- cambiar estimateHrMax() no les recalcula nada solo,
     porque el valor ya está persistido. Para quien todavía no tiene una FC máxima real
     cargada (hrKnown=false), la recalculamos con la fórmula nueva (Tanaka) cada vez que
     entra a la app, así no quedan pegados para siempre a la estimación vieja por haberse
     registrado antes de este cambio. A quien ya tiene una FC real cargada no le tocamos
     nada -- un dato real siempre le gana a cualquier estimación por edad. */
  const p = state.profile;
  if(!p || p.hrKnown || !p.birth) return;
  const newEstimate = estimateHrMax(ageFromBirth(p.birth));
  if(newEstimate && newEstimate !== p.hrMax){
    p.hrMax = newEstimate;
    p.hrZones = computeZones(newEstimate);
    persist();
  }
}
function checkHrMaxFromRuns(){
  /* Un pico de FC real registrado en una carrera (reloj sincronizado por Strava) es más
     confiable que la estimación por edad -- si superó lo que tenemos guardado, lo tomamos
     como la nueva FC máxima real, sin esperar a que el corredor se lo cuente a mano al coach
     por chat (que hasta ahora era la única forma de que hrKnown pasara a true). Un tope de
     220 evita que un pico raro de sensor (glitch del reloj) rompa las zonas. */
  const observedMax = (state.runs||[]).reduce((max,r)=> (typeof r.maxHr==='number' && r.maxHr>max) ? r.maxHr : max, 0);
  if(observedMax && observedMax<=220 && observedMax > (state.profile.hrMax||0)){
    state.profile.hrMax = observedMax;
    state.profile.hrKnown = true;
    state.profile.hrZones = computeZones(observedMax);
    persist();
    if(document.getElementById('view-perfil') && document.getElementById('view-perfil').classList.contains('active')) renderZones();
    showToast(t('hrmax_auto_update_msg', {bpm: observedMax}), 'success');
  }
}
function setEvent(){
  const name = document.getElementById('ev-name').value.trim(); const date = document.getElementById('ev-date').value;
  if(!name || !date) return;
  const distanceKm = parseFloat(document.getElementById('ev-distance').value);
  state.event = {name, date, type:document.getElementById('ev-type').value, distanceKm: distanceKm>0 ? distanceKm : null};
  // el evento (fecha, tipo de terreno) influye en el plan (taper, día de descanso el día
  // de la carrera, terreno del rodaje largo) -- si no se regenera acá, esos efectos
  // quedaban "guardados" pero invisibles hasta el próximo cambio de semana natural.
  state.plan = preserveLivedDays(state.plan, generatePlan(state.profile, state.weekNumber||1));
  renderAll(); persist();
}
async function deleteEvent(){
  if(!(await showConfirm(t('confirm_delete'), {danger:true, confirmText:t('delete_word')}))) return;
  state.event = null;
  document.getElementById('ev-name').value=''; document.getElementById('ev-date').value=''; document.getElementById('ev-distance').value='';
  dateBoxUpdaters['ev-date'] && dateBoxUpdaters['ev-date']();
  state.plan = preserveLivedDays(state.plan, generatePlan(state.profile, state.weekNumber||1));
  renderAll(); persist();
}
/* ---- agregar la carrera de "Próximos eventos" al calendario del celular (.ics) ----
   Un evento de calendario ICS estándar (RFC 5545) que cualquier app de calendario sabe
   abrir (Calendario de iOS/macOS, Google Calendar, Outlook, etc.) -- no depende de
   ningún permiso especial ni de una integración puntual con un calendario en particular.
   Se arma como evento DE TODO EL DÍA (VALUE=DATE, sin hora) a propósito: acá solo
   tenemos la FECHA de la carrera, nunca una hora de largada, así que un evento con hora
   (DTSTART/DTEND con TZID) obligaría a inventar una hora que probablemente esté mal --
   mejor un evento de todo el día, sin ambigüedad de huso horario posible (a diferencia
   de los recordatorios del coach, esto no depende para nada de detectDeviceTz()). */
function escapeIcsText(s){
  // Caracteres que el RFC 5545 pide escapar en valores de texto (SUMMARY, DESCRIPTION).
  return String(s).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
}
function buildEventIcs(ev){
  // YYYYMMDD sin separadores, como pide VALUE=DATE -- ev.date ya viene en formato
  // YYYY-MM-DD (mismo string que usa el resto de la app, ver setEvent()).
  const dtStart = ev.date.replace(/-/g,'');
  // DTEND en un evento de todo el día es EXCLUSIVO (el día siguiente), tal cual pide el
  // estándar -- si no, algunas apps de calendario (Outlook en particular) lo muestran
  // como si durara dos días.
  const endDate = new Date(ev.date+'T00:00:00'); endDate.setDate(endDate.getDate()+1);
  const dtEnd = endDate.toISOString().slice(0,10).replace(/-/g,'');
  const now = new Date();
  const dtStamp = now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const typeLabel = t('ev_type_'+ev.type);
  const descParts = [typeLabel];
  if(ev.distanceKm>0) descParts.push(fmtDist(ev.distanceKm,1)+' '+distUnit());
  descParts.push('Zancada');
  const uid = 'evt-'+dtStart+'-'+Math.random().toString(36).slice(2,10)+'@zancada.org';
  // CRLF (\r\n): el RFC 5545 pide ese fin de línea puntual, no alcanza con \n solo --
  // algunos lectores de calendario más estrictos (Outlook) lo rechazan sin esto.
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Zancada//Coach de running//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'UID:'+uid,
    'DTSTAMP:'+dtStamp,
    'DTSTART;VALUE=DATE:'+dtStart,
    'DTEND;VALUE=DATE:'+dtEnd,
    'SUMMARY:'+escapeIcsText(ev.name),
    'DESCRIPTION:'+escapeIcsText(descParts.join(' · ')),
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')+'\r\n';
}
async function downloadEventIcs(){
  if(!state.event) return;
  const ics = buildEventIcs(state.event);
  const blob = new Blob([ics], {type:'text/calendar;charset=utf-8'});
  // Mismo patrón que shareRunImage(): en el celular (donde de verdad importa "agregar al
  // calendario") preferimos el panel nativo para compartir/abrir archivos -- ahí el
  // sistema ya sabe ofrecer "Agregar a Calendario" directo, sin pasar por la carpeta de
  // Descargas. En desktop (sin Web Share API) caemos a la descarga clásica del archivo.
  const file = new File([blob], 'zancada-carrera.ics', {type:'text/calendar'});
  if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title:state.event.name}); }catch(e){ /* usuario canceló */ }
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'zancada-carrera.ics';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
  }
}

/* ================= LIVE TRACKER + MAP ================= */
let tracker = {watchId:null, timerId:null, points:[], distanceKm:0, elapsedSec:0, running:false, hrLog:[], lastAnnouncedKm:0, startedAt:null, workout:null, autoPaused:false, lastMoveMs:null, lastFixMs:null};
/* ---- Auto-pausa: detectar solo cuando el corredor se frena (semáforo, cruce, tomar
   agua) sin que tenga que acordarse de tocar "Pausar" -- lo que hacen Strava/Nike/Garmin
   de fábrica. Se mide la velocidad instantánea entre cada dos posiciones del GPS (con el
   timestamp real del propio fix, independiente de tracker.elapsedSec, que es justamente
   lo que congelamos mientras dura la auto-pausa) y con un poco de histéresis entre el
   umbral de "pausar" y el de "reanudar" para no titilar por el ruido normal del GPS
   parado en un punto. No toca la pausa manual (el botón) -- son dos banderas separadas:
   tracker.running (pausa manual) y tracker.autoPaused (esta). */
const AUTO_PAUSE_SPEED_MPS = 0.5; // por debajo de esto (~1.8 km/h) se considera "parado"
const AUTO_RESUME_SPEED_MPS = 0.9; // por encima de esto (~3.2 km/h) se considera "moviéndose de nuevo"
const AUTO_PAUSE_HOLD_MS = 10000; // cuánto tiempo quieto antes de pausar solo
function isTrackingActive(){ return tracker.running && !tracker.autoPaused; }
function updateRecordingLabel(){
  const dot = document.getElementById('run-rec-dot');
  const label = document.getElementById('run-recording-label');
  if(!dot || !label) return;
  if(tracker.autoPaused){
    dot.style.background = 'var(--mist-dim)'; dot.style.animation = 'none';
    label.textContent = t('run_auto_paused');
  } else if(!tracker.running){
    dot.style.background = 'var(--mist-dim)'; dot.style.animation = 'none';
    label.textContent = t('run_paused_manual');
  } else {
    dot.style.background = ''; dot.style.animation = '';
    label.textContent = t('run_recording');
  }
}
let liveMap, liveMarker, startMarker, livePolyline;
let wakeLockSentinel = null;

async function requestWakeLock(){ try{ if('wakeLock' in navigator) wakeLockSentinel = await navigator.wakeLock.request('screen'); }catch(e){} }
async function releaseWakeLock(){ try{ if(wakeLockSentinel){ await wakeLockSentinel.release(); wakeLockSentinel=null; } }catch(e){} }
document.addEventListener('visibilitychange', async ()=>{ if(document.visibilityState==='visible' && tracker.running && !wakeLockSentinel) await requestWakeLock(); });

/* ---- guardado automático de la carrera en curso ----
   Si el navegador se cierra solo (poca batería, la app se va a segundo plano
   y el sistema mata la pestaña, etc.) mientras estás corriendo, esto permite
   recuperar lo ya recorrido en vez de perder el entrenamiento entero. Se
   guarda en el almacenamiento local del teléfono, no en el servidor. */
const RUN_PROGRESS_KEY = 'zancada_run_in_progress';
function saveRunProgress(){
  if(!tracker || !tracker.startedAt) return;
  try{
    localStorage.setItem(RUN_PROGRESS_KEY, JSON.stringify({
      startedAt: tracker.startedAt,
      points: tracker.points,
      distanceKm: tracker.distanceKm,
      hrLog: tracker.hrLog,
      lastAnnouncedKm: tracker.lastAnnouncedKm,
      elapsedSec: tracker.elapsedSec
    }));
  }catch(e){}
}
function clearRunProgress(){ try{ localStorage.removeItem(RUN_PROGRESS_KEY); }catch(e){} }
function readRunProgress(){
  try{ const raw = localStorage.getItem(RUN_PROGRESS_KEY); return raw ? JSON.parse(raw) : null; }catch(e){ return null; }
}
function speak(text){
  if(state.voiceEnabled===false || !('speechSynthesis' in window)) return;
  try{ const u = new SpeechSynthesisUtterance(text); u.lang = LOCALE_MAP[lang]; window.speechSynthesis.speak(u); }catch(e){}
}
function maybeAnnounceKm(){
  const currentKm = Math.floor(tracker.distanceKm);
  if(currentKm>0 && currentKm>tracker.lastAnnouncedKm){
    tracker.lastAnnouncedKm = currentKm;
    const paceMin = (tracker.elapsedSec/60)/tracker.distanceKm;
    const paceStr = `${Math.floor(paceMin)}:${String(Math.round((paceMin%1)*60)).padStart(2,'0')}`;
    speak(t('voice_km',{km:currentKm, pace:paceStr}));
  }
}

/* ---- Guía en vivo de series/subidas ----
   Antes, el tracker en vivo era el mismo sin importar qué entrenamiento tocaba hoy --
   solo avisaba el km y el ritmo, ni idea de si era un día de series, subidas o rodaje
   fácil. Esto lo hace consciente del tipo de sesión: si hoy hay series (intervals) o
   subidas (hills) -- los dos únicos tipos que ya traen una estructura de repeticiones
   concreta en dayObj.interval (ver buildIntervalStructure/buildHillStructure) -- guía
   al corredor repetición por repetición por voz y con un cartel en pantalla, sin que
   tenga que mirar el reloj ni contar mentalmente.

   Por qué arranca en "pending" y no arranca solo: el dato que tenemos (today.dist) es
   la distancia TOTAL de la sesión (entrada en calor + series + vuelta a la calma), no
   dónde empiezan las series -- así que no hay forma automática y confiable de saber
   cuándo terminó de calentar. Se lo preguntamos con un botón en vez de adivinar mal.

   Las series (intervals) miden el esfuerzo por DISTANCIA (repMeters) porque así están
   pensadas -- "corré 400m fuerte" -- y la recuperación por TIEMPO (recoveryMin), tal
   cual la arma buildIntervalStructure(). Las subidas (hills) ahora también se miden
   por DISTANCIA (repMeters, ver buildHillStructure()) tanto en el esfuerzo (la
   subida) como en la recuperación (la bajada trotando suave) -- bajar trotando
   cubre aproximadamente el mismo tramo que se subió fuerte, así que no hace falta
   una duración de recuperación aparte como en las series. (Antes se medía todo por
   TIEMPO -- effortSec -- justamente porque en una pendiente la distancia puede
   variar según el terreno, pero eso dejaba el total de la sesión mostrado en el
   plan desconectado de la descripción real del ejercicio; ver buildHillStructure()
   para el detalle.) */
function getTodayWorkoutStructure(){
  const idx = (new Date().getDay()+6)%7;
  const today = state.plan[idx];
  if(!today || !today.interval) return null;
  // Si el corredor entrena "por tiempo", las repeticiones (series/cuestas) se completan
  // por tiempo transcurrido (repSec) en vez de por distancia GPS (repMeters) -- ver
  // tickWorkoutGuide() y renderWorkoutGuide(). En modo distancia repSec queda undefined
  // y el comportamiento es exactamente el de siempre.
  const repSec = isTimeMode() ? repDurationSec(today.interval.repMeters) : undefined;
  if(today.typeKey==='intervals') return {typeKey:'intervals', reps:today.interval.reps, repMeters:today.interval.repMeters, repSec, recoveryMin:today.interval.recoveryMin};
  if(today.typeKey==='hills') return {typeKey:'hills', reps:today.interval.reps, repMeters:today.interval.repMeters, repSec};
  return null;
}
function setupWorkoutGuide(){
  const structure = getTodayWorkoutStructure();
  tracker.workout = structure ? {structure, phase:'pending', currentRep:0, phaseStartDistanceKm:0, phaseStartElapsedSec:0} : null;
  renderWorkoutGuide();
}
function beginWorkoutReps(){
  if(!tracker.workout) return;
  const w = tracker.workout;
  w.phase = 'effort';
  w.currentRep = 1;
  w.phaseStartDistanceKm = tracker.distanceKm;
  w.phaseStartElapsedSec = tracker.elapsedSec;
  haptic([15,40,15]);
  announceWorkoutPhase();
  renderWorkoutGuide();
}
function announceWorkoutPhase(){
  const w = tracker.workout; if(!w) return;
  const s = w.structure;
  if(w.phase==='effort'){
    speak(s.typeKey==='intervals' ? t('voice_rep_start',{cur:w.currentRep, total:s.reps}) : t('voice_hill_start',{cur:w.currentRep, total:s.reps}));
  } else if(w.phase==='recovery'){
    speak(s.typeKey==='intervals' ? t('voice_rep_recovery',{cur:w.currentRep, min:s.recoveryMin}) : t('voice_hill_recovery',{cur:w.currentRep}));
  } else if(w.phase==='done'){
    speak(t('voice_workout_done'));
  }
}
function advanceWorkoutPhase(){
  const w = tracker.workout; const s = w.structure;
  if(w.phase==='effort'){
    if(w.currentRep >= s.reps){
      w.phase = 'done';
    } else {
      w.phase = 'recovery';
      w.phaseStartElapsedSec = tracker.elapsedSec;
      // Para cuestas la recuperación (bajada) también se mide por distancia -- ver
      // tickWorkoutGuide() -- así que hay que reiniciar el punto de partida acá
      // también, no solo al arrancar el esfuerzo. Para series (intervals) este valor
      // no se usa durante la recuperación (que es por tiempo), así que actualizarlo
      // siempre acá no cambia nada para ese caso.
      w.phaseStartDistanceKm = tracker.distanceKm;
    }
  } else if(w.phase==='recovery'){
    w.currentRep++;
    w.phase = 'effort';
    w.phaseStartDistanceKm = tracker.distanceKm;
    w.phaseStartElapsedSec = tracker.elapsedSec;
  }
  haptic([15,40,15]);
  announceWorkoutPhase();
}
function tickWorkoutGuide(){
  const w = tracker.workout;
  if(!w || w.phase==='pending' || w.phase==='done') return;
  const s = w.structure;
  let complete = false;
  if(s.typeKey==='intervals'){
    if(w.phase==='effort') complete = s.repSec!=null ? (tracker.elapsedSec - w.phaseStartElapsedSec) >= s.repSec : (tracker.distanceKm - w.phaseStartDistanceKm)*1000 >= s.repMeters;
    else complete = (tracker.elapsedSec - w.phaseStartElapsedSec) >= s.recoveryMin*60;
  } else {
    // hills: tanto la subida (esfuerzo) como la bajada trotando (recuperación) se
    // miden por la misma distancia repMeters -- ver comentario arriba de
    // getTodayWorkoutStructure() -- salvo en modo "por tiempo", donde ambas fases
    // se completan por tiempo transcurrido (repSec) en vez de GPS.
    complete = s.repSec!=null ? (tracker.elapsedSec - w.phaseStartElapsedSec) >= s.repSec : (tracker.distanceKm - w.phaseStartDistanceKm)*1000 >= s.repMeters;
  }
  if(complete) advanceWorkoutPhase();
  renderWorkoutGuide();
}
function renderWorkoutGuide(){
  const card = document.getElementById('workout-guide-card');
  if(!card) return;
  const w = tracker.workout;
  if(!w){ card.style.display = 'none'; return; }
  card.style.display = 'block';
  const pendingEl = document.getElementById('workout-guide-pending');
  const activeEl = document.getElementById('workout-guide-active');
  const doneEl = document.getElementById('workout-guide-done');
  pendingEl.style.display = w.phase==='pending' ? 'block' : 'none';
  activeEl.style.display = (w.phase==='effort' || w.phase==='recovery') ? 'block' : 'none';
  doneEl.style.display = w.phase==='done' ? 'block' : 'none';
  if(w.phase==='pending'){
    const idx = (new Date().getDay()+6)%7;
    const today = state.plan[idx];
    document.getElementById('workout-guide-desc').textContent = today ? planLabel(today).desc : '';
    document.getElementById('workout-guide-start-btn').textContent = t('run_guide_start_btn');
  } else if(w.phase==='effort' || w.phase==='recovery'){
    const s = w.structure;
    const tag = document.getElementById('workout-guide-phase-tag');
    const isEffort = w.phase==='effort';
    tag.textContent = isEffort ? t('run_guide_tag_effort') : t('run_guide_tag_recovery');
    tag.className = 'tag ' + (isEffort ? 'tag-load-risk' : 'tag-mixto');
    document.getElementById('workout-guide-rep-count').textContent = `${w.currentRep}/${s.reps}`;
    let pct;
    if(s.typeKey==='intervals'){
      pct = isEffort
        ? (s.repSec!=null ? ((tracker.elapsedSec - w.phaseStartElapsedSec) / s.repSec)*100 : ((tracker.distanceKm - w.phaseStartDistanceKm)*1000 / s.repMeters)*100)
        : ((tracker.elapsedSec - w.phaseStartElapsedSec) / (s.recoveryMin*60))*100;
    } else {
      pct = s.repSec!=null ? ((tracker.elapsedSec - w.phaseStartElapsedSec) / s.repSec)*100 : ((tracker.distanceKm - w.phaseStartDistanceKm)*1000 / s.repMeters)*100;
    }
    document.getElementById('workout-guide-progress-bar').style.width = Math.max(0,Math.min(100,pct)) + '%';
  } else if(w.phase==='done'){
    document.getElementById('workout-guide-done-text').textContent = t('voice_workout_done');
  }
}

function haversine(lat1,lon1,lat2,lon2){
  const R=6371, toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function fmtTime(sec){
  const h=String(Math.floor(sec/3600)).padStart(2,'0'), m=String(Math.floor((sec%3600)/60)).padStart(2,'0'), s=String(Math.floor(sec%60)).padStart(2,'0');
  return `${h}:${m}:${s}`;
}
function classifyHR(bpm){
  const z = state.profile.hrZones; if(!z) return 2;
  if(bpm<=z[1].max) return 1; if(bpm<=z[2].max) return 2; if(bpm<=z[3].max) return 3; if(bpm<=z[4].max) return 4; return 5;
}
// Zona de ritmo RELATIVA al propio promedio de la carrera (no a un umbral de
// laboratorio ni a un test de esfuerzo que Zancada no le pide a nadie) --
// clasifica cada tramo como más lento/más rápido que el promedio de ESE
// entrenamiento puntual. Es deliberadamente distinto de las zonas de FC
// (que sí están personalizadas con state.profile.hrZones): no tenemos base
// para decir "esto es tu ritmo de maratón", así que no lo afirmamos.
function classifyPaceRelative(paceMin, avgPaceMin){
  if(!avgPaceMin || avgPaceMin<=0) return 3;
  const ratio = paceMin/avgPaceMin;
  if(ratio > 1.15) return 1;
  if(ratio > 1.05) return 2;
  if(ratio >= 0.95) return 3;
  if(ratio >= 0.85) return 4;
  return 5;
}
// Deriva splits por km reales a partir de los puntos GPS de una carrera
// trackeada en vivo (con t=segundos desde el arranque, ver onPosition).
// Antes esto solo existía para carreras sincronizadas de Strava -- las
// trackeadas desde el celular no guardaban ni la hora de cada punto, así que
// no había forma de calcular ritmo real por tramo.
function computeSplitsFromPoints(points){
  if(!points || points.length < 2) return [];
  const cum = [0];
  for(let i=1;i<points.length;i++){
    cum.push(cum[i-1] + haversine(points[i-1].lat,points[i-1].lon,points[i].lat,points[i].lon));
  }
  const totalKm = cum[cum.length-1];
  const numFullKm = Math.floor(totalKm);
  if(numFullKm < 1 && totalKm*1000 < 50) return [];
  function buildSegment(fromIdx, toIdx, fromTime, label){
    const segKm = cum[toIdx] - cum[fromIdx];
    const segTime = (points[toIdx].t||0) - fromTime;
    const paceMin = segKm>0 ? (segTime/60)/segKm : 0;
    let elevGain = 0;
    for(let j=fromIdx+1;j<=toIdx;j++){
      if(points[j].alt!=null && points[j-1].alt!=null){ const d=points[j].alt-points[j-1].alt; if(d>0) elevGain+=d; }
    }
    return {km:label, paceMin: Math.round(paceMin*100)/100, elevGain: Math.round(elevGain), avgHr:null, avgCadence:null};
  }
  const splits = [];
  let startIdx = 0, startTime = points[0].t||0;
  for(let km=1; km<=numFullKm; km++){
    let idx = startIdx;
    while(idx<cum.length && cum[idx]<km) idx++;
    if(idx>=cum.length) idx = cum.length-1;
    splits.push(buildSegment(startIdx, idx, startTime, km));
    startIdx = idx; startTime = points[idx].t||0;
  }
  const lastIdx = cum.length-1;
  const remainderKm = cum[lastIdx] - cum[startIdx];
  if(remainderKm*1000 > 50){
    splits.push(buildSegment(startIdx, lastIdx, startTime, Math.round(remainderKm*100)/100));
  }
  return splits;
}
// Ascenso/descenso total a partir de la altitud del GPS del celular. No todos
// los dispositivos la reportan (ni siquiera de forma constante en todos sus
// puntos) -- devolvemos null/null cuando no hay ningún dato real de altitud
// en vez de inventar un número, para que la pantalla de detalle simplemente
// no muestre esa fila en esos casos.
function computeElevationFromPoints(points){
  if(!points || points.length<2) return {gain:null, loss:null};
  let gain=0, loss=0, any=false;
  for(let i=1;i<points.length;i++){
    if(points[i].alt!=null && points[i-1].alt!=null){
      any = true;
      const d = points[i].alt - points[i-1].alt;
      if(d>0) gain+=d; else loss+=-d;
    }
  }
  return any ? {gain:Math.round(gain), loss:Math.round(loss)} : {gain:null, loss:null};
}
// Curva de ritmo en el tiempo para el gráfico de la pestaña "Gráficos" en
// carreras trackeadas en vivo (sin FC -- eso necesitaría un sensor externo
// que hoy la app no lee). Promediamos en ventanas de ~30s para suavizar el
// ruido normal del GPS punto a punto.
function computePaceSeriesFromPoints(points){
  if(!points || points.length<3) return null;
  const windowSec = 30;
  const out = {t:[], paceMin:[]};
  let i = 0;
  while(i<points.length-1){
    const t0 = points[i].t||0;
    let j = i, distKm = 0;
    while(j<points.length-1 && (points[j+1].t||0)-t0 < windowSec){
      distKm += haversine(points[j].lat,points[j].lon,points[j+1].lat,points[j+1].lon);
      j++;
    }
    const dt = (points[j].t||0) - t0;
    if(dt>0 && distKm>0.01){
      out.t.push(Math.round((t0 + (points[j].t||0))/2));
      out.paceMin.push(Math.round(((dt/60)/distKm)*100)/100);
    }
    i = j>i ? j : i+1;
  }
  return out.t.length>=2 ? out : null;
}
function initLiveMap(){
  if(liveMap){ liveMap.remove(); liveMap=null; }
  liveMap = L.map('liveMap', {zoomControl:false, attributionControl:true}).setView([0,0], 15);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=cb1_2i8k_1_882919874396f1a734cae151', {maxZoom:20, attribution:'&copy; OpenStreetMap contributors &copy; CARTO'}).addTo(liveMap);
  livePolyline = L.polyline([], {color:'#0B5D2E', weight:5, lineCap:'round', lineJoin:'round'}).addTo(liveMap);
  liveMarker = null; startMarker = null;
  setTimeout(()=>{ if(liveMap) liveMap.invalidateSize(); }, 250);
}
function updateLiveMap(lat, lon){
  if(!liveMap) return;
  livePolyline.addLatLng([lat,lon]);
  if(!startMarker){
    startMarker = L.circleMarker([lat,lon], {radius:6, color:'#fff', weight:2, fillColor:'#4ADE80', fillOpacity:1}).addTo(liveMap);
  }
  if(liveMarker) liveMap.removeLayer(liveMarker);
  liveMarker = L.circleMarker([lat,lon], {radius:8, color:'#121415', weight:3, fillColor:'#D6FF3F', fillOpacity:1}).addTo(liveMap);
  liveMap.setView([lat,lon], Math.max(liveMap.getZoom(),16));
}
function recenterMap(){
  if(liveMap && liveMarker) liveMap.setView(liveMarker.getLatLng(), 17);
}
function startRun(){
  if(!navigator.geolocation){ document.getElementById('geo-warning').style.display='block'; document.getElementById('geo-warning').textContent=t('geo_err_support'); return; }
  const saved = readRunProgress();
  if(saved && saved.startedAt && (Date.now()-saved.startedAt) < 6*3600*1000 && (saved.points||[]).length){
    // hay una carrera sin terminar de hace menos de 6 horas (por ejemplo, la app
    // se cerró sola a mitad de un entrenamiento) -> ofrecemos recuperarla en vez
    // de arrancar una nueva y perder lo ya corrido
    showConfirm(t('run_recover_text'), {confirmText:t('run_recover_confirm'), cancelText:t('run_recover_discard')}).then(resume=>{
      if(!resume) clearRunProgress();
      actuallyStartRun(resume ? saved : null);
    });
    return;
  }
  actuallyStartRun(null);
}
function actuallyStartRun(saved){
  // Ojo con elapsedSec al recuperar una carrera guardada: ANTES se recalculaba como
  // Date.now()-saved.startedAt, o sea el reloj de pared completo desde que arrancó la
  // carrera -- lo cual incluía CUALQUIER rato con la app cerrada (que es exactamente el
  // caso que esta recuperación existe para cubrir) como si hubiera sido tiempo corriendo.
  // Cerrar la app 2 horas a mitad de una carrera y recuperarla después inflaba la duración
  // guardada en 2 horas, arruinando el ritmo/las calorías de esa carrera para siempre.
  // distanceKm/points/hrLog ya se restauraban tal cual quedaron guardados (sin intentar
  // "adivinar" nada del tiempo cerrado, porque no se grabó ningún punto de GPS durante ese
  // rato) -- elapsedSec ahora hace lo mismo: se restaura tal cual, sin extrapolar por reloj
  // de pared. El único margen de error es el intervalo entre el último guardado (cada fix
  // de GPS, y como mucho cada 15s por el timer) y el cierre real, siempre chico.
  tracker = saved
    ? {watchId:null, timerId:null, points:saved.points||[], distanceKm:saved.distanceKm||0, elapsedSec:saved.elapsedSec||0, running:true, hrLog:saved.hrLog||[], lastAnnouncedKm:saved.lastAnnouncedKm||0, startedAt:saved.startedAt, autoPaused:false, lastMoveMs:Date.now(), lastFixMs:null}
    : {watchId:null, timerId:null, points:[], distanceKm:0, elapsedSec:0, running:true, hrLog:[], lastAnnouncedKm:0, startedAt:Date.now(), autoPaused:false, lastMoveMs:Date.now(), lastFixMs:null};
  requestWakeLock();
  document.getElementById('runIdle').style.display='none';
  document.getElementById('runSummary').style.display='none';
  document.getElementById('runActive').style.display='block';
  // El botón arranca en "Pausar" -- sin esto quedaba con el texto que tenía la
  // última vez que se renderizó la pantalla (típicamente "Reanudar", puesto por
  // applyStaticTranslations() al cargar la app con tracker.running todavía en false).
  document.getElementById('pauseBtn').textContent = t('run_pause');
  updateRecordingLabel();
  initLiveMap();
  updateLiveStats();
  setupWorkoutGuide();
  saveRunProgress();
  tracker.watchId = navigator.geolocation.watchPosition(onPosition, onPosError, {enableHighAccuracy:true, maximumAge:1000, timeout:15000});
  tracker.timerId = setInterval(()=>{ if(isTrackingActive()){ tracker.elapsedSec++; updateLiveStats(); tickWorkoutGuide(); if(tracker.elapsedSec % 15 === 0) saveRunProgress(); } }, 1000);
}
function onPosition(pos){
  const {latitude:lat, longitude:lon, accuracy, altitude} = pos.coords;
  if(accuracy && accuracy>50) return;
  const last = tracker.points[tracker.points.length-1];
  const stepKm = last ? haversine(last.lat,last.lon,lat,lon) : 0;

  // Auto-pausa: la velocidad instantánea sale del propio timestamp del fix del GPS
  // (pos.timestamp), no de tracker.elapsedSec -- porque elapsedSec es justo lo que
  // queremos poder congelar sin perder la referencia de tiempo real para el cálculo.
  const nowMs = pos.timestamp || Date.now();
  const dtSec = tracker.lastFixMs!=null ? Math.max(0.001, (nowMs-tracker.lastFixMs)/1000) : null;
  const speedMps = dtSec!=null ? (stepKm*1000)/dtSec : null;
  tracker.lastFixMs = nowMs;
  if(tracker.running){
    if(speedMps==null){
      tracker.lastMoveMs = nowMs; // primer fix de la carrera (o de la reanudación): todavía sin referencia, arrancamos el reloj de quietud desde acá
    } else if(speedMps >= AUTO_RESUME_SPEED_MPS){
      tracker.lastMoveMs = nowMs;
      if(tracker.autoPaused){ tracker.autoPaused = false; updateRecordingLabel(); }
    } else if(!tracker.autoPaused && speedMps < AUTO_PAUSE_SPEED_MPS && tracker.lastMoveMs!=null && (nowMs-tracker.lastMoveMs) >= AUTO_PAUSE_HOLD_MS){
      tracker.autoPaused = true; updateRecordingLabel();
    }
  }

  const active = isTrackingActive();
  if(active && stepKm>0.002) tracker.distanceKm += stepKm;
  // t = segundos desde el arranque de la carrera, alt = altitud del GPS si el
  // dispositivo la da (no todos la reportan, y aun cuando la dan puede faltar
  // en puntos sueltos -- por eso el resto del código nunca asume que todos
  // los puntos la tienen). Con esto podemos calcular ritmo real por tramo y
  // ascenso/descenso para carreras trackeadas desde el celular, algo que
  // antes solo teníamos para las carreras sincronizadas de Strava.
  tracker.points.push({lat, lon, t:tracker.elapsedSec, alt:(typeof altitude==='number' && !isNaN(altitude)) ? altitude : null});
  updateLiveMap(lat,lon);
  updateLiveStats();
  if(active){ maybeAnnounceKm(); tickWorkoutGuide(); }
  saveRunProgress();
}
function onPosError(){ document.getElementById('geo-warning').style.display='block'; document.getElementById('geo-warning').textContent=t('geo_err_permission'); }
function updateRunUnitLabels(){
  const distLbl = distUnit().toUpperCase();
  const paceLbl = `${t('run_pace_word')} /${distUnit()}`;
  ['track-dist-label','sum-dist-label'].forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent = distLbl; });
  ['track-pace-label','sum-pace-label'].forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent = paceLbl; });
}
function updateLiveStats(){
  document.getElementById('track-timer').textContent = fmtTime(tracker.elapsedSec);
  document.getElementById('track-dist').textContent = fmtDist(tracker.distanceKm);
  const paceMin = tracker.distanceKm>0.02 ? (tracker.elapsedSec/60)/tracker.distanceKm : 0;
  document.getElementById('track-pace').textContent = fmtPace(paceMin);
  updateRunUnitLabels();
}
function togglePause(){
  tracker.running = !tracker.running;
  if(tracker.running){
    // al reanudar a mano, reiniciamos el reloj de quietud de la auto-pausa -- si no,
    // como veníamos "parados" desde antes de pausar, se auto-pausaría de nuevo apenas
    // pasen los AUTO_PAUSE_HOLD_MS aunque el corredor ya haya arrancado a correr otra vez.
    tracker.autoPaused = false;
    tracker.lastMoveMs = Date.now();
  }
  document.getElementById('pauseBtn').textContent = tracker.running? t('run_pause') : t('run_resume');
  updateRecordingLabel();
  // Guardamos el progreso justo al pausar/reanudar a mano -- si la app se cierra
  // segundos después de tocar "Pausar" (llamada, se apaga el teléfono, etc.), el
  // elapsedSec recuperado más tarde queda lo más cerca posible del momento real de la
  // pausa, en vez de depender de que llegue el próximo fix de GPS o el timer de 15s.
  saveRunProgress();
}
function stopRun(){
  clearInterval(tracker.timerId);
  if(tracker.watchId!==null) navigator.geolocation.clearWatch(tracker.watchId);
  releaseWakeLock();
  tracker.workout = null;
  document.getElementById('workout-guide-card').style.display = 'none';
  document.getElementById('runActive').style.display='none';
  document.getElementById('runSummary').style.display='block';
  const paceMin = tracker.distanceKm>0.02 ? (tracker.elapsedSec/60)/tracker.distanceKm : 0;
  document.getElementById('sum-dist').textContent = fmtDist(tracker.distanceKm);
  document.getElementById('sum-time').textContent = fmtTime(tracker.elapsedSec);
  document.getElementById('sum-pace').textContent = fmtPace(paceMin);
  document.getElementById('sum-cal').textContent = Math.round((state.profile.weight||70)*tracker.distanceKm*1.036);
  updateRunUnitLabels();
  const sel = document.getElementById('sum-shoe');
  sel.innerHTML = state.shoes.length ? state.shoes.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('') : `<option value="">${t('no_shoes')}</option>`;
}
let ratingTargetIdx = null;
function findUnratedDoneDay(){
  return state.plan.findIndex(d => d.status==='done' && !d.rating);
}
function checkPendingRating(){
  if(document.getElementById('login').style.display==='block' || document.getElementById('onboard').style.display==='block') return;
  const idx = findUnratedDoneDay();
  if(idx < 0) return;
  const d = state.plan[idx];
  const lbl = planLabel(d);
  document.getElementById('rating-session-desc').textContent = `${t('day_'+d.day)}: ${lbl.type}${d.dist>0?' · '+planAmountText(d):''}`;
  ratingTargetIdx = idx;
  document.getElementById('rating-modal').style.display = 'block';
}
async function submitRating(value){
  if(ratingTargetIdx===null) return;
  const idx = ratingTargetIdx;
  state.plan[idx].rating = value;
  document.getElementById('rating-modal').style.display = 'none';
  ratingTargetIdx = null;
  await persist();
  if(value === 'mal'){
    if(await showConfirm(t('rating_lower_intensity_confirm'))){
      lowerRemainingIntensity(-15);
      state.chat.push({role:'coach', text: t('rating_lowered_msg'), ts:Date.now()});
      await persist();
    }
  }
  setTimeout(checkPendingRating, 400);
}
function lowerRemainingIntensity(pct){
  const factor = 1 + (pct/100);
  state.plan.forEach(d=>{ if(d.dist>0 && !d.status){ d.dist = Math.max(1, Math.round(d.dist*factor)); } });
  renderPlan(); renderHome(); persist();
}
async function closeSummary(){
  const shoeId = parseInt(document.getElementById('sum-shoe').value);
  const shoe = state.shoes.find(s=>s.id===shoeId);
  if(shoe) shoe.km += tracker.distanceKm;
  checkShoeWearAlerts();
  const runDate = new Date().toISOString();
  const runId = Date.now();
  const elev = computeElevationFromPoints(tracker.points);
  const paceSeries = computePaceSeriesFromPoints(tracker.points);
  state.runs.push({
    id:runId, date:runDate, distanceKm:tracker.distanceKm, durationSec:tracker.elapsedSec,
    hrLog:tracker.hrLog, points:tracker.points, shoeId:shoeId||null,
    splits: computeSplitsFromPoints(tracker.points), splitsV:3,
    elevationGain: elev.gain, elevationLoss: elev.loss,
    series: paceSeries ? {t: paceSeries.t, hr: null, paceMin: paceSeries.paceMin} : null
  });
  checkNewPR(state.runs[state.runs.length-1]);
  autoMarkSessionDone(runDate, runId);
  clearRunProgress();
  document.getElementById('runSummary').style.display='none';
  document.getElementById('runIdle').style.display='block';
  renderAll(); renderHistory(); renderRunTodayCard();
  await persist();
  showView('inicio');
  showToast(t('run_completed_toast'), 'success');
  haptic([15,40,15]);
  setTimeout(checkPendingRating, 500);
}
function autoMarkSessionDone(dateIso, runId){
  const monday = getMondayISO(new Date(dateIso));
  if(monday !== state.weekStart) return;
  const idx = (new Date(dateIso).getDay()+6)%7;
  if(state.plan[idx] && !state.plan[idx].status){ state.plan[idx].status = 'done'; state.plan[idx].linkedRunId = runId; }
}
function toggleManualForm(){
  const el = document.getElementById('manual-run-card');
  const show = el.style.display==='none';
  el.style.display = show?'block':'none';
  if(show){
    document.getElementById('man-date').value = localDateISO();
    dateBoxUpdaters['man-date'] && dateBoxUpdaters['man-date']();
    const sel = document.getElementById('man-shoe');
    sel.innerHTML = state.shoes.length ? state.shoes.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('') : `<option value="">${t('no_shoes')}</option>`;
  }
}
function saveManualRun(){
  const date = document.getElementById('man-date').value;
  const dist = parseFloat(document.getElementById('man-dist').value);
  const durMin = parseFloat(document.getElementById('man-dur').value);
  if(!date || !dist || !durMin) return;
  const hr = parseInt(document.getElementById('man-hr').value);
  const shoeId = parseInt(document.getElementById('man-shoe').value) || null;
  const isoDate = new Date(date+'T12:00:00').toISOString();
  const runId = Date.now();
  state.runs.push({id:runId, date:isoDate, distanceKm:dist, durationSec:Math.round(durMin*60), hrLog: hr?[{t:0,bpm:hr}]:[], points:[], shoeId, manual:true});
  checkNewPR(state.runs[state.runs.length-1]);
  const shoe = state.shoes.find(s=>s.id===shoeId);
  if(shoe) shoe.km += dist;
  checkShoeWearAlerts();
  autoMarkSessionDone(isoDate, runId);
  document.getElementById('man-dist').value=''; document.getElementById('man-dur').value=''; document.getElementById('man-hr').value='';
  toggleManualForm();
  renderAll(); renderHistory(); persist();
}

/* ================= HISTORY ================= */
function computeDailyTrend(days){
  const result = [];
  const today = new Date(); today.setHours(0,0,0,0);
  const weekDayKeys = ['sun','mon','tue','wed','thu','fri','sat'];
  for(let i=days-1; i>=0; i--){
    const d = new Date(today); d.setDate(d.getDate()-i);
    const dateStr = d.toISOString().slice(0,10);
    // localDateISO(r.date), no r.date.slice(0,10): r.date es un timestamp UTC completo,
    // cortarlo a mano daba el día calendario en UTC en vez del día LOCAL real de la
    // carrera (ver el comentario junto a localDateISO/getTodayRun).
    const km = state.runs.filter(r => localDateISO(r.date) === dateStr).reduce((a,r)=>a+r.distanceKm,0);
    let planned = false;
    // dateStr >= state.weekStart no alcanza solo: weekStart es el lunes de la semana en la
    // que se creó la cuenta, así que alguien que se sumó un martes igual pasaba esa
    // comparación para el lunes anterior (que sí es "de esta semana" pero la cuenta ni
    // existía todavía ese día). El chequeo contra createdAt es lo que evita marcarlo como
    // sesión planeada/perdida en el gráfico de Historial.
    const createdAt = state.profile && state.profile.createdAt;
    if(state.weekStart && dateStr >= state.weekStart && (!createdAt || dateStr >= createdAt)){
      const planDay = state.plan.find(p=>p.day===weekDayKeys[d.getDay()]);
      if(planDay && planDay.dist>0) planned = true;
    }
    result.push({date:dateStr, km, planned, day:d.getDate()});
  }
  return result;
}
function computeTrends(){
  const totalKm = state.runs.reduce((a,r)=>a+r.distanceKm,0);
  return {totalKm, totalRuns: state.runs.length};
}
function getQualitySessionBreakdown(daysBack){
  // Cuenta las sesiones fuertes COMPLETADAS (series, tempo, fartlek, cuestas,
  // progresivo) de los últimos `daysBack` días, mirando tanto el plan actual como
  // el historial de semanas ya cerradas (planHistory). Sirve para que el corredor
  // vea si el coach le está dando variedad real o siempre lo mismo.
  daysBack = daysBack || 30;
  const cutoff = Date.now() - daysBack*86400000;
  const qualityTypes = ['intervals','tempo','fartlek','hills','progression'];
  const counts = {};
  const consider = (weekStart, plan) => {
    if(!weekStart || !plan || !plan.length) return;
    const start = new Date(weekStart+'T00:00:00');
    if(isNaN(start.getTime())) return;
    plan.forEach((d,i)=>{
      if(d.status!=='done') return;
      const dt = new Date(start); dt.setDate(dt.getDate()+i);
      if(dt.getTime() < cutoff) return;
      if(!qualityTypes.includes(d.typeKey)) return;
      counts[d.typeKey] = (counts[d.typeKey]||0) + 1;
    });
  };
  (state.planHistory||[]).forEach(h => consider(h.weekStart, h.plan));
  consider(state.weekStart, state.plan);
  return counts;
}

/* ---- Récords personales ---- */
// Distancias estándar contra las que medimos marcas. Un run cuenta para una de estas
// solo si su distancia real está a menos del 6% de la distancia estándar -- así no
// confundimos una tirada larga cualquiera de 15.8km con un intento real de 15K.
const PR_DISTANCES = [
  {key:'5k', km:5},
  {key:'10k', km:10},
  {key:'15k', km:15},
  {key:'half', km:21.0975},
  {key:'marathon', km:42.195},
];
function nearestPRBucket(km){
  let best = null, bestDiff = Infinity;
  PR_DISTANCES.forEach(b=>{
    const diff = Math.abs(km-b.km)/b.km;
    if(diff < bestDiff){ bestDiff = diff; best = b; }
  });
  return (best && bestDiff <= 0.06) ? best : null;
}
// Para la "devolución" que se muestra en cada tarjeta del historial (para qué sirvió esa
// sesión). Cuando la carrera está vinculada a un día real del plan usamos su tipo real;
// si no (carga manual, importada de Strava sin vincular, o de una semana ya vieja donde
// el plan de ese momento no se conserva), la clasificamos por distancia/ritmo relativos
// al resto del historial -- no es una ciencia exacta, pero da una devolución razonable.
function runBenefitKey(r){
  const linkedDay = (state.plan||[]).find(d => d.linkedRunId === r.id);
  if(linkedDay && linkedDay.typeKey && linkedDay.typeKey !== 'rest') return linkedDay.typeKey;
  if(nearestPRBucket(r.distanceKm)) return 'race';
  const others = (state.runs||[]).filter(x => x.id!==r.id && x.distanceKm>0 && x.durationSec>0);
  if(!others.length) return 'easy';
  const avgDist = others.reduce((a,x)=>a+x.distanceKm,0)/others.length;
  const paceOf = x => (x.durationSec/60)/x.distanceKm;
  const avgPace = others.reduce((a,x)=>a+paceOf(x),0)/others.length;
  const thisPace = r.distanceKm>0.02 ? paceOf(r) : avgPace;
  if(r.distanceKm >= avgDist*1.4) return 'long';
  if(thisPace <= avgPace*0.92) return 'tempo';
  return 'easy';
}
function getPersonalRecords(excludeRunId){
  // Mejor tiempo registrado por distancia estándar. excludeRunId sirve para comparar
  // una carrera recién agregada contra "lo que había antes" y saber si es récord nuevo.
  const records = {};
  (state.runs||[]).forEach(r=>{
    if(excludeRunId!=null && String(r.id)===String(excludeRunId)) return;
    if(!r.distanceKm || !r.durationSec) return;
    const bucket = nearestPRBucket(r.distanceKm);
    if(!bucket) return;
    const cur = records[bucket.key];
    if(!cur || r.durationSec < cur.durationSec){
      records[bucket.key] = {distanceKm:r.distanceKm, durationSec:r.durationSec, runId:r.id, date:r.date};
    }
  });
  return records;
}
function checkNewPR(run){
  // Avisa por el chat cuando una carrera recién agregada (del reloj vía Strava, cargada
  // a mano, o grabada con la app) resulta ser una marca personal nueva para su distancia.
  if(!run || !run.distanceKm || !run.durationSec) return;
  const bucket = nearestPRBucket(run.distanceKm);
  if(!bucket) return;
  const prev = getPersonalRecords(run.id)[bucket.key];
  if(prev && prev.durationSec <= run.durationSec) return;
  state.chat.push({role:'coach', text: t('coach_new_pr_'+bucket.key, {time: fmtTime(run.durationSec)}), ts:Date.now()});
  renderChat();
  showToast(t('pr_toast_new', {label: t('pr_label_'+bucket.key), time: fmtTime(run.durationSec)}), 'success');
  celebrate();
  haptic(40);
}
/* ---- Logros (pantalla de hitos) ---- */
// Hitos de distancia total, cantidad de carreras y constancia (racha de semanas
// cumpliendo el plan). Todo se calcula al vuelo a partir de datos que ya existen
// (state.runs, state.bestStreakWeeks) -- nada nuevo que persistir salvo
// bestStreakWeeks, que ya se actualiza en weeklyRecap().
const ACH_DISTANCE_KM = [50, 100, 250, 500, 1000, 2000];
const ACH_RUN_COUNT = [10, 25, 50, 100, 250];
const ACH_STREAK_WEEKS = [2, 4, 8, 12, 26];
function getAchievementSections(){
  const totalKm = (state.runs||[]).reduce((a,r)=>a+r.distanceKm,0);
  const totalRuns = (state.runs||[]).length;
  const bestStreak = Math.max(state.bestStreakWeeks||0, state.streakWeeks||0);

  const distanceBadges = ACH_DISTANCE_KM.map(km=>{
    const achieved = totalKm >= km;
    return {achieved, label: `${fmtDist(km,0)} ${distUnit()}`,
      progressText: achieved ? null : t('ach_locked_distance_left', {n: `${fmtDist(km-totalKm,0)} ${distUnit()}`})};
  });
  const runBadges = ACH_RUN_COUNT.map(n=>{
    const achieved = totalRuns >= n;
    return {achieved, label: t('ach_badge_runs_label', {n}),
      progressText: achieved ? null : t('ach_locked_runs_left', {n: n-totalRuns})};
  });
  const streakBadges = ACH_STREAK_WEEKS.map(n=>{
    const achieved = bestStreak >= n;
    return {achieved, label: t('ach_badge_streak_label', {n}),
      progressText: achieved ? null : t('ach_locked_streak_left', {n: n-bestStreak})};
  });
  // Los récords personales también cuentan como logros (una marca por distancia estándar
  // cuenta como desbloqueada), aunque se muestran en su propia tarjeta -- con el tiempo
  // de la marca -- en vez de la grilla genérica de "Desbloqueado" (ver renderPersonalRecordsCard).
  const prRecords = getPersonalRecords();
  const recordBadges = PR_DISTANCES.map(b=>({achieved: !!prRecords[b.key]}));
  const allBadges = [...distanceBadges, ...runBadges, ...streakBadges, ...recordBadges];
  return {distanceBadges, runBadges, streakBadges, unlockedCount: allBadges.filter(b=>b.achieved).length, totalCount: allBadges.length};
}
function renderAchievementBadgeGrid(badges){
  return `<div class="pr-medal-grid">${badges.map(b=>{
    if(b.achieved) return `<div class="pr-medal achieved"><span class="icon-sq">${ICONS.medal}</span><span class="pr-medal-label">${b.label}</span><span class="pr-medal-time">${t('ach_unlocked_tag')}</span></div>`;
    return `<div class="pr-medal"><span class="icon-sq">${ICONS.medal}</span><span class="pr-medal-label">${b.label}</span><span class="pr-medal-locked">${b.progressText}</span></div>`;
  }).join('')}</div>`;
}
function renderPersonalRecordsCard(){
  // Vivía en Historial como una tarjeta aparte; ahora se muestra acá, en Logros, junto
  // con el resto de los hitos del corredor (mismo estilo de medalla: iluminada con el
  // tiempo si ya hay marca para esa distancia estándar, apagada con candado si no).
  const prRecords = getPersonalRecords();
  return `<div class="card"><h3>${t('hist_pr_title')}</h3><div class="pr-medal-grid">${PR_DISTANCES.map(b=>{
    const rec = prRecords[b.key];
    if(rec) return `<div class="pr-medal achieved"><span class="icon-sq">${ICONS.medal}</span><span class="pr-medal-label">${t('pr_label_'+b.key)}</span><span class="pr-medal-time">${fmtTime(rec.durationSec)}</span></div>`;
    return `<div class="pr-medal"><span class="icon-sq">${ICONS.medal}</span><span class="pr-medal-label">${t('pr_label_'+b.key)}</span><span class="pr-medal-locked">${t('pr_medal_locked')}</span></div>`;
  }).join('')}</div></div>`;
}
function openAchievements(){
  const {distanceBadges, runBadges, streakBadges, unlockedCount, totalCount} = getAchievementSections();
  // Barra de progreso general (reusa .ob-progress/.ob-progress-fill, el mismo componente
  // visual que ya usaba el onboarding) -- antes solo estaba el texto "X de Y logros
  // desbloqueados"; de un vistazo ahora se ve además cuánto falta.
  const pct = totalCount ? Math.round((unlockedCount/totalCount)*100) : 0;
  document.getElementById('achievements-content').innerHTML = `
    <h2 class="display" style="font-size:20px; margin-bottom:2px;">${t('ach_title')}</h2>
    <p class="muted" style="margin:0 0 4px;">${t('ach_subtitle')}</p>
    <p style="margin:0 0 8px; font-weight:800; color:var(--hivis-text); font-size:13px;">${t('ach_unlocked_count', {unlocked:unlockedCount, total:totalCount})}</p>
    <div class="ob-progress" style="margin-bottom:16px;"><div class="ob-progress-fill" style="width:${pct}%;"></div></div>
    ${renderPersonalRecordsCard()}
    <div class="card"><h3>${t('ach_section_distance')}</h3>${renderAchievementBadgeGrid(distanceBadges)}</div>
    <div class="card"><h3>${t('ach_section_runs')}</h3>${renderAchievementBadgeGrid(runBadges)}</div>
    <div class="card"><h3>${t('ach_section_streak')}</h3>${renderAchievementBadgeGrid(streakBadges)}</div>
  `;
  document.getElementById('achievements-modal').classList.add('overlay-open');
}
function closeAchievements(){
  document.getElementById('achievements-modal').classList.remove('overlay-open');
}

/* ================= SOCIAL: usernames + seguir amigos + feed + likes =================
   Todo esto vive en tablas nuevas y chicas de Supabase (sql/social.sql), separadas de
   app_state a propósito: app_state es un blob único por usuario con TODO (perfil, plan,
   carreras con GPS y frecuencia cardíaca) -- exponerlo a otros usuarios, aunque sea un
   campo, sería un lío de privacidad. Estas tablas nuevas guardan a propósito lo mínimo
   para que la parte social funcione: un nombre de usuario, quién sigue a quién, y una
   versión resumida de cada carrera que el usuario decide compartir (distancia, tiempo,
   fecha -- nunca la ruta ni la frecuencia cardíaca). Compartir una carrera es una acción
   explícita (botón "Compartir con amigos" en el detalle de esa carrera) -- no se comparte
   nada solo, ni automáticamente al agregar una carrera nueva. */
async function loadMyUsername(){
  if(!currentUserId) return;
  try{
    const { data, error } = await supabaseClient.from('usernames').select('username').eq('user_id', currentUserId).maybeSingle();
    if(!error && data) myUsername = data.username;
  }catch(e){ console.error('loadMyUsername error', e); }
}
async function saveUsername(){
  const input = document.getElementById('social-username-input');
  if(!input) return;
  const raw = input.value.trim().toLowerCase();
  if(!/^[a-z0-9_]{3,20}$/.test(raw)){ showToast(t('social_username_invalid'), 'error'); return; }
  try{
    const { error } = await supabaseClient.from('usernames').upsert({ user_id: currentUserId, username: raw });
    if(error){
      if(error.code === '23505') showToast(t('social_username_taken'), 'error');
      else{ console.error('saveUsername error', error); showToast(t('social_generic_error'), 'error'); }
      return;
    }
    myUsername = raw;
    showToast(t('social_username_saved'), 'success');
    renderSocialSection();
  }catch(e){
    console.error('saveUsername error', e);
    showToast(t('social_generic_error'), 'error');
  }
}
async function followByUsername(){
  const input = document.getElementById('social-follow-input');
  if(!input) return;
  const raw = input.value.trim().toLowerCase();
  if(!raw) return;
  try{
    const { data: found, error: findErr } = await supabaseClient.from('usernames').select('user_id').eq('username', raw).maybeSingle();
    if(findErr || !found){ showToast(t('social_user_not_found'), 'error'); return; }
    if(String(found.user_id) === String(currentUserId)){ showToast(t('social_cant_follow_self'), 'error'); return; }
    const { error: insErr } = await supabaseClient.from('follows').insert({ follower_id: currentUserId, followee_id: found.user_id });
    if(insErr && insErr.code !== '23505'){ console.error('followByUsername error', insErr); showToast(t('social_generic_error'), 'error'); return; }
    showToast(insErr ? t('social_already_following') : t('social_now_following', {username: raw}), insErr ? 'info' : 'success');
    input.value = '';
    renderSocialFollowingList();
  }catch(e){
    console.error('followByUsername error', e);
    showToast(t('social_generic_error'), 'error');
  }
}
async function unfollowUser(userId){
  try{
    await supabaseClient.from('follows').delete().eq('follower_id', currentUserId).eq('followee_id', userId);
    renderSocialFollowingList();
  }catch(e){ console.error('unfollowUser error', e); showToast(t('social_generic_error'), 'error'); }
}
async function renderSocialFollowingList(){
  const el = document.getElementById('social-following-list');
  if(!el) return;
  try{
    const { data, error } = await supabaseClient.from('follows').select('followee_id, usernames(username)').eq('follower_id', currentUserId).order('created_at', {ascending:false});
    if(error || !data || !data.length){
      el.innerHTML = `<p class="muted" style="margin:10px 0 0; font-size:12.5px;">${t('social_following_empty')}</p>`;
      return;
    }
    el.innerHTML = data.map(f=>`<div style="display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-top:1px solid var(--asphalt-3);"><span>@${escapeHtml(f.usernames ? f.usernames.username : '?')}</span><button class="small-link" onclick="unfollowUser('${f.followee_id}')">${t('social_unfollow')}</button></div>`).join('');
  }catch(e){ console.error('renderSocialFollowingList error', e); }
}
function renderSocialSection(){
  const el = document.getElementById('social-section-body');
  if(!el) return;
  if(!myUsername){
    el.innerHTML = `
      <p class="muted" style="margin:0 0 10px; font-size:12.5px;">${t('social_username_intro')}</p>
      <div class="field" style="margin-top:0;"><input type="text" id="social-username-input" maxlength="20" placeholder="${t('social_username_ph')}"></div>
      <button class="btn btn-outline btn-sm" style="width:100%; margin-top:8px;" onclick="saveUsername()">${t('social_username_save_btn')}</button>
    `;
  }else{
    el.innerHTML = `
      <p style="margin:0 0 12px; font-weight:800;">@${escapeHtml(myUsername)}</p>
      <div class="field" style="margin-top:0;">
        <label>${t('social_follow_label')}</label>
        <div style="display:flex; gap:8px;">
          <input type="text" id="social-follow-input" maxlength="20" placeholder="${t('social_follow_ph')}" style="flex:1;">
          <button class="btn btn-outline btn-sm" onclick="followByUsername()">${t('social_follow_btn')}</button>
        </div>
      </div>
      <div id="social-following-list"></div>
      <button class="btn btn-outline btn-sm" style="width:100%; margin-top:14px;" onclick="openSocialFeed()">${t('social_open_feed_btn')}</button>
    `;
    renderSocialFollowingList();
  }
}
async function openSocialFeed(){
  const el = document.getElementById('social-feed-content');
  const title = `<h2 class="display" style="font-size:20px; margin-bottom:16px;">${t('social_feed_title')}</h2>`;
  el.innerHTML = title + `<p class="muted">${t('social_feed_loading')}</p>`;
  document.getElementById('social-feed-modal').style.display = 'block';
  try{
    const { data, error } = await supabaseClient.from('run_feed')
      .select('id, distance_km, duration_sec, run_date, usernames(username), run_likes(user_id)')
      .order('run_date', {ascending:false}).limit(50);
    if(error) throw error;
    if(!data || !data.length){ el.innerHTML = title + `<p class="muted">${t('social_feed_empty')}</p>`; return; }
    el.innerHTML = title + data.map(r=>{
      const likedByMe = (r.run_likes||[]).some(l=>String(l.user_id)===String(currentUserId));
      const likeCount = (r.run_likes||[]).length;
      const dateStr = new Date(r.run_date+'T00:00:00').toLocaleDateString(LOCALE_MAP[lang], {day:'numeric', month:'short'});
      const paceMin = r.distance_km>0 ? (r.duration_sec/60)/r.distance_km : 0;
      return `<div class="card" style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:baseline;">
          <span style="font-weight:800;">@${escapeHtml(r.usernames ? r.usernames.username : '?')}</span>
          <span class="muted" style="font-size:12px;">${dateStr}</span>
        </div>
        <div style="display:flex; gap:20px; margin-top:10px;">
          <div><div class="mono" style="font-weight:800;">${fmtDist(r.distance_km,2)} ${distUnit()}</div></div>
          <div><div class="mono" style="font-weight:800;">${fmtTime(r.duration_sec)}</div></div>
          <div><div class="mono" style="font-weight:800;">${fmtPace(paceMin)}/${distUnit()}</div></div>
        </div>
        <button class="small-link" style="margin-top:12px; display:flex; align-items:center; gap:6px; ${likedByMe?'color:var(--hivis-text);':''}" onclick="toggleRunLike('${r.id}', ${likedByMe})">
          <span class="icon-sq" style="width:15px; height:15px;">${likedByMe ? ICONS.heartFilled : ICONS.heart}</span>${likedByMe ? t('social_liked') : t('social_like')}${likeCount>0 ? ' · '+likeCount : ''}
        </button>
      </div>`;
    }).join('');
  }catch(e){
    console.error('openSocialFeed error', e);
    el.innerHTML = title + `<p class="muted">${t('social_generic_error')}</p>`;
  }
}
function closeSocialFeed(){
  document.getElementById('social-feed-modal').style.display = 'none';
}
async function toggleRunLike(runFeedId, currentlyLiked){
  try{
    if(currentlyLiked) await supabaseClient.from('run_likes').delete().eq('run_feed_id', runFeedId).eq('user_id', currentUserId);
    else await supabaseClient.from('run_likes').insert({ run_feed_id: runFeedId, user_id: currentUserId });
    openSocialFeed();
  }catch(e){ console.error('toggleRunLike error', e); showToast(t('social_generic_error'), 'error'); }
}
// Compartir una carrera puntual al feed de amigos -- acción explícita desde el detalle
// de esa carrera (junto al botón de exportar GPX). Solo manda distancia/tiempo/fecha,
// nunca la ruta GPS ni la frecuencia cardíaca (esas columnas ni existen en run_feed).
async function shareRunToFeed(runId){
  if(!myUsername){ showToast(t('social_need_username_first'), 'error'); return; }
  const r = state.runs.find(x => String(x.id) === String(runId));
  if(!r || !r.distanceKm || !r.durationSec) return;
  try{
    const { error } = await supabaseClient.from('run_feed').insert({
      user_id: currentUserId,
      run_id: String(r.id),
      distance_km: r.distanceKm,
      duration_sec: r.durationSec,
      run_date: localDateISO(r.date),
    });
    if(error){
      if(error.code === '23505') showToast(t('social_already_shared'), 'info');
      else{ console.error('shareRunToFeed error', error); showToast(t('social_generic_error'), 'error'); }
      return;
    }
    showToast(t('social_share_success'), 'success');
  }catch(e){
    console.error('shareRunToFeed error', e);
    showToast(t('social_generic_error'), 'error');
  }
}
function predictRaceTime(targetKm){
  // Estima el tiempo objetivo para `targetKm` con la fórmula de Riegel (T2 = T1 *
  // (D2/D1)^1.06), usando como referencia la marca personal más cercana en distancia
  // (cuanto más parecidas son las distancias, más confiable es la proyección).
  const records = Object.values(getPersonalRecords());
  if(!records.length) return null;
  let best = null, bestDiff = Infinity;
  records.forEach(rec=>{
    const diff = Math.abs(Math.log(rec.distanceKm/targetKm));
    if(diff < bestDiff){ bestDiff = diff; best = rec; }
  });
  if(!best) return null;
  const predictedSec = best.durationSec * Math.pow(targetKm/best.distanceKm, 1.06);
  return { predictedSec, refDistanceKm: best.distanceKm, refDurationSec: best.durationSec };
}
function getGoalRaceKm(){
  return {'5k':5, '10k':10, '15k':15, '21k':21.0975, '42k':42.195}[state.profile.goal] || null;
}
/* ================= CALCULADORA DE RITMO DE CARRERA =================
   Dada una distancia y un tiempo objetivo, arma el plan de ritmo km a km del
   día de la carrera -- "parejo" (mismo ritmo todo el recorrido) o "progresivo"
   (arranca un poco más lento y termina más rápido, el clásico negative split
   que además es más seguro que salir demasiado rápido y sufrir los últimos km).
   Se abre desde la tarjeta de "Próximos eventos" de Perfil, y si hay marcas
   personales cargadas se sugiere un tiempo con la misma fórmula de Riegel que
   ya usa el bloque de "ritmo objetivo estimado" de esa misma tarjeta. */
function parseHMS(str){
  // Acepta "mm:ss" o "h:mm:ss" (con 1 o 2 dígitos en cada parte) -- lo que
  // el usuario probablemente tipee a mano en vez de forzarlo a un formato
  // rígido con inputs separados de horas/minutos/segundos.
  const parts = String(str||'').trim().split(':').map(p=>p.trim());
  if(parts.length<2 || parts.length>3 || parts.some(p=>p==='' || isNaN(p))) return null;
  const nums = parts.map(Number);
  if(nums.some(n=>n<0)) return null;
  let sec;
  if(nums.length===2) sec = nums[0]*60 + nums[1];
  else sec = nums[0]*3600 + nums[1]*60 + nums[2];
  return sec>0 ? sec : null;
}
/* Selector de horas/minutos/segundos de la calculadora de ritmo: 3 <select> en vez de
   un campo de texto libre (antes había que tipear "1:45:00" a mano). Las opciones se
   generan una sola vez (quedan vacías la primera vez que se abre el modal). */
function ensurePaceCalcTimeOptions(){
  const hSel = document.getElementById('pc-time-h');
  if(hSel.options.length) return;
  for(let h=0; h<=9; h++) hSel.innerHTML += `<option value="${h}">${h}</option>`;
  const pad2 = n => String(n).padStart(2,'0');
  let mmss = '';
  for(let n=0; n<60; n++) mmss += `<option value="${n}">${pad2(n)}</option>`;
  document.getElementById('pc-time-m').innerHTML = mmss;
  document.getElementById('pc-time-s').innerHTML = mmss;
}
function setPaceCalcTimeSec(totalSec){
  const s = Math.max(0, Math.round(totalSec||0));
  document.getElementById('pc-time-h').value = Math.floor(s/3600);
  document.getElementById('pc-time-m').value = Math.floor((s%3600)/60);
  document.getElementById('pc-time-s').value = s%60;
}
function getPaceCalcTimeSec(){
  const h = parseInt(document.getElementById('pc-time-h').value, 10) || 0;
  const m = parseInt(document.getElementById('pc-time-m').value, 10) || 0;
  const s = parseInt(document.getElementById('pc-time-s').value, 10) || 0;
  const total = h*3600 + m*60 + s;
  return total>0 ? total : null;
}
function paceCalcCurrentKm(){
  const sel = document.getElementById('pc-distance');
  if(!sel) return null;
  if(sel.value==='custom'){
    const km = parseFloat(document.getElementById('pc-custom-km').value);
    return km>0 ? km : null;
  }
  return parseFloat(sel.value);
}
function onPaceCalcDistanceChange(){
  const isCustom = document.getElementById('pc-distance').value==='custom';
  document.getElementById('pc-custom-km-field').style.display = isCustom ? 'block' : 'none';
  renderPaceCalcResults();
}
function openPaceCalcModal(){
  const goalKm = (state.event && state.event.distanceKm>0) ? state.event.distanceKm : getGoalRaceKm();
  const sel = document.getElementById('pc-distance');
  const knownOptions = ['5','10','15','21.0975','42.195'];
  if(goalKm && knownOptions.includes(String(goalKm))){
    sel.value = String(goalKm);
    document.getElementById('pc-custom-km-field').style.display = 'none';
  } else if(goalKm){
    sel.value = 'custom';
    document.getElementById('pc-custom-km').value = goalKm;
    document.getElementById('pc-custom-km-field').style.display = 'block';
  } else {
    sel.value = '10';
    document.getElementById('pc-custom-km-field').style.display = 'none';
  }
  ensurePaceCalcTimeOptions();
  const km = paceCalcCurrentKm();
  const prediction = km ? predictRaceTime(km) : null;
  setPaceCalcTimeSec(prediction ? Math.round(prediction.predictedSec) : 0);
  document.getElementById('pc-strategy').value = 'even';
  document.getElementById('pace-calc-modal').style.display = 'block';
  renderPaceCalcResults();
}
function closePaceCalcModal(){ document.getElementById('pace-calc-modal').style.display = 'none'; }
function renderPaceCalcResults(){
  const resultsEl = document.getElementById('pc-results');
  if(!resultsEl) return;
  const km = paceCalcCurrentKm();
  const totalSec = getPaceCalcTimeSec();
  if(!km || !totalSec){
    resultsEl.innerHTML = `<p class="muted" style="margin-top:16px; font-size:13px;">${t('pace_calc_need_input')}</p>`;
    return;
  }
  const strategy = document.getElementById('pc-strategy').value;
  const avgPaceMin = (totalSec/60)/km;
  const numFullKm = Math.floor(km);
  const remainderKm = km - numFullKm;
  const segments = []; // {label, distKm}
  for(let i=1;i<=numFullKm;i++) segments.push({label:String(i), distKm:1});
  if(remainderKm>0.005) segments.push({label:fmtDist(km,2), distKm:remainderKm});
  // Negative split simple: el ritmo de cada tramo va del +4% al -4% del promedio,
  // de forma lineal a lo largo de la carrera. Con distancias exactas (5, 10, 15km)
  // esos factores ya promedian justo 1 y el tiempo total cae exacto -- pero
  // 21.0975/42.195km dejan un último tramo más corto (la "fracción" de km), que
  // pesa menos que los demás y corre el promedio ponderado unos segundos. Para
  // que el tiempo acumulado de la última fila SIEMPRE caiga en el objetivo exacto
  // (no unos segundos de más/menos), se normalizan los factores dividiendo por su
  // propio promedio ponderado por distancia antes de aplicarlos.
  const rawFactor = (i)=> (strategy==='negative' && segments.length>1) ? (1.04 - 0.08*(i/(segments.length-1))) : 1;
  const weightedMeanFactor = segments.reduce((sum, seg, i)=> sum + rawFactor(i)*seg.distKm, 0) / km;
  let cumSec = 0;
  const rows = segments.map((seg, i)=>{
    const segPaceMin = avgPaceMin * (rawFactor(i)/weightedMeanFactor);
    const segSec = segPaceMin*60*seg.distKm;
    cumSec += segSec;
    return `<tr><td>${seg.label}</td><td class="mono">${fmtTime(Math.round(cumSec))}</td><td class="mono">${fmtPace(segPaceMin)}</td></tr>`;
  });
  resultsEl.innerHTML = `
    <div style="margin-top:18px; padding-top:16px; border-top:1px solid var(--asphalt-3);">
      <p class="muted" style="margin:0 0 4px; font-size:12px;">${t('pace_calc_avg_pace_label')}</p>
      <p class="mono" style="font-size:22px; font-weight:800; color:var(--hivis); margin:0 0 14px;">${fmtPace(avgPaceMin)} /${distUnit()}</p>
      <div style="max-height:260px; overflow-y:auto;">
        <table class="rd-seg-table">
          <thead><tr><th>${t('pace_calc_km_col')}</th><th>${t('pace_calc_cum_col')}</th><th>${t('pace_calc_pace_col')}</th></tr></thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>
    </div>`;
}
// Antes, si la sincronización con Strava fallaba (token revocado, la API de Strava
// caída, lo que sea) o simplemente dejaba de correr, no había NINGÚN aviso -- el cron
// atrapaba el error en un catch y no quedaba registrado en ningún lado (ver el
// comentario largo en set_strava_sync_status.sql). El corredor solo se enteraba el día
// que notaba "che, no me aparecen las carreras de esta semana" -- para entonces ya
// venía arrastrando el problema un tiempo. Este cartel usa app_state.data.stravaSync
// (que ahora sí se guarda en cada intento, exitoso o no) para avisar apenas se detecta
// -- ya sea un error puntual, o simplemente que hace demasiado que no se actualiza
// (36 horas: de sobra para el cron de cada 15', así que si pasó tanto tiempo es señal
// real de que algo viene fallando, no solo mala suerte de timing).
// Devuelve null si no hay nada para avisar, o {severity, title, detail} -- 'error' si el
// intento más reciente falló (detail trae el mensaje tal cual, mismo criterio que ya usa
// syncTodayNow() al mostrarlo en un toast), 'stale' si hace 36+ horas que no hay una
// sincronización EXITOSA (de sobra para el cron de cada 15', así que si pasó tanto tiempo
// es señal real de que algo viene fallando, no solo mala suerte de timing). Se usa tanto
// en el cartel de Historial (buildStravaSyncBanner) como en la nota corta de Perfil
// (updateStravaStatusDisplay), para no repetir el mismo cálculo dos veces.
function getStravaSyncIssue(){
  const sync = state.stravaSync;
  if(!sync) return null; // nunca se conectó Strava, o nunca corrió ningún intento todavía
  if(sync.lastError) return {severity:'error', title:t('hist_strava_sync_error_title'), detail:sync.lastError};
  if(sync.lastSuccessAt){
    const hoursSince = (Date.now() - new Date(sync.lastSuccessAt).getTime()) / 3600000;
    if(hoursSince >= 36){
      const days = Math.floor(hoursSince/24);
      const title = days>=1 ? t('hist_strava_stale_days', {days}) : t('hist_strava_stale_1day');
      return {severity:'stale', title, detail:null};
    }
  }
  return null;
}
// Antes, si la sincronización con Strava fallaba (token revocado, la API de Strava
// caída, lo que sea) o simplemente dejaba de correr, no había NINGÚN aviso -- el cron
// atrapaba el error en un catch y no quedaba registrado en ningún lado (ver el
// comentario largo en set_strava_sync_status.sql). El corredor solo se enteraba el día
// que notaba "che, no me aparecen las carreras de esta semana" -- para entonces ya
// venía arrastrando el problema un tiempo. Este cartel avisa apenas se detecta.
function buildStravaSyncBanner(){
  const issue = getStravaSyncIssue();
  if(!issue) return '';
  const color = issue.severity==='error' ? 'var(--danger)' : 'var(--clay)';
  const bg = issue.severity==='error' ? 'var(--danger-dim)' : 'var(--clay-dim)';
  const detailHtml = issue.detail ? `<p class="muted" style="margin:4px 0 10px; font-size:12.5px;">${escapeHtml(issue.detail)}</p>` : '';
  return `<div class="card" style="border-color:${color}; background:${bg};">
    <div style="display:flex; align-items:flex-start; gap:10px;">
      <span class="icon-sq" style="width:20px; height:20px; color:${color}; flex-shrink:0; margin-top:1px;">${ICONS.warn}</span>
      <div style="min-width:0; flex:1;">
        <p style="margin:0; font-size:13.5px; font-weight:700; color:${color};">${issue.title}</p>
        ${detailHtml}
        <button class="btn btn-outline btn-sm" style="margin-top:${issue.detail?'0':'10px'};" onclick="syncTodayNow()"><span class="icon-sq" style="width:14px; height:14px;">${ICONS.refresh}</span> ${t('plan_sync_button')}</button>
      </div>
    </div>
  </div>`;
}
function renderHistory(){
  const el = document.getElementById('history-list');
  const stravaSyncCard = buildStravaSyncBanner();
  const weekRuns = (state.runs||[]).filter(r => getMondayISO(new Date(r.date)) === state.weekStart);
  document.getElementById('home-runs-count').textContent = weekRuns.length;
  const tr = computeTrends();
  const daily = computeDailyTrend(14);
  const maxKmDay = Math.max(...daily.map(x=>x.km), 1);
  const trendsCard = `<div class="card">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <h3 style="margin:0;" data-i18n="hist_trends">${t('hist_trends')}</h3>
      <button onclick="shareWeeklyRecapImage()" style="background:none; border:1.5px solid var(--asphalt-4); color:var(--hivis); font-size:12px; cursor:pointer; padding:5px 9px; border-radius:6px; display:flex; align-items:center; gap:5px; font-weight:700; flex-shrink:0;">${t('hist_share')}</button>
    </div>
    <div class="stat-row-divided">
      <div class="stat-cell"><div class="n">${fmtDist(tr.totalKm,0)}</div><div class="l">${t('hist_total_km')} (${distUnit()})</div></div>
      <div class="stat-cell"><div class="n">${tr.totalRuns}</div><div class="l">${t('hist_total_runs')}</div></div>
    </div>
    <div class="trend-bars" id="hist-trend-bars" style="margin-top:16px;">${daily.map((x,i)=>{
      const h = x.km>0 ? Math.max(6, Math.round((x.km/maxKmDay)*70)) : (x.planned ? 4 : 2);
      const cls = (x.km>0 ? '' : (x.planned ? 'trend-planned' : 'trend-rest')) + (i===daily.length-1 ? ' trend-today' : '');
      return `<div class="trend-col"><div class="trend-stroke ${cls}" data-h="${h}" style="height:0px; transition-delay:${i*30}ms;"></div><div class="trend-lbl">${x.day}</div></div>`;
    }).join('')}</div>
  </div>`;
  const qualityCounts = getQualitySessionBreakdown(30);
  const qualityEntries = Object.entries(qualityCounts).filter(([,c])=>c>0).sort((a,b)=>b[1]-a[1]);
  const maxQualityCount = qualityEntries.length ? qualityEntries[0][1] : 0;
  const mixCard = qualityEntries.length ? `<div class="card">
    <h3>${t('hist_quality_mix_title')}</h3>
    <p class="muted" style="margin:0 0 12px; font-size:12px;">${t('hist_quality_mix_subtitle')}</p>
    <div class="type-breakdown-list">${qualityEntries.map(([key,count])=>`
      <div class="type-breakdown-row">
        <span class="type-breakdown-label">${t('type_'+key)}</span>
        <div class="type-breakdown-bar-wrap"><div class="type-breakdown-bar" style="width:${Math.round((count/maxQualityCount)*100)}%"></div></div>
        <span class="type-breakdown-count">${count}</span>
      </div>`).join('')}</div>
  </div>` : '';
  // Los récords personales se muestran ahora en Logros (Perfil), junto con el resto de
  // los hitos del corredor -- ver renderPersonalRecordsCard() y openAchievements().
  // El icono generico de "historial" (reloj+flecha) no decia nada de running -- se
  // reemplaza por el mismo perfil de elevacion que ya es la firma visual de la app
  // (hoy usado como separador en Perfil), agrandado como pieza central acá: "todavia
  // no recorriste este camino" en vez de un ícono de reloj cualquiera.
  if(!state.runs || state.runs.length===0){ el.innerHTML = stravaSyncCard + trendsCard + mixCard + `<div class="card" style="text-align:center; padding:32px 18px;"><svg viewBox="0 0 60 14" style="width:90px; height:21px; margin:0 auto 14px; display:block; opacity:.7;"><polyline points="0,12 10,12 16,4 22,10 28,2 34,9 40,12 60,12" fill="none" stroke="#C06A2E" stroke-width="1.6"/></svg><p class="muted" style="margin:0;">${t('hist_empty')}</p></div>`; animateHistTrendBars(); return; }
  // Buscador simple + encabezados de mes -- con varios meses de historial cargado, una
  // lista plana se vuelve incómoda de recorrer. El buscador filtra por lo que se ve en
  // cada tarjeta (fecha, zapatilla, "manual"/Strava); los encabezados de mes se insertan
  // solos al detectar un cambio de mes en la lista ya ordenada de más nueva a más vieja.
  const searchEl = document.getElementById('hist-search');
  const query = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const allRunsDesc = state.runs.slice().reverse();
  const filteredRuns = !query ? allRunsDesc : allRunsDesc.filter(r=>{
    const shoe = state.shoes.find(s=>String(s.id)===String(r.shoeId));
    const longDateStr = new Date(r.date).toLocaleDateString(LOCALE_MAP[lang], {weekday:'long', day:'numeric', month:'long', year:'numeric'});
    const haystack = [longDateStr, shoe?shoe.name:'', r.manual?t('hist_manual_tag'):'', r.source==='strava'?'strava':''].join(' ').toLowerCase();
    return haystack.includes(query);
  });
  if(query && !filteredRuns.length){
    el.innerHTML = stravaSyncCard + trendsCard + mixCard + `<div class="card" style="text-align:center; padding:32px 18px;"><p class="muted" style="margin:0;">${t('hist_search_empty')}</p></div>`;
    animateHistTrendBars();
    return;
  }
  let lastMonthKey = null;
  el.innerHTML = stravaSyncCard + trendsCard + mixCard + filteredRuns.map(r=>{
    const shoe = state.shoes.find(s=>String(s.id)===String(r.shoeId));
    const paceMin = r.distanceKm>0.02 ? (r.durationSec/60)/r.distanceKm : 0;
    const avgHr = r.avgHr || (r.hrLog && r.hrLog.length ? Math.round(r.hrLog.reduce((a,h)=>a+h.bpm,0)/r.hrLog.length) : null);
    const cal = r.calories || Math.round((state.profile.weight||70)*r.distanceKm*1.036);
    const hasMap = !!(r.points && r.points.length>1);
    const dateStr = new Date(r.date).toLocaleDateString(LOCALE_MAP[lang], {weekday:'short', day:'numeric', month:'short'});
    const monthKey = new Date(r.date).toLocaleDateString(LOCALE_MAP[lang], {month:'long', year:'numeric'});
    let monthHeader = '';
    if(monthKey !== lastMonthKey){
      monthHeader = `<div class="hist-month-header" style="margin:${lastMonthKey?'22px':'2px'} 2px 8px; font-size:12.5px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; color:var(--mist-dim);">${monthKey}</div>`;
      lastMonthKey = monthKey;
    }
    return `${monthHeader}<div class="swipe-item" data-swipe-id="${r.id}">
      <div class="swipe-action-delete" role="button" tabindex="0" aria-label="${t('aria_delete')}" onclick="deleteRun('${r.id}')"><span class="icon-sq" style="width:20px; height:20px;">${ICONS.trash}</span></div>
      <div class="card hist-card swipe-content" onclick="openRunDetail('${r.id}')" style="cursor:pointer;">
        <div class="hist-top"><span style="font-weight:700;">${dateStr}</span>${hasMap ? '' : `<span class="hist-date">${r.manual? `<span class="tag tag-asfalto" style="margin-right:6px;">${t('hist_manual_tag')}</span>`:''}${r.source==='strava'? `<span class="tag tag-asfalto" style="margin-right:6px;">Strava</span>`:''}${fmtTime(r.durationSec)}</span>`}</div>
        ${hasMap ? `<div class="hist-map" id="hist-map-${r.id}"><div class="hist-map-badge">${r.manual? `<span class="tag tag-asfalto">${t('hist_manual_tag')}</span>`:''}${r.source==='strava'? `<span class="tag tag-asfalto">Strava</span>`:''}<span class="hist-map-duration">${fmtTime(r.durationSec)}</span></div></div>` : ''}
        <div class="stat-row-divided">
          <div class="stat-cell"><div class="n">${fmtDist(r.distanceKm)}</div><div class="l">${distUnit()}</div></div>
          <div class="stat-cell"><div class="n">${fmtPace(paceMin)}</div><div class="l">${t('run_pace_word')}</div></div>
          <div class="stat-cell"><div class="n">${avgHr||'—'}</div><div class="l">${t('hist_avg_hr')}</div></div>
          <div class="stat-cell"><div class="n">${cal}</div><div class="l">${t('run_calories')}</div></div>
        </div>
        <p class="muted" style="margin-top:10px; font-size:12.5px;">${t('hist_benefit_'+runBenefitKey(r))}</p>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; gap:8px;">
          <p class="muted" style="margin:0;">${t('hist_shoe')}: ${shoe? escapeHtml(shoe.name) : t('hist_no_shoe')}</p>
          <button onclick="event.stopPropagation(); shareRunImage('${r.id}')" style="background:none; border:1.5px solid var(--asphalt-4); color:var(--hivis); font-size:12px; cursor:pointer; padding:5px 9px; border-radius:6px; display:flex; align-items:center; gap:5px; font-weight:700; flex-shrink:0;">${t('hist_share')}</button>
        </div>
      </div>
    </div>`;
  }).join('');
  historyMaps.forEach(m=>m.remove());
  historyMaps = [];
  (state.runs||[]).filter(r=>r.points && r.points.length>1).forEach(r=>{
    const el = document.getElementById('hist-map-'+r.id);
    if(!el) return;
    const map = L.map(el, {zoomControl:false, attributionControl:false, dragging:false, scrollWheelZoom:false, doubleClickZoom:false, touchZoom:false, boxZoom:false, keyboard:false});
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=cb1_2i8k_1_882919874396f1a734cae151', {maxZoom:20}).addTo(map);
    const latlngs = r.points.map(p=>[p.lat,p.lon]);
    const poly = L.polyline(latlngs, {color:'#0B5D2E', weight:3, lineCap:'round', lineJoin:'round'}).addTo(map);
    map.fitBounds(poly.getBounds(), {padding:[10,10]});
    historyMaps.push(map);
  });
  animateHistTrendBars();
}
function animateHistTrendBars(){
  ['hist-trend-bars'].forEach(id=>{
    const barsEl = document.getElementById(id);
    if(!barsEl) return;
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        barsEl.querySelectorAll('.trend-stroke[data-h]').forEach(el=>{ el.style.height = el.dataset.h+'px'; });
      });
    });
  });
}

let detailMap = null;
let historyMaps = [];
function analyzeSplitPacing(splits){
  // Compara el ritmo promedio de la primera mitad de la carrera contra la segunda para
  // detectar si se corrió parejo, acelerando (negative split, buena señal) o
  // desacelerando (positive split -- salir muy rápido y pagarlo después). Solo tiene
  // sentido con unos cuantos parciales, así que lo salteamos en carreras muy cortas.
  if(!splits || splits.length < 4) return null;
  const mid = Math.floor(splits.length/2);
  const avg = arr => arr.reduce((s,x)=>s+x.paceMin,0)/arr.length;
  const p1 = avg(splits.slice(0, mid));
  const p2 = avg(splits.slice(mid));
  const diffPct = (p2 - p1) / p1; // positivo = mas lento en la segunda mitad
  let kind;
  if(diffPct <= -0.02) kind = 'negative';
  else if(diffPct >= 0.05) kind = 'positive_strong';
  else if(diffPct >= 0.02) kind = 'positive_mild';
  else kind = 'even';
  return { kind, diffPct };
}
/* ================= DETALLE DE CARRERA (pestañas Ruta/Ritmo/Segmentos/Gráficos/Detalles) =================
   rdCurrent guarda la carrera activa y los valores derivados que varias pestañas
   necesitan (ritmo promedio, FC promedio, calorías) para no recalcularlos en cada
   una. Cada pestaña se renderiza recién la primera vez que se abre (panel.dataset.rendered),
   no las cinco de una -- así abrir el detalle de una carrera no arma de entrada un
   mapa Leaflet + dos gráficos que la mayoría de las veces la persona ni va a mirar. */
let rdCurrent = null;
function zoneColorVar(n){
  return (getComputedStyle(document.documentElement).getPropertyValue('--zone'+n) || '').trim() || '#8B9296';
}
function openRunDetail(runId){
  if(swipeSuppressClick) return;
  const r = state.runs.find(x => String(x.id) === String(runId));
  if(!r) return;
  const paceMin = r.distanceKm>0.02 ? (r.durationSec/60)/r.distanceKm : 0;
  const avgHr = r.avgHr || (r.hrLog && r.hrLog.length ? Math.round(r.hrLog.reduce((a,h)=>a+h.bpm,0)/r.hrLog.length) : null);
  const cal = r.calories || Math.round((state.profile.weight||70)*r.distanceKm*1.036);
  const hasRoute = !!(r.points && r.points.length>1);
  const hasSplits = !!(r.splits && r.splits.length>0);
  const hasHrSeries = !!(r.series && r.series.hr && r.series.t && r.series.hr.filter(v=>v!=null).length>1);
  const hasPaceSeries = !!(r.series && r.series.paceMin && r.series.t && r.series.paceMin.filter(v=>v!=null).length>1);
  rdCurrent = {r, paceMin, avgHr, cal, hasRoute, hasSplits, hasHrSeries, hasPaceSeries};

  const tabs = [];
  if(hasRoute) tabs.push('ruta');
  if(hasSplits) tabs.push('ritmo');
  if(hasSplits) tabs.push('segmentos');
  if(hasHrSeries || hasPaceSeries) tabs.push('graficos');
  tabs.push('detalles');
  rdCurrent.tabs = tabs;
  const tabLabels = {ruta:t('rd_tab_ruta'), ritmo:t('rd_tab_ritmo'), segmentos:t('rd_tab_segmentos'), graficos:t('rd_tab_graficos'), detalles:t('rd_tab_detalles')};
  const dateStr = new Date(r.date).toLocaleDateString(LOCALE_MAP[lang], {weekday:'long', day:'numeric', month:'long', year:'numeric'});

  document.getElementById('run-detail-content').innerHTML = `
    <h2 class="display" style="font-size:20px; margin-bottom:2px;">${escapeHtml(r.name) || dateStr}</h2>
    ${r.name ? `<p class="muted" style="margin-bottom:10px;">${dateStr}</p>` : '<div style="margin-bottom:10px;"></div>'}
    <div class="rd-tabs">${tabs.map(tb=>`<button class="rd-tab-btn" id="rd-tabbtn-${tb}" onclick="switchRDTab('${tb}')">${tabLabels[tb]}</button>`).join('')}</div>
    ${tabs.map(tb=>`<div class="rd-panel" id="rd-panel-${tb}"></div>`).join('')}
    <button class="btn btn-outline" style="width:100%; margin-top:24px;" onclick="openEditRun('${r.id}')">${t('edit_run_btn')}</button>
    <button class="btn btn-danger" style="width:100%; margin-top:12px;" onclick="deleteRun('${r.id}')">${t('hist_delete_run')}</button>
  `;
  document.getElementById('run-detail-modal').style.display='block';
  switchRDTab(tabs[0]);
}
function switchRDTab(tab){
  if(!rdCurrent) return;
  rdCurrent.tabs.forEach(tb=>{
    const btn = document.getElementById('rd-tabbtn-'+tb);
    const panel = document.getElementById('rd-panel-'+tb);
    if(btn) btn.classList.toggle('active', tb===tab);
    if(panel) panel.classList.toggle('active', tb===tab);
  });
  const panel = document.getElementById('rd-panel-'+tab);
  if(!panel) return;
  if(panel.dataset.rendered==='1'){
    if(tab==='ruta' && detailMap) setTimeout(()=>detailMap.invalidateSize(), 50);
    return;
  }
  panel.dataset.rendered = '1';
  if(tab==='ruta') renderRDRuta(panel);
  else if(tab==='ritmo') renderRDRitmo(panel);
  else if(tab==='segmentos') renderRDSegmentos(panel);
  else if(tab==='graficos') renderRDGraficos(panel);
  else if(tab==='detalles') renderRDDetalles(panel);
}
// Corta el recorrido (r.points) en tramos por km alineados con r.splits, y le
// asigna a cada tramo el color de zona de ritmo (relativa al promedio de ESA
// carrera, ver classifyPaceRelative) -- así el mapa de la pestaña Ruta se ve
// coloreado por velocidad como en la referencia, en vez de una línea plana.
function buildColoredRouteSegments(r){
  const points = r.points||[];
  if(points.length<2) return [];
  if(!r.splits || !r.splits.length || points.length<3){
    return [{latlngs:points.map(p=>[p.lat,p.lon]), color: zoneColorVar(3)}];
  }
  const cum=[0];
  for(let i=1;i<points.length;i++) cum.push(cum[i-1]+haversine(points[i-1].lat,points[i-1].lon,points[i].lat,points[i].lon));
  const avgPace = rdCurrent.paceMin;
  const segs = [];
  let startIdx = 0;
  r.splits.forEach((split, i)=>{
    const isLast = i===r.splits.length-1;
    const targetCum = isLast ? cum[cum.length-1] : split.km;
    let idx = startIdx;
    while(idx<cum.length-1 && cum[idx]<targetCum) idx++;
    const chunk = points.slice(startIdx, idx+1);
    if(chunk.length>=2){
      const zone = classifyPaceRelative(split.paceMin, avgPace);
      segs.push({latlngs:chunk.map(p=>[p.lat,p.lon]), color: zoneColorVar(zone)});
    }
    startIdx = idx;
  });
  return segs.length ? segs : [{latlngs:points.map(p=>[p.lat,p.lon]), color: zoneColorVar(3)}];
}
function renderRDRuta(panel){
  const {r, paceMin, cal} = rdCurrent;
  const dateStr = new Date(r.date).toLocaleDateString(LOCALE_MAP[lang], {weekday:'long', day:'numeric', month:'long'});
  const timeStr = new Date(r.date).toLocaleTimeString(LOCALE_MAP[lang], {hour:'numeric', minute:'2-digit'});
  const paces = (r.splits||[]).map(s=>s.paceMin).filter(p=>p>0);
  const slowest = paces.length ? Math.max(...paces) : paceMin;
  const fastest = paces.length ? Math.min(...paces) : paceMin;
  panel.innerHTML = `
    <div class="rd-map-full" id="rd-map-full">
      <div id="rd-route-map" style="height:100%; width:100%;"></div>
      <div class="rd-map-fade"></div>
      <div class="rd-map-controls"><button onclick="rdRecenterMap()" data-i18n-aria="aria_recenter">${ICONS.locate}</button></div>
      <div class="rd-map-handle" id="rd-map-handle" onclick="toggleRDMapExpanded()"></div>
    </div>
    <div class="rd-ruta-below" id="rd-ruta-below">
      <div class="rd-big-dist">${fmtDist(r.distanceKm)} <span style="font-size:19px; font-weight:700; color:var(--mist);">${distUnit()}</span></div>
      <p class="muted" style="margin-top:2px; text-transform:capitalize;">${dateStr}, ${timeStr}</p>
      <!-- Botón "Video del recorrido" sacado a pedido del usuario: en la web (PWA)
           nunca se pudo lograr que el video se guarde/comparta de forma confiable
           en iPhone (ver el historial de intentos alrededor de rdRemuxVideoIfNeeded
           más abajo). La idea es retomarlo cuando haya apps nativas de Android/iOS
           (Capacitor), donde compartir un archivo es mucho más directo que por el
           navegador. El resto del sistema de video (startDynamicVideo y compañía)
           queda intacto, sin usarse, listo para volver a engancharse acá con solo
           reponer este botón. -->
      ${paces.length>1 ? `
        <div class="rd-legend-bar"></div>
        <div class="rd-legend-labels"><span>${t('rd_slowest')} ${fmtPace(slowest)}/${distUnit()}</span><span>${t('rd_fastest')} ${fmtPace(fastest)}/${distUnit()}</span></div>
      ` : ''}
      <div class="rd-stat-row">
        <div><span class="mono">${fmtTime(r.durationSec)}</span><span class="muted" style="font-size:11px;">${t('run_time')}</span></div>
        <div><span class="mono">${fmtPace(paceMin)}</span><span class="muted" style="font-size:11px;">${t('run_pace_word')}/${distUnit()}</span></div>
        <div><span class="mono">${cal}</span><span class="muted" style="font-size:11px;">${t('run_calories')}</span></div>
      </div>
    </div>
  `;
  rdMapExpanded = false;
  setTimeout(()=>{
    if(detailMap){ detailMap.remove(); detailMap=null; }
    detailMap = L.map('rd-route-map', {zoomControl:false, attributionControl:true});
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=cb1_2i8k_1_882919874396f1a734cae151', {maxZoom:20, attribution:'&copy; OpenStreetMap contributors &copy; CARTO'}).addTo(detailMap);
    const segs = buildColoredRouteSegments(r);
    const allLatLngs = [];
    segs.forEach(seg=>{ L.polyline(seg.latlngs, {color:seg.color, weight:5, lineCap:'round', lineJoin:'round'}).addTo(detailMap); allLatLngs.push(...seg.latlngs); });
    if(allLatLngs.length) detailMap.fitBounds(L.latLngBounds(allLatLngs), {padding:[20,20]});
    applyStaticTranslations();
  }, 60);
}
/* ---- arrastrar el mapa de la pestaña Ruta hacia arriba para agrandarlo ----
   Igual que el resto de los gestos de la app (swipe-to-delete, swipe del plan
   semanal): se decide con el primer movimiento si es un drag vertical del mapa
   o si hay que dejar pasar el toque (por ej. un tap en el botón de recentrar,
   o un scroll normal de la pantalla). Dos estados nada más -- achicado (340px,
   el de siempre) y agrandado (~72% del alto de pantalla, dejando arriba el
   título y las pestañas) -- con umbral a mitad de camino para decidir a cuál
   de los dos "engancha" al soltar. */
let rdMapExpanded = false;
let rdMapDragging = false, rdMapDragStartY = 0, rdMapDragStartH = 0, rdMapDragAxisLocked = false;
let rdMapInvalidateRaf = false;
const RD_MAP_COLLAPSED_H = 340;
function rdMapExpandedH(){ return Math.round(window.innerHeight * 0.72); }
function rdSetMapExpanded(expand, animate){
  const mapEl = document.getElementById('rd-map-full');
  const belowEl = document.getElementById('rd-ruta-below');
  if(!mapEl) return;
  rdMapExpanded = expand;
  if(animate===false) mapEl.classList.add('rd-map-dragging'); else mapEl.classList.remove('rd-map-dragging');
  mapEl.style.height = (expand ? rdMapExpandedH() : RD_MAP_COLLAPSED_H) + 'px';
  if(belowEl) belowEl.classList.toggle('rd-collapsed', expand);
  // invalidateSize() sólo le avisa a Leaflet que su contenedor cambió de tamaño --
  // no reencuadra el recorrido. Sin el fitBounds de rdRecenterMap() de acá abajo,
  // al agrandar el mapa se veía más área de alrededor pero la ruta quedaba chica
  // y corrida en vez de aprovechar el espacio nuevo (lo mismo al achicarlo).
  setTimeout(()=>{ if(detailMap){ detailMap.invalidateSize(); rdRecenterMap(); } }, animate===false ? 0 : 320);
}
function toggleRDMapExpanded(){
  if(swipeSuppressClick) return;
  haptic(8);
  rdSetMapExpanded(!rdMapExpanded);
}
document.addEventListener('touchstart', e=>{
  const mapEl = e.target.closest ? e.target.closest('#rd-map-full') : null;
  if(!mapEl || e.target.closest('.rd-map-controls')){ rdMapDragging = false; return; }
  rdMapDragStartY = e.touches[0].clientY;
  rdMapDragStartH = mapEl.getBoundingClientRect().height;
  rdMapDragAxisLocked = false;
  rdMapDragging = false;
}, {passive:true});
document.addEventListener('touchmove', e=>{
  const mapEl = document.getElementById('rd-map-full');
  if(!mapEl || rdMapDragStartY===0) return;
  const dy = rdMapDragStartY - e.touches[0].clientY;
  const dx = 0;
  if(!rdMapDragAxisLocked){
    if(Math.abs(dy) > 8){
      rdMapDragAxisLocked = true;
      rdMapDragging = true;
      mapEl.classList.add('rd-map-dragging');
    } else { return; }
  }
  if(!rdMapDragging) return;
  const newH = Math.max(RD_MAP_COLLAPSED_H, Math.min(rdMapExpandedH(), rdMapDragStartH + dy));
  mapEl.style.height = newH + 'px';
  if(!rdMapInvalidateRaf){
    rdMapInvalidateRaf = true;
    requestAnimationFrame(()=>{ rdMapInvalidateRaf = false; if(detailMap){ detailMap.invalidateSize(); rdRecenterMap(); } });
  }
  e.preventDefault();
}, {passive:false});
document.addEventListener('touchend', ()=>{
  if(rdMapDragging){
    const mapEl = document.getElementById('rd-map-full');
    if(mapEl){
      const h = mapEl.getBoundingClientRect().height;
      const mid = (RD_MAP_COLLAPSED_H + rdMapExpandedH()) / 2;
      mapEl.classList.remove('rd-map-dragging');
      rdSetMapExpanded(h > mid);
      haptic(10);
    }
    swipeSuppressClick = true;
    setTimeout(()=>{ swipeSuppressClick = false; }, 300);
  }
  rdMapDragStartY = 0;
  rdMapDragging = false;
  rdMapDragAxisLocked = false;
}, {passive:true});
function rdRecenterMap(){
  if(!detailMap || !rdCurrent) return;
  const pts = rdCurrent.r.points;
  if(pts && pts.length) detailMap.fitBounds(L.latLngBounds(pts.map(p=>[p.lat,p.lon])), {padding:[20,20]});
}
function renderRDRitmo(panel){
  const {r, paceMin} = rdCurrent;
  const splits = r.splits||[];
  const splitPaces = splits.map(s=>s.paceMin).filter(p=>p>0);
  const fastest = splitPaces.length ? Math.min(...splitPaces) : paceMin;
  const maxPaceForBar = Math.max(...splitPaces, paceMin) * 1.02 || 1;
  const pacingAnalysis = analyzeSplitPacing(splits);
  panel.innerHTML = `
    <div style="display:flex; justify-content:space-around; text-align:center; margin-bottom:20px;">
      <div><span class="mono" style="font-size:22px; font-weight:800; display:block;">${fmtPace(paceMin)}</span><span class="muted" style="font-size:12px;">${t('rd_avg_pace')}</span></div>
      <div><span class="mono" style="font-size:22px; font-weight:800; display:block;">${fmtPace(fastest)}</span><span class="muted" style="font-size:12px;">${t('rd_fastest_pace')}</span></div>
    </div>
    ${pacingAnalysis ? `<p style="font-weight:700; margin-bottom:14px; font-size:13.5px;">${t('hist_split_'+pacingAnalysis.kind)}</p>` : ''}
    <div class="muted" style="font-size:11px; margin-bottom:8px; display:flex; justify-content:space-between;"><span>${distUnit()}</span><span>${t('run_pace_word')} (/${distUnit()})</span></div>
    ${splits.map(s=>{
      const zone = classifyPaceRelative(s.paceMin, paceMin);
      const widthPct = s.paceMin>0 ? Math.max(22, Math.min(100, (s.paceMin/maxPaceForBar)*100)) : 22;
      return `<div class="pace-bar-row">
        <div class="pace-bar-label">${s.km}</div>
        <div class="pace-bar-track"><div class="pace-bar-fill" style="width:${widthPct}%; background:${zoneColorVar(zone)};">${fmtPace(s.paceMin)}</div></div>
      </div>`;
    }).join('')}
  `;
}
function renderRDSegmentos(panel){
  const {r, paceMin, avgHr} = rdCurrent;
  const splits = r.splits||[];
  const anyHr = splits.some(s=>s.avgHr!=null);
  const anyCad = splits.some(s=>s.avgCadence!=null);
  const rows = splits.map(s=>{
    const segDistKm = Number.isInteger(s.km) ? 1 : s.km;
    const segSec = Math.round(s.paceMin*60*segDistKm);
    return `<tr>
      <td>${s.km}</td>
      <td>${fmtTime(segSec)}</td>
      <td>${fmtDist(segDistKm)}</td>
      <td>${fmtPace(s.paceMin)}</td>
      ${anyHr ? `<td>${s.avgHr!=null ? s.avgHr : '–'}</td>` : ''}
      ${anyCad ? `<td>${s.avgCadence!=null ? s.avgCadence : '–'}</td>` : ''}
    </tr>`;
  }).join('');
  panel.innerHTML = `
    <div style="overflow-x:auto;">
    <table class="rd-seg-table">
      <thead><tr>
        <th>${t('rd_seg_col')}</th><th>${t('rd_seg_dur')}</th><th>${t('rd_seg_dist')} (${distUnit()})</th><th>${t('run_pace_word')} (/${distUnit()})</th>
        ${anyHr ? `<th>${t('hist_avg_hr')}</th>` : ''}
        ${anyCad ? `<th>${t('hist_cadence')}</th>` : ''}
      </tr></thead>
      <tbody>
        ${rows}
        <tr>
          <td>${t('rd_total')}</td><td>${fmtTime(r.durationSec)}</td><td>${fmtDist(r.distanceKm)}</td><td>${fmtPace(paceMin)}</td>
          ${anyHr ? `<td>${avgHr!=null?avgHr:'–'}</td>` : ''}
          ${anyCad ? `<td>${r.avgCadence!=null?r.avgCadence:'–'}</td>` : ''}
        </tr>
      </tbody>
    </table>
    </div>
  `;
}
// Área de FC/ritmo en el tiempo, dibujada como SVG a mano (sin librería de
// gráficos -- no hay bundler en este proyecto, ver comentario de arriba de
// todo el archivo). invertY=true pone los valores más ALTOS arriba (para FC:
// más pulsaciones = más arriba); invertY=false deja los valores más BAJOS
// arriba (para ritmo: correr más rápido = número más chico = arriba, como
// leería cualquier corredor el gráfico).
function buildAreaChartSVG(tArr, valArr, colorHex, invertY){
  const W=300, H=100, padT=6, padB=6;
  const pairs = tArr.map((tv,i)=>({tv, v:valArr[i]})).filter(p=>p.v!=null);
  if(pairs.length<2) return '';
  const vals = pairs.map(p=>p.v);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const spanV = (maxV-minV) || 1;
  const minT = pairs[0].tv, maxT = pairs[pairs.length-1].tv;
  const spanT = (maxT-minT) || 1;
  const pts = pairs.map(p=>{
    const x = ((p.tv-minT)/spanT) * W;
    const frac = (p.v-minV)/spanV;
    const y = invertY ? (padT + (1-frac)*(H-padT-padB)) : (padT + frac*(H-padT-padB));
    return [x,y];
  });
  const linePath = pts.map((p,i)=> (i===0?'M':'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const areaPath = `M${pts[0][0].toFixed(1)},${H} L` + pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' L') + ` L${pts[pts.length-1][0].toFixed(1)},${H} Z`;
  const gradId = 'rdgrad'+Math.random().toString(36).slice(2,9);
  return `<svg class="rd-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${colorHex}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="${colorHex}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${areaPath}" fill="url(#${gradId})" stroke="none"/>
    <path d="${linePath}" fill="none" stroke="${colorHex}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}
// Minutos pasados en cada zona (1-5) a lo largo de una serie en el tiempo.
// classifyFn recibe (valor, extra) -- extra es el promedio de la carrera para
// classifyPaceRelative, e ignorado por classifyHR.
function computeZoneMinutes(tArr, valArr, classifyFn, extra){
  const mins = {1:0,2:0,3:0,4:0,5:0};
  for(let i=0;i<tArr.length-1;i++){
    if(valArr[i]==null) continue;
    const dt = (tArr[i+1]-tArr[i])/60;
    if(dt<=0) continue;
    mins[classifyFn(valArr[i], extra)] += dt;
  }
  return mins;
}
function buildDonutCSS(zoneMinutes){
  const total = [1,2,3,4,5].reduce((a,z)=>a+zoneMinutes[z],0);
  if(total<=0) return `<div style="width:96px; height:96px; border-radius:50%; background:var(--asphalt-3); flex-shrink:0;"></div>`;
  let acc = 0;
  const stops = [];
  [1,2,3,4,5].forEach(z=>{
    const frac = zoneMinutes[z]/total;
    if(frac<=0) return;
    stops.push(`${zoneColorVar(z)} ${(acc*360).toFixed(1)}deg ${((acc+frac)*360).toFixed(1)}deg`);
    acc += frac;
  });
  return `<div style="width:96px; height:96px; border-radius:50%; background:conic-gradient(${stops.join(',')}); flex-shrink:0; position:relative;">
    <div style="position:absolute; inset:18px; border-radius:50%; background:var(--asphalt-2);"></div>
  </div>`;
}
function fmtZoneMin(min){ return min<1 ? '<1' : Math.round(min); }
function renderRDGraficos(panel){
  const {r, paceMin, avgHr} = rdCurrent;
  let html = '';
  if(rdCurrent.hasHrSeries){
    const hrColor = zoneColorVar(5);
    const maxHr = r.maxHr || Math.max(...r.series.hr.filter(v=>v!=null));
    const zoneMin = computeZoneMinutes(r.series.t, r.series.hr, classifyHR);
    html += `<div class="card rd-chart-card">
      <h3 style="font-size:16px; margin-bottom:14px;">${t('rd_chart_hr')}</h3>
      <div style="display:flex; justify-content:space-around; text-align:center; margin-bottom:12px;">
        <div><span class="mono" style="font-size:20px; font-weight:800; display:block;">${avgHr||'–'}</span><span class="muted" style="font-size:11.5px;">${t('rd_avg_hr_full')}</span></div>
        <div><span class="mono" style="font-size:20px; font-weight:800; display:block;">${maxHr||'–'}</span><span class="muted" style="font-size:11.5px;">${t('hist_max_hr')}</span></div>
      </div>
      ${buildAreaChartSVG(r.series.t, r.series.hr, hrColor, true)}
      <div class="rd-donut-row">
        ${buildDonutCSS(zoneMin)}
        <div class="rd-donut-legend">
          ${[1,2,3,4,5].map(z=>zoneMin[z]>0.05 ? `<div class="rd-donut-legend-row"><span class="rd-donut-legend-name"><span class="dot" style="background:${zoneColorVar(z)};"></span>${t('zdesc_'+z)}</span><span class="rd-donut-legend-val">${fmtZoneMin(zoneMin[z])} ${t('rd_min_short')}</span></div>` : '').join('')}
        </div>
      </div>
    </div>`;
  }
  if(rdCurrent.hasPaceSeries){
    const paceColor = zoneColorVar(2);
    const fastest = Math.min(...r.series.paceMin.filter(v=>v!=null));
    const zoneMin = computeZoneMinutes(r.series.t, r.series.paceMin, classifyPaceRelative, paceMin);
    html += `<div class="card rd-chart-card">
      <h3 style="font-size:16px; margin-bottom:14px;">${t('rd_chart_pace')}</h3>
      <div style="display:flex; justify-content:space-around; text-align:center; margin-bottom:12px;">
        <div><span class="mono" style="font-size:20px; font-weight:800; display:block;">${fmtPace(paceMin)}</span><span class="muted" style="font-size:11.5px;">${t('rd_avg_pace')}</span></div>
        <div><span class="mono" style="font-size:20px; font-weight:800; display:block;">${fmtPace(fastest)}</span><span class="muted" style="font-size:11.5px;">${t('rd_fastest_pace')}</span></div>
      </div>
      ${buildAreaChartSVG(r.series.t, r.series.paceMin, paceColor, false)}
      <div class="rd-donut-row">
        ${buildDonutCSS(zoneMin)}
        <div class="rd-donut-legend">
          ${[1,2,3,4,5].map(z=>zoneMin[z]>0.05 ? `<div class="rd-donut-legend-row"><span class="rd-donut-legend-name"><span class="dot" style="background:${zoneColorVar(z)};"></span>${t('rd_pacezone_'+z)}</span><span class="rd-donut-legend-val">${fmtZoneMin(zoneMin[z])} ${t('rd_min_short')}</span></div>` : '').join('')}
        </div>
      </div>
    </div>`;
  }
  panel.innerHTML = html;
}
function renderRDDetalles(panel){
  const {r, paceMin, avgHr, cal} = rdCurrent;
  const speedKmh = r.durationSec>0 ? (r.distanceKm/(r.durationSec/3600)) : 0;
  const tiles = [];
  tiles.push([t('run_time'), fmtTime(r.durationSec)]);
  tiles.push([t('run_calories'), cal+' kcal']);
  tiles.push([`${t('run_pace_word')} /${distUnit()}`, fmtPace(paceMin)]);
  tiles.push([t('rd_avg_speed'), (isImperial()? (speedKmh*0.621371).toFixed(2)+' mph' : speedKmh.toFixed(2)+' km/h')]);
  if(r.avgCadence) tiles.push([t('hist_cadence'), Math.round(r.avgCadence)+' spm']);
  if(avgHr) tiles.push([t('hist_avg_hr'), avgHr+' bpm']);
  if(r.maxHr) tiles.push([t('hist_max_hr'), r.maxHr+' bpm']);
  if(r.elevationGain!=null) tiles.push([t('rd_ascent'), isImperial() ? Math.round(r.elevationGain*3.28084)+' ft' : Math.round(r.elevationGain)+' m']);
  if(r.elevationLoss!=null) tiles.push([t('rd_descent'), isImperial() ? Math.round(r.elevationLoss*3.28084)+' ft' : Math.round(r.elevationLoss)+' m']);

  const shoeSelect = `<select onchange="changeRunShoe('${r.id}', this.value)" style="background:var(--asphalt-3); border:1.5px solid var(--asphalt-4); color:var(--chalk); padding:6px 8px; border-radius:6px; font-family:inherit; font-size:13px; max-width:60%;">
    <option value="">${t('hist_no_shoe')}</option>
    ${state.shoes.map(s=>`<option value="${s.id}" ${String(s.id)===String(r.shoeId)?'selected':''}>${escapeHtml(s.name)}</option>`).join('')}
  </select>`;

  panel.innerHTML = `
    <div class="card">
      <div class="rd-stat-grid">
        ${tiles.map(([lbl,val])=>`<div class="rd-stat-tile"><div><div class="rd-tile-val mono">${val}</div><div class="rd-tile-lbl">${lbl}</div></div></div>`).join('')}
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; padding-top:16px; border-top:1px solid var(--asphalt-3); gap:8px; flex-wrap:wrap;"><span class="muted">${t('hist_shoe')}</span>${shoeSelect}</div>
    </div>
    ${r.hrLog && r.hrLog.length>1 ? `<div class="hist-hrlist" style="margin-top:12px;">${r.hrLog.map(h=>`<span class="zone-chip zone-${classifyHR(h.bpm)}">${h.bpm} bpm</span>`).join('')}</div>` : ''}
  `;
  // El botón "Compartir con amigos" queda oculto por ahora (junto con la sección social
  // de Perfil) -- shareRunToFeed() se deja intacta para poder reactivarlo más adelante.
}
async function deleteRun(runId){
  if(!(await showConfirm(t('hist_delete_confirm'), {danger:true, confirmText:t('delete_word')}))) return;
  const idx = state.runs.findIndex(r => String(r.id) === String(runId));
  if(idx<0) return;
  const run = state.runs[idx];
  const shoe = state.shoes.find(s => String(s.id) === String(run.shoeId));
  if(shoe) shoe.km = Math.max(0, shoe.km - run.distanceKm);
  checkShoeWearAlerts();
  const planDay = state.plan.find(d => d.linkedRunId === run.id);
  if(planDay){ planDay.status = null; planDay.linkedRunId = null; }
  state.runs.splice(idx,1);
  closeRunDetail();
  renderHistory(); renderHome(); renderPlan(); renderPerfil();
  persist();
}
function openHistInfo(){ document.getElementById('hist-info-modal').style.display = 'block'; }
function closeHistInfo(){ document.getElementById('hist-info-modal').style.display = 'none'; }
function openZonesInfo(){
  document.getElementById('zones-info-body').innerHTML = [1,2,3,4,5].map(n=>`
    <div>
      <span class="zone-chip zone-${n}">${t('zone_word')} ${n} · ${t('zone_info_title_'+n)}</span>
      <p class="muted" style="margin-top:6px;">${t('zone_info_desc_'+n)}</p>
    </div>`).join('');
  document.getElementById('zones-info-modal').style.display = 'block';
}
function closeZonesInfo(){ document.getElementById('zones-info-modal').style.display = 'none'; }

/* ================= INSTALL PROMPT (PWA) ================= */
let deferredInstallPrompt = null;
const INSTALL_DISMISS_KEY = 'zancada_install_dismissed';
function isRunningStandalone(){
  try{ return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }catch(e){ return false; }
}
function isIOSDevice(){
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function installBannerDismissed(){
  try{ return localStorage.getItem(INSTALL_DISMISS_KEY) === '1'; }catch(e){ return false; }
}
function maybeShowInstallBanner(){
  if(isRunningStandalone() || installBannerDismissed()) return;
  const card = document.getElementById('install-banner');
  const btn = document.getElementById('install-banner-btn');
  const text = document.getElementById('install-banner-text');
  if(!card || !btn || !text) return;
  if(deferredInstallPrompt){
    text.textContent = t('install_banner_text');
    btn.textContent = t('install_banner_btn');
    btn.style.display = 'block';
    card.style.display = 'flex';
  } else if(isIOSDevice()){
    text.textContent = t('install_banner_ios_text');
    btn.style.display = 'none';
    card.style.display = 'flex';
  }
}
async function triggerInstallPrompt(){
  if(!deferredInstallPrompt) return;
  try{
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
  }catch(e){ /* usuario canceló o el navegador no soporta el prompt */ }
  deferredInstallPrompt = null;
  dismissInstallBanner();
}
function toggleInstallHelp(e){
  const body = document.getElementById('install-help-body');
  const chevron = document.getElementById('install-help-chevron');
  const open = body.style.display === 'block';
  body.style.display = open ? 'none' : 'block';
  chevron.style.transform = open ? '' : 'rotate(180deg)';
  const trigger = e && e.currentTarget;
  if(trigger) trigger.setAttribute('aria-expanded', open ? 'false' : 'true');
}
function dismissInstallBanner(){
  const card = document.getElementById('install-banner');
  if(card) card.style.display = 'none';
  try{ localStorage.setItem(INSTALL_DISMISS_KEY, '1'); }catch(e){}
}
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredInstallPrompt = e;
  if(document.getElementById('mainHeader') && document.getElementById('mainHeader').style.display !== 'none') maybeShowInstallBanner();
});
window.addEventListener('appinstalled', ()=>{
  deferredInstallPrompt = null;
  dismissInstallBanner();
});
async function shareRunImage(runId){
  const r = state.runs.find(x => String(x.id) === String(runId));
  if(!r) return;

  const blob = await buildShareImageBlob(r);
  if(!blob) return;

  const file = new File([blob], 'zancada.png', {type:'image/png'});
  if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title:'Zancada'}); }catch(e){ /* usuario canceló */ }
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'zancada.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
  }
}
function buildShareImageBlob(r){
  return new Promise(async (resolve)=>{
    try{
      // aseguramos que las tipografías de la app (JetBrains Mono, Bebas Neue) ya estén cargadas
      // antes de dibujar; si no, el canvas dibuja con una fuente de reemplazo de menor calidad.
      try{
        await Promise.all([
          document.fonts.load('400 64px "Bebas Neue"'),
          document.fonts.load('700 92px "JetBrains Mono"'),
          document.fonts.load('700 28px "Inter"'),
        ]);
        await document.fonts.ready;
      }catch(e){}

      const W = 1080, H = 1920;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      // el canvas queda transparente a propósito, sin ningún fondo ni caja detrás del texto:
      // es un sticker para subir sobre una foto propia en Instagram.

      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 3;

      ctx.textAlign = 'center';
      ctx.fillStyle = '#D6FF3F';
      ctx.font = '400 80px "Bebas Neue", Arial, sans-serif';
      ctx.fillText('ZANCADA', W/2, 500);

      const paceMin = r.distanceKm>0.02 ? (r.durationSec/60)/r.distanceKm : 0;
      const stats = [
        [fmtDist(r.distanceKm), distUnit().toUpperCase()],
        [`${fmtPace(paceMin)}/${distUnit()}`, t('run_pace_word').toUpperCase()],
        [fmtTime(r.durationSec), t('run_time').toUpperCase()],
      ];
      const rowTop = 610, rowHeight = 240; // apilados uno abajo del otro, con espacio entre cada uno
      stats.forEach((s,i)=>{
        const top = rowTop + i*rowHeight;
        ctx.fillStyle = '#EDEFEF';
        ctx.font = '700 92px "JetBrains Mono", monospace';
        ctx.fillText(s[0], W/2, top + 95);
        ctx.fillStyle = '#EDEFEF';
        ctx.font = '700 28px "Inter", Arial, sans-serif';
        ctx.fillText(s[1], W/2, top + 148);
      });

      if(r.points && r.points.length>1){
        drawRouteSilhouette(ctx, r.points, 140, 1360, W-280, 420);
      }

      canvas.toBlob((blob)=>resolve(blob||null), 'image/png');
    }catch(e){ resolve(null); }
  });
}
async function shareWeeklyRecapImage(){
  const blob = await buildWeeklyShareImageBlob();
  if(!blob) return;
  const file = new File([blob], 'zancada-semana.png', {type:'image/png'});
  if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title:'Zancada'}); }catch(e){ /* usuario canceló */ }
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'zancada-semana.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
  }
}
function buildWeeklyShareImageBlob(){
  // Mismo formato "sticker" que el resumen de una carrera individual (buildShareImageBlob),
  // pero con las cifras de la semana completa en vez de una sola corrida.
  return new Promise(async (resolve)=>{
    try{
      try{
        await Promise.all([
          document.fonts.load('400 64px "Bebas Neue"'),
          document.fonts.load('700 92px "JetBrains Mono"'),
          document.fonts.load('700 28px "Inter"'),
        ]);
        await document.fonts.ready;
      }catch(e){}

      const W = 1080, H = 1920;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');

      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 3;

      ctx.textAlign = 'center';
      ctx.fillStyle = '#D6FF3F';
      ctx.font = '400 80px "Bebas Neue", Arial, sans-serif';
      ctx.fillText('ZANCADA', W/2, 480);
      ctx.fillStyle = '#EDEFEF';
      ctx.font = '700 42px "Inter", Arial, sans-serif';
      ctx.fillText(t('share_week_word').toUpperCase(), W/2, 555);

      const weekRuns = (state.runs||[]).filter(r => getMondayISO(new Date(r.date)) === state.weekStart);
      const km = weekRuns.reduce((s,r)=>s+r.distanceKm, 0);
      const totalSec = weekRuns.reduce((s,r)=>s+r.durationSec, 0);

      // Km total, arriba de todo.
      ctx.fillStyle = '#EDEFEF';
      ctx.font = '700 92px "JetBrains Mono", monospace';
      ctx.fillText(fmtDist(km), W/2, 745);
      ctx.font = '700 28px "Inter", Arial, sans-serif';
      ctx.fillText(distUnit().toUpperCase(), W/2, 798);

      // Trazos chiquitos de cada corrida de la semana, uno al lado del otro y
      // repartidos parejo -- en vez de un número de sesiones, se ve la semana entera.
      const traceRuns = weekRuns.filter(r => r.points && r.points.length>1);
      if(traceRuns.length){
        const rowY = 950, rowH = 280, gap = 24, marginX = 110;
        const contentW = W - marginX*2;
        const boxW = (contentW - gap*(traceRuns.length-1)) / traceRuns.length;
        traceRuns.forEach((r,i)=>{
          const boxX = marginX + i*(boxW+gap);
          drawRouteSilhouette(ctx, r.points, boxX, rowY, boxW, rowH, 5, 6);
        });
      }

      // Tiempo total, abajo.
      ctx.fillStyle = '#EDEFEF';
      ctx.font = '700 92px "JetBrains Mono", monospace';
      ctx.fillText(fmtTime(totalSec), W/2, 1475);
      ctx.font = '700 28px "Inter", Arial, sans-serif';
      ctx.fillText(t('run_time').toUpperCase(), W/2, 1528);

      canvas.toBlob((blob)=>resolve(blob||null), 'image/png');
    }catch(e){ resolve(null); }
  });
}
function drawRouteSilhouette(ctx, points, x, y, w, h, lineWidth, dotRadius){
  lineWidth = lineWidth || 11;
  dotRadius = dotRadius || 13;
  const lats = points.map(p=>p.lat), lons = points.map(p=>p.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const latRange = (maxLat-minLat) || 0.001;
  const lonRange = (maxLon-minLon) || 0.001;
  const scale = Math.min(w/lonRange, h/latRange) * 0.85;
  const drawW = lonRange*scale, drawH = latRange*scale;
  const offsetX = x + (w-drawW)/2;
  const offsetY = y + (h-drawH)/2;

  ctx.beginPath();
  points.forEach((p,i)=>{
    const px = offsetX + (p.lon-minLon)*scale;
    const py = offsetY + (maxLat-p.lat)*scale;
    if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  });
  ctx.strokeStyle = '#D6FF3F';
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  const startPx = offsetX + (points[0].lon-minLon)*scale;
  const startPy = offsetY + (maxLat-points[0].lat)*scale;
  ctx.beginPath();
  ctx.arc(startPx, startPy, dotRadius, 0, Math.PI*2);
  ctx.fillStyle = '#EDEFEF';
  ctx.fill();
}
function closeRunDetail(){
  document.getElementById('run-detail-modal').style.display='none';
  if(detailMap){ detailMap.remove(); detailMap=null; }
}

/* ================= VIDEO DE SEGUIMIENTO DINÁMICO =================
   Genera, 100% en el dispositivo (canvas + MediaRecorder, sin backend ni
   librerías externas), un video real y descargable/compartible: la ruta se
   va dibujando de a poco, coloreada por zona de ritmo igual que el mapa de
   la pestaña Ruta, con un punto que la recorre y las estadísticas reales
   (distancia, tiempo, ritmo promedio hasta ese punto) actualizándose a
   medida que avanza. Reusa la misma identidad visual que ya tiene la
   tarjeta para compartir (shareRunImage): verde #D6FF3F, Bebas Neue para
   el logo, JetBrains Mono para los números grandes. */
let rdVideoState = null;

// Dibuja un rectángulo con esquinas redondeadas a mano (ctx.roundRect no
// está disponible en todos los WebView de Android/iOS que usa la app empaquetada).
function rdRoundRectPath(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

const MAP_TILE_SIZE = 256;
// Cuánto mundo real (en metros) queremos que se vea a lo ancho/alto del
// recuadro del mapa en el modo "cámara dinámica" (ver más abajo) -- un valor
// chico da un acercamiento tipo Strava (se ven las calles cercanas mientras
// la cámara sigue al corredor); uno grande se parecería más al mapa
// "panorama fijo" que teníamos antes.
const FOLLOW_TARGET_METERS = 550;
const FOLLOW_MIN_ZOOM = 12, FOLLOW_MAX_ZOOM = 17;
// Tope de tiles distintas a pedir para armar el mosaico de la cámara
// dinámica. Si una carrera muy larga necesitaría más que esto al zoom
// ideal, vamos bajando el zoom (mapa más "alejado") hasta que entre.
const FOLLOW_MAX_TILES = 220;

// Plantilla de URL de las tiles, en una variable (no una constante) a
// propósito: así un test puede redirigirla a un servidor local para poder
// probar la carga y el armado del mosaico de punta a punta sin depender de
// la red real (bloqueada en este entorno de pruebas).
let cartoTileUrl = function(subdomain, zoom, x, y){
  return `https://${subdomain}.basemaps.cartocdn.com/rastertiles/voyager/${zoom}/${x}/${y}.png?key=cb1_2i8k_1_882919874396f1a734cae151`;
};

// Proyección Web Mercator estándar (la misma matemática que usan los mapas
// tipo slippy-map / Leaflet / Google Maps), en píxeles de "mundo" a un zoom
// dado. La usamos tanto para ubicar los puntos de la ruta como para elegir
// qué tiles de mapa real pedir -- así quedan perfectamente alineados.
function webMercatorProject(lat, lon, zoom){
  const scale = MAP_TILE_SIZE * Math.pow(2, zoom);
  const x = (lon + 180) / 360 * scale;
  const latRad = lat * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(latRad) + 1/Math.cos(latRad)) / Math.PI) / 2 * scale;
  return { x, y };
}

// Calcula qué tiles hacen falta para que, mientras la cámara recorre TODA la
// ruta (no solo su encuadre final), el recuadro del mapa esté siempre
// cubierto -- como el "corredor" de tiles alrededor de todo el trazado, no
// el rectángulo que contiene a toda la ruta (que para una carrera larga
// podría ser gigantesco). Si ese corredor no entra en FOLLOW_MAX_TILES al
// zoom ideal, vamos alejando el mapa (bajando el zoom) hasta que entre.
function computeFollowCameraPlan(pts, latMid, availW, availH){
  const halfW = availW/2, halfH = availH/2;
  const idealMpp = FOLLOW_TARGET_METERS / Math.max(availW, availH);
  const cosLat = Math.max(0.15, Math.cos(latMid * Math.PI/180));
  let zoom = Math.round(Math.log2((156543.03392 * cosLat) / idealMpp));
  zoom = Math.max(FOLLOW_MIN_ZOOM, Math.min(FOLLOW_MAX_ZOOM, zoom));

  // Para rutas con muchísimos puntos GPS no hace falta mirar cada uno para
  // saber qué tiles hacen falta -- muestreamos, pero nos aseguramos de
  // incluir siempre el último punto (el muestreo por paso fijo puede
  // saltearlo).
  const addTilesForPoint = (tileSet, lat, lon, zoomLevel) => {
    const wp = webMercatorProject(lat, lon, zoomLevel);
    const txMin = Math.floor((wp.x-halfW)/MAP_TILE_SIZE)-1, txMax = Math.floor((wp.x+halfW)/MAP_TILE_SIZE)+1;
    const tyMin = Math.floor((wp.y-halfH)/MAP_TILE_SIZE)-1, tyMax = Math.floor((wp.y+halfH)/MAP_TILE_SIZE)+1;
    for(let tx=txMin; tx<=txMax; tx++) for(let ty=tyMin; ty<=tyMax; ty++) tileSet.add(tx+'_'+ty);
  };

  for(; zoom>=FOLLOW_MIN_ZOOM; zoom--){
    const tileSet = new Set();
    const step = Math.max(1, Math.floor(pts.length/400));
    for(let i=0;i<pts.length;i+=step) addTilesForPoint(tileSet, pts[i].lat, pts[i].lon, zoom);
    addTilesForPoint(tileSet, pts[pts.length-1].lat, pts[pts.length-1].lon, zoom);

    if(tileSet.size <= FOLLOW_MAX_TILES || zoom===FOLLOW_MIN_ZOOM){
      const tiles = Array.from(tileSet, key=>{ const [tx,ty] = key.split('_').map(Number); return {tx, ty}; });
      let txMin=Infinity, txMax=-Infinity, tyMin=Infinity, tyMax=-Infinity;
      tiles.forEach(tl=>{ if(tl.tx<txMin)txMin=tl.tx; if(tl.tx>txMax)txMax=tl.tx; if(tl.ty<tyMin)tyMin=tl.ty; if(tl.ty>tyMax)tyMax=tl.ty; });
      return { zoom, tiles, txMin, txMax, tyMin, tyMax };
    }
  }
  return null;
}

// Proyecta los puntos GPS reales de la carrera usando Web Mercator para el
// modo "cámara dinámica" del video: en vez de encoger toda la ruta para que
// entre en el recuadro (como hacíamos antes), acá la escala es real (metros
// por píxel fijo, ver FOLLOW_TARGET_METERS) y en cada cuadro la cámara se
// centra en la posición actual del corredor -- el mapa y el trazado ya
// recorrido se mueven por debajo, como en los videos de Strava. También
// devuelve el plan de tiles (computeFollowCameraPlan) que necesita
// loadFollowMapForVideo para cargar el mosaico real.
function computeVideoRouteData(r, rectX, rectY, rectW, rectH, pad){
  // Filtramos puntos sin lat/lon numérica (defensivo: un solo punto corrupto
  // en el estado guardado no debería tirar abajo el cálculo de toda la ruta).
  const pts = (r.points||[]).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if(pts.length<2) return null;
  let latMin=Infinity, latMax=-Infinity, lonMin=Infinity, lonMax=-Infinity;
  pts.forEach(p=>{
    if(p.lat<latMin) latMin=p.lat; if(p.lat>latMax) latMax=p.lat;
    if(p.lon<lonMin) lonMin=p.lon; if(p.lon>lonMax) lonMax=p.lon;
  });
  const latMid = (latMin+latMax)/2;
  const availW = rectW - pad*2, availH = rectH - pad*2;

  const followPlan = computeFollowCameraPlan(pts, latMid, availW, availH);
  const followZoom = followPlan.zoom;
  const followProj = pts.map(p => webMercatorProject(p.lat, p.lon, followZoom));

  const cum=[0];
  for(let i=1;i<pts.length;i++) cum.push(cum[i-1]+haversine(pts[i-1].lat,pts[i-1].lon,pts[i].lat,pts[i].lon));
  const totalDist = cum[cum.length-1];

  // Las carreras trackeadas en vivo (después de este cambio) guardan tiempo
  // real por punto GPS (points[].t); las sincronizadas desde Strava sólo
  // traen la posición (polilínea decodificada), sin marca de tiempo por
  // punto. Cuando hay tiempo real lo usamos (refleja mejor los cambios de
  // ritmo reales dentro de la carrera); si no, el tiempo se reparte de forma
  // proporcional a la distancia recorrida -- una aproximación honesta, sin
  // inventar precisión que no tenemos.
  const hasRealTime = pts[0].t!=null && pts[pts.length-1].t!=null && pts[pts.length-1].t > pts[0].t;

  return {
    followProj, cum, totalDist, hasRealTime, times: hasRealTime ? pts.map(p=>p.t) : null,
    followZoom, followPlan, availW, availH
  };
}

// Carga el mosaico de tiles reales (mismo servidor CARTO que ya usa el mapa
// en vivo de la app) que necesita la cámara dinámica para recorrer TODA la
// ruta, según el plan que ya calculó computeVideoRouteData -- así no hace
// falta pedir tiles nuevas cuadro a cuadro mientras se graba, todo el
// recorrido de cámara se arma sobre este único mosaico offscreen.
//
// Devuelve null ante CUALQUIER problema (una tile que falla, timeout, sin
// conexión, canvas contaminado por CORS, mosaico demasiado grande, etc.)
// para garantizar que esto nunca puede producir algo peor que la tarjeta
// plana de antes -- en el peor caso simplemente no se ve el mapa real y el
// trazado se sigue dibujando igual (la cámara dinámica no depende de tener
// mapa real, ver drawFrame en startDynamicVideo).
async function loadFollowMapForVideo(routeData){
  if(!routeData || !routeData.followPlan) return null;
  try{
    const { zoom, tiles, txMin, txMax, tyMin, tyMax } = routeData.followPlan;
    const tileCountX = txMax-txMin+1, tileCountY = tyMax-tyMin+1;
    // Chequeo extra además del tope de tiles ÚNICAS: para una ruta con forma
    // rara (ida y vuelta muy separadas, etc.) el rectángulo que ENVUELVE a
    // todas las tiles necesarias podría ser mucho más grande que la cantidad
    // de tiles real -- no queremos reservar un canvas gigantesco vacío.
    if(tileCountX<=0 || tileCountY<=0 || tileCountX*tileCountY > FOLLOW_MAX_TILES*2) return null;

    const maxTile = Math.pow(2, zoom);
    const subdomains = ['a','b','c','d'];
    const loadTile = (tx, ty) => new Promise(resolve=>{
      if(ty<0 || ty>=maxTile){ resolve(null); return; }
      const wrappedX = ((tx % maxTile) + maxTile) % maxTile;
      const s = subdomains[Math.abs(tx+ty) % subdomains.length];
      const img = new Image();
      img.crossOrigin = 'anonymous';
      let done = false;
      const finish = (val)=>{ if(done) return; done=true; resolve(val); };
      const timer = setTimeout(()=>finish(null), 6000);
      img.onload = ()=>{ clearTimeout(timer); finish(img); };
      img.onerror = ()=>{ clearTimeout(timer); finish(null); };
      img.src = cartoTileUrl(s, zoom, wrappedX, ty);
    });

    const results = await Promise.all(tiles.map(tl => loadTile(tl.tx, tl.ty)));
    if(results.every(img=>!img)) return null;

    const off = document.createElement('canvas');
    off.width = tileCountX*MAP_TILE_SIZE;
    off.height = tileCountY*MAP_TILE_SIZE;
    const octx = off.getContext('2d');
    // Fondo parejo antes de pegar las tiles: si alguna tile puntual falló
    // (timeout, 404, etc.) el hueco se ve como el resto de la tarjeta en vez
    // de quedar transparente/negro.
    octx.fillStyle = '#23282c';
    octx.fillRect(0, 0, off.width, off.height);
    tiles.forEach((tl,i)=>{
      const img = results[i];
      if(!img) return;
      try{ octx.drawImage(img, (tl.tx-txMin)*MAP_TILE_SIZE, (tl.ty-tyMin)*MAP_TILE_SIZE); }catch(e){}
    });

    // Chequeo de "taint": si alguna tile contaminó el canvas (cross-origin
    // sin CORS bien habilitado), getImageData tira excepción. En ese caso NO
    // copiamos nada de esto al canvas de grabación -- un canvas contaminado
    // rompe captureStream() en silencio (graba cuadros vacíos).
    try{ octx.getImageData(0,0,1,1); }catch(e){ return null; }

    return { canvas: off, originWX: txMin*MAP_TILE_SIZE, originWY: tyMin*MAP_TILE_SIZE };
  }catch(e){
    return null;
  }
}

function closeDynamicVideo(){
  if(rdVideoState){
    rdVideoState.cancelled = true;
    if(rdVideoState.raf) cancelAnimationFrame(rdVideoState.raf);
    if(rdVideoState.recorder && rdVideoState.recorder.state!=='inactive'){
      try{ rdVideoState.recorder.stop(); }catch(e){}
    }
    if(rdVideoState.url) URL.revokeObjectURL(rdVideoState.url);
  }
  rdVideoState = null;
  const overlay = document.getElementById('rd-video-overlay');
  const canvas = document.getElementById('rd-video-canvas');
  const video = document.getElementById('rd-video-preview');
  const actions = document.getElementById('rd-video-actions');
  const progressEl = document.getElementById('rd-video-progress');
  if(overlay) overlay.style.display='none';
  if(video){ try{ video.pause(); }catch(e){} video.removeAttribute('src'); try{ video.load(); }catch(e){} video.style.display='none'; }
  if(canvas) canvas.style.display='none';
  if(actions) actions.style.display='none';
  if(progressEl) progressEl.textContent='';
}

async function startDynamicVideo(runId){
  if(rdVideoState) closeDynamicVideo();
  const r = state.runs.find(x => String(x.id) === String(runId));
  if(!r || !r.points || r.points.length<2){ showToast(t('rd_video_error'), 'error'); return; }
  if(typeof MediaRecorder==='undefined' || !document.createElement('canvas').captureStream){
    showToast(t('rd_video_unsupported'), 'error');
    return;
  }

  const overlay = document.getElementById('rd-video-overlay');
  const canvas = document.getElementById('rd-video-canvas');
  const video = document.getElementById('rd-video-preview');
  const progressEl = document.getElementById('rd-video-progress');
  const actions = document.getElementById('rd-video-actions');
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');

  const mapX=34, mapY=176, mapW=W-68, mapH=640, mapPad=26;
  const routeData = computeVideoRouteData(r, mapX, mapY, mapW, mapH, mapPad);
  if(!routeData || routeData.totalDist<=0){ showToast(t('rd_video_error'), 'error'); return; }

  // Mapa real: intentamos cargar el mosaico de tiles que necesita la cámara
  // dinámica para recorrer toda la ruta (ver loadFollowMapForVideo). Si algo
  // falla -- sin conexión, CORS, timeout, lo que sea -- followMap queda en
  // null y drawFrame sigue mostrando la cámara dinámica igual (el trazado
  // moviéndose bajo el corredor centrado) pero sobre la tarjeta plana de
  // siempre en vez de calles reales: nunca puede quedar peor que antes.
  let followMap = null;
  try{
    followMap = await loadFollowMapForVideo(routeData);
  }catch(e){ followMap = null; }

  video.style.display='none'; video.removeAttribute('src');
  actions.style.display='none';
  canvas.style.display='block';
  overlay.style.display='flex';
  progressEl.textContent = t('rd_video_generating');

  try{
    await Promise.all([
      document.fonts.load('400 60px "Bebas Neue"'),
      document.fonts.load('700 64px "JetBrains Mono"'),
      document.fonts.load('700 24px "Inter"'),
    ]);
    await document.fonts.ready;
  }catch(e){}

  const dateStr = new Date(r.date).toLocaleDateString(LOCALE_MAP[lang], {day:'numeric', month:'long', year:'numeric'});
  const totalDist = routeData.totalDist;
  const ANIM_MS = Math.round(Math.min(12000, Math.max(6000, 1500 + totalDist*900)));
  const bg1 = (getComputedStyle(document.documentElement).getPropertyValue('--asphalt-2')||'#1c2126').trim() || '#1c2126';
  const bg2 = (getComputedStyle(document.documentElement).getPropertyValue('--asphalt')||'#14181b').trim() || '#14181b';

  // Capa auxiliar SOLO para el trazado y el marcador, del tamaño exacto del
  // interior del recuadro del mapa. En el modo "cámara dinámica" el trazado
  // ya recorrido puede quedar, en píxeles de mundo, muy lejos del centro de
  // pantalla (la escala ahora es real, no se encoge para que la ruta entera
  // entre en el recuadro como antes) -- así que hace falta recortarlo a los
  // límites de la tarjeta. En vez de ctx.clip() en el canvas principal
  // (sospechoso de romper canvas.captureStream() en el WebView de iOS, ver
  // comentario más abajo) dibujamos en este canvas aparte, que recorta solo
  // por tener ese tamaño fijo, y lo pegamos entero con un drawImage() plano.
  const routeLayer = document.createElement('canvas');
  routeLayer.width = Math.max(1, Math.round(routeData.availW));
  routeLayer.height = Math.max(1, Math.round(routeData.availH));
  const routeCtx = routeLayer.getContext('2d');

  // Tarjeta del mapa: fondo bien visible (antes casi transparente, por eso no se
  // veía) + borde sutil, dibujados con fill/stroke normales, SIN ctx.clip(). En
  // algunos WebView de iOS (donde corre la app empaquetada) combinar ctx.clip()
  // con canvas.captureStream() puede hacer que esa región no quede grabada.
  function drawFrame(p, virtualDist, cursor){
    // Reseteamos sombra explícitamente: en el WebView de la app empaquetada
    // (iOS) usar ctx.shadowBlur en un canvas que se está grabando con
    // captureStream() puede dejar el resto del cuadro -- todo lo que se
    // dibuja con fill()/stroke() después, no el texto -- sin grabarse, aunque
    // en el canvas en vivo se vea bien. Por eso ya no usamos sombra en nada
    // de este video (antes la tarjeta del mapa tenía una, y todo lo que se
    // dibujaba después -- la propia tarjeta, la ruta, el marcador -- no
    // aparecía en el video final, aunque el texto sí).
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    const grad = ctx.createLinearGradient(0,0,0,H);
    grad.addColorStop(0, bg1); grad.addColorStop(1, bg2);
    ctx.fillStyle = grad; ctx.fillRect(0,0,W,H);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#D6FF3F';
    ctx.font = '400 54px "Bebas Neue", Arial, sans-serif';
    ctx.fillText('ZANCADA', 40, 78);
    ctx.fillStyle = 'rgba(237,239,239,0.6)';
    ctx.font = '500 22px "Inter", Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(dateStr, W-40, 68);
    ctx.textAlign = 'left';

    // Posición actual de la cámara en píxeles de "mundo" al zoom de
    // seguimiento (mismo sistema que routeData.followProj) -- interpolada
    // entre el punto actual y el siguiente para que el paneo sea suave
    // cuadro a cuadro, igual que antes se interpolaba la posición del
    // marcador.
    let camX = routeData.followProj[cursor].x, camY = routeData.followProj[cursor].y;
    if(cursor < routeData.followProj.length-1){
      const dA = routeData.cum[cursor], dB = routeData.cum[cursor+1];
      const frac = dB>dA ? Math.max(0, Math.min(1, (virtualDist-dA)/(dB-dA))) : 0;
      camX = routeData.followProj[cursor].x + (routeData.followProj[cursor+1].x-routeData.followProj[cursor].x)*frac;
      camY = routeData.followProj[cursor].y + (routeData.followProj[cursor+1].y-routeData.followProj[cursor].y)*frac;
    }

    if(followMap){
      // Mapa real: recortamos del mosaico precargado la ventana que
      // corresponde a la posición actual de la cámara (sin ctx.clip() a
      // propósito -- el recorte lo hace el propio ancho/alto del destino)
      // más un velo bien sutil, solo para que el trazado y el marcador no
      // se pierdan sobre calles muy claras -- antes era más oscuro y tapaba
      // demasiado el mapa real.
      try{
        const sx = camX - followMap.originWX - routeData.availW/2;
        const sy = camY - followMap.originWY - routeData.availH/2;
        ctx.drawImage(followMap.canvas, sx, sy, routeData.availW, routeData.availH, mapX+mapPad, mapY+mapPad, routeData.availW, routeData.availH);
        ctx.fillStyle = 'rgba(0,0,0,0.07)';
        ctx.fillRect(mapX+mapPad, mapY+mapPad, routeData.availW, routeData.availH);
      }catch(e){
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        rdRoundRectPath(ctx, mapX, mapY, mapW, mapH, 28);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      rdRoundRectPath(ctx, mapX, mapY, mapW, mapH, 28);
      ctx.fill();
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    rdRoundRectPath(ctx, mapX, mapY, mapW, mapH, 28);
    ctx.stroke();

    // Trazo parejo de un solo color (el verde de la marca), dibujado en
    // coordenadas relativas a la cámara -- el corredor queda siempre fijo en
    // el centro de la tarjeta (como en los videos de Strava) y el trazado ya
    // recorrido se desliza por debajo a medida que avanza la carrera. Se
    // dibuja en routeLayer (ver más arriba) para que quede recortado a los
    // límites de la tarjeta sin usar ctx.clip() en el canvas que se graba.
    // Envuelto en try/catch a propósito: si algo de esto tira una excepción
    // en el teléfono, preferimos ver el mensaje de error dibujado en rojo
    // (aparece en el video) a que la carátula quede muda sobre qué pasó.
    const centerLocalX = routeData.availW/2, centerLocalY = routeData.availH/2;
    try{
      routeCtx.clearRect(0, 0, routeLayer.width, routeLayer.height);
      routeCtx.beginPath();
      routeCtx.moveTo(centerLocalX + (routeData.followProj[0].x-camX), centerLocalY + (routeData.followProj[0].y-camY));
      for(let i=1;i<=cursor;i++){
        routeCtx.lineTo(centerLocalX + (routeData.followProj[i].x-camX), centerLocalY + (routeData.followProj[i].y-camY));
      }
      routeCtx.lineTo(centerLocalX, centerLocalY);
      routeCtx.lineCap='round'; routeCtx.lineJoin='round';
      routeCtx.lineWidth = 12; routeCtx.strokeStyle = 'rgba(0,0,0,0.35)';
      routeCtx.stroke();
      routeCtx.lineWidth = 7; routeCtx.strokeStyle = '#D6FF3F';
      routeCtx.stroke();

      routeCtx.beginPath(); routeCtx.arc(centerLocalX,centerLocalY,17,0,Math.PI*2); routeCtx.fillStyle='rgba(255,255,255,0.22)'; routeCtx.fill();
      routeCtx.beginPath(); routeCtx.arc(centerLocalX,centerLocalY,8,0,Math.PI*2); routeCtx.fillStyle='#fff'; routeCtx.fill();
      routeCtx.lineWidth=3; routeCtx.strokeStyle = '#D6FF3F'; routeCtx.stroke();

      ctx.drawImage(routeLayer, mapX+mapPad, mapY+mapPad);
    }catch(drawErr){
      ctx.textAlign='left';
      ctx.font = '700 15px monospace';
      ctx.fillStyle = '#FF5A5A';
      ctx.fillText('ERROR: '+drawErr.message, mapX+10, mapY+mapH/2);
    }

    let currentTimeSec;
    if(routeData.hasRealTime){
      const nextIdx = Math.min(cursor+1, routeData.times.length-1);
      const dA=routeData.cum[cursor], dB=routeData.cum[nextIdx];
      const frac = dB>dA ? Math.max(0, Math.min(1, (virtualDist-dA)/(dB-dA))) : 0;
      currentTimeSec = routeData.times[cursor] + (routeData.times[nextIdx]-routeData.times[cursor])*frac;
    } else {
      currentTimeSec = totalDist>0 ? (virtualDist/totalDist)*r.durationSec : 0;
    }
    const currentPace = virtualDist>0.05 ? (currentTimeSec/60)/virtualDist : null;

    // Estadísticas más abajo (antes quedaban pegadas al borde del mapa).
    const statsY = mapY+mapH+130;
    ctx.textAlign='center';
    ctx.fillStyle = '#EDEFEF';
    ctx.font = '700 88px "JetBrains Mono", monospace';
    ctx.fillText(fmtDist(virtualDist), W/2, statsY);
    ctx.fillStyle = 'rgba(237,239,239,0.55)';
    ctx.font = '700 24px "Inter", Arial, sans-serif';
    ctx.fillText(distUnit().toUpperCase(), W/2, statsY+38);

    const rowY = statsY+118;
    const colW = (W-80)/2;
    ctx.font = '700 46px "JetBrains Mono", monospace';
    ctx.fillStyle = '#EDEFEF';
    ctx.fillText(fmtTime(Math.round(currentTimeSec)), 40+colW/2, rowY);
    ctx.fillText(currentPace!=null ? (fmtPace(currentPace)+'/'+distUnit()) : '--:--', 40+colW+colW/2, rowY);
    ctx.font = '700 20px "Inter", Arial, sans-serif';
    ctx.fillStyle = 'rgba(237,239,239,0.55)';
    ctx.fillText(t('run_time').toUpperCase(), 40+colW/2, rowY+34);
    ctx.fillText(t('run_pace_word').toUpperCase(), 40+colW+colW/2, rowY+34);

    const barY = H-56, barW = W-80, barH=6;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    rdRoundRectPath(ctx, 40, barY, barW, barH, 3); ctx.fill();
    ctx.fillStyle = '#D6FF3F';
    rdRoundRectPath(ctx, 40, barY, Math.max(barH, barW*p), barH, 3); ctx.fill();
    ctx.textAlign='left';
  }

  // Pintamos el primer cuadro ANTES de pedir captureStream(): en algunos
  // WebView (iOS) si el canvas todavía está en blanco cuando se llama a
  // captureStream(), el video queda grabado en negro/vacío de principio a
  // fin, aunque el canvas se siga dibujando bien después.
  drawFrame(0, 0, 0);

  let mimeType = '';
  ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'].forEach(c=>{
    if(!mimeType && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) mimeType=c;
  });

  let stream, recorder;
  try{
    stream = canvas.captureStream(30);
    recorder = mimeType ? new MediaRecorder(stream, {mimeType, videoBitsPerSecond:4000000}) : new MediaRecorder(stream);
  }catch(e){
    closeDynamicVideo();
    showToast(t('rd_video_unsupported'), 'error');
    return;
  }

  // El tipo real del archivo grabado lo sabe el propio MediaRecorder
  // (recorder.mimeType) -- lo usamos en vez de nuestra variable "mimeType"
  // (que es solo lo que NOSOTROS pedimos) porque en algunos navegadores el
  // valor real puede diferir. Y le sacamos el ";codecs=..." de la cola: el
  // resto de la app comparte archivos (la imagen de la carrera, el .ics del
  // calendario) siempre con un tipo MIME "pelado" como 'image/png', nunca
  // con parámetros de codec -- ese es justo el tipo de string que
  // navigator.canShare()/el share sheet de iOS puede no reconocer como
  // "compartible" y hacer que la app caiga al método de descarga directa
  // (que en el WebView empaquetado no sabe qué hacer con un video y por eso
  // se veía como "formato incompatible").
  const recordedMimeType = ((recorder.mimeType || mimeType || 'video/webm').split(';')[0] || 'video/webm').trim();

  const chunks = [];
  recorder.ondataavailable = (e)=>{ if(e.data && e.data.size>0) chunks.push(e.data); };
  rdVideoState = { recorder, cancelled:false, raf:null, url:null, blob:null };

  recorder.onstop = ()=>{
    if(!rdVideoState || rdVideoState.cancelled) return;
    const blob = new Blob(chunks, {type: recordedMimeType});
    rdVideoState.blob = blob;
    const url = URL.createObjectURL(blob);
    rdVideoState.url = url;
    canvas.style.display='none';
    video.src = url;
    video.style.display='block';
    video.play().catch(()=>{});
    progressEl.textContent='';
    actions.style.display='flex';
    // Arrancamos en paralelo (sin esperar acá) el arreglo del contenedor del
    // video del lado del servidor -- ver rdRemuxVideoIfNeeded. La vista previa
    // ya se puede mostrar con el video tal cual sale de MediaRecorder porque
    // <video> lo reproduce bien; el problema es sólo al exportarlo. Si para
    // cuando el usuario aprieta compartir/descargar ya terminó, usamos el
    // arreglado; si no, downloadDynamicVideo() lo espera un toque.
    rdRemuxVideoIfNeeded();
  };

  recorder.start();
  let cursor = 0;
  const t0 = performance.now();
  function frame(now){
    if(!rdVideoState || rdVideoState.cancelled) return;
    const p = Math.min(1, (now-t0)/ANIM_MS);
    const virtualDist = p*totalDist;
    while(cursor < routeData.followProj.length-2 && routeData.cum[cursor+1]<=virtualDist) cursor++;
    drawFrame(p, virtualDist, cursor);
    if(progressEl) progressEl.textContent = Math.round(p*100)+'%';
    if(p<1){
      rdVideoState.raf = requestAnimationFrame(frame);
    } else {
      if(progressEl) progressEl.textContent = t('rd_video_finishing');
      setTimeout(()=>{ if(rdVideoState && !rdVideoState.cancelled) recorder.stop(); }, 400);
    }
  }
  rdVideoState.raf = requestAnimationFrame(frame);
}

// El video que graba MediaRecorder en Safari/WKWebView (iPhone) queda en MP4
// "fragmentado" -- un formato válido (por eso el <video> de la vista previa
// lo reproduce bien) pero que el importador de Fotos de iOS y el validador de
// adjuntos de WhatsApp rechazan sin avisar bien por qué (el panel de compartir
// se abre, pero falla al elegir destino). El arreglo real es reprocesarlo del
// lado del servidor con ffmpeg (api/remux-video.js) para reordenarlo al
// formato clásico -- no hay forma confiable de hacer esto en el propio
// celular sin una librería pesada. Si algo falla acá (sin sesión, sin datos
// móviles en ese momento, el servidor tarda, etc.) nos quedamos con el video
// original tal cual salió -- nunca dejamos al usuario sin nada.
async function rdRemuxVideoIfNeeded(){
  if(!rdVideoState || !rdVideoState.blob) return;
  const blob = rdVideoState.blob;
  if(!(blob.type||'').includes('mp4')) return; // el problema es específico de MP4 (Safari); webm no lo necesita
  rdVideoState.remuxState = 'pending';
  try{
    const { data: { session } } = await supabaseClient.auth.getSession();
    if(!session || !session.access_token) throw new Error('no session');
    const resp = await fetch(apiUrl('/api/remux-video'), {
      method:'POST',
      headers:{'Content-Type': blob.type, 'Authorization':`Bearer ${session.access_token}`},
      body: blob
    });
    if(!resp.ok) throw new Error('remux http '+resp.status);
    const fixedBlob = await resp.blob();
    if(fixedBlob && fixedBlob.size>0 && rdVideoState && !rdVideoState.cancelled){
      rdVideoState.blob = fixedBlob;
    }
  }catch(e){
    console.warn('rdRemuxVideoIfNeeded: no se pudo optimizar el video del lado del servidor, se comparte el original', e);
  }finally{
    if(rdVideoState) rdVideoState.remuxState = 'done';
  }
}
async function downloadDynamicVideo(){
  if(!rdVideoState || !rdVideoState.blob) return;
  if(rdVideoState.remuxState === 'pending'){
    // Le damos un margen a que termine de optimizarse en el servidor -- pero
    // no de más: si tarda mucho (sin datos móviles, servidor lento), preferimos
    // compartir el original a dejar al usuario esperando sin poder hacer nada.
    const downloadBtn = document.querySelector('#rd-video-actions .btn-primary');
    const originalLabel = downloadBtn ? downloadBtn.textContent : '';
    if(downloadBtn) downloadBtn.textContent = t('rd_video_optimizing');
    await Promise.race([
      new Promise(resolve=>{
        const iv = setInterval(()=>{
          if(!rdVideoState || rdVideoState.remuxState !== 'pending'){ clearInterval(iv); resolve(); }
        }, 150);
      }),
      new Promise(resolve=>setTimeout(resolve, 6000))
    ]);
    if(downloadBtn) downloadBtn.textContent = originalLabel;
  }
  if(!rdVideoState || !rdVideoState.blob) return;
  const blob = rdVideoState.blob;
  const dateSlug = (rdCurrent && rdCurrent.r && rdCurrent.r.date ? rdCurrent.r.date : new Date().toISOString()).slice(0,10);
  // La extensión del archivo tiene que coincidir con el tipo real del video
  // grabado. Antes el nombre quedaba hardcodeado en ".webm" sin importar qué
  // formato haya elegido MediaRecorder -- pero Safari/WKWebView (la app
  // empaquetada de iOS) normalmente NO soporta grabar en webm y termina
  // grabando en video/mp4. Un archivo "algo.webm" cuyo contenido real es MP4
  // confunde al share sheet: por eso WhatsApp lo trataba como si "no
  // existiera" (lo recibía pero no lo reconocía como un video válido).
  const mime = blob.type || 'video/webm';
  const ext = mime.includes('mp4') ? 'mp4' : (mime.includes('webm') ? 'webm' : 'mp4');
  const fileName = `zancada-${dateSlug}.${ext}`;
  try{
    const file = new File([blob], fileName, {type: mime});
    if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file], title:'Zancada'});
      return;
    }
  }catch(e){ /* si el share falla o lo cancela, seguimos con la descarga directa */ }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 5000);
}
function changeRunShoe(runId, newShoeId){
  const r = state.runs.find(x => String(x.id) === String(runId));
  if(!r) return;
  const oldShoe = state.shoes.find(s => String(s.id) === String(r.shoeId));
  if(oldShoe) oldShoe.km = Math.max(0, oldShoe.km - r.distanceKm);
  r.shoeId = newShoeId || null;
  const newShoe = state.shoes.find(s => String(s.id) === String(r.shoeId));
  if(newShoe) newShoe.km += r.distanceKm;
  checkShoeWearAlerts();
  persist();
  renderHistory();
  renderPerfil();
}

/* ---- editar una carrera cargada -----
   Antes, la única forma de corregir una carrera con un dato mal cargado (una
   distancia mal importada de Strava, un error al cargarla a mano) era borrarla
   entera y perder el registro. Reutiliza los mismos campos que el alta manual. */
let editingRunId = null;
function openEditRun(runId){
  const r = state.runs.find(x => String(x.id) === String(runId));
  if(!r) return;
  editingRunId = runId;
  // localDateISO, no toISOString().slice(0,10): esto último muestra el día en UTC, que
  // para una carrera cargada a última hora de la noche puede ser el día SIGUIENTE al
  // real (ver el comentario junto a localDateISO/getTodayRun).
  document.getElementById('edit-run-date').value = localDateISO(r.date);
  dateBoxUpdaters['edit-run-date'] && dateBoxUpdaters['edit-run-date']();
  document.getElementById('edit-run-dist').value = r.distanceKm;
  document.getElementById('edit-run-dur').value = Math.round((r.durationSec/60)*10)/10;
  const avgHr = r.avgHr || (r.hrLog && r.hrLog.length ? Math.round(r.hrLog.reduce((a,h)=>a+h.bpm,0)/r.hrLog.length) : '');
  document.getElementById('edit-run-hr').value = avgHr || '';
  const sel = document.getElementById('edit-run-shoe');
  sel.innerHTML = `<option value="">${t('hist_no_shoe')}</option>` + state.shoes.map(s=>`<option value="${s.id}" ${String(s.id)===String(r.shoeId)?'selected':''}>${escapeHtml(s.name)}</option>`).join('');
  document.getElementById('edit-run-modal').style.display = 'block';
}
function closeEditRun(){ document.getElementById('edit-run-modal').style.display = 'none'; editingRunId = null; }
async function saveEditRun(){
  const r = state.runs.find(x => String(x.id) === String(editingRunId));
  if(!r) return;
  const date = document.getElementById('edit-run-date').value;
  const dist = parseFloat(document.getElementById('edit-run-dist').value);
  const durMin = parseFloat(document.getElementById('edit-run-dur').value);
  if(!date || !(dist>0) || !(durMin>0)){ showToast(t('edit_run_invalid'),'error'); return; }
  const hr = parseInt(document.getElementById('edit-run-hr').value);
  const newShoeId = document.getElementById('edit-run-shoe').value || null;

  // reacomodamos el kilometraje acumulado de zapatillas: se lo restamos al par viejo
  // (con la distancia vieja) y se lo sumamos al par nuevo (con la distancia nueva) --
  // puede ser el mismo par, en cuyo caso el resultado neto es solo el ajuste de km.
  const oldShoe = state.shoes.find(s => String(s.id) === String(r.shoeId));
  if(oldShoe) oldShoe.km = Math.max(0, oldShoe.km - r.distanceKm);

  // conservamos la hora original de la carrera, solo cambiamos el día -- así no se
  // desordena si en algún lado se usa la hora para algo.
  const oldMoment = new Date(r.date);
  const newDate = new Date(date+'T00:00:00');
  newDate.setHours(oldMoment.getHours(), oldMoment.getMinutes(), oldMoment.getSeconds());
  r.date = newDate.toISOString();
  r.distanceKm = dist;
  r.durationSec = Math.round(durMin*60);
  if(hr>0){ r.avgHr = hr; if(!r.hrLog || r.hrLog.length<=1) r.hrLog = [{t:0,bpm:hr}]; }
  r.shoeId = newShoeId;

  const newShoe = state.shoes.find(s => String(s.id) === String(newShoeId));
  if(newShoe) newShoe.km += dist;
  checkShoeWearAlerts();

  const savedRunId = r.id;
  closeEditRun();
  renderHistory(); renderPerfil(); renderAll();
  openRunDetail(savedRunId); // refresca el detalle con los datos nuevos, por si vuelve a mirarlo
  await persist();
  showToast(t('save_confirmed'));
}

/* ================= COACH CHAT (con tool-use real para editar el plan) ================= */
function seedCoachGreeting(){
  state.chat = [{role:'coach', text: t('coach_greeting', {name:state.profile.name, km:state.profile.weeklyKm, goal:t('ob_goal_'+state.profile.goal)}), ts:Date.now()}];
  renderChat();
}
function renderChat(){
  const msgs = state.chat;
  let html = '';
  for(let i=0;i<msgs.length;i++){
    const m = msgs[i];
    const prev = msgs[i-1];
    const next = msgs[i+1];
    const GAP = 5*60000;
    const sameAsPrev = !!(prev && prev.role===m.role && m.role!=='system' && m.ts && prev.ts && (m.ts-prev.ts) < GAP);
    const sameAsNext = !!(next && next.role===m.role && m.role!=='system' && m.ts && next.ts && (next.ts-m.ts) < GAP);
    let groupCls = '';
    if(m.role!=='system'){
      groupCls = sameAsPrev && sameAsNext ? 'mid' : sameAsPrev ? 'last' : sameAsNext ? 'first' : '';
    }
    const safeText = m.role==='system' ? m.text : m.role==='coach' ? formatCoachText(m.text) : escapeHtml(m.text);
    html += `<div class="msg ${m.role} ${groupCls}">${safeText}</div>`;
    if(m.role!=='system' && m.ts && !sameAsNext){
      const d = new Date(m.ts);
      const hh = String(d.getHours()).padStart(2,'0');
      const mm = String(d.getMinutes()).padStart(2,'0');
      html += `<div class="msg-time ${m.role==='user'?'right':'left'}">${hh}:${mm}</div>`;
    }
  }
  document.getElementById('chatLog').innerHTML = html;
  renderChatChips();
  scrollChatToBottom();
  updateChatBadge();
}
// Puntito en la pestaña del coach cuando hay un mensaje suyo (proactivo o de ajuste
// automático) que todavía no viste, para no depender de entrar "porque sí" a mirar.
function updateChatBadge(){
  const badge = document.getElementById('chat-tab-badge');
  if(!badge) return;
  const lastSeen = state.lastSeenChatTs || 0;
  const hasUnread = (state.chat||[]).some(m => m.role==='coach' && m.ts && m.ts > lastSeen);
  badge.style.display = hasUnread ? 'block' : 'none';
}
// Chips de respuesta rápida con las preguntas más típicas, para no tener que escribir
// todo siempre (sobre todo recién terminada una corrida). Se muestran una sola vez,
// pegadas debajo del último mensaje, y desaparecen mientras el coach está respondiendo.
const CHAT_CHIP_KEYS = ['coach_chip_progress','coach_chip_lower','coach_chip_next','coach_chip_pain'];
function renderChatChips(){
  const log = document.getElementById('chatLog');
  if(!log) return;
  const sendBtn = document.getElementById('chat-send-btn');
  if(sendBtn && sendBtn.dataset.busy==='1') return;
  const chipsHtml = `<div class="chat-chips">${CHAT_CHIP_KEYS.map(k=>`<button class="chat-chip" onclick="sendChatChip('${k}')">${escapeHtml(t(k))}</button>`).join('')}</div>`;
  log.insertAdjacentHTML('beforeend', chipsHtml);
}
function sendChatChip(key){
  // "Me duele algo" ya no manda un mensaje de texto que se pierde en la conversación --
  // abre el registro de molestias (openPainModal), que guarda la molestia con fecha y
  // zona del cuerpo, y desde ahí manda el mensaje al coach con ese detalle adentro.
  if(key === 'coach_chip_pain'){ openPainModal(); return; }
  const input = document.getElementById('chatInput');
  if(!input) return;
  input.value = t(key);
  handleChatSendClick();
}
function scrollChatToBottom(){
  // El chat ahora scrollea dentro de #chatLog (no la página entera) -- ver
  // syncCoachChatLayout() para el porqué del cambio de modelo.
  const scroller = document.getElementById('chatLog');
  if(!scroller) return;
  requestAnimationFrame(()=>{ scroller.scrollTop = scroller.scrollHeight; });
}
// Botón flotante para volver al último mensaje cuando el corredor scrolleó para
// arriba a leer algo viejo en una charla larga.
function updateChatScrollBtn(){
  const btn = document.getElementById('chat-scroll-bottom-btn');
  if(!btn) return;
  const coachActive = document.getElementById('view-coach')?.classList.contains('active');
  if(!coachActive){ btn.style.display='none'; return; }
  const scroller = document.getElementById('chatLog');
  if(!scroller) return;
  const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
  btn.style.display = distanceFromBottom > 200 ? 'flex' : 'none';
}
document.getElementById('chatLog')?.addEventListener('scroll', updateChatScrollBtn, {passive:true});
function paceMinPerKmOf(r){
  if(!r || !r.distanceKm) return '—';
  const p = (r.durationSec/60)/r.distanceKm;
  return `${Math.floor(p)}:${String(Math.round((p%1)*60)).padStart(2,'0')}`;
}
function buildContext(){
  const p = state.profile;
  let ctx = `Nombre: ${p.name}. Edad aprox: ${ageFromBirth(p.birth)}. Peso: ${p.weight}kg. Altura: ${p.height}cm. Corre ${p.weeklyKm}km/semana (calculado automáticamente según objetivo y fecha de carrera). Terreno: ${p.terrain}. Objetivo: ${t('ob_goal_'+p.goal)}. Zonas de FC (bpm): ${JSON.stringify(p.hrZones)}.`;
  if(p.trainingDays && p.trainingDays.length) ctx += ` Días de entreno habituales (cronograma de base, permanente): ${p.trainingDays.map(d=>t('day_'+d)).join(', ')}. Si el corredor pide cambiar este cronograma de forma permanente (no solo esta semana), usá modificar_perfil con dias_entreno.`;
  if(p.raceDate){
    const weeksLeft = Math.round((new Date(p.raceDate) - new Date()) / (7*86400000));
    ctx += ` Fecha de la carrera objetivo: ${p.raceDate} (${weeksLeft>0?`faltan ${weeksLeft} semanas`:'ya pasó'}).`;
  }
  if(p.weeklyGoalKm > 0) ctx += ` Meta de km que el corredor se puso para esta semana: ${p.weeklyGoalKm}km (esto ya se usó para ajustar el volumen del plan actual, dentro de márgenes seguros).`;
  if(p.goalNote) ctx += ` Objetivo personal, en sus propias palabras: "${p.goalNote}".`;
  const gapWeeks = detectTrainingGapWeeks();
  if(gapWeeks >= 2) ctx += ` Hace ${gapWeeks} semanas que no registra una carrera -- si el volumen del plan actual parece bajo, es porque ya se lo redujo automáticamente por esta pausa.`;
  if(p.coachNotes && p.coachNotes.length) ctx += ` Notas permanentes guardadas sobre el corredor (lesiones, preferencias u otros datos a tener en cuenta siempre): ${p.coachNotes.map(n=>`"${n}"`).join('; ')}.`;
  const activePains = activePainEntries();
  if(activePains.length) ctx += ` Molestias activas registradas por el corredor: ${activePains.map(pa=>`${t('pain_body_'+pa.bodyPart)} (desde ${pa.date}${pa.note?', nota: "'+pa.note+'"':''})`).join('; ')}. Tenelas en cuenta al sugerir ejercicios y preguntá cómo siguen si corresponde.`;
  const todayReadiness = todayReadinessEntry();
  if(todayReadiness) ctx += ` Check-in de hoy sobre cómo durmió/energía: ${todayReadiness.quality}.`;
  if(state.event) ctx += ` Carrera cargada en "Próximos eventos" (informativa, no es necesariamente la carrera objetivo del perfil): ${state.event.name} (${state.event.type}) el ${state.event.date}.`;
  if(state.runs.length){
    // En vez de solo la última carrera, le damos al coach una tendencia real: las
    // últimas corridas con ritmo y cuánto volumen acumulado hay en las últimas semanas.
    // Así puede responder con criterio si le preguntan "¿cómo vengo?" o "¿mejoré el ritmo?",
    // en vez de solo reaccionar a lo último que pasó.
    const recent = state.runs.slice(-5);
    const runsSummary = recent.map(r=>`${localDateISO(r.date)}: ${r.distanceKm.toFixed(2)}km en ${fmtTime(r.durationSec)} (ritmo ${paceMinPerKmOf(r)}/km)`).join('; ');
    const cutoff = Date.now() - 28*86400000;
    const last4wKm = state.runs.filter(r=>new Date(r.date).getTime() >= cutoff).reduce((s,r)=>s+r.distanceKm,0);
    ctx += ` Últimas carreras registradas (de más vieja a más nueva): ${runsSummary}. Total corrido en los últimos 28 días: ${last4wKm.toFixed(1)}km.`;
  }
  if(state.shoes.length) ctx += ` Zapatillas: ${state.shoes.map(s=>`${s.name} (${s.km.toFixed(0)}km, ${s.terrain})`).join(', ')}.`;
  // Le pasamos al coach el mismo indicador de carga (agudo:crónico) que ya ve el
  // corredor en la pantalla de Inicio -- antes lo calculábamos solo para mostrar el
  // tag ahí, y si preguntaban "¿cómo viene mi carga?" el coach no tenía ese dato y
  // podía contestar algo inconsistente con lo que el usuario ya está viendo en pantalla.
  const load = calcTrainingLoad();
  if(load) ctx += ` Indicador de carga de entrenamiento (semana actual vs. promedio reciente): ${load.level} (ratio ${load.ratio.toFixed(2)}, corrió ${load.acuteKm.toFixed(1)}km esta semana vs. promedio de ${load.chronicWeeklyAvg.toFixed(1)}km/semana). Este es el mismo indicador que ve en la pantalla de Inicio -- si te pregunta por su carga o riesgo de lesión por volumen, usá este dato en vez de estimarlo de nuevo.`;
  // trainBy: si el corredor eligió entrenar "por tiempo" en vez de "por distancia" (ver
  // Perfil/onboarding), el coach tiene que expresar y ajustar TODO en minutos -- series,
  // descansos, sesiones enteras -- nunca en km. El plan interno sigue siendo 100% km
  // (generatePlan no cambia), así que acá le anotamos a cada día su duración estimada
  // (según el ritmo propio del corredor, ver estimateBasePaceMinPerKm) junto al km real,
  // para que el coach pueda hablar en minutos sin perder la referencia de distancia.
  ctx += isTimeMode()
    ? ` Este corredor entrena POR TIEMPO, no por distancia: todas las sesiones, series/pasadas y descansos que le describas o modifiques tienen que estar en minutos (o segundos si son cortos), nunca en km/metros.`
    : ` Este corredor entrena por distancia (km), como es el modo por defecto.`;
  ctx += ` Plan actual: ${state.plan.map(d=>`${d.day}=${d.custom?d.type:d.typeKey}${d.zone?'/Z'+d.zone:''}/${d.dist}km(~${planDurationMin(d)}min)${d.status?'/'+d.status:''}${d.rating?'/calificó:'+d.rating:''}`).join(', ')}.`;
  const nw = getNextWeekPlan();
  ctx += ` Plan de la semana que sigue (semana ${nw.weekNumber}, ya calculado y puede ajustarse un poco según cómo termine esta semana): ${nw.plan.map(d=>`${d.day}=${d.custom?d.type:d.typeKey}${d.zone?'/Z'+d.zone:''}/${d.dist}km(~${planDurationMin(d)}min)`).join(', ')}.`;
  return ctx;
}
const TOOLS = [
  {
    name:"modificar_sesion",
    description:"Modifica UNA sesión puntual del plan semanal: tipo, distancia, zona de frecuencia cardíaca objetivo, terreno y descripción. Usala cuando el corredor pida un cambio en un día específico, de esta semana o de la que sigue. Si semana es 'actual' y el día pedido ya pasó (o ya se corrió/salteó), la herramienta va a rechazar el cambio -- avisale al corredor que ese día ya cerró y ofrecele ajustar desde hoy en adelante, o la semana que viene.",
    input_schema:{type:"object", properties:{
      semana:{type:"string", enum:["actual","siguiente"], description:"Si el cambio es para la semana en curso o para la que sigue. Por defecto 'actual'. Ya tenés el plan de ambas semanas en el contexto."},
      dia:{type:"string", enum:DAY_KEYS, description:"Código del día: mon,tue,wed,thu,fri,sat,sun (siempre en estos códigos, sin importar el idioma de la charla)"},
      tipo:{type:"string", description:"Nombre del tipo de sesión en el idioma de la conversación, ej. 'Rodaje suave', 'Easy run'"},
      distancia_km:{type:"number"},
      duracion_min:{type:"number", description:"Duración de la sesión en minutos. Usalo en vez de distancia_km si el corredor entrena por tiempo (fijate en el contexto) o si pide la sesión directamente en minutos -- se convierte sola a km internamente."},
      zona:{type:"integer", minimum:1, maximum:5},
      terreno:{type:"string", enum:["asfalto","trail","mixto"]},
      descripcion:{type:"string", description:"Instrucción breve para el corredor, en el idioma de la conversación"}
    }, required:["dia","tipo","descripcion"]}
  },
  {
    name:"cancelar_sesion",
    description:"Cancela por completo UNA sesión puntual, dejando ese día vacío -- igual que cualquier otro día sin entrenamiento asignado (no le pone una sesión suave ni de zona 1 en su lugar). Usala cuando el corredor te avise que no va a poder entrenar ese día, o que quiere sacar/cancelar/borrar una sesión sin reemplazarla por otra. NO uses modificar_sesion para esto: modificar_sesion es para CAMBIAR una sesión por otra distinta, no para dejar el día sin nada.",
    input_schema:{type:"object", properties:{
      semana:{type:"string", enum:["actual","siguiente"], description:"Si el cambio es para la semana en curso o para la que sigue. Por defecto 'actual'."},
      dia:{type:"string", enum:DAY_KEYS, description:"Código del día: mon,tue,wed,thu,fri,sat,sun (siempre en estos códigos, sin importar el idioma de la charla)"}
    }, required:["dia"]}
  },
  {
    name:"mover_sesion",
    description:"Mueve/intercambia la sesión de un día puntual a OTRO día de la MISMA semana actual, conservando exactamente el mismo tipo, distancia, terreno, zona y estructura de series -- no hace falta describir la sesión de nuevo. Usala cuando el corredor pida directamente mover/pasar/cambiar de día una sesión ya planificada (ej. 'pasá la sesión del martes al miércoles', 'corré el entrenamiento de hoy para mañana', 'movés lo de mañana al jueves'), sin que cambie el tipo de sesión en sí. Si el día de destino ya tenía otra sesión, los dos días intercambian su contenido entre sí. NO uses modificar_sesion para esto -- modificar_sesion es para CAMBIAR una sesión por una DISTINTA, no para mover la misma de día (perdería el terreno y la descripción original).",
    input_schema:{type:"object", properties:{
      semana:{type:"string", enum:["actual"], description:"Por ahora solo se puede mover una sesión dentro de la semana actual."},
      dia_origen:{type:"string", enum:DAY_KEYS, description:"Día de donde se saca la sesión."},
      dia_destino:{type:"string", enum:DAY_KEYS, description:"Día al que se mueve la sesión."}
    }, required:["dia_origen","dia_destino"]}
  },
  {
    name:"ajustar_volumen_semana",
    description:"Sube o baja el volumen (distancia) de TODAS las sesiones de running de una semana, aplicando un mismo porcentaje. Usala para pedidos generales como 'quiero correr más', 'esta semana quiero sumar kilómetros' o 'bajale un poco', sin que el corredor especifique un día puntual. Por defecto aplica a la semana ACTUAL; si el corredor habla de la semana que sigue, usá semana:'siguiente'.",
    input_schema:{type:"object", properties:{
      semana:{type:"string", enum:["actual","siguiente"], description:"Por defecto 'actual'."},
      porcentaje:{type:"number", description:"Cambio porcentual a aplicar a la distancia de cada sesión. Ejemplo: 15 para +15%, -10 para -10%."}
    }, required:["porcentaje"]}
  },
  {
    name:"modificar_perfil",
    description:"Modifica datos personales del corredor que afectan cómo se generan sus PRÓXIMOS planes semanales: objetivo de entrenamiento, fecha de la carrera objetivo, terreno preferido, frecuencia cardíaca máxima o los días de la semana en que entrena. Los km semanales se recalculan solos según el objetivo y el tiempo hasta la carrera. Si el corredor está cambiando de objetivo (por ejemplo de 5K a 10K) y menciona cuántos km corre actualmente, pasalo en km_actuales para que el nuevo plan arranque desde su realidad real, no de una fórmula genérica — si cambia el objetivo y no te dice cuántos km corre, preguntáselo antes de aplicar el cambio. Usala para cambios permanentes o 'de ahora en adelante', no solo para esta semana. IMPORTANTE: si el corredor dice que quiere cambiar QUÉ DÍAS entrena de forma habitual (ej. 'de ahora en adelante entreno martes y jueves' o 'ya no puedo los lunes'), usá dias_entreno acá en vez de mover o cancelar sesiones sueltas con modificar_sesion/cancelar_sesion/mover_sesion — esas herramientas solo afectan un día puntual de una semana y no cambian el cronograma de base, así que la semana siguiente el corredor volvería a ver sesiones en los días viejos.",
    input_schema:{type:"object", properties:{
      objetivo:{type:"string", enum:["start","5k","10k","15k","21k","42k","ultra","lifestyle"]},
      fecha_carrera:{type:"string", description:"Fecha de la carrera objetivo en formato YYYY-MM-DD, si el corredor la menciona."},
      terreno:{type:"string", enum:["asfalto","trail","mixto"]},
      fc_maxima:{type:"number"},
      km_actuales:{type:"number", description:"Km semanales que el corredor dice estar corriendo ahora mismo. Solo incluir si lo menciona explícitamente."},
      dias_entreno:{type:"array", items:{type:"string", enum:DAY_KEYS}, description:"Nuevo cronograma FIJO y permanente de días de entreno del corredor, ej. ['tue','thu','sun']. Solo incluir cuando el corredor pide cambiar sus días habituales de entrenamiento de ahora en adelante, no para mover o cancelar una sesión de una sola semana."}
    }}
  },
  {
    name:"guardar_nota_coach",
    description:"Guarda un dato permanente sobre el corredor para tenerlo en cuenta siempre de ahora en adelante, aunque no implique cambiar el plan en este momento: una lesión o molestia, una preferencia de entrenamiento, una restricción de horario, o cualquier otro dato relevante que el corredor comparta. Usala apenas el corredor mencione algo así, para no depender de que quede en el historial de la charla.",
    input_schema:{type:"object", properties:{
      nota:{type:"string", description:"El dato a recordar, resumido en una frase breve, en el idioma de la conversación."}
    }, required:["nota"]}
  },
  {
    name:"deshacer_cambio",
    description:"Deshace el ÚLTIMO cambio que aplicaste vos (con cualquiera de las otras herramientas) en esta conversación, dejando el plan y el perfil exactamente como estaban justo antes. Usala cuando el corredor te dice que te confundiste, que no era eso, o te pide explícitamente deshacer/revertir/volver atrás el último cambio. Solo se puede deshacer un paso -- si no hay ningún cambio reciente para deshacer, te va a avisar.",
    input_schema:{type:"object", properties:{}}
  }
];
// Snapshot de un solo nivel para deshacer_cambio: guarda plan + overrides de la semana que
// viene + perfil justo antes de que una herramienta del coach los toque. Se llama al
// principio de cada una de las 5 herramientas que pueden modificar el plan o el perfil,
// incluso en llamadas que después terminan rechazadas por validación (día no encontrado,
// día ya pasado, etc.) -- eso es intencional y no rompe nada: si la llamada no termina
// modificando el estado, el snapshot queda simplemente igual al estado actual, y deshacer
// ese "cambio" sería un no-op inofensivo.
// Vive en state.coachUndoSnapshot (y por lo tanto se persiste igual que el resto del estado)
// a propósito -- antes era una variable de módulo aparte, en memoria nomás, y si el corredor
// cerraba la app (o se recargaba) entre que el coach aplicaba un cambio y el pedido de
// deshacerlo, el snapshot se perdía y deshacer_cambio contestaba "no hay nada para deshacer"
// aunque el cambio siguiera fresco. Guardarlo en `state` lo hace sobrevivir un cierre/reapertura,
// igual que el resto de lo que el coach toca.
function captureUndoSnapshot(){
  state.coachUndoSnapshot = {
    plan: JSON.parse(JSON.stringify(state.plan)),
    nextWeekOverrides: JSON.parse(JSON.stringify(state.nextWeekOverrides || {})),
    profile: JSON.parse(JSON.stringify(state.profile))
  };
}
function applyUndoLastChange(){
  if(!state.coachUndoSnapshot) return 'No hay ningún cambio reciente para deshacer.';
  state.plan = state.coachUndoSnapshot.plan;
  state.nextWeekOverrides = state.coachUndoSnapshot.nextWeekOverrides;
  state.profile = state.coachUndoSnapshot.profile;
  state.coachUndoSnapshot = null; // un solo nivel: no se puede deshacer dos veces seguidas
  renderAll(); renderZones(); persist();
  state.chat.push({role:'system', text:sysMsgWithIcon(ICONS.edit, t('coach_undo_applied')), ts:Date.now()});
  return 'Listo, deshice el último cambio.';
}
function applyPlanChange(input){
  captureUndoSnapshot();
  if(input.semana === 'siguiente'){
    // la semana que sigue no es un array persistido como state.plan, así que el cambio puntual
    // se guarda como "override" y se aplica encima de lo que genere getNextWeekPlan() cada vez
    // (que sigue reaccionando a cómo termine esta semana) hasta que se promueva a semana actual
    if(!state.nextWeekOverrides) state.nextWeekOverrides = {};
    const override = { type: input.tipo, desc: input.descripcion };
    let effectiveDistKm = typeof input.distancia_km==='number' ? input.distancia_km : null;
    if(effectiveDistKm===null && typeof input.duracion_min==='number'){
      effectiveDistKm = Math.max(0.5, Math.round((input.duracion_min / estimateBasePaceMinPerKm(state.profile))*10)/10);
    }
    if(effectiveDistKm!==null) override.dist = effectiveDistKm;
    if(input.zona) override.zone = input.zona;
    if(input.terreno) override.terrain = input.terreno;
    state.nextWeekOverrides[input.dia] = override;
    renderPlan(); persist();
    state.chat.push({role:'system', text:sysMsgWithIcon(ICONS.edit, t('coach_plan_updated')+': '+t('day_'+input.dia)), ts:Date.now()});
    const amountTxt = typeof input.duracion_min==='number' ? `${input.duracion_min}min (~${effectiveDistKm}km)` : (effectiveDistKm!==null ? effectiveDistKm+'km' : '');
    return `OK, actualicé ${input.dia} de la semana que viene: ${input.tipo}${amountTxt?', '+amountTxt:''}${input.zona?', zona '+input.zona:''}.`;
  }
  const d = state.plan.find(x=>x.day===input.dia);
  if(!d) return "Día no encontrado.";
  // El día ya pasó (o ya se corrió/salteó) -- no tiene sentido asignarle ahora un
  // entrenamiento distinto de forma retroactiva. Se lo explicamos al modelo para
  // que se lo cuente al corredor en vez de aplicar el cambio silenciosamente.
  if(isDayLocked(input.dia)) return `No puedo modificar ${input.dia}: ya pasó (o ya se corrió/salteó) esta semana. Puedo ajustar desde hoy en adelante, o la semana que viene.`;
  d.custom = true;
  d.cancelled = false; // si venía de cancelar_sesion, esta sesión nueva reemplaza esa cancelación
  d.type = input.tipo; d.desc = input.descripcion;
  if(typeof input.distancia_km==='number'){
    d.dist = input.distancia_km;
  } else if(typeof input.duracion_min==='number'){
    d.dist = Math.max(0.5, Math.round((input.duracion_min / estimateBasePaceMinPerKm(state.profile))*10)/10);
  }
  if(input.zona) d.zone = input.zona;
  // Si el modelo no menciona terreno (no es obligatorio en la herramienta), no queremos
  // que el día se quede SIN terreno -- antes pasaba justo eso cuando el día venía de ser
  // descanso (terrain:null) y el pedido era, por ejemplo, "pasá la sesión del martes acá":
  // el terreno quedaba en null y el cartel de asfalto/trail desaparecía sin que nadie lo
  // haya pedido. Si ya tenía terreno seteado lo dejamos como está; si no, usamos el
  // terreno preferido del perfil como default razonable.
  if(input.terreno) d.terrain = input.terreno;
  else if(!d.terrain) d.terrain = state.profile.terrain;
  renderPlan(); renderHome(); persist();
  state.chat.push({role:'system', text:sysMsgWithIcon(ICONS.edit, t('coach_plan_updated')+': '+t('day_'+d.day)), ts:Date.now()});
  const amountTxt = typeof input.duracion_min==='number' ? `${input.duracion_min}min (~${d.dist}km)` : `${d.dist}km`;
  return `OK, actualizado ${d.day}: ${d.type}, ${amountTxt}${d.zone?', zona '+d.zone:''}.`;
}
function applyMoveSession(input){
  // Mueve/intercambia la sesión de un día a otro DENTRO de la semana actual, conservando
  // tipo, distancia, terreno, zona y estructura de series exactamente como estaban --
  // pensada para pedidos de "mové/pasá/cambiá de día" una sesión ya planificada, sin que
  // el modelo tenga que reescribir la descripción de memoria (eso es lo que hacía antes
  // modificar_sesion para estos casos, y por eso el día de destino terminaba con una
  // descripción distinta a la original y, a veces, sin terreno).
  captureUndoSnapshot();
  if(input.semana === 'siguiente'){
    return 'Por ahora solo puedo mover una sesión ya planificada dentro de la semana ACTUAL. Para la semana que viene, usá modificar_sesion en cada día.';
  }
  const origIdx = DAY_KEYS.indexOf(input.dia_origen);
  const destIdx = DAY_KEYS.indexOf(input.dia_destino);
  if(origIdx===-1 || destIdx===-1) return 'Día no encontrado.';
  if(origIdx===destIdx) return 'El día de origen y el de destino son el mismo.';
  const origDay = state.plan[origIdx], destDay = state.plan[destIdx];
  if(!origDay || !destDay) return 'Día no encontrado.';
  if(isDayLocked(input.dia_origen)) return `No puedo mover ${input.dia_origen}: ya pasó (o ya se corrió/salteó) esta semana.`;
  if(isDayLocked(input.dia_destino)) return `No puedo mover la sesión a ${input.dia_destino}: ese día ya pasó (o ya se corrió/salteó) esta semana.`;
  swapPlanDaySessions(origDay, destDay);
  renderPlan(); renderHome(); renderRunTodayCard(); persist();
  state.chat.push({role:'system', text:sysMsgWithIcon(ICONS.edit, t('coach_plan_updated')+': '+t('day_'+input.dia_origen)+' → '+t('day_'+input.dia_destino)), ts:Date.now()});
  return `OK, moví la sesión de ${input.dia_origen} a ${input.dia_destino}.`;
}
function applyCancelSession(input){
  // Antes, cuando el corredor cancelaba una sesión por chat, el modelo terminaba
  // llamando a modificar_sesion igual (es la única herramienta de "un día puntual"
  // que conocía) y como esa herramienta exige tipo/descripción, improvisaba algo
  // como "Rodaje suave en zona 1" -- resultado: el día quedaba con un entrenamiento
  // inventado en vez de quedar vacío. Esta herramienta deja el día realmente vacío,
  // igual que cualquier otro día sin sesión asignada (typeKey:'rest', sin custom).
  // Sí queda marcado con d.cancelled (ver preserveLivedDays) para que una regeneración
  // posterior no lo "resucite" con una sesión nueva solo porque ese día sigue siendo,
  // en el perfil, un día de entreno normal -- el corredor lo canceló a propósito.
  captureUndoSnapshot();
  if(input.semana === 'siguiente'){
    if(!state.nextWeekOverrides) state.nextWeekOverrides = {};
    // cancelled:true acá (a diferencia de un override de modificar_sesion) es lo que le permite a
    // getNextWeekPlan() distinguir "cancelé este día" de "personalicé este día" al armar el plan de
    // la semana que viene -- ver el comentario en getNextWeekPlan más abajo.
    state.nextWeekOverrides[input.dia] = { type: t('type_rest'), desc: t('desc_rest'), dist:0, zone:null, terrain:null, cancelled:true };
    renderPlan(); persist();
    state.chat.push({role:'system', text:sysMsgWithIcon(ICONS.edit, t('coach_plan_updated')+': '+t('day_'+input.dia)), ts:Date.now()});
    return `OK, dejé ${input.dia} de la semana que viene sin sesión (descanso).`;
  }
  const d = state.plan.find(x=>x.day===input.dia);
  if(!d) return "Día no encontrado.";
  if(isDayLocked(input.dia)) return `No puedo modificar ${input.dia}: ya pasó (o ya se corrió/salteó) esta semana. Puedo dejarlo sin sesión desde hoy en adelante, o la semana que viene.`;
  d.custom = false;
  d.cancelled = true;
  d.typeKey = 'rest';
  d.type = undefined; d.desc = undefined;
  d.dist = 0; d.zone = null; d.terrain = null;
  delete d.interval;
  renderPlan(); renderHome(); persist();
  state.chat.push({role:'system', text:sysMsgWithIcon(ICONS.edit, t('coach_plan_updated')+': '+t('day_'+d.day)), ts:Date.now()});
  return `OK, dejé ${d.day} sin sesión (descanso).`;
}
function applyVolumeAdjust(input){
  const pct = input.porcentaje;
  if(typeof pct !== 'number') return 'Falta el porcentaje.';
  captureUndoSnapshot();
  const factor = 1 + (pct/100);
  if(input.semana === 'siguiente'){
    const nw = getNextWeekPlan();
    if(!state.nextWeekOverrides) state.nextWeekOverrides = {};
    nw.plan.forEach(d=>{
      if(d.dist>0){
        const lbl = d.custom ? {type:d.type, desc:d.desc} : planLabel(d);
        state.nextWeekOverrides[d.day] = { type: lbl.type, desc: lbl.desc, dist: Math.max(1, Math.round(d.dist*factor)), zone: d.zone, terrain: d.terrain };
      }
    });
    renderPlan(); persist();
    state.chat.push({role:'system', text:sysMsgWithIcon(ICONS.edit, t('coach_plan_updated')), ts:Date.now()});
    return `OK, ajusté el volumen de la semana que viene ${pct>0?'+':''}${pct}%.`;
  }
  // Los días que ya pasaron (o que ya se corrieron/saltearon) quedan afuera del ajuste --
  // no tiene sentido subir o bajar retroactivamente el volumen de un día de esta semana
  // que ya terminó.
  state.plan.forEach(d=>{ if(d.dist>0 && !isDayLocked(d.day)){ d.dist = Math.max(1, Math.round(d.dist*factor)); d.custom = true; } });
  renderPlan(); renderHome(); persist();
  state.chat.push({role:'system', text:sysMsgWithIcon(ICONS.edit, t('coach_plan_updated')), ts:Date.now()});
  return `OK, ajusté el volumen de esta semana ${pct>0?'+':''}${pct}%.`;
}
function applyProfileChange(input){
  captureUndoSnapshot();
  const changes = [];
  let recalc = false;
  if(input.objetivo){ state.profile.goal = input.objetivo; changes.push('objetivo'); recalc = true; }
  if(input.fecha_carrera){ state.profile.raceDate = input.fecha_carrera; changes.push('fecha de carrera'); recalc = true; }
  if(input.terreno){ state.profile.terrain = input.terreno; changes.push('terreno'); }
  if(typeof input.fc_maxima==='number'){ state.profile.hrMax = input.fc_maxima; state.profile.hrKnown = true; state.profile.hrZones = computeZones(input.fc_maxima); changes.push('FC máxima'); }
  if(typeof input.km_actuales==='number'){ state.profile.currentWeeklyKm = input.km_actuales; state.profile.runnerType = 'active'; changes.push('km actuales'); recalc = true; }
  if(Array.isArray(input.dias_entreno) && input.dias_entreno.length){
    // Cronograma de base nuevo y permanente (no un cambio puntual de una sesión):
    // por esto usamos recalc para forzar una regeneración completa del plan, igual
    // que con objetivo/fecha de carrera. preserveLivedDays sigue protegiendo los
    // días ya vividos y los personalizados/cancelados a propósito (d.custom/d.cancelled).
    const validDays = DAY_KEYS.filter(d=>input.dias_entreno.includes(d));
    if(validDays.length){
      state.profile.trainingDays = validDays;
      changes.push('días de entreno');
      recalc = true;
    }
  }
  if(!changes.length) return 'No hubo cambios para aplicar.';
  if(recalc){
    state.profile.weeklyKm = calcWeeklyKm(state.profile);
    state.plan = preserveLivedDays(state.plan, generatePlan(state.profile, state.weekNumber||1));
    state.nextWeekOverrides = {}; // cambió la base del plan -> los cambios puntuales de la semana que viene ya no aplican
  }
  renderAll(); renderZones(); persist();
  state.chat.push({role:'system', text:sysMsgWithIcon(ICONS.edit, t('coach_plan_updated')), ts:Date.now()});
  return `Perfil actualizado: ${changes.join(', ')}.`;
}
function applyCoachNote(input){
  // Guardamos el dato aparte del historial del chat (que a futuro se puede recortar
  // para no mandar una conversación gigante en cada request) para que una lesión o
  // preferencia mencionada hace meses no se pierda nunca.
  if(!input || !input.nota) return 'Falta la nota a guardar.';
  if(!state.profile.coachNotes) state.profile.coachNotes = [];
  state.profile.coachNotes.push(String(input.nota).slice(0,200));
  if(state.profile.coachNotes.length > 12) state.profile.coachNotes = state.profile.coachNotes.slice(-12);
  persist();
  return 'Nota guardada.';
}
let chatAbortController = null;
function handleChatSendClick(){
  const sendBtn = document.getElementById('chat-send-btn');
  if(sendBtn && sendBtn.dataset.busy==='1'){ cancelChatRequest(); }
  else { sendChat(); }
}
function cancelChatRequest(){
  if(chatAbortController){ chatAbortController.abort(); }
}
async function sendChat(){
  const input = document.getElementById('chatInput');
  const text = input.value.trim(); if(!text) return;
  const sendBtn = document.getElementById('chat-send-btn');
  if(sendBtn?.dataset.busy==='1') return; // ya hay un mensaje en camino
  if(sendBtn){
    sendBtn.dataset.originalHtml = sendBtn.innerHTML;
    sendBtn.dataset.busy = '1';
    sendBtn.innerHTML = `<span class="icon-sq" style="width:16px; height:16px;">${ICONS.stop}</span>`;
  }
  input.value='';
  state.chat.push({role:'user', text, ts:Date.now()});
  renderChat();
  document.getElementById('chatLog').insertAdjacentHTML('beforeend', `<div class="msg coach typing" id="typing"><span></span><span></span><span></span></div>`);
  scrollChatToBottom();

  // Mandamos como máximo los últimos CHAT_HISTORY_LIMIT mensajes: una charla de meses
  // mandaría el historial entero en cada request, cada vez más lento y más caro sin
  // necesidad. Los datos importantes de largo plazo (lesiones, preferencias) no dependen
  // de este historial: quedan guardados aparte con guardar_nota_coach.
  const CHAT_HISTORY_LIMIT = 40;
  let messages = state.chat.filter(m=>m.role==='user'||m.role==='coach').slice(0,-1).slice(-CHAT_HISTORY_LIMIT).map(m=>({role: m.role==='user'?'user':'assistant', content:m.text}));
  messages.push({role:'user', content:text});

  const system = `Sos "Coach Zancada", el entrenador virtual dentro de la app Zancada. Hablás con calidez y honestidad, como un entrenador real de running (no un chatbot genérico). Respondé siempre en ${LANG_NAMES[lang]}. Datos del corredor: ${buildContext()}. Ayudás a definir ejercicios, responder dudas de entrenamiento en calle y trail, y personalizar el plan según los gustos del corredor.

Si el corredor cargó una meta de km semanales o un objetivo personal en sus propias palabras, tenelos presentes: orientá tus sugerencias hacia ese objetivo, y si el plan actual no está bien encaminado para lograrlo, decilo con honestidad y proponé un ajuste concreto (usando las herramientas).

El plan actual incluye, para cada día ya corrido, cómo lo calificó el corredor ("mal", "bien" o "excelente"). Si te pregunta cómo le fue en la semana o pide un resumen, usá esa información para responder con criterio: varias calificaciones "mal" o sesiones salteadas son señal de que conviene bajar volumen o intensidad; varias "excelente" sin ninguna "mal" son señal de que puede sumar un poco más. El sistema ya ajusta el volumen base solo cada semana según este patrón — si te preguntan por qué cambió el plan, podés explicarlo así.

Basá tus recomendaciones en principios reales de entrenamiento, no solo en lo que el corredor pide textualmente:
- La mayoría del volumen semanal (cerca del 80%) debería correrse suave, en zona 1-2 — reservar las sesiones fuertes (series, ritmo, fartlek) para el resto. Es el error más común de corredores amateur: correr todo "medio fuerte" y no progresar.
- El volumen semanal no debería subir más de ~10% de una semana a la siguiente, con una semana de descarga cada 3-4 semanas.
- El entrenamiento es específico al objetivo: para 5k/10k pesa más la velocidad, para 21k/42k pesan más el volumen y la tirada larga.
- Antes de la carrera OBJETIVO del corredor (la fecha de carrera cargada en Perfil > Metas), el volumen baja gradualmente en las últimas tres semanas (tapering) sin perder del todo la intensidad. Esto se aplica SOLO a esa fecha objetivo del perfil, nunca a una carrera cargada en "Próximos eventos" (la tenés en el contexto si hay una) -- esa es informativa nomás (nombre, cuenta regresiva, calendario) y no reprograma nada con semanas de anticipación. Lo único que sí hace una carrera de "Próximos eventos" es bajar el volumen la semana puntual en la que cae (como una semana de descarga más) y activar una semana de recuperación la semana siguiente -- pero recién esa semana, nunca antes. El día exacto de esa carrera SÍ recibe una sesión de entrenamiento normal en el plan, como cualquier otro día. Si te preguntan por qué bajó el volumen en alguna de estas semanas, podés explicarlo así.
- La edad y la contextura física del corredor importan: el plan base ya modera solo la cantidad de sesiones fuertes por semana y la velocidad de progresión según esto (más conservador para corredores mayores o con más masa corporal). Si te preguntan por qué su plan tiene menos series que el de otra persona, o por qué sube el volumen despacio, podés explicarlo así — no lo trates como si fuera un plan genérico igual para cualquiera.
- Cuando hagas un cambio, explicá brevemente el porqué si ayuda a que el corredor entienda el criterio, no solo el qué.

Ya tenés en el contexto el plan de la semana actual Y el de la semana que sigue (todavía no empezó, pero ya está calculado). Si te preguntan qué toca la semana que viene, respondé con esos datos directamente — nunca digas que todavía no está definida.

Tenés estas herramientas para aplicar cambios reales en la app. Cuando el corredor pida un cambio, usá SIEMPRE la herramienta correspondiente en la misma respuesta — nunca digas que ya lo cambiaste sin haber llamado a la herramienta:
- mover_sesion: cuando el pedido es literalmente MOVER/PASAR/CAMBIAR DE DÍA una sesión que ya está planificada, sin cambiar qué es (ej. "pasá el martes al miércoles", "corré lo de hoy para mañana"), dentro de la semana actual. Usala SIEMPRE que el pedido sea de este tipo, en vez de modificar_sesion + cancelar_sesion combinadas -- conserva el terreno, la zona y la descripción original tal cual, que es exactamente lo que se espera de un "cambio de día" (modificar_sesion te haría reescribir la descripción de memoria y perder el terreno si no lo repetís).
- modificar_sesion: para cambiar UN día puntual por OTRA sesión DISTINTA de la que tenía (tipo, distancia, zona, terreno) -- no para mover la misma sesión de día, para eso está mover_sesion. Sirve para esta semana o la que sigue (parámetro semana). Si el corredor entrena por tiempo (fijate en el contexto) o te da la sesión directamente en minutos, usá duracion_min en vez de distancia_km.
- cancelar_sesion: cuando el corredor cancela, saca o no puede hacer una sesión y NO la reemplaza por otra — deja ese día vacío, igual que un día sin entrenamiento. Nunca uses modificar_sesion para esto ni inventes una sesión suave o de zona 1 "de reemplazo": si el pedido es cancelar, el día tiene que quedar sin ningún ejercicio.
- ajustar_volumen_semana: para pedidos generales de correr más o menos (ej. "quiero correr más km", "bajale un poco"), sin que especifiquen un día — de esta semana o de la que sigue (parámetro semana).
- modificar_perfil: para cambios permanentes de datos personales que afectan los PRÓXIMOS planes (km semanales base, objetivo, terreno, FC máxima, o el cronograma fijo de días de entreno con dias_entreno). IMPORTANTE: si lo que cambia es QUÉ DÍAS entrena de forma habitual y permanente (ej. "de ahora en adelante entreno martes y jueves"), usá modificar_perfil con dias_entreno -- no mover_sesion/modificar_sesion/cancelar_sesion, que solo afectan una semana puntual y dejarían al corredor con el cronograma viejo la semana siguiente.
- guardar_nota_coach: para guardar un dato permanente del corredor (una lesión o molestia, una preferencia, una restricción de horario, etc.) apenas lo mencione, aunque no implique cambiar el plan ahora mismo. El historial de la charla no es infinito, así que esto es lo único que te garantiza acordarte de algo importante más adelante.
- deshacer_cambio: si el corredor dice que te confundiste, que no era eso, o pide deshacer/revertir el último cambio que hiciste, usá esta herramienta en vez de intentar adivinar manualmente cómo estaba antes -- restaura el plan y el perfil a como estaban justo antes de tu último cambio. Solo deshace UN cambio (el más reciente); si pide deshacer más de uno, avisale que solo podés volver un paso atrás.
Si el pedido es ambiguo entre "esta semana" y "de ahora en adelante", aplicá el cambio a esta semana con ajustar_volumen_semana para que se note ya, y preguntá si también querés que sea la nueva base con modificar_perfil.

Formato del texto: el chat solo interpreta **negrita** (usala con moderación, para resaltar un dato clave) y guiones "- " al inicio de línea para listas cortas. No uses encabezados (#), links, tablas ni bloques de código: no se muestran bien en el chat.

Sé breve (4-6 líneas salvo que pidan más detalle). Si mencionan dolor agudo, que empeora al correr, o que persiste más de unos días, recomendá frenar y consultar a un profesional de la salud antes de seguir entrenando — no intentes diagnosticar vos la causa.`;

  let finalText = '';
  let networkFailed = false;
  let cancelled = false;
  let anyToolApplied = false;
  chatAbortController = new AbortController();
  try{
    // Mandamos el token de sesión igual que en los demás endpoints, para que
    // /api/chat solo le responda a usuarios logueados de verdad y no a
    // cualquiera que le pegue directo a la URL.
    const { data: { session } } = await supabaseClient.auth.getSession();
    for(let loop=0; loop<4; loop++){
      const res = await fetch(apiUrl('/api/chat'), {
        method:'POST', headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${session?.access_token || ''}`},
        body: JSON.stringify({system, tools:TOOLS, messages, lang}),
        signal: chatAbortController.signal
      });
      const data = await res.json();
      if(data.error){ finalText = data.error.message || t('coach_connection_error'); break; }
      const blocks = data.content || [];
      const textPart = blocks.filter(b=>b.type==='text').map(b=>b.text).join('\n').trim();
      if(textPart) finalText += (finalText? '\n':'') + textPart;
      const toolUses = blocks.filter(b=>b.type==='tool_use');
      if(toolUses.length===0) break;
      anyToolApplied = true;
      const toolResults = toolUses.map(tu=>{
        let result;
        if(tu.name==='modificar_sesion') result = applyPlanChange(tu.input);
        else if(tu.name==='mover_sesion') result = applyMoveSession(tu.input);
        else if(tu.name==='cancelar_sesion') result = applyCancelSession(tu.input);
        else if(tu.name==='ajustar_volumen_semana') result = applyVolumeAdjust(tu.input);
        else if(tu.name==='modificar_perfil') result = applyProfileChange(tu.input);
        else if(tu.name==='guardar_nota_coach') result = applyCoachNote(tu.input);
        else if(tu.name==='deshacer_cambio') result = applyUndoLastChange();
        else result = 'Herramienta no reconocida.';
        return {type:'tool_result', tool_use_id:tu.id, content: result};
      });
      messages.push({role:'assistant', content: blocks});
      messages.push({role:'user', content: toolResults});
    }
  }catch(e){ if(e.name==='AbortError') cancelled = true; else networkFailed = true; }
  chatAbortController = null;

  document.getElementById('typing')?.remove();
  if(cancelled){
    // El corredor apretó "pausar": no mostramos error ni reintentamos, simplemente
    // dejamos el mensaje ya enviado en el historial y volvemos a dejar todo listo
    // para el próximo mensaje, igual que hace Gemini al cancelar una respuesta.
    persist();
    restoreSendBtn();
    renderChat(); // vuelve a mostrar los chips de respuesta rápida, ocultos mientras estaba "pausar"
    return;
  }
  if(networkFailed){
    /* No pudimos ni conectarnos — no ensuciamos el historial del chat con un mensaje
       falso del coach. Avisamos con un toast y devolvemos el texto para poder reintentar. */
    haptic(20);
    showToast(t('coach_connection_error'), 'error');
    input.value = text;
    persist();
    restoreSendBtn();
    renderChat();
    return;
  }
  // Si el loop de herramientas se agotó (4 vueltas, ver arriba) sin que el modelo
  // llegara a mandar una respuesta final en texto plano, finalText puede quedar
  // vacío aunque sí se hayan aplicado cambios reales -- antes eso se mostraba como
  // un mensaje "..." confuso, como si el coach no hubiera hecho nada.
  if(!finalText.trim() && anyToolApplied) finalText = t('coach_changes_applied_fallback');
  state.chat.push({role:'coach', text: finalText || '...', ts:Date.now()});
  restoreSendBtn();
  renderChat();
  persist();
}
function restoreSendBtn(){
  const sendBtn = document.getElementById('chat-send-btn');
  if(sendBtn && sendBtn.dataset.originalHtml){
    sendBtn.innerHTML = sendBtn.dataset.originalHtml;
    delete sendBtn.dataset.originalHtml;
  }
  if(sendBtn) sendBtn.dataset.busy = '0';
}

/* Traducir todo lo estático apenas carga la página, sin esperar a que el usuario toque un idioma */
applyStaticTranslations();
populateOnboardDays();
