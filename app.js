const APP_VERSION = '2026-10-02T02:11:11Z';
/* Se usa para detectar si hay una versión más nueva publicada y recargar sola la app
   (ver checkForAppUpdate más abajo). Un hook de pre-commit local (.git/hooks/pre-commit)
   la actualiza sola a la hora actual en cada commit que toque app.js/index.html.
   Esta constante tiene que ser literalmente la primera línea del archivo: checkForAppUpdate
   solo pide los primeros bytes (Range) para no gastar datos, así que si esto se corre más
   abajo (por ejemplo detrás de este mismo comentario, como estaba antes) el Range nunca
   llega a incluirla, la regex nunca matchea, y la app deja de darse cuenta de que hay
   una versión nueva -- exactamente lo que pasó hasta el 2026-09-18. */
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
  {id:'2026-09-pace-calc', key:'changelog_pace_calc'},
  {id:'2026-09-achievements', key:'changelog_achievements'},
  {id:'2026-09-social', key:'changelog_social', hidden:true}, // anunciaba una función social que nunca se llegó a construir del lado del cliente (ver auditoría) -- se deja el id para no romper el índice de "ya vistas" de nadie, pero se oculta (ver maybeShowWhatsNew)
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
  {id:'2026-09-connectivity-box', key:'changelog_connectivity_box'},
  {id:'2026-09-km-pulse', key:'changelog_km_pulse'},
  {id:'2026-09-light-mode', key:'changelog_light_mode'},
  {id:'2026-09-connectivity-push', key:'changelog_connectivity_push'},
  {id:'2026-09-devices-overlay', key:'changelog_devices_overlay'},
  {id:'2026-09-light-mode-v2', key:'changelog_light_mode_v2'},
  {id:'2026-09-mountains-chat-polish', key:'changelog_mountains_chat_polish'},
  {id:'2026-09-a11y-perf', key:'changelog_a11y_perf'},
  {id:'2026-09-race-day-plan', key:'changelog_race_day_plan'},
  {id:'2026-09-coros-connect', key:'changelog_coros_connect'},
  {id:'2026-09-multi-device-warning', key:'changelog_multi_device_warning'},
  {id:'2026-09-keep-data-on-disconnect', key:'changelog_keep_data_on_disconnect'},
  {id:'2026-09-week-rollover-fix', key:'changelog_week_rollover_fix'},
  {id:'2026-09-rating-dismiss', key:'changelog_rating_dismiss'},
  {id:'2026-09-push-stale-fix', key:'changelog_push_stale_fix'},
  {id:'2026-09-calendar-bounds-fix', key:'changelog_calendar_bounds_fix'},
  {id:'2026-09-race-week-double-discount-fix', key:'changelog_race_week_double_discount_fix'},
  {id:'2026-09-rest-cap-fix', key:'changelog_rest_cap_fix'},
  {id:'2026-09-no-past-days-onboarding', key:'changelog_no_past_days_onboarding'},
  {id:'2026-09-hist-info-generic-watch', key:'changelog_hist_info_generic_watch'},
  {id:'2026-09-manual-save-flash-close', key:'changelog_manual_save_flash_close'},
  {id:'2026-09-android-back-button', key:'changelog_android_back_button'},
  {id:'2026-09-coach-today-fix', key:'changelog_coach_today_fix'},
  {id:'2026-09-coach-week-mixup-fix', key:'changelog_coach_week_mixup_fix'},
  {id:'2026-09-coach-sunday-taper-fix', key:'changelog_coach_sunday_taper_fix'},
  {id:'2026-09-skipped-day-repair', key:'changelog_skipped_day_repair'},
  {id:'2026-09-race-phase-event-fix', key:'changelog_race_phase_event_fix'},
  {id:'2026-09-reminder-already-done-fix', key:'changelog_reminder_already_done_fix'},
  {id:'2026-09-run-date-confirm-fix', key:'changelog_run_date_confirm_fix'},
  {id:'2026-09-hrmax-spurious-fix', key:'changelog_hrmax_spurious_fix'},
  {id:'2026-09-route-map-zoom-fix', key:'changelog_route_map_zoom_fix'},
  {id:'2026-09-mapbox-switch', key:'changelog_mapbox_switch'},
  {id:'2026-09-live-map-follow-fix', key:'changelog_live_map_follow_fix'},
  {id:'2026-09-rd-map-recenter-visibility', key:'changelog_rd_map_recenter_visibility'},
  {id:'2026-09-coros-auto-sync', key:'changelog_coros_auto_sync'},
  {id:'2026-09-wahoo-polar-auto-sync', key:'changelog_wahoo_polar_auto_sync'},
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
  // hidden: una entrada que se anunció pero después se decidió no mostrar más (ver el
  // comentario en la entrada 'social' de CHANGELOG) -- se filtra acá, no se borra del
  // array, para no correr el índice de nadie que tenga guardado justo ese id como
  // "última vista".
  const unseen = (lastSeenIdx>=0 ? CHANGELOG.slice(lastSeenIdx+1) : CHANGELOG).filter(c=>!c.hidden);
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
  // https://zancada.org (sin "www") redirige (308) a https://www.zancada.org del lado del
  // servidor -- un navegador/WebView rechaza por completo un redirect durante el PREFLIGHT
  // de CORS (la petición OPTIONS que dispara cualquier POST con body JSON + Authorization,
  // como esta), así que apuntar acá al dominio sin "www" rompía TODO pedido nativo a /api/*
  // con "Failed to fetch", sin más detalle en la app -- confirmado en el chat real de un
  // dispositivo real vía logcat: "Redirect is not allowed for a preflight request". Apuntar
  // directo al host final evita el redirect (y el preflight) por completo.
  return native ? ('https://www.zancada.org' + path) : path;
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
// index.html ya cargó UN SOLO locale de forma sincrónica (el que detectó por
// navigator.language, vía document.write antes de este script -- ver el bootstrap chico
// junto a los <script> de /locales/ en index.html) y dejó guardado cuál en
// window.__ZANCADA_INITIAL_LANG__. Antes se cargaban los 6 diccionarios siempre, sin
// importar el idioma real (~75KB comprimidos tirados a la basura en cada carga, para
// siempre, para el 100% de la gente que nunca toca el selector de idioma) -- ahora el
// resto se trae recién si hace falta: al restaurar una cuenta con otro idioma guardado
// (loadUserAndEnter), o si alguien realmente abre el selector en Perfil (setLang).
let lang = (typeof window!=='undefined' && window.__ZANCADA_INITIAL_LANG__) || detectInitialLang();
function ensureLocaleLoaded(code){
  if(window.I18N && window.I18N[code]) return Promise.resolve();
  return new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = '/locales/' + code + '.js';
    s.onload = ()=>resolve();
    s.onerror = ()=>reject(new Error('No se pudo cargar /locales/'+code+'.js'));
    document.head.appendChild(s);
  });
}
function t(key, vars){
  let s = (I18N[lang]&&I18N[lang][key]) || I18N.es[key] || key;
  // Reportado en una auditoría: pasar vars[k] directo como segundo argumento de replace()
  // lo trata como un patrón de reemplazo aunque el string de búsqueda sea literal -- "$&",
  // "$$", "$`", "$'" (o "$1" etc.) dentro de un nombre que escribió el usuario (zapatilla,
  // carrera/evento) se interpretaban como esos patrones especiales en vez de insertarse tal
  // cual, corrompiendo el texto mostrado. Con una función como reemplazo, su valor de
  // retorno se usa siempre literal, sin ningún procesamiento de "$" -- forma estándar de
  // evitar este problema con String.replace().
  if(vars) Object.keys(vars).forEach(k=>{ s = s.replace('{'+k+'}', () => String(vars[k])); });
  return s;
}
function applyStaticTranslations(){
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el=>{ el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>{ el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el=>{ el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.querySelectorAll('a[href^="/privacy.html"]').forEach(el=>{ el.href = apiUrl('/privacy.html?lang=' + lang); });
  document.querySelectorAll('a[href^="/terms.html"]').forEach(el=>{ el.href = apiUrl('/terms.html?lang=' + lang); });
  [...document.getElementById('perfil-lang-choice').children].forEach(c=>c.classList.toggle('active', c.dataset.v===lang));
  const langSummaryEl = document.getElementById('perfil-lang-summary');
  if(langSummaryEl) langSummaryEl.textContent = LANG_DISPLAY[lang] || lang;
}
let latestRequestedLang = null;
async function setLang(code){
  // ensureLocaleLoaded no hace nada si ese idioma ya está en memoria (el inicial, o uno
  // que ya se haya pedido antes en esta misma sesión) -- el fetch solo pasa la primera
  // vez que alguien elige un idioma nuevo.
  latestRequestedLang = code;
  try{ await ensureLocaleLoaded(code); }catch(e){ showToast(t('generic_error'), 'error'); return; }
  // Si mientras esperábamos este fetch el usuario tocó OTRO idioma (ej: toca "English" --
  // ya en memoria, resuelve al toque -- y enseguida "Français" -- todavía no cargado, tarda
  // un poco más), sin este chequeo la llamada más vieja podía terminar de resolver último y
  // pisar la elección real más reciente. Si ya no somos el pedido más nuevo, no aplicamos nada.
  if(latestRequestedLang !== code) return;
  lang = code; state.lang = code;
  applyStaticTranslations();
  populateOnboardDays();
  renderSportChips('ob');
  if(state.onboarded){
    renderAll(); renderHistory(); renderZones(); renderPerfilDays(); renderPerfilCrossTraining(); persist();
    // Mismo motivo que en handleSignUp: sincronizamos el idioma al user_metadata de
    // Supabase Auth para que los emails de autenticación lo puedan usar. Es best-effort
    // (no bloquea la UI ni avisa si falla) -- si no llega a guardarse, el email cae al
    // español por default, no rompe nada.
    try{ supabaseClient.auth.updateUser({ data: { lang: code } }); }catch(e){}
  }
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
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>',
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
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4.5" height="14" rx="1.5"/><rect x="13.5" y="5" width="4.5" height="14" rx="1.5"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6a1 1 0 0 0 1.52.85l11-6.8a1 1 0 0 0 0-1.7l-11-6.8A1 1 0 0 0 8 5.2z"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><line x1="12" y1="11" x2="12" y2="16.5"/><circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.8 21.8 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a21.8 21.8 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
  medal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 2.5 10.5 8M15.5 2.5 13.5 8"/><circle cx="12" cy="14.5" r="6.5"/><path d="M12 11.2l1.1 2.2 2.4.35-1.75 1.7.4 2.4-2.15-1.15-2.15 1.15.4-2.4-1.75-1.7 2.4-.35z" fill="currentColor" stroke="none"/></svg>',
  locate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="M15.5 10.2l6-3.2v10l-6-3.2z"/></svg>',
  stopwatch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6M12 2v2"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-10-9.3C.4 8 1.8 4.5 5 3.5c2-.6 4 .2 5.2 2C11.4 3.7 13.4 2.9 15.4 3.5c3.2 1 4.6 4.5 3 7.7-2.5 4.7-10 9.3-10 9.3z"/></svg>',
  heartFilled: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 20.5s-7.5-4.6-10-9.3C.4 8 1.8 4.5 5 3.5c2-.6 4 .2 5.2 2C11.4 3.7 13.4 2.9 15.4 3.5c3.2 1 4.6 4.5 3 7.7-2.5 4.7-10 9.3-10 9.3z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4"/><path d="M7.5 8.5 12 4l4.5 4.5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a9 9 0 0 1 0 12"/></svg>',
  speakerMute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><line x1="16" y1="9" x2="21" y2="14"/><line x1="21" y1="9" x2="16" y2="14"/></svg>'
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
  // Piso de duración para navigator.vibrate(): confirmado en un dispositivo real que los
  // motores ERM (los comunes en gamas media/baja, sin @capacitor/haptics instalado) no
  // llegan a arrancar con pulsos de 15-40ms -- el sistema recibe el pedido (confirmado con
  // dumpsys vibrator) pero el teléfono no llega a sentirse. 1500ms sí se sintió, así que
  // cualquier pulso por debajo de este piso se estira; en los patrones [on, pausa, on, ...]
  // solo se estiran los índices pares (los "on"), no las pausas.
  const VIBRATE_MIN_MS = 40;
  try{
    if(!navigator.vibrate) return;
    const p = Array.isArray(pattern)
      ? pattern.map((ms, i) => i % 2 === 0 ? Math.max(ms, VIBRATE_MIN_MS) : ms)
      : Math.max(pattern, VIBRATE_MIN_MS);
    navigator.vibrate(p);
  }catch(e){}
}
/* ---- Micro-festejo (confetti) ----
   Los dos únicos momentos donde ya existía un showToast('success') atado a algo que el
   corredor realmente LOGRÓ (no un guardado de rutina): una marca personal nueva y llegar
   a la meta semanal. Son justo los disparadores correctos para un festejo visual chiquito
   -- nada de librerías, un puñado de <span> con los mismos colores de la paleta de la
   app, cayendo con una animación CSS y sacándose solos del DOM al terminar. Respeta
   prefers-reduced-motion (no todos quieren cosas moviéndose por la pantalla). */
function celebrate(){
  // El personaje del coach (ver setMascotExpression/initMascotEyes más abajo) también
  // festeja acá -- primera línea, ANTES del early-return de prefers-reduced-motion, porque
  // cambiar la forma de la boca es un cambio de estado puntual (como un toast), no una
  // animación continua -- no hay motivo para negarle ESO a alguien con esa preferencia,
  // a diferencia del confetti (que sí es puro movimiento y por eso se sigue salteando).
  setMascotExpression('excited', {priority:2, duration:2600});
  setMascotColor('good', {duration:3200});
  try{
    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const layer = document.createElement('div');
    layer.className = 'confetti-layer';
    document.body.appendChild(layer);
    // Mismos colores que el resto del sistema despues de desaturar las zonas de esfuerzo
    // (ver --zone1..5 en el :root) -- antes este array tenia los hex viejos, saturados,
    // hardcodeados aparte, asi que el confetti seguia tirando un arcoiris "de manual" que
    // ya no pegaba con el resto de la paleta.
    const colors = ['#D6FF3F','#7CB88F','#D4B356','#CC8A56','#7B9BC9','#C06A2E'];
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
// --- Personaje del coach: ojos que siguen el mouse/dedo + expresiones de festejo --------
// El botón flotante que abre el chat del coach (coach-fab) tenía un ícono genérico de
// globo de diálogo -- ahora es un círculo lima propio (ver index.html) con dos ojos en
// forma de pastilla vertical que siguen el puntero por toda la pantalla y cambian de forma
// en los momentos que la app ya reconoce como un logro (nueva marca personal o meta semanal
// cumplida, ambos vía celebrate() más arriba) y al terminar una carrera trackeada (ver
// closeSummary). También se queda dormido si pasa un rato largo sin interacción, y saluda
// con dos parpadeos apenas carga la página. Sin ninguna librería externa.
//
// La expresión se hace cambiando la FORMA de los ojos (atributo "d" de cada <path>), no una
// boca -- el personaje no tiene boca a propósito, todo el gesto sale de los ojos (pastilla
// vertical en reposo, achatada horizontal al festejar, chatita y fina al dormirse). Cada
// forma está escrita dos veces
// (una centrada en el ojo izquierdo, otra en el derecho) porque el "d" de un path SVG es
// siempre en coordenadas absolutas del documento, no relativas al ojo -- no hay forma de
// reusar un solo "d" para los dos ojos sin además mover el <path> con un transform (y el
// transform ya lo usa initMascotEyes para el seguimiento de mirada/parpadeo).
const MASCOT_EYE_SHAPES = {
  // Pastilla vertical (5 de ancho x 14 de alto) -- el mismo reposo de siempre.
  neutral: {
    l: 'M21.5 25.5 a2.5 2.5 0 0 1 5 0 v9 a2.5 2.5 0 0 1 -5 0 z',
    r: 'M37.5 25.5 a2.5 2.5 0 0 1 5 0 v9 a2.5 2.5 0 0 1 -5 0 z',
  },
  // Pastilla horizontal achatada (13x6) -- ojos entrecerrados de contento, terminaste una carrera.
  happy: {
    l: 'M20.5 27 h7 a3 3 0 0 1 0 6 h-7 a3 3 0 0 1 0 -6 z',
    r: 'M36.5 27 h7 a3 3 0 0 1 0 6 h-7 a3 3 0 0 1 0 -6 z',
  },
  // Círculo grande (radio 4.5) -- ojos bien abiertos, marca personal o meta cumplida.
  excited: {
    l: 'M19.5 30 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0',
    r: 'M35.5 30 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0',
  },
  // Cápsula angosta e inclinada (radio 2.2) -- la punta de ADENTRO (más cerca del centro de
  // la cara) más arriba, la de AFUERA más abajo, mismo gesto que unas cejas fruncidas hacia
  // la nariz. Se usa junto con setMascotColor('bad', ...) -- dormiste mal, cargaste una
  // molestia/lesión -- para que el gesto no dependa solo del color.
  concerned: {
    l: 'M24.73 24.73 L18.73 30.73 L21.27 33.27 L27.27 27.27 Z',
    r: 'M36.73 27.27 L42.73 33.27 L45.27 30.73 L39.27 24.73 Z',
  },
  // Pastilla bien chata y fina (8x2.5) -- ojos entrecerrados de sueño, después de un rato
  // largo sin que nadie toque la app (ver SLEEPY_AFTER_MS en initMascotEyes). No pasa por
  // setMascotExpression (no tiene un final automático -- se queda así hasta la próxima
  // interacción real, no hasta que venza un timer).
  sleepy: {
    l: 'M20 28.75 h8 a1.25 1.25 0 0 1 0 2.5 h-8 a1.25 1.25 0 0 1 0 -2.5 z',
    r: 'M36 28.75 h8 a1.25 1.25 0 0 1 0 2.5 h-8 a1.25 1.25 0 0 1 0 -2.5 z',
  },
};
let mascotExpressionTimer = null;
let mascotExpressionPriority = -1;
// priority: si ya hay una expresión de más prioridad activa (ej. "excited" por una marca
// personal, prioridad 2), una de menor prioridad que llega justo en el medio (ej. el
// "happy" genérico de terminar cualquier carrera, prioridad 1) no la corta antes de tiempo
// -- sin esto, terminar una carrera que ADEMÁS es récord mostraba la cara de festejo grande
// solo un instante, tapada enseguida por la genérica de "carrera terminada".
function setMascotExpression(name, {duration=2200, priority=1}={}){
  const eyeL = document.getElementById('mascot-eye-l'), eyeR = document.getElementById('mascot-eye-r');
  const shape = MASCOT_EYE_SHAPES[name];
  if(!eyeL || !eyeR || !shape) return;
  if(priority < mascotExpressionPriority) return;
  mascotExpressionPriority = priority;
  eyeL.setAttribute('d', shape.l); eyeR.setAttribute('d', shape.r);
  clearTimeout(mascotExpressionTimer);
  mascotExpressionTimer = setTimeout(()=>{
    eyeL.setAttribute('d', MASCOT_EYE_SHAPES.neutral.l); eyeR.setAttribute('d', MASCOT_EYE_SHAPES.neutral.r);
    mascotExpressionPriority = -1;
  }, duration);
}
// Color del cuerpo: lima de siempre (neutral), un dorado cálido cuando pasa algo bueno
// (marca personal, meta semanal, racha de semanas), y un tono arcilla cuando pasa algo que
// conviene tomarse con calma (durmió mal, cargó una molestia/lesión) -- reusa colores que
// la app ya usa en otro lado en vez de inventar hex nuevos sueltos: --clay es el mismo
// tono que ya usan las etiquetas de terreno asfalto. "good" usaba antes --zone3 (el
// dorado de la zona de esfuerzo "constante") -- encontrado en una auditoría: las 5 zonas
// de esfuerzo son una escala de datos fija (ver DESIGN.md), nunca un color de marca para
// pedir prestado, así que un corredor que ya aprendió "ese dorado es zona 3" lo veía
// significar otra cosa en la cara de la mascota. "good" ahora usa el mismo lima que el
// estado neutral (lima YA es la señal de "esto es bueno/lo único que importa" en toda la
// app, ver la regla de la única señal) y se distingue del reposo normal con el mismo
// brillo que ya usan los botones primarios (--hivis-glow), no con un color nuevo. Sin
// sistema de prioridad (a diferencia de las expresiones): son pocos disparadores, ninguno
// realmente compite entre sí, así que "el último que llamó gana y reinicia el timer" alcanza.
const MASCOT_BODY_COLORS = { neutral: 'var(--hivis)', good: 'var(--hivis)', bad: 'var(--clay)' };
let mascotColorTimer = null;
function setMascotColor(name, {duration=4000}={}){
  const body = document.getElementById('mascot-body');
  if(!body || !MASCOT_BODY_COLORS[name]) return;
  body.setAttribute('fill', MASCOT_BODY_COLORS[name]);
  body.style.filter = name === 'good' ? 'drop-shadow(0 0 6px var(--hivis-glow))' : '';
  clearTimeout(mascotColorTimer);
  mascotColorTimer = setTimeout(()=>{ body.setAttribute('fill', MASCOT_BODY_COLORS.neutral); body.style.filter = ''; }, duration);
}
// Guiño (un solo ojo, no los dos -- eso ya es el parpadeo normal) apenas se toca el botón,
// antes de entrar al chat -- showView('coach') esconde coach-fab-wrap en el mismo instante
// (ver el otro lugar que lo hace, más abajo en el archivo), así que sin este delay chico el
// guiño nunca llegaría a verse.
// Se pone en true mientras dura (y un instante después de soltar) un mantener-presionado
// real detectado por initMascotHoldEasterEgg() -- openCoachWithWink() lo chequea primero
// para NO abrir el chat en ese caso: mantener presionado es "jugar con el personaje", un
// gesto aparte de tocar para abrir la conversación, no una forma más lenta de hacer lo mismo.
let mascotHoldFired = false;
function openCoachWithWink(){
  if(mascotHoldFired){ mascotHoldFired = false; return; }
  const eyeR = document.getElementById('mascot-eye-r');
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!eyeR || reduced){ showView('coach'); return; }
  eyeR.setAttribute('transform', 'translate(40 30) scale(1 0.12) translate(-40 -30)');
  setTimeout(()=>{ eyeR.setAttribute('transform', ''); showView('coach'); }, 140);
}
// Easter egg de mantener presionado el personaje (no de tocarlo, eso ya abre el chat con un
// guiño -- ver openCoachWithWink) -- puro juego, no depende de ningún dato real de la app,
// solo para que se sienta con más personalidad si alguien lo toca de más.
function initMascotHoldEasterEgg(){
  const fab = document.querySelector('.coach-fab');
  if(!fab) return;
  const HOLD_MS = 550;
  let holdTimer = null;
  function cancelHold(){ clearTimeout(holdTimer); }
  function startHold(){
    cancelHold();
    holdTimer = setTimeout(()=>{
      mascotHoldFired = true;
      haptic(15);
      setMascotExpression('excited', {priority:1, duration:900});
      // Mismo pop de escala que ya usa updateChatBadge() para un mensaje nuevo -- reusar en
      // vez de sumar una animación CSS más para el mismo gesto de "algo pasó acá".
      const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if(!reduced){
        fab.classList.remove('pop'); void fab.offsetWidth; fab.classList.add('pop');
        setTimeout(()=>fab.classList.remove('pop'), 500);
      }
    }, HOLD_MS);
  }
  fab.addEventListener('pointerdown', startHold);
  fab.addEventListener('pointerup', cancelHold);
  fab.addEventListener('pointerleave', cancelHold);
  fab.addEventListener('pointercancel', cancelHold);
}
// Ojos que siguen el puntero (mouse) o el dedo (touchmove) -- clampeados a un radio chico
// (MAX_OFFSET) para que se lea como "de reojo", no como si los ojos se fueran a otro lado.
// Con prefers-reduced-motion no se engancha nada de esto (ver celebrate() para el mismo
// criterio con el confetti): ni el seguimiento, ni las miradas propias de "estar vivo", ni
// el parpadeo -- todo movimiento continuo queda afuera, la carita se queda quieta y neutra.
function initMascotEyes(){
  const eyes = document.getElementById('mascot-eyes');
  const eyeL = document.getElementById('mascot-eye-l');
  const eyeR = document.getElementById('mascot-eye-r');
  const fab = document.querySelector('.coach-fab');
  if(!eyes || !eyeL || !eyeR || !fab) return;
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // OJO -- el movimiento de los ojos usa el atributo SVG "transform" (setAttribute), NUNCA
  // la propiedad CSS transform (style.transform): probado a mano en el navegador, hay
  // motores que renderizan <circle>/<g> perfectamente pero jamás aplican ningún transform
  // CSS sobre elementos SVG (queda siempre en la matriz identidad, sin ningún error ni
  // aviso) -- el atributo nativo de SVG en cambio funciona en cualquier motor con soporte
  // de SVG, viejo o nuevo, así que es la única forma confiable de mover estas piezas.
  const MAX_OFFSET = 3.2;
  // Date.now() (no 0): idleMs se calcula como Date.now()-lastLookMs -- si arrancara en 0
  // (época 1970), ESE resultado sería la fecha actual completa en ms (billones), muy por
  // encima de cualquier umbral de "inactivo" -- el personaje se quedaba dormido a los pocos
  // segundos de cargar la página, no después de un rato real sin interacción. Reportado en
  // la propia verificación de esta función al agregar el estado "dormido".
  let lastLookMs = Date.now();
  let mascotSleepy = false;
  // Tween manual por setTimeout (~60fps, reemplaza la transición que hubiera dado CSS si
  // hubiera funcionado) -- interpola el offset actual de los ojos hacia el destino con una
  // curva ease-out cúbica en ~220ms, en vez de saltar de golpe a la nueva posición.
  // setTimeout en vez de requestAnimationFrame a propósito: rAF se pausa/nunca dispara en una
  // pestaña oculta/en segundo plano (esperable, mismo comportamiento en cualquier navegador
  // real) -- setTimeout sigue disparando igual, así que el personaje no se queda "pegado" en
  // la última posición si el usuario vuelve a la app después de tenerla en segundo plano.
  let curX = 0, curY = 0, eyesTimer = null;
  function animateEyesTo(targetX, targetY, duration){
    clearTimeout(eyesTimer);
    const startX = curX, startY = curY, t0 = Date.now();
    (function step(){
      const t = Math.min(1, (Date.now()-t0)/duration);
      const eased = 1 - Math.pow(1-t, 3);
      curX = startX + (targetX-startX)*eased;
      curY = startY + (targetY-startY)*eased;
      eyes.setAttribute('transform', `translate(${curX.toFixed(2)} ${curY.toFixed(2)})`);
      if(t < 1) eyesTimer = setTimeout(step, 16);
    })();
  }
  function lookAt(clientX, clientY){
    // Cualquier movimiento real despierta al personaje si se había quedado dormido (ver
    // SLEEPY_AFTER_MS más abajo) -- pero solo si no hay una expresión de festejo activa en
    // ese momento (mascotExpressionPriority>=0), para no pisarle la cara a un festejo real
    // que justo esté mostrándose.
    if(mascotSleepy && mascotExpressionPriority < 0){
      mascotSleepy = false;
      eyeL.setAttribute('d', MASCOT_EYE_SHAPES.neutral.l); eyeR.setAttribute('d', MASCOT_EYE_SHAPES.neutral.r);
    }
    const rect = fab.getBoundingClientRect();
    // Un fab con display:none (todavía no inició sesión) da un rect de ancho/alto 0 --
    // dividir por esa distancia daría Infinity/NaN en el transform.
    if(!rect.width) return;
    const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
    const dx = clientX - cx, dy = clientY - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const ox = (dx/dist) * Math.min(MAX_OFFSET, dist/12);
    const oy = (dy/dist) * Math.min(MAX_OFFSET, dist/12);
    animateEyesTo(ox, oy, 220);
    lastLookMs = Date.now();
  }
  // Throttle por setTimeout (no rAF, mismo motivo que animateEyesTo arriba) -- pointermove/
  // touchmove disparan muchísimas veces por segundo durante un arrastre real; sin este
  // throttle se recalcularía el offset (y se reiniciaría el tween) en cada uno de esos
  // eventos en vez de una vez cada ~16ms.
  let movePending = false, pendingXY = null;
  function onMove(x, y){
    pendingXY = [x, y];
    if(movePending) return;
    movePending = true;
    setTimeout(()=>{ movePending = false; if(pendingXY) lookAt(pendingXY[0], pendingXY[1]); }, 16);
  }
  document.addEventListener('pointermove', e=> onMove(e.clientX, e.clientY), {passive:true});
  document.addEventListener('touchmove', e=>{ const tp = e.touches[0]; if(tp) onMove(tp.clientX, tp.clientY); }, {passive:true});
  // Miradas propias: si no hubo un movimiento real hace un rato, el personaje igual "vive"
  // -- mira para un lado al azar un instante y vuelve al centro, en vez de quedarse
  // congelado esperando que alguien lo toque. Y si pasó AÚN más tiempo sin ninguna
  // interacción real, se queda dormido (ojos entrecerrados finitos) hasta el próximo
  // movimiento real -- lookAt() lo despierta (ver ahí arriba).
  // De madrugada (23-6h, hora LOCAL del dispositivo) se hace el dormido mucho más rápido --
  // mismo estado "sleepy" de siempre, ni una forma ni un timer nuevo, solo un umbral de
  // inactividad más corto para que de noche el personaje se sienta con ganas de dormir en
  // vez de con la misma energía constante a cualquier hora. Se calcula una sola vez al
  // cargar la página (no re-evalúa a medianoche si la pestaña queda abierta) porque nadie
  // deja la app abierta sin tocarla durante horas y horas -- no vale la complejidad de un
  // segundo timer solo para ese caso límite.
  const hour = new Date().getHours();
  const isLateNight = hour >= 23 || hour < 6;
  const SLEEPY_AFTER_MS = isLateNight ? 12000 : 45000;
  (function idleGlanceLoop(){
    const delay = 3200 + Math.random()*2600;
    setTimeout(()=>{
      const idleMs = Date.now()-lastLookMs;
      if(idleMs > SLEEPY_AFTER_MS){
        // priority<0: no pisar una expresión de festejo real que esté mostrándose justo en
        // este momento -- se vuelve a chequear en la próxima vuelta del loop si no se pudo
        // esta vez.
        if(!mascotSleepy && mascotExpressionPriority < 0){
          mascotSleepy = true;
          eyeL.setAttribute('d', MASCOT_EYE_SHAPES.sleepy.l); eyeR.setAttribute('d', MASCOT_EYE_SHAPES.sleepy.r);
        }
      } else if(idleMs > 2800){
        const ang = Math.random()*Math.PI*2;
        animateEyesTo(Math.cos(ang)*MAX_OFFSET, Math.sin(ang)*MAX_OFFSET*0.6, 260);
        setTimeout(()=>{ if(Date.now()-lastLookMs > 2800) animateEyesTo(0, 0, 260); }, 900);
      }
      idleGlanceLoop();
    }, delay);
  })();
  // Parpadeo: escala Y a 0.12 alrededor del propio centro de cada ojo (cx,cy) -- con el
  // atributo transform hay que armar a mano translate-scale-translate para escalar
  // alrededor de un punto que no sea el origen (0,0) del SVG, si no el "parpadeo" también
  // corriría la posición del ojo hacia arriba.
  function setEyeSquash(el, cx, cy, scaleY){
    el.setAttribute('transform', scaleY===1 ? '' : `translate(${cx} ${cy}) scale(1 ${scaleY}) translate(${-cx} ${-cy})`);
  }
  (function blinkLoop(){
    const delay = 2800 + Math.random()*2400;
    setTimeout(()=>{
      // (24,30)/(40,30): centro de CUALQUIERA de las 3 formas de MASCOT_EYE_SHAPES (pastilla
      // vertical, pastilla horizontal, círculo) -- las tres comparten el mismo centro por
      // diseño, así que el parpadeo escala bien alrededor del centro real sea cual sea la
      // expresión activa en ese momento.
      setEyeSquash(eyeL, 24, 30, 0.12); setEyeSquash(eyeR, 40, 30, 0.12);
      setTimeout(()=>{ setEyeSquash(eyeL, 24, 30, 1); setEyeSquash(eyeR, 40, 30, 1); }, 130);
      blinkLoop();
    }, delay);
  })();
  // Saludo inicial: dos parpadeos seguidos apenas termina de cargar la página, para que la
  // primera impresión sea "esto está vivo" en vez de una imagen quieta -- mismo
  // setEyeSquash que ya usa blinkLoop, solo que disparado una vez a mano en vez de por el
  // temporizador al azar (que recién arranca a los 2800-5200ms).
  setTimeout(()=>{
    setEyeSquash(eyeL, 24, 30, 0.12); setEyeSquash(eyeR, 40, 30, 0.12);
    setTimeout(()=>{
      setEyeSquash(eyeL, 24, 30, 1); setEyeSquash(eyeR, 40, 30, 1);
      setTimeout(()=>{
        setEyeSquash(eyeL, 24, 30, 0.12); setEyeSquash(eyeR, 40, 30, 0.12);
        setTimeout(()=>{ setEyeSquash(eyeL, 24, 30, 1); setEyeSquash(eyeR, 40, 30, 1); }, 130);
      }, 160);
    }, 130);
  }, 600);
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
  // Defensa en profundidad: renderChat() inserta los mensajes de rol 'system' con innerHTML
  // SIN escapar (a diferencia de los de usuario/coach, ver escapeHtml/formatCoachText ahí) --
  // asumía que este texto siempre viene de t()/concatenación de strings fijos, nunca de
  // datos crudos. Eso dejó de ser cierto en más de un lugar (ver el comentario en
  // applyPlanChange/applyCancelSession sobre input.dia sin validar) -- escapar acá, en el
  // único lugar donde se arma este texto, cierra el hueco sin depender de que cada llamador
  // se acuerde de hacerlo.
  return `<span class="icon-sq" style="width:12px; height:12px; vertical-align:-1px; margin-right:4px;">${icon}</span>${escapeHtml(text)}`;
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
/* ---- pantalla de "confirmá tu mail", con reintento automático de login mientras se espera ---- */
let confirmEmailAddr = '';
let confirmEmailPw = '';
let confirmEmailPollTimer = null;
let confirmEmailResendCooldown = false;
const DAY_KEYS = ['mon','tue','wed','thu','fri','sat','sun'];
// Orden aproximado de más jugado a nivel mundial a menos -- no hace falta precisión de
// estudio de mercado, solo que el que abre la lista vea primero los deportes más comunes
// (fútbol, básquet, etc.) y al final los de nicho, en vez de un orden alfabético al voleo.
const SPORTS_LIST = ['futbol','basquet','voley','criquet','tenis_padel','beisbol','rugby',
  'futbol_americano','handball','hockey_cesped','hockey_hielo','golf','boxeo','artes_marciales',
  'natacion','ciclismo','remo','escalada','surf','esqui_snowboard','patin_skate',
  'yoga_pilates','otro'];
const MI_PER_KM = 0.621371, KM_PER_MI = 1.609344, LB_PER_KG = 2.20462, FT_PER_CM = 0.0328084, CM_PER_FT = 30.48;
function isImperial(){ return state.profile && state.profile.units === 'imperial'; }
function distUnit(){ return isImperial() ? 'mi' : 'km'; }
function fmtDist(km, decimals=2){
  const val = isImperial() ? km * MI_PER_KM : km;
  return val.toFixed(decimals);
}
// stepKm/goalKm llegan siempre en km desde el input (lo que el usuario tipeó, en la unidad
// que está viendo) -- hay que convertirlos a km ANTES de guardarlos en state.profile, si no
// se guarda el número tal cual como si fuera km aunque el usuario lo haya escrito en millas.
function parseDistInput(val){
  const n = parseFloat(val);
  if(!(n>0) && n!==0) return 0;
  return isImperial() ? n * KM_PER_MI : n;
}
function fmtWeight(kg){ return Math.round(isImperial() ? kg * LB_PER_KG : kg); }
function weightUnit(){ return isImperial() ? 'lb' : 'kg'; }
// 25-250kg: generoso a propósito (cubre desde un chico chiquito hasta un físico grandote de
// verdad), pero rechaza los típos obvios (ej. "5" en vez de "50", o un "900" con un cero de
// más) que antes pasaban derecho con solo el chequeo de ">0" -- guardando un peso imposible
// para siempre, que ensuciaba el cálculo de calorías de cada carrera desde ese día.
function parseWeightInput(val){
  const n = parseFloat(val);
  if(!(n>0)) return 0;
  const kg = isImperial() ? n / LB_PER_KG : n;
  return (kg>=25 && kg<=250) ? kg : 0;
}
// Mismo patrón que fmtWeight/parseWeightInput -- la altura se guarda siempre en cm
// (state.profile.height), y se muestra convertida a pies (con un decimal, para no perder
// más de ~1 pulgada de precisión al redondear) cuando el corredor eligió sistema imperial.
// Pedido del usuario: la altura mostraba "cm" fijo aunque estuviera en modo imperial.
function fmtHeight(cm){ return isImperial() ? (cm*FT_PER_CM).toFixed(1) : Math.round(cm); }
function heightUnit(){ return isImperial() ? 'ft' : 'cm'; }
// 100-230cm: mismo criterio que parseWeightInput -- generoso para no rechazar a nadie real,
// pero rechaza un típo obvio (ej. "10" en vez de "170").
function parseHeightInput(val){
  const n = parseFloat(val);
  if(!(n>0)) return 0;
  const cm = isImperial() ? n * CM_PER_FT : n;
  return (cm>=100 && cm<=230) ? cm : 0;
}
function updateProfileUnitLabels(){
  const weightLbl = document.getElementById('perfil-weight-label');
  if(weightLbl) weightLbl.textContent = t(isImperial() ? 'ob_weight_label_imperial' : 'ob_weight_label');
  const heightLbl = document.getElementById('perfil-height-label');
  if(heightLbl) heightLbl.textContent = t(isImperial() ? 'ob_height_label_imperial' : 'ob_height_label');
  const kmLbl = document.getElementById('perfil-current-km-label');
  if(kmLbl) kmLbl.textContent = t(isImperial() ? 'ob_currentkm_label_mi' : 'ob_currentkm_label');
  const goalLbl = document.getElementById('perfil-weekly-goal-label');
  if(goalLbl) goalLbl.textContent = t(isImperial() ? 'perfil_weekly_goal_label_mi' : 'perfil_weekly_goal_label');
  const evDist = document.getElementById('ev-distance');
  if(evDist){
    const evDistLabel = t(isImperial() ? 'perfil_ev_dist_ph_mi' : 'perfil_ev_dist_ph');
    evDist.placeholder = evDistLabel;
    // aria-label acá también: el placeholder desaparece apenas el usuario escribe algo, así
    // que sin esto un lector de pantalla se quedaba sin ningún nombre accesible persistente
    // para este campo (encontrado en una auditoría de accesibilidad de index.html).
    evDist.setAttribute('aria-label', evDistLabel);
  }
}
function fmtPace(minPerKm){
  if(!minPerKm || minPerKm<=0) return '—';
  const val = isImperial() ? minPerKm * KM_PER_MI : minPerKm;
  return `${Math.floor(val)}:${String(Math.round((val%1)*60)).padStart(2,'0')}`;
}

/* ---- Supabase: cuentas y datos reales, sincronizados entre dispositivos ---- */
const SUPABASE_URL = 'https://smcicgaraqlvalxvdriz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__JlJqs3dTRRxBcR0QhkUpA_sSPPOW6j';
// "Recordarme" del login (ver el checkbox en index.html y handleSignIn): elige en qué
// storage guarda Supabase la sesión. localStorage sobrevive cerrar y volver a abrir la
// app/pestaña (lo que ya pasaba siempre, sin este checkbox); sessionStorage se borra sola
// al cerrar -- para alguien que inicia sesión en un dispositivo compartido y no quiere
// quedar logueado ahí para siempre. REMEMBER_ME_KEY (la preferencia en sí, no la sesión)
// siempre va en localStorage -- es solo un true/false, no un dato sensible, y tiene que
// sobrevivir el cierre de la app para que la próxima apertura sepa dónde buscar la sesión.
const REMEMBER_ME_KEY = 'zancada_remember_me';
function getRememberMe(){
  try{ return localStorage.getItem(REMEMBER_ME_KEY) !== 'false'; }catch(e){ return true; }
}
function setRememberMe(remember){
  try{ localStorage.setItem(REMEMBER_ME_KEY, remember ? 'true' : 'false'); }catch(e){}
}
// Storage "dual" que Supabase usa para leer/guardar la sesión: mira getRememberMe() en cada
// llamada (no solo una vez al crear el cliente), así que cambiar el checkbox y volver a
// iniciar sesión alcanza para que la próxima sesión quede en el storage correcto, sin
// necesitar recrear supabaseClient.
const dualAuthStorage = {
  getItem(key){
    try{
      const primary = getRememberMe() ? localStorage : sessionStorage;
      const secondary = getRememberMe() ? sessionStorage : localStorage;
      return primary.getItem(key) ?? secondary.getItem(key);
    }catch(e){ return null; }
  },
  setItem(key, value){
    try{
      const target = getRememberMe() ? localStorage : sessionStorage;
      const other = getRememberMe() ? sessionStorage : localStorage;
      target.setItem(key, value);
      other.removeItem(key); // no dejar una copia vieja dando vueltas en el otro storage
    }catch(e){}
  },
  removeItem(key){
    try{ localStorage.removeItem(key); sessionStorage.removeItem(key); }catch(e){}
  }
};
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storage: dualAuthStorage } });

/* ---- Notificaciones push ---- */
const VAPID_PUBLIC_KEY = 'BLBsiej6FgDHLt2S5DvrDfYU9_jf1_qfIzRswRgjcvLvMTPT1lDnVo9NUu8lRfYSVobM_zI80R9KWDbfb-tZXfU';
// El service worker es para la PWA web (offline + detectar versión nueva). Adentro del
// wrapper nativo (Capacitor) no tiene sentido -- ahí las actualizaciones llegan por la
// tienda, no por la red, y registrar un SW sobre los archivos empaquetados solo suma
// riesgo de comportamiento raro de caché sin ningún beneficio real.
if('serviceWorker' in navigator && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())){
  navigator.serviceWorker.register('/sw.js').catch(e=>console.error('SW registration failed', e));
}
// Notificaciones push en la app nativa (Capacitor + Firebase Cloud Messaging, ver
// mobile/push-setup/) -- hasta ahora esto no existía: el SW de arriba está a propósito
// desactivado en nativo, así que enablePushNotifications() de más abajo (pensada para
// PushManager del navegador) directamente le mostraba "no soportado" a cualquiera que
// activara el toggle desde la app instalada. Reportado por el usuario al preguntar qué
// hacía falta rearmar de cara a publicar en las tiendas.
function nativePushPlugin(){ return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications; }
// Registrado UNA sola vez al arrancar (no recién cuando el corredor toca el toggle) para
// que, si FCM llega a rotar el token del dispositivo más adelante (pasa, aunque no seguido),
// el listener siga vivo y actualice solo lo guardado -- en vez de dejarlo roto hasta que
// alguien apague/prenda el toggle a mano de nuevo. Antes de que haya sesión iniciada, o si
// el corredor nunca activó el toggle en este dispositivo, el evento puede llegar igual
// (el plugin no distingue) -- por eso el guard de state.nativePushEnabled/currentUserId.
function initNativePushListeners(){
  const nativePush = nativePushPlugin();
  if(!nativePush) return;
  nativePush.addListener('registration', async (token)=>{
    if(!currentUserId || !state.nativePushEnabled) return;
    try{
      await supabaseClient.from('push_subscriptions').upsert({ user_id: currentUserId, subscription: {token: token.value}, platform: window.Capacitor.getPlatform() });
    }catch(e){ console.error('push nativo: no se pudo guardar el token', e); }
  });
  nativePush.addListener('registrationError', (err)=>{ console.error('push nativo: registro falló', err); });
}
initNativePushListeners();
async function enableNativePushNotifications(nativePush){
  try{
    let status = await nativePush.checkPermissions();
    if(status.receive === 'prompt' || status.receive === 'prompt-with-rationale'){
      const proceed = await showConfirm(t('push_soft_ask'), { confirmText: t('push_soft_ask_confirm'), cancelText: t('push_soft_ask_cancel') });
      if(!proceed){ await updatePushStatusDisplay(); return; }
      status = await nativePush.requestPermissions();
    }
    if(status.receive !== 'granted'){ showToast(t('push_denied'),'error'); await updatePushStatusDisplay(); return; }
    // Tiene que quedar en true ANTES de register(): el listener de arriba solo guarda el
    // token si esto ya está prendido, y el evento 'registration' puede llegar casi al toque.
    state.nativePushEnabled = true;
    persist();
    nativePush.register();
    await updatePushStatusDisplay();
  }catch(e){ console.error(e); showToast(t('push_error'),'error'); await updatePushStatusDisplay(); }
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
  const nativePush = nativePushPlugin();
  if(nativePush){
    // El plugin nativo no tiene un equivalente a pushManager.getSubscription() (no hay forma
    // de preguntarle "¿ya estoy registrado?") -- el estado real es la combinación del permiso
    // del sistema (checkPermissions) y si este dispositivo llegó a pedir el registro alguna
    // vez (state.nativePushEnabled, ver enableNativePushNotifications/initNativePushListeners).
    try{
      const status = await nativePush.checkPermissions();
      // Mismo problema que el bloque de abajo (web push): el usuario puede revocar el permiso
      // de notificaciones desde la configuración del sistema (no desde este toggle) -- sin
      // esto, la fila de push_subscriptions (con el token de FCM de este dispositivo) quedaba
      // viva para siempre, y api/send-reminders.js le seguía intentando mandar avisos a un
      // token que el sistema operativo ya cortó del otro lado.
      if(status.receive !== 'granted' && state.nativePushEnabled){
        state.nativePushEnabled = false;
        if(currentUserId){ try{ await supabaseClient.from('push_subscriptions').delete().eq('user_id', currentUserId); }catch(e){} }
      }
      const enabled = status.receive === 'granted' && !!state.nativePushEnabled;
      el.textContent = enabled ? t('push_enabled') : t('push_disabled');
      if(toggle) toggle.checked = enabled;
    }catch(e){ el.textContent = t('push_disabled'); if(toggle) toggle.checked = false; }
    return;
  }
  if(!('serviceWorker' in navigator) || !('PushManager' in window)){ el.textContent = t('push_not_supported'); if(toggle) toggle.disabled = true; return; }
  try{
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    // El usuario puede revocar el permiso de notificaciones desde la configuración del
    // navegador/SO sin pasar nunca por este toggle -- ahí la suscripción del browser puede
    // seguir "viva" (sub no es null) pero Notification.permission ya no es 'granted', así
    // que ningún push va a llegar de verdad aunque el toggle siguiera mostrando "activadas".
    // Detectamos ese estado y lo mostramos como apagado, y de paso limpiamos la suscripción
    // vieja (browser + push_subscriptions) para no seguir intentando mandarle pushes a un
    // endpoint que el usuario ya cortó del otro lado.
    if(sub && Notification.permission !== 'granted'){
      try{ await sub.unsubscribe(); }catch(e){}
      if(currentUserId){ try{ await supabaseClient.from('push_subscriptions').delete().eq('user_id', currentUserId); }catch(e){} }
      el.textContent = t('push_disabled'); if(toggle) toggle.checked = false;
      return;
    }
    el.textContent = sub ? t('push_enabled') : t('push_disabled');
    if(toggle) toggle.checked = !!sub;
  }catch(e){ el.textContent = t('push_disabled'); if(toggle) toggle.checked = false; }
}
// enable/disablePushNotifications hacen varios await en cadena (service worker, permiso,
// suscripción/token, upsert o delete en Supabase) -- sin ningún candado, tocar el toggle
// rápido (apagar-prender, o prender-apagar-prender) podía disparar dos llamadas superpuestas
// que terminan en cualquier orden. El resultado quedaba en silencio desincronizado: por
// ejemplo, el upsert de un "activar" viejo podía resolver DESPUÉS del delete de un
// "desactivar" más nuevo, dejando la fila de push_subscriptions viva (y las notificaciones
// llegando) aunque el toggle mostrara apagado -- o al revés, un delete viejo borrando la
// suscripción de una activación reciente mientras el toggle sigue mostrando prendido.
// Deshabilitar el checkbox mientras hay una operación en curso hace imposible disparar la
// segunda antes de que la primera (y su updatePushStatusDisplay() final, que sincroniza el
// checkbox con el estado real) haya terminado.
let pushToggleBusy = false;
async function handlePushToggle(checked){
  if(pushToggleBusy) return;
  pushToggleBusy = true;
  const toggleEl = document.getElementById('push-toggle');
  if(toggleEl) toggleEl.disabled = true;
  try{
    if(checked) await enablePushNotifications();
    else await disablePushNotifications();
  } finally {
    pushToggleBusy = false;
    if(toggleEl) toggleEl.disabled = false;
  }
}
async function enablePushNotifications(){
  const nativePush = nativePushPlugin();
  if(nativePush){ await enableNativePushNotifications(nativePush); return; }
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
    await supabaseClient.from('push_subscriptions').upsert({ user_id: currentUserId, subscription: sub.toJSON(), platform: 'web' });
    await updatePushStatusDisplay();
  }catch(e){ console.error(e); showToast(t('push_error'),'error'); await updatePushStatusDisplay(); }
}
async function disablePushNotifications(){
  const nativePush = nativePushPlugin();
  if(nativePush){
    try{
      // El plugin no tiene un "unregister" real (FCM no lo necesita: el token sigue viviendo
      // del lado del dispositivo, pero dejamos de mandarle nada apenas se borra la fila de
      // abajo) -- apagar el toggle es, en la práctica, borrar la fila y bajar la bandera local
      // que initNativePushListeners() usa para decidir si vale la pena guardar un token nuevo.
      state.nativePushEnabled = false;
      persist();
      if(currentUserId) await supabaseClient.from('push_subscriptions').delete().eq('user_id', currentUserId);
      await updatePushStatusDisplay();
    }catch(e){ console.error(e); showToast(t('push_error'),'error'); await updatePushStatusDisplay(); }
    return;
  }
  try{
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if(sub) await sub.unsubscribe();
    if(currentUserId) await supabaseClient.from('push_subscriptions').delete().eq('user_id', currentUserId);
    await updatePushStatusDisplay();
  }catch(e){
    // El checkbox nativo ya se muestra destildado apenas el usuario lo toca (antes de
    // que corra este handler) -- sin avisar ni volver a sincronizar el estado real acá,
    // quedaba pareciendo apagado aunque la baja de verdad haya fallado.
    console.error(e); showToast(t('push_error'),'error'); await updatePushStatusDisplay();
  }
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
let persistSettledResolvers = [];
async function persist(){
  if(!currentUserId) return;
  if(persistInFlight){ persistQueued = true; return; }
  persistInFlight = true;
  try{
    // checkForRemoteConflict() (ver más abajo) solo corre cuando la pestaña VUELVE a estar
    // visible -- protege el caso de "cambiaste de pestaña/dispositivo", pero no el de una
    // pestaña que se queda en segundo plano y nunca vuelve al frente. flushPendingBackup()
    // reintenta cada 25s un guardado que había fallado antes (por ejemplo, por conexión) sin
    // importar si la pestaña está oculta -- si mientras tanto OTRA pestaña o dispositivo, al
    // frente, ya guardó algo más nuevo (una carrera cargada, un cambio de plan), este reintento
    // en segundo plano pisaba esa versión más nueva con el `state` viejo que esta pestaña
    // todavía tiene en memoria, sin ningún aviso. Antes de escribir desde una pestaña oculta,
    // nos fijamos si el servidor ya tiene algo más nuevo que lo último que sabíamos -- si es
    // así, no escribimos nada (el backup local pendiente queda como está, para reintentar más
    // tarde) en vez de arriesgarnos a perder el cambio ajeno. Si esta pestaña vuelve a estar
    // visible más adelante, el chequeo de conflicto de siempre ya se encarga de avisarle al
    // corredor y ofrecerle recargar.
    let skipWrite = false;
    if(typeof document !== 'undefined' && document.visibilityState !== 'visible' && loadedStateVersion){
      const { data } = await supabaseClient.from('app_state').select('updated_at').eq('user_id', currentUserId).maybeSingle();
      if(data && data.updated_at && new Date(data.updated_at).getTime() > new Date(loadedStateVersion).getTime()){
        skipWrite = true;
      }
    }
    if(!skipWrite){
      const nowIso = new Date().toISOString();
      await supabaseClient.from('app_state').upsert({ user_id: currentUserId, data: state, updated_at: nowIso });
      loadedStateVersion = nowIso; // este guardado ya es la versión más nueva que conocemos
      clearPendingBackup();
    }
  }catch(e){
    console.error('persist error', e);
    savePendingBackup(); // sin conexión: lo guardamos en el teléfono y reintentamos más tarde
  }
  updateSyncBadge();
  persistInFlight = false;
  if(persistQueued){ persistQueued = false; persist(); } // había un pedido más pendiente -- lo mandamos ahora con el `state` más actual
  else {
    // Esta era la última llamada de la cadena (no quedó ningún guardado encolado detrás) --
    // si alguien está esperando a que termine de guardar todo (ver waitForPendingPersist(),
    // usado antes de cerrar sesión/borrar cuenta/reiniciar la app), lo desbloqueamos acá.
    const resolvers = persistSettledResolvers; persistSettledResolvers = [];
    resolvers.forEach(fn=>fn());
  }
}
function waitForPendingPersist(){
  // logout()/resetApp()/deleteAccount() cierran sesión o borran datos del lado del servidor
  // justo después de llamar acá -- sin esperar a que un persist() en vuelo (o encolado)
  // termine, esa escritura podía perderse (el usuario edita algo, cierra sesión al toque, y
  // el cambio nunca llega a guardarse) o, en el caso de "Borrar mis datos", un persist()
  // tardío podía llegar DESPUÉS del delete y resucitar la fila que se acababa de borrar.
  if(!persistInFlight && !persistQueued) return Promise.resolve();
  return new Promise(resolve=>{ persistSettledResolvers.push(resolve); });
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
      // OJO: mientras el diálogo de arriba estaba abierto (el usuario tardó en responder),
      // un persist() propio pudo haber corrido igual y ya haber dejado loadedStateVersion
      // más nuevo que este data.updated_at (capturado ANTES de abrir el diálogo) -- si lo
      // pisamos a ciegas acá, loadedStateVersion retrocede a una versión vieja y la próxima
      // comparación detecta un "conflicto" contra el propio guardado que este dispositivo
      // acaba de hacer. Solo lo adoptamos si de verdad sigue siendo más nuevo que lo que ya
      // sabemos.
      if(!loadedStateVersion || new Date(data.updated_at).getTime() > new Date(loadedStateVersion).getTime()){
        loadedStateVersion = data.updated_at;
      }
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
      // El chequeo de "más carreras que en el servidor" solo (sin mirar cuándo se guardó cada
      // cosa) podía dispararse al revés de lo que busca: si este backup local quedó viejo
      // (por ejemplo, se guardaron carreras nuevas desde OTRO dispositivo, y después alguna se
      // borró del todo desde ahí, dejando al servidor con MENOS carreras que las que había acá
      // hace rato), esto pisaba el estado ya actualizado del servidor con datos de este
      // teléfono que en realidad son más viejos -- perdiendo cualquier cambio de perfil/plan
      // hecho desde el otro dispositivo mientras tanto. Reportado en una auditoría. Se agregó
      // que el backup local también sea más NUEVO que la última versión conocida del servidor.
      //
      // Segunda vuelta de la misma auditoría: la condición de "más carreras" se había dejado
      // ADEMÁS del chequeo de fecha (con Y, no en vez de) -- así que una edición offline que no
      // cambia la cantidad de carreras (perfil, plan, chat, cualquier ajuste de Perfil) nunca
      // pasaba ese segundo chequeo, aunque el backup fuera genuinamente más nuevo. La app volvía
      // a cargar el estado viejo del servidor y lo re-guardaba (persist() más abajo), borrando el
      // cambio offline para siempre -- y de paso limpiando el propio backup pendiente
      // (clearPendingBackup() dentro de persist()), así que el indicador de "falta sincronizar"
      // desaparecía como si el cambio SÍ se hubiera guardado. El chequeo de fecha (pending.ts >
      // remoteTs) ya alcanza solo: si este backup es más nuevo que el updated_at que el propio
      // servidor acaba de devolver, es porque a esta altura ya venció a lo que había ahí,
      // tenga más, menos o la misma cantidad de carreras.
      const remoteTs = loadedStateVersion ? new Date(loadedStateVersion).getTime() : 0;
      if(pending && pending.data && pending.ts > remoteTs){
        // había una carrera guardada en el teléfono que no llegó a subirse la última vez -> la recuperamos
        state = pending.data; lang = state.lang || lang;
        persist();
      }
      // El idioma guardado en la cuenta puede no ser el que index.html adivinó por
      // navigator.language y cargó de entrada (alguien que configuró el teléfono en
      // inglés pero eligió español en Perfil, por ejemplo) -- si es otro, hace falta
      // traerlo antes de renderizar nada, sino t() cae de vuelta a español a mitad de
      // camino y despues "salta" cuando este fetch termine.
      // Try/catch propio y a propósito, separado del que envuelve todo esto: si el
      // fetch de la cuenta (arriba) salió bien pero ESTE script puntual falla (blip de
      // red, caché vieja de CDN -- una app que se usa afuera corriendo pisa esto seguido),
      // antes se caía en el catch de "no pudimos cargar tu cuenta" y le ofrecía cerrar
      // sesión, tirando a la basura un `state` que en realidad ya llegó bien. Si falla,
      // seguimos igual -- t() ya cae de vuelta a español si el idioma pedido no está.
      try{ await ensureLocaleLoaded(lang); }catch(e){ console.error('locale load error', e); }
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
      // Mismo criterio que profile.tz arriba: mantenemos sincronizado el idioma en el
      // user_metadata de Supabase Auth (usado por los emails de autenticación, ver
      // email-templates/reset-password.html) en cada apertura, no solo cuando alguien
      // toca el selector en Perfil -- así una cuenta creada ANTES de que existiera este
      // campo también termina teniendo el idioma correcto guardado, sin que el usuario
      // tenga que hacer nada. Solo escribe si hace falta, para no pegarle a la API en
      // cada apertura de la app de balde.
      if(user.user_metadata && user.user_metadata.lang !== lang){
        try{ supabaseClient.auth.updateUser({ data: { lang } }); }catch(e){}
      }
      if(!state.chat || !state.chat.length) seedCoachGreeting(); else renderChat();
      enterApp();
      return;
    }
    // la consulta funcionó y confirmó que no hay datos guardados -> recién registrado, onboarding real.
    // Una alta por email ya pasó por el checkbox de Términos/Privacidad en la pantalla de
    // signup (nunca llega acá con app_state vacío por otro camino), pero Google/Apple pueden
    // haber creado la cuenta recién ahora mismo -- confirmLegalForNewAccount() es el chequeo
    // que cubre ese caso, ver el comentario largo en su definición.
    if(!(await confirmLegalForNewAccount(user))){
      await supabaseClient.auth.signOut();
      location.reload();
      return;
    }
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
// "Crear cuenta" arranca deshabilitado (ver el atributo disabled en index.html) y solo se
// habilita cuando los 3 requisitos están OK a la vez -- antes se podía tocar siempre y
// recién al hacer click aparecía el error puntual de qué faltaba. Se llama desde los
// oninput/onchange de email, contraseña y el checkbox legal (ver index.html).
function updateSignupButtonState(){
  const btn = document.getElementById('signup-submit-btn');
  if(!btn) return;
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const legalOk = document.getElementById('signup-legal-check').checked;
  btn.disabled = !(email.includes('@') && isPasswordStrong(password) && legalOk);
}
function translateAuthError(error){
  const msg = (error && error.message) || '';
  if(msg.includes('Invalid login')) return t('login_err_wrong_password');
  if(msg.includes('already registered') || msg.includes('User already registered')) return t('login_err_exists');
  if(msg.includes('Password should be')) return t('login_err_password');
  // Reportado en una auditoría: el fallback devolvía el mensaje CRUDO de Supabase (siempre
  // en inglés) para cualquier error no listado arriba -- el más común con diferencia es
  // justo "Email not confirmed" (intentar entrar antes de tocar el link del mail), pero
  // también cualquier otro (rate limit, email inválido, etc.) en los 6 idiomas. Ahora
  // "Email not confirmed" reusa login_check_email (mismo texto que ya se muestra en la
  // pantalla de "confirmá tu cuenta"), y cualquier otro caso no reconocido cae a
  // generic_error en vez de mostrar el string de Supabase tal cual.
  if(msg.includes('Email not confirmed')) return t('login_check_email');
  return msg ? t('generic_error') : t('login_err');
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
  // A diferencia de email/Apple, Google muestra su propia pantalla de consentimiento
  // ("Para continuar, revisá los Términos y la Política de Privacidad de Zancada") antes de
  // volver acá -- pedirle que además tilde nuestro checkbox es un segundo paso redundante
  // sobre lo mismo. Por eso NO pasa por checkLegalAccepted() ni por confirmLegalForNewAccount()
  // (ver loadUserAndEnter, que lo saltea para provider==='google').
  setBtnBusy(btnId, true, t('google_loading'));
  try{
    const { error } = await supabaseClient.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: window.location.origin } });
    if(error){ console.error(error); showToast(t('login_err'),'error'); }
  }finally{ setBtnBusy(btnId, false); }
}
// "Sign in with Apple" -- solo se usa en la app nativa de iOS (ver toggle de visibilidad
// de los botones en init(), más abajo). Usa el plugin @capawesome/capacitor-apple-sign-in,
// que se registra solo como Capacitor.Plugins.AppleSignIn apenas corre nativo, sin
// necesitar import ni bundler (mismo patrón que haptic() más arriba).
async function handleAppleSignIn(btnId){
  // Mismo motivo que en handleGoogleSignIn: el checkbox solo existe en signup.
  if(btnId === 'signup-apple-btn' && !checkLegalAccepted()) return;
  setBtnBusy(btnId, true, t('google_loading'));
  try{
    const AppleSignIn = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AppleSignIn;
    if(!AppleSignIn){ showToast(t('login_err'),'error'); return; }
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    // Reportado en una auditoría: este código se escribió sin poder probarlo contra el
    // plugin real (@capawesome/capacitor-apple-sign-in nunca estuvo instalado -- ver
    // mobile/package.json). Los scopes adivinados ('email'/'fullName', minúscula) no
    // coinciden con el enum SignInScope real del plugin ('EMAIL'/'FULL_NAME', ver su
    // README) -- sin este arreglo, Apple nunca habría devuelto el email ni el nombre.
    const result = await AppleSignIn.signIn({ scopes: ['EMAIL', 'FULL_NAME'], nonce });
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
// Conectar más de un reloj a la vez (ej. Strava + COROS) hace que la misma carrera
// entre dos veces a Historial -- cada integración sincroniza contra su propia fuente,
// sin enterarse de que la otra ya trajo esa carrera (el chequeo de duplicados es por
// stravaId/polarId/wahooId/corosId, no cruza entre marcas). Antes de mandar al usuario
// a autorizar una marca nueva, si ya tiene otra conectada le avisamos y le pedimos
// que confirme -- no lo bloqueamos del todo porque hay casos legítimos para tener dos
// a la vez un rato (ej. comparar los datos de un reloj nuevo contra Strava antes de
// migrar del todo).
async function confirmMultiDeviceConnect(newBrand){
  const others = [];
  if(deviceConnections.strava && newBrand!=='Strava') others.push('Strava');
  if(deviceConnections.polar && newBrand!=='Polar') others.push('Polar');
  if(deviceConnections.wahoo && newBrand!=='Wahoo') others.push('Wahoo');
  if(deviceConnections.coros && newBrand!=='COROS') others.push('COROS');
  // Faltaba Health Connect acá -- reportado en una auditoría. No vive en deviceConnections
  // (ver el comentario grande arriba de esa variable: Health Connect se lee directo de
  // state.healthConnectConnected, no se cachea ahí), así que había que agregarlo aparte.
  if(state.healthConnectConnected && newBrand!=='Health Connect') others.push('Health Connect');
  if(!others.length) return true;
  return showConfirm(t('device_multi_connect_confirm', {brands: others.join(', ')}), {confirmText: t('device_multi_connect_proceed')});
}
// Al desconectar una marca, el backend borra de Historial las carreras que había
// importado de ahí (ver el comentario grande en strava-disconnect.js sobre por qué --
// en el caso de Strava, es un requisito de su acuerdo de desarrollador). Si el usuario
// no quiere perder esos datos, le ofrecemos convertirlas a carreras "manuales" ANTES de
// desconectar: les sacamos el source y el id propio de la marca (stravaId/polarId/etc.),
// todo lo demás (distancia, duración, fecha, FC, ruta) queda igual -- así, para cuando el
// backend hace el borrado, esas carreras ya no están marcadas como de esa marca y no las
// toca. persist() tiene que terminar ANTES de llamar al endpoint de desconexión, si no el
// backend puede leer los datos viejos todavía.
async function confirmKeepDataBeforeDisconnect(brand, sourceKey, idField){
  const matching = (state.runs||[]).filter(r=>r.source===sourceKey);
  if(!matching.length) return true;
  const keep = await showConfirm(t('device_disconnect_keep_confirm', {brand, count: matching.length}), {confirmText: t('device_disconnect_keep_btn')});
  if(!keep) return false;
  matching.forEach(r=>{ delete r.source; delete r[idField]; });
  await persist();
  return true;
}
async function connectStrava(){
  if(!(await confirmMultiDeviceConnect('Strava'))) return;
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
// Estado de "hay algún reloj/app conectada" (Strava/Polar/Wahoo -- Health Connect
// se lee directo de state.healthConnectConnected, no hace falta cachearlo acá) para
// poder decidir si mostrar el botón "Sincronizar" (y "Enviar a mi reloj", solo Wahoo)
// en Plan sin tener que volver a consultar Supabase en cada render. Arranca todo en
// false a propósito: mejor no mostrar el botón un instante y que aparezca cuando se
// confirme una conexión real, que mostrarlo de entrada y tener que ocultarlo después
// (ver refreshDeviceConnections(), llamada una vez al entrar a la app).
let deviceConnections = { strava:false, polar:false, wahoo:false, coros:false };
async function refreshDeviceConnections(){
  if(!currentUserId) return;
  try{
    const [s, p, w, c] = await Promise.all([
      supabaseClient.from('strava_connections').select('user_id').eq('user_id', currentUserId).maybeSingle(),
      supabaseClient.from('polar_connections').select('user_id').eq('user_id', currentUserId).maybeSingle(),
      supabaseClient.from('wahoo_connections').select('user_id').eq('user_id', currentUserId).maybeSingle(),
      supabaseClient.from('coros_connections').select('user_id').eq('user_id', currentUserId).maybeSingle()
    ]);
    deviceConnections = { strava: !!s.data, polar: !!p.data, wahoo: !!w.data, coros: !!c.data };
  }catch(e){ console.error(e); }
  renderPlan();
  if(document.getElementById('perfil-devices-summary')) renderPerfil();
}
async function updateStravaStatusDisplay(){
  const el = document.getElementById('strava-status');
  const btn = document.getElementById('strava-connect-btn');
  const note = document.getElementById('strava-sync-note');
  if(!el || !currentUserId) return;
  try{
    const { data } = await supabaseClient.from('strava_connections').select('athlete_id').eq('user_id', currentUserId).maybeSingle();
    deviceConnections.strava = !!data;
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
    renderPlan();
  }catch(e){}
}
async function disconnectStrava(){
  if(!currentUserId) return;
  if(!(await confirmKeepDataBeforeDisconnect('Strava', 'strava', 'stravaId'))) return;
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
      checkShoeWearAlerts(); // si el km bajó del umbral, hay que soltar wearAlerted para que pueda re-avisar más adelante
    }
    renderHistory(); renderHome(); renderPerfil(); persist();
  }
  await updateStravaStatusDisplay();
}

/* ---- Polar AccessLink -----
   Mismo patrón que Strava arriba: authorize -> callback firma+intercambia
   token -> el backend trae las últimas carreras. La diferencia real está
   toda del lado del backend (ver api/polar-auth.js) -- acá el front es
   prácticamente un calco de connectStrava/disconnectStrava. */
const POLAR_CLIENT_ID = 'a4236422-03d7-4814-b772-09c51e50ecba';
async function connectPolar(){
  if(!(await confirmMultiDeviceConnect('Polar'))) return;
  try{
    const { data: { session } } = await supabaseClient.auth.getSession();
    if(!session){ showToast(t('polar_connect_error'),'error'); return; }
    const res = await fetch(apiUrl('/api/polar-init'), {
      method:'POST',
      headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}`}
    });
    if(!res.ok) throw new Error('polar-init failed');
    const { state } = await res.json();
    // Mismo motivo que en connectStrava: redirect_uri fijo a zancada.org, nunca
    // armado con window.location.origin (ver ese comentario para el detalle).
    const redirectUri = 'https://zancada.org/api/polar-auth';
    const url = `https://flow.polar.com/oauth2/authorization?response_type=code&client_id=${POLAR_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
    window.location.href = url;
  }catch(e){
    console.error(e);
    showToast(t('polar_connect_error'),'error');
  }
}
async function updatePolarStatusDisplay(){
  const el = document.getElementById('polar-status');
  const btn = document.getElementById('polar-connect-btn');
  if(!el || !currentUserId) return;
  try{
    const { data } = await supabaseClient.from('polar_connections').select('polar_user_id').eq('user_id', currentUserId).maybeSingle();
    deviceConnections.polar = !!data;
    if(data){
      el.textContent = t('perfil_strava_connected'); el.className = 'tag tag-asfalto';
      if(btn){ btn.textContent = t('perfil_strava_disconnect'); btn.onclick = disconnectPolar; }
    } else {
      el.textContent = t('perfil_native'); el.className = 'tag tag-asfalto';
      if(btn){ btn.textContent = t('perfil_polar_connect'); btn.onclick = connectPolar; }
    }
    renderPlan();
  }catch(e){}
}
async function disconnectPolar(){
  if(!currentUserId) return;
  if(!(await confirmKeepDataBeforeDisconnect('Polar', 'polar', 'polarId'))) return;
  try{
    const { data: { session } } = await supabaseClient.auth.getSession();
    if(session){
      const res = await fetch(apiUrl('/api/polar-disconnect'), {
        method:'POST',
        headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}`}
      });
      if(!res.ok) throw new Error('polar-disconnect failed');
    } else {
      await supabaseClient.from('polar_connections').delete().eq('user_id', currentUserId);
    }
  }catch(e){
    console.error(e);
    try{ await supabaseClient.from('polar_connections').delete().eq('user_id', currentUserId); }catch(e2){}
  }
  if(state.runs && state.runs.some(r=>r.source==='polar')){
    state.runs = state.runs.filter(r=>r.source!=='polar');
    if(state.shoes){
      state.shoes.forEach(shoe=>{
        shoe.km = state.runs.filter(r=>String(r.shoeId)===String(shoe.id)).reduce((a,r)=>a+(r.distanceKm||0),0);
      });
      checkShoeWearAlerts();
    }
    renderHistory(); renderHome(); renderPerfil(); persist();
  }
  await updatePolarStatusDisplay();
}

/* ---- Wahoo -----
   Mismo patrón OAuth que Strava/Polar. A diferencia de Polar, los tokens de
   Wahoo vencen (2hs) -- el refresh vive del lado del backend (ver
   refreshWahooToken en api/_lib/wahoo-activity-helpers.js), acá no hace
   falta manejarlo. Wahoo además soporta mandar entrenamientos AL reloj
   (workouts_write) -- ver pushTodayToWahoo() más abajo. */
const WAHOO_CLIENT_ID = 'WH3lkrMmnMc9vrsIzK5ihi2_FxV2W0zB_LaAxl0EZ-Q';
async function connectWahoo(){
  if(!(await confirmMultiDeviceConnect('Wahoo'))) return;
  try{
    const { data: { session } } = await supabaseClient.auth.getSession();
    if(!session){ showToast(t('wahoo_connect_error'),'error'); return; }
    const res = await fetch(apiUrl('/api/wahoo-init'), {
      method:'POST',
      headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}`}
    });
    if(!res.ok) throw new Error('wahoo-init failed');
    const { state } = await res.json();
    const redirectUri = 'https://zancada.org/api/wahoo-auth';
    const scope = encodeURIComponent('user_read workouts_read workouts_write plans_write');
    const url = `https://api.wahooligan.com/oauth/authorize?client_id=${WAHOO_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code&state=${encodeURIComponent(state)}`;
    window.location.href = url;
  }catch(e){
    console.error(e);
    showToast(t('wahoo_connect_error'),'error');
  }
}
async function updateWahooStatusDisplay(){
  const el = document.getElementById('wahoo-status');
  const btn = document.getElementById('wahoo-connect-btn');
  if(!el || !currentUserId) return;
  try{
    const { data } = await supabaseClient.from('wahoo_connections').select('user_id').eq('user_id', currentUserId).maybeSingle();
    deviceConnections.wahoo = !!data;
    if(data){
      el.textContent = t('perfil_strava_connected'); el.className = 'tag tag-asfalto';
      if(btn){ btn.textContent = t('perfil_strava_disconnect'); btn.onclick = disconnectWahoo; }
    } else {
      el.textContent = t('perfil_native'); el.className = 'tag tag-asfalto';
      if(btn){ btn.textContent = t('wahoo_connect'); btn.onclick = connectWahoo; }
    }
    renderPlan();
  }catch(e){}
}
async function disconnectWahoo(){
  if(!currentUserId) return;
  if(!(await confirmKeepDataBeforeDisconnect('Wahoo', 'wahoo', 'wahooId'))) return;
  try{
    const { data: { session } } = await supabaseClient.auth.getSession();
    if(session){
      const res = await fetch(apiUrl('/api/wahoo-disconnect'), {
        method:'POST',
        headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}`}
      });
      if(!res.ok) throw new Error('wahoo-disconnect failed');
    } else {
      await supabaseClient.from('wahoo_connections').delete().eq('user_id', currentUserId);
    }
  }catch(e){
    console.error(e);
    try{ await supabaseClient.from('wahoo_connections').delete().eq('user_id', currentUserId); }catch(e2){}
  }
  if(state.runs && state.runs.some(r=>r.source==='wahoo')){
    state.runs = state.runs.filter(r=>r.source!=='wahoo');
    if(state.shoes){
      state.shoes.forEach(shoe=>{
        shoe.km = state.runs.filter(r=>String(r.shoeId)===String(shoe.id)).reduce((a,r)=>a+(r.distanceKm||0),0);
      });
      checkShoeWearAlerts();
    }
    renderHistory(); renderHome(); renderPerfil(); persist();
  }
  await updateWahooStatusDisplay();
}
// Manda la sesión de HOY (la misma que ya se ve en Inicio) al calendario de
// Wahoo del usuario -- ver el comentario grande en api/wahoo-push-workout.js
// sobre el alcance de esta primera versión (sin intervalos estructurados).
async function pushTodayToWahoo(){
  const idx = (new Date().getDay()+6)%7;
  const today = state.plan[idx];
  if(!today || !(today.dist>0)){ showToast(t('wahoo_push_nothing'),'error'); return; }
  const lbl = planLabel(today);
  const durMin = today.durMin || Math.round((today.dist / 10) * 60); // estimación si no hay duración explícita
  try{
    const { data: { session } } = await supabaseClient.auth.getSession();
    if(!session){ showToast(t('wahoo_connect_error'),'error'); return; }
    const now = new Date();
    const startsISO = now.toISOString();
    const res = await fetch(apiUrl('/api/wahoo-push-workout'), {
      method:'POST',
      headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}`},
      body: JSON.stringify({ name: lbl.type, startsISO, minutes: durMin })
    });
    const result = await res.json().catch(()=>null);
    if(result && result.alreadyExists){ showToast(t('wahoo_push_already'),'success'); }
    else if(result && result.pushed){ showToast(t('wahoo_push_success'),'success'); }
    else if(result && result.reason==='not_connected'){ showToast(t('wahoo_connect_error'),'error'); }
    else { showToast(t('wahoo_push_error'),'error'); }
  }catch(e){
    console.error(e);
    showToast(t('wahoo_push_error'),'error');
  }
}

// A diferencia de Strava/Polar/Wahoo (OAuth clásico con un client_id/secret creados
// en un panel de developers), COROS usa OAuth 2.1 + PKCE contra su servidor MCP, con
// registro dinámico de cliente -- ver el comentario grande en api/coros-init.js. El
// client_id de acá abajo no es un secreto (igual que STRAVA/POLAR/WAHOO_CLIENT_ID):
// se registró una sola vez para "Zancada" contra el servidor de la región Americas.
const COROS_CLIENT_ID = '8df2bc64-ed53-41f6-a04f-d4d9bf4bb929';
async function connectCoros(){
  if(!(await confirmMultiDeviceConnect('COROS'))) return;
  try{
    const { data: { session } } = await supabaseClient.auth.getSession();
    if(!session){ showToast(t('coros_connect_error'),'error'); return; }
    const res = await fetch(apiUrl('/api/coros-init'), {
      method:'POST',
      headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}`}
    });
    if(!res.ok) throw new Error('coros-init failed');
    const { state, codeChallenge } = await res.json();
    const redirectUri = 'https://zancada.org/api/coros-auth';
    const scope = encodeURIComponent('openid mcp.tools offline_access');
    const url = `https://mcpus.coros.com/oauth2/authorize?response_type=code&client_id=${COROS_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${encodeURIComponent(state)}&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256`;
    window.location.href = url;
  }catch(e){
    console.error(e);
    showToast(t('coros_connect_error'),'error');
  }
}
async function updateCorosStatusDisplay(){
  const el = document.getElementById('coros-status');
  const btn = document.getElementById('coros-connect-btn');
  if(!el || !currentUserId) return;
  try{
    const { data } = await supabaseClient.from('coros_connections').select('user_id').eq('user_id', currentUserId).maybeSingle();
    deviceConnections.coros = !!data;
    if(data){
      el.textContent = t('perfil_strava_connected'); el.className = 'tag tag-asfalto';
      if(btn){ btn.textContent = t('perfil_strava_disconnect'); btn.onclick = disconnectCoros; }
    } else {
      el.textContent = t('perfil_native'); el.className = 'tag tag-asfalto';
      if(btn){ btn.textContent = t('coros_connect'); btn.onclick = connectCoros; }
    }
    renderPlan();
  }catch(e){}
}
async function disconnectCoros(){
  if(!currentUserId) return;
  if(!(await confirmKeepDataBeforeDisconnect('COROS', 'coros', 'corosId'))) return;
  try{
    const { data: { session } } = await supabaseClient.auth.getSession();
    if(session){
      const res = await fetch(apiUrl('/api/coros-disconnect'), {
        method:'POST',
        headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}`}
      });
      if(!res.ok) throw new Error('coros-disconnect failed');
    } else {
      await supabaseClient.from('coros_connections').delete().eq('user_id', currentUserId);
    }
  }catch(e){
    console.error(e);
    try{ await supabaseClient.from('coros_connections').delete().eq('user_id', currentUserId); }catch(e2){}
  }
  if(state.runs && state.runs.some(r=>r.source==='coros')){
    state.runs = state.runs.filter(r=>r.source!=='coros');
    if(state.shoes){
      state.shoes.forEach(shoe=>{
        shoe.km = state.runs.filter(r=>String(r.shoeId)===String(shoe.id)).reduce((a,r)=>a+(r.distanceKm||0),0);
      });
      checkShoeWearAlerts();
    }
    renderHistory(); renderHome(); renderPerfil(); persist();
  }
  await updateCorosStatusDisplay();
}

/* ---- Health Connect (solo Android nativo) -----
   A diferencia de Strava/Polar, acá no hay backend ni OAuth: todo el permiso y la
   lectura pasan en el propio teléfono, vía el plugin local HealthConnectBridge (ver
   mobile/healthconnect-setup/). Por eso el merge de carreras es en el cliente
   (agregar a state.runs + persist(), como cualquier edición local) en vez de una
   función SQL como merge_strava_runs/merge_polar_runs -- no hay condición de carrera
   posible con un cron de fondo, porque no hay ningún cron: solo sincroniza cuando el
   usuario lo pide, con la app abierta y state ya cargado en memoria.
   En la web (y en iOS) window.Capacitor.Plugins.HealthConnectBridge no existe, así
   que todo esto queda inerte -- mismo patrón que haptic(). */
function healthConnectExerciseToRun(ex){
  return {
    id: 'healthconnect_' + ex.id,
    healthConnectId: ex.id,
    date: ex.startTime,
    name: null,
    distanceKm: (ex.distanceMeters || 0) / 1000,
    durationSec: ex.durationSec || 0,
    elevationGain: 0,
    elevationLoss: null,
    avgHr: ex.avgHr ? Math.round(ex.avgHr) : null,
    maxHr: ex.maxHr ? Math.round(ex.maxHr) : null,
    avgCadence: null,
    calories: null,
    hrLog: [],
    points: [],
    splits: [],
    splitsV: 3,
    series: null,
    shoeId: null,
    source: 'healthconnect'
  };
}
// Antes Historial solo reconocía r.source==='strava' para la insignia y la búsqueda --
// Polar/Wahoo/Health Connect quedaban con carreras "sin marca" (sin insignia, invisibles
// para el buscador) aunque llegaran de un reloj sincronizado igual que las de Strava.
const SOURCE_LABELS = {strava:'Strava', polar:'Polar', wahoo:'Wahoo', coros:'COROS', healthconnect:'Health Connect'};
function sourceBadgeHtml(source, withMargin){
  const label = SOURCE_LABELS[source];
  if(!label) return '';
  return `<span class="tag tag-asfalto"${withMargin?' style="margin-right:6px;"':''}>${label}</span>`;
}
function isLikelyDuplicateOfExistingRun(startIso, distanceKm, existingRuns, durationSec){
  // Compara contra CUALQUIER carrera ya guardada, sin importar la fuente -- si el mismo
  // reloj manda la actividad tanto por Health Connect (local, en este dispositivo) como
  // por Strava/Polar/Wahoo (la nube de esa marca), sin este chequeo se guardaban las dos
  // como carreras distintas, porque cada sincronización solo se fija en su propio id
  // (healthConnectId/stravaId/polarId/wahooId). Emparejamos por hora de inicio cercana
  // (10 min) y distancia parecida (10%, con un piso de 300m para carreras cortas) --
  // suficiente para reconocer la misma actividad real sin confundir dos carreras
  // distintas hechas el mismo día.
  // Ojo con solo mirar distancia: una entrada en calor corta seguida, unos minutos después,
  // de una serie/tiempo fuerte con distancia parecida (ej. 3km trotando + 3.2km fuerte) caía
  // dentro de esta misma ventana de 10 min y 10% -- dos actividades reales y distintas
  // terminaban tratadas como una sola, perdiendo una de las dos para siempre. La MISMA
  // actividad sincronizada dos veces (el caso real que este chequeo existe para atajar)
  // siempre tiene una duración prácticamente idéntica además de la distancia -- dos
  // esfuerzos distintos de distancia parecida casi nunca duran lo mismo (ritmos distintos).
  // Exigir también duración parecida (10%, piso de 60s) cierra ese falso positivo sin
  // debilitar la detección del caso real.
  const startMs = new Date(startIso).getTime();
  if(isNaN(startMs)) return false;
  return (existingRuns||[]).some(r=>{
    const rMs = new Date(r.date).getTime();
    if(isNaN(rMs) || Math.abs(rMs-startMs) > 10*60*1000) return false;
    const rKm = r.distanceKm || 0;
    const distTol = Math.max(0.3, rKm*0.1);
    if(Math.abs(rKm - distanceKm) > distTol) return false;
    if(durationSec>0 && r.durationSec>0){
      const durTol = Math.max(60, r.durationSec*0.1);
      if(Math.abs(r.durationSec - durationSec) > durTol) return false;
    }
    return true;
  });
}
function getHealthConnectBridge(){
  return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.HealthConnectBridge;
}
async function connectHealthConnect(){
  if(!(await confirmMultiDeviceConnect('Health Connect'))) return;
  const HC = getHealthConnectBridge();
  if(!HC){ showToast(t('healthconnect_unavailable'),'error'); return; }
  try{
    const avail = await HC.checkAvailability();
    if(!avail.available){ showToast(t('healthconnect_unavailable'),'error'); return; }
    const perm = await HC.requestPermissions();
    if(!perm.granted){ showToast(t('healthconnect_permission_denied'),'error'); return; }
    state.healthConnectConnected = true;
    await syncHealthConnectNow();
    persist();
    updateHealthConnectStatusDisplay();
  }catch(e){
    console.error(e);
    showToast(t('healthconnect_error'),'error');
  }
}
async function syncHealthConnectNow(){
  const HC = getHealthConnectBridge();
  if(!HC) return {synced:false};
  try{
    const { exercises } = await HC.readExercises();
    const knownIds = new Set((state.runs||[]).map(r=>r.healthConnectId));
    const newRuns = (exercises||[])
      .filter(ex=>!knownIds.has(ex.id))
      .filter(ex=>!isLikelyDuplicateOfExistingRun(ex.startTime, (ex.distanceMeters||0)/1000, state.runs, ex.durationSec))
      .map(healthConnectExerciseToRun);
    if(newRuns.length){
      state.runs = [...(state.runs||[]), ...newRuns];
      if(state.shoes){
        state.shoes.forEach(shoe=>{
          shoe.km = state.runs.filter(r=>String(r.shoeId)===String(shoe.id)).reduce((a,r)=>a+(r.distanceKm||0),0);
        });
      }
      // A diferencia de Strava/Polar/Wahoo/COROS (que sincronizan vía el backend y pasan por
      // refreshStateFromServer, que sí llama checkNewPR por cada carrera nueva -- ver ese
      // comentario), Health Connect entra directo a state.runs en memoria acá mismo, así que
      // sin esto una marca personal nueva de un reloj sin API propia (Huawei, ver el resto de
      // relojes que dependen de Health Connect) nunca disparaba el festejo/aviso de "nuevo
      // récord", aunque Logros sí mostrara la marca correcta (se recalcula siempre en vivo).
      // checkAchievementUnlocks() una sola vez después del forEach (no por carrera): recalcula
      // los totales de state.runs completo en cada llamada, así que alcanza con una vez por
      // tanda para detectar cualquier medalla que este lote de carreras nuevas haga cruzar.
      newRuns.forEach(checkNewPR);
      checkAchievementUnlocks();
      renderHistory(); renderHome(); renderPerfil();
    }
    return {synced:newRuns.length>0};
  }catch(e){
    console.error(e);
    return {synced:false, error:e.message};
  }
}
function updateHealthConnectStatusDisplay(){
  const card = document.getElementById('healthconnect-card');
  const isAndroid = !!(window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'android');
  if(card) card.style.display = isAndroid ? '' : 'none';
  // El cartel de arriba de Relojes ("¿No ves tu reloj...") recomienda Strava en
  // web/iOS (aplica ahí, y Health Connect ni existe en esas plataformas), pero en
  // Android tiene más sentido recomendar Health Connect -- ya cubre cualquier marca
  // que escriba ahí (Huawei, Samsung, Garmin, etc.) sin pasar por ninguna conexión
  // propia, y no tiene el riesgo de duplicados de sumar Strava ENCIMA de un reloj que
  // ya sincroniza directo. data-i18n de index.html ya puso el texto de Strava por
  // default (ver applyStaticTranslations) -- acá solo lo pisamos en Android.
  const hintEl = document.getElementById('devices-hint-text');
  if(hintEl) hintEl.textContent = isAndroid ? t('perfil_connectivity_hint_android') : t('perfil_connectivity_hint');
  if(!isAndroid) return;
  const el = document.getElementById('healthconnect-status');
  const btn = document.getElementById('healthconnect-connect-btn');
  if(!el) return;
  if(state.healthConnectConnected){
    el.textContent = t('perfil_strava_connected'); el.className = 'tag tag-asfalto';
    if(btn){ btn.textContent = t('perfil_strava_disconnect'); btn.onclick = disconnectHealthConnect; }
  } else {
    el.textContent = t('perfil_native'); el.className = 'tag tag-asfalto';
    if(btn){ btn.textContent = t('healthconnect_connect'); btn.onclick = connectHealthConnect; }
  }
}
async function disconnectHealthConnect(){
  // Le faltaba el mismo chequeo que ya tienen los otros 4 (confirmMultiDeviceConnect):
  // borraba las carreras de Health Connect directo, sin ofrecer convertirlas a manuales
  // primero -- reportado en una auditoría.
  if(!(await confirmKeepDataBeforeDisconnect('Health Connect', 'healthconnect', 'healthConnectId'))) return;
  const HC = getHealthConnectBridge();
  try{ if(HC) await HC.disconnect(); }catch(e){ console.error(e); }
  state.healthConnectConnected = false;
  if(state.runs && state.runs.some(r=>r.source==='healthconnect')){
    state.runs = state.runs.filter(r=>r.source!=='healthconnect');
    if(state.shoes){
      state.shoes.forEach(shoe=>{
        shoe.km = state.runs.filter(r=>String(r.shoeId)===String(shoe.id)).reduce((a,r)=>a+(r.distanceKm||0),0);
      });
      checkShoeWearAlerts();
    }
    renderHistory(); renderHome(); renderPerfil();
  }
  persist();
  updateHealthConnectStatusDisplay();
}

async function handleSignIn(){
  if(document.getElementById('login-submit-btn')?.disabled) return;
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const err = document.getElementById('login-err');
  err.style.display='none';
  if(!email || !email.includes('@')){ err.textContent = t('login_err'); err.style.display='block'; return; }
  if(!password){ err.textContent = t('login_err_password'); err.style.display='block'; return; }
  // Antes de firmar in: dualAuthStorage (ver la creación de supabaseClient) mira esta
  // preferencia recién en el momento de guardar la sesión que devuelve signInWithPassword,
  // así que hay que dejarla puesta ANTES de esa llamada, no después.
  setRememberMe(document.getElementById('login-remember-me')?.checked !== false);
  setBtnBusy('login-submit-btn', true, t('login_loading'));
  try{
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if(error){ err.textContent = translateAuthError(error); err.style.display='block'; return; }
    await loadUserAndEnter(data.user);
  }finally{ setBtnBusy('login-submit-btn', false); }
}
// Chequea el checkbox de "acepto Términos y Privacidad" del signup -- antes esa
// aceptación era solo un texto pasivo debajo de los botones, sin ninguna acción
// explícita del usuario. Con datos de salud de por medio (lesiones, embarazo, peso)
// conviene un consentimiento afirmativo real, no implícito. Se llama desde los 3
// caminos de alta (email, Google, Apple) -- el checkbox solo existe en la pantalla
// de signup, nunca en la de login (btnId lo distingue para las dos funciones que
// comparten login/signup).
// Cubre el hueco que dejaba checkLegalAccepted(): ESE chequeo solo corre antes de llamar a
// signUp()/OAuth desde la pantalla de signup -- pero "Continuar con Google/Apple" es EL
// MISMO botón para alguien que ya tiene cuenta y para alguien que se está registrando (no
// hay forma de saberlo de antemano, antes de volver de Google), y ese botón también existe
// en la pantalla de LOGIN, sin ningún checkbox cerca. Sin este chequeo acá, entrar por
// Google desde login con una cuenta que no existía todavía la creaba igual, sin que nadie
// aceptara nunca los Términos ni la Privacidad. Se llama desde loadUserAndEnter() en la
// rama de "cuenta recién creada" (app_state vacío) -- una cuenta YA EXISTENTE nunca pasa
// por ahí, así que esto no le vuelve a aparecer a nadie en logins normales.
async function confirmLegalForNewAccount(user){
  // Un alta por email guarda legalAccepted:true en el user_metadata en el momento mismo del
  // signUp() (ver handleSignUp) -- si confirmar el mail tarda (el usuario cierra la pestaña y
  // confirma desde el mail en otro dispositivo, caso que ya soporta el polling de
  // pollConfirmEmail), ese dato viaja con la cuenta en el servidor, no en una variable JS que
  // se perdería. Si ya está, no hace falta volver a preguntar acá.
  if(user.user_metadata && user.user_metadata.legalAccepted) return true;
  // Google ya muestra su propia pantalla ("Para continuar, revisá los Términos y la Política
  // de Privacidad de Zancada") antes de volver acá -- preguntarlo de nuevo es redundante. Solo
  // Google hace esto de forma nativa (Apple no), por eso el saltee es específico a ese provider.
  if(user.app_metadata && user.app_metadata.provider === 'google') return true;
  const terms = `<a href="${apiUrl('/terms.html?lang='+lang)}" target="_blank" rel="noopener" style="color:var(--hivis-text); text-decoration:underline;">${t('legal_terms_link')}</a>`;
  const privacy = `<a href="${apiUrl('/privacy.html?lang='+lang)}" target="_blank" rel="noopener" style="color:var(--hivis-text); text-decoration:underline;">${t('legal_privacy_link')}</a>`;
  const accepted = await showConfirm(t('oauth_legal_confirm', {terms, privacy}), {confirmText: t('oauth_legal_accept_btn'), cancelText: t('cancel_word')});
  if(accepted){ try{ await supabaseClient.auth.updateUser({ data: { legalAccepted: true } }); }catch(e){} }
  return accepted;
}
function checkLegalAccepted(){
  const cb = document.getElementById('signup-legal-check');
  if(cb && !cb.checked){
    const err = document.getElementById('signup-err');
    if(err){ err.textContent = t('signup_legal_required'); err.style.display='block'; }
    return false;
  }
  return true;
}
async function handleSignUp(){
  if(document.getElementById('signup-submit-btn')?.disabled) return;
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const err = document.getElementById('signup-err');
  err.style.display='none';
  if(!email || !email.includes('@')){ err.textContent = t('login_err'); err.style.display='block'; return; }
  if(!password || !isPasswordStrong(password)){ err.textContent = t('login_err_password_weak'); err.style.display='block'; return; }
  if(!checkLegalAccepted()) return;
  setBtnBusy('signup-submit-btn', true, t('signup_loading'));
  try{
    // Guardamos el idioma actual en el user_metadata de Supabase Auth (no en app_state,
    // que Supabase no puede leer) para que los emails de autenticación (reset de
    // contraseña, etc.) se puedan armar en el idioma de cada usuario -- ver
    // email-templates/reset-password.html, que lee esto como {{ .Data.lang }}. legalAccepted
    // queda guardado acá mismo (ya pasó por checkLegalAccepted() arriba) para que
    // confirmLegalForNewAccount() en loadUserAndEnter() no le vuelva a preguntar apenas
    // confirme el mail -- ese dato viaja con la cuenta en el servidor, no depende de que
    // sea la misma pestaña/dispositivo el que confirme.
    const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { lang, legalAccepted: true } } });
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
  // Tope de 10 minutos (150 intentos x 4s): auditoría de costos -- sin esto, alguien que deja
  // esta pantalla abierta y nunca confirma el mail (o abandona la pestaña) generaba un intento
  // real de login contra Supabase Auth cada 4 segundos para siempre, sin límite. Pasado el
  // tope simplemente dejamos de sondear -- el botón "Reenviar email" y volver a entrar siguen
  // andando igual, así que no se pierde ninguna funcionalidad real.
  let attempts = 0;
  const MAX_ATTEMPTS = 150;
  confirmEmailPollTimer = setInterval(async ()=>{
    if(document.visibilityState !== 'visible') return;
    if(++attempts > MAX_ATTEMPTS){ stopConfirmEmailPolling(); return; }
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
document.getElementById('ob-returning').addEventListener('click', e=>{
  const c=e.target.closest('.choice'); if(!c) return;
  [...document.getElementById('ob-returning').children].forEach(x=>x.classList.remove('active')); c.classList.add('active');
});
document.getElementById('ob-pregnancy').addEventListener('click', e=>{
  const c=e.target.closest('.choice'); if(!c) return;
  [...document.getElementById('ob-pregnancy').children].forEach(x=>x.classList.remove('active')); c.classList.add('active');
});
document.getElementById('ob-gender').addEventListener('click', e=>{
  const c=e.target.closest('.choice'); if(!c) return;
  [...document.getElementById('ob-gender').children].forEach(x=>x.classList.remove('active')); c.classList.add('active');
  // El toggle de embarazo/postparto solo tiene sentido si eligió "femenino" -- para
  // cualquier otra opción lo ocultamos y lo dejamos en "no" por las dudas, así un
  // corredor que cambia de género después de haberlo tildado por error no deja
  // ese dato viejo sin que se vea.
  const isF = c.dataset.v==='f';
  document.getElementById('ob-pregnancy-wrap').style.display = isF?'block':'none';
  if(!isF){
    [...document.getElementById('ob-pregnancy').children].forEach(x=>x.classList.toggle('active', x.dataset.v==='no'));
  }
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
// Reportado en una auditoría: ninguno de los 29 paneles .overlay/.overlay-sheet (login,
// settings, calendario, etc.) tenía semántica de diálogo -- sin role="dialog"/aria-modal,
// un lector de pantalla no anuncia "se abrió un diálogo", y sin Escape no hay forma de
// cerrarlo sin tocar la pantalla. Se agrega centralizado acá (en vez de tocar cada una de
// las ~29 funciones open*Overlay() dispersas por el archivo) con dos partes:
//
// 1. Un MutationObserver mira cualquier .overlay/.overlay-sheet que gane la clase
// overlay-open (así se abren todas, sin importar desde qué función) y le pone role="dialog"
// aria-modal="true" -- puramente aditivo, no cambia ningún comportamiento existente.
//
// 2. Escape busca, DENTRO del overlay abierto, el mismo botón de "atrás" que ya tiene la
// mayoría (data-i18n-aria="aria_back", el ícono de flecha en la esquina) y le simula un
// click -- reusa el cierre real de cada overlay (con cualquier guardado/limpieza que haga),
// en vez de sacarle la clase a mano y arriesgarse a saltear ese cierre propio. Los paneles
// que no tienen ese botón (login/signup/onboarding, y los modales de confirmar/calificar)
// se quedan sin Escape a propósito: no tienen un "atrás" al que volver sin perder el
// progreso, o no deberían cerrarse sin una decisión explícita.
if(typeof MutationObserver !== 'undefined'){
  new MutationObserver(muts=>{
    muts.forEach(m=>{
      const el = m.target;
      if(el.classList && el.classList.contains('overlay-open') && (el.classList.contains('overlay') || el.classList.contains('overlay-sheet'))){
        if(!el.hasAttribute('role')) el.setAttribute('role','dialog');
        if(!el.hasAttribute('aria-modal')) el.setAttribute('aria-modal','true');
      }
    });
  }).observe(document.body, { attributes:true, attributeFilter:['class'], subtree:true });
}
document.addEventListener('keydown', e=>{
  if(e.key!=='Escape') return;
  const openOverlay = document.querySelector('.overlay.overlay-open, .overlay-sheet.overlay-open');
  if(!openOverlay) return;
  const backBtn = openOverlay.querySelector('[data-i18n-aria="aria_back"]');
  if(backBtn) backBtn.click();
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
const THEME_KEY = 'zancada_theme';
// El tema es una preferencia del dispositivo, no un dato del corredor -- vive en
// localStorage (mismo lugar que ya lee el script de arranque en el <head>, antes de
// que cargue este archivo) y nunca pasa por persist()/Supabase: cambiarlo en un
// celular no debería prender o apagar el tema en los demás dispositivos de la cuenta.
// El toggle de Perfil solo ofrece Claro/Oscuro (sin "Sistema") -- pero mientras nadie
// tocó nada, sigue sin forzar ningún atributo y dejando que decida el propio sistema
// operativo (ver el script del <head> y el media query en el CSS); esta función solo
// resuelve esa ambigüedad para saber qué botón marcar activo en el toggle.
function currentThemePref(){
  const v = localStorage.getItem(THEME_KEY);
  if(v==='light' || v==='dark') return v;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
function applyTheme(pref){
  try{ localStorage.setItem(THEME_KEY, pref); }catch(e){}
  if(pref==='light' || pref==='dark') document.documentElement.setAttribute('data-theme', pref);
  else document.documentElement.removeAttribute('data-theme');
  const isLight = pref==='light' || (pref!=='dark' && window.matchMedia('(prefers-color-scheme: light)').matches);
  const meta = document.getElementById('theme-color-meta');
  if(meta) meta.setAttribute('content', isLight ? '#F0F1EE' : '#0A0A0A');
  [...document.getElementById('theme-toggle').children].forEach(c=>c.classList.toggle('active', c.dataset.v===pref));
}
document.getElementById('theme-toggle').addEventListener('click', e=>{
  const c=e.target.closest('.choice'); if(!c) return;
  applyTheme(c.dataset.v);
});
// Si el tema está en "system" y el usuario cambia el modo oscuro/claro del sistema
// operativo mientras la app sigue abierta, el CSS (prefers-color-scheme) ya reacciona
// solo -- esto solo mantiene el color de la barra de estado (theme-color) sincronizado
// con lo que el CSS terminó mostrando, ya que esa meta no puede reaccionar sola.
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', ()=>{
  // Sin preferencia explícita guardada, el CSS ya se re-renderiza solo (prefers-color-scheme)
  // apenas cambia el modo del sistema -- esto solo mantiene sincronizado el color de la
  // barra de estado, que no puede reaccionar sola a un media query.
  const stored = localStorage.getItem(THEME_KEY);
  if(stored!=='light' && stored!=='dark'){
    const meta = document.getElementById('theme-color-meta');
    if(meta) meta.setAttribute('content', window.matchMedia('(prefers-color-scheme: light)').matches ? '#F0F1EE' : '#0A0A0A');
    [...document.getElementById('theme-toggle').children].forEach(c=>c.classList.toggle('active', c.dataset.v===currentThemePref()));
  }
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
  document.querySelectorAll('#ob-sport-days .day-pill').forEach(el=>{ el.textContent = t('day_'+el.dataset.v).slice(0,3); });
}
function renderPerfilDays(){
  const selected = state.profile.trainingDays || [];
  document.getElementById('perfil-days').innerHTML = DAY_KEYS.map(d=>
    `<div class="day-pill${selected.includes(d)?' active':''}" data-v="${d}" role="button" tabindex="0">${t('day_'+d).slice(0,3)}</div>`).join('');
  const daysSummaryEl = document.getElementById('perfil-days-summary');
  if(daysSummaryEl) daysSummaryEl.textContent = DAY_KEYS.filter(d=>selected.includes(d)).map(d=>t('day_'+d)).join(', ');
}
// La selección de deporte ya no es un grid fijo de chips siempre visible (con 24 deportes en
// pantalla a la vez no entraba/se veía espantoso) -- ahora es un botón "Seleccionar deporte"
// que abre un picker con buscador (#sport-picker-overlay, compartido entre onboarding y
// Perfil) sobre SPORTS_LIST. Mientras el picker está abierto, la selección vive en un Set
// aparte (sportPickerTemp) y recién se aplica al draft del contexto ("ob" u "perfil") al
// cerrar con "Listo" -- así cancelar (o simplemente no tocar nada) no deja nada a medio
// aplicar. El selector de días recién se revela cuando hay al menos un deporte elegido.
let obSelectedSports = [];
let perfilSportsDraft = [];
let sportPickerCtx = null;
let sportPickerTemp = new Set();
function sportsDraftFor(ctx){ return ctx === 'ob' ? obSelectedSports : perfilSportsDraft; }
function setSportsDraftFor(ctx, arr){ if(ctx==='ob') obSelectedSports = arr; else perfilSportsDraft = arr; }
// A diferencia de #perfil-sport-days (renderPerfilCrossTraining regenera ese innerHTML entero
// desde state.profile.crossTrainingDays cada vez que se abre, así que nunca queda un día
// pegado de una selección vieja), #ob-sport-days es un bloque ESTÁTICO en el HTML del
// onboarding -- nada lo regenera, solo se van togglenado los .day-pill a mano (ver el
// addEventListener más abajo). Sin este control, elegir "Fútbol" y marcar lunes/miércoles,
// después sacar "Fútbol" y elegir "Yoga" en su lugar, dejaba lunes/miércoles todavía
// marcados -- finishOnboard() los guardaba como si fueran los días de Yoga, sin que el
// usuario los haya confirmado para ESE deporte. obLastSportsKey guarda qué combinación de
// deportes fue la última que de verdad se renderizó para onboarding; si cambió (se agregó o
// sacó alguno), se limpian los días marcados -- si no cambió (por ej. abrir el picker y
// cerrarlo sin tocar nada), se dejan como estaban.
let obLastSportsKey = null;
function renderSportChips(ctx){
  const sports = sportsDraftFor(ctx);
  const row = document.getElementById(ctx+'-sports-selected');
  const btn = document.getElementById(ctx+'-sports-select-btn');
  if(row){
    row.style.display = sports.length ? 'flex' : 'none';
    row.innerHTML = sports.map(s=>
      `<div class="choice active sport-chip" data-v="${s}">${t('sport_'+s)}<span class="sport-chip-x" onclick="event.stopPropagation(); removeSelectedSport('${ctx}','${s}')">&times;</span></div>`).join('');
    // Reportado en una auditoría: makeClickablesFocusable() (ver su definición) solo corría
    // una vez, al cargar la página -- cualquier [onclick] agregado después por un render
    // dinámico (como este) quedaba sin tabindex/role, inalcanzable por teclado. Se re-corre
    // acotada a este contenedor cada vez que se re-renderiza. Mismo criterio en
    // renderSportPickerList/renderPlan/renderHistory/renderCalendar* más abajo.
    makeClickablesFocusable(row);
  }
  if(btn) btn.textContent = t(sports.length ? 'sport_select_btn_more' : 'sport_select_btn');
  const wrap = document.getElementById(ctx+'-sport-days-wrap');
  if(wrap) wrap.style.display = sports.length ? 'block' : 'none';
  if(ctx === 'ob'){
    const key = sports.slice().sort().join(',');
    if(key !== obLastSportsKey){
      document.querySelectorAll('#ob-sport-days .day-pill').forEach(el=>el.classList.remove('active'));
      obLastSportsKey = key;
    }
  }
}
function removeSelectedSport(ctx, key){
  setSportsDraftFor(ctx, sportsDraftFor(ctx).filter(s=>s!==key));
  renderSportChips(ctx);
  if(ctx === 'perfil') markPerfilDirty('crosstraining');
}
function openSportPicker(ctx){
  sportPickerCtx = ctx;
  sportPickerTemp = new Set(sportsDraftFor(ctx));
  const search = document.getElementById('sport-picker-search');
  if(search) search.value = '';
  renderSportPickerList();
  openOverlaySheetEl(document.getElementById('sport-picker-overlay'));
}
function closeSportPicker(){
  if(sportPickerCtx){
    setSportsDraftFor(sportPickerCtx, SPORTS_LIST.filter(s=>sportPickerTemp.has(s)));
    renderSportChips(sportPickerCtx);
    if(sportPickerCtx === 'perfil') markPerfilDirty('crosstraining');
  }
  sportPickerCtx = null;
  document.getElementById('sport-picker-overlay').classList.remove('overlay-open');
}
function toggleSportPickerRow(key){
  if(sportPickerTemp.has(key)) sportPickerTemp.delete(key); else sportPickerTemp.add(key);
  renderSportPickerList();
}
function filterSportPicker(){ renderSportPickerList(); }
function renderSportPickerList(){
  const list = document.getElementById('sport-picker-list');
  if(!list) return;
  const q = (document.getElementById('sport-picker-search')?.value || '').trim().toLowerCase();
  const filtered = SPORTS_LIST.filter(s => !q || t('sport_'+s).toLowerCase().includes(q));
  list.innerHTML = filtered.length ? filtered.map(s => `
    <div class="sport-row${sportPickerTemp.has(s)?' active':''}" onclick="toggleSportPickerRow('${s}')">
      <span>${t('sport_'+s)}</span>
      <span class="check-dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
    </div>`).join('') : `<p class="muted" style="text-align:center; padding:20px 0;">${t('sport_picker_empty')}</p>`;
  makeClickablesFocusable(list);
}
document.getElementById('ob-sport-days').addEventListener('click', e=>{
  const c=e.target.closest('.day-pill'); if(!c) return;
  c.classList.toggle('active');
});
document.getElementById('perfil-sport-days').addEventListener('click', e=>{
  const c=e.target.closest('.day-pill'); if(!c) return;
  c.classList.toggle('active');
  markPerfilDirty('crosstraining');
});
function renderPerfilCrossTraining(){
  perfilSportsDraft = [...(state.profile.crossTrainingSports || [])];
  renderSportChips('perfil');
  const selectedDays = state.profile.crossTrainingDays || [];
  document.getElementById('perfil-sport-days').innerHTML = DAY_KEYS.map(d=>
    `<div class="day-pill${selectedDays.includes(d)?' active':''}" data-v="${d}" role="button" tabindex="0">${t('day_'+d).slice(0,3)}</div>`).join('');
  const summaryEl = document.getElementById('perfil-crosstraining-summary');
  if(summaryEl){
    const selectedSports = state.profile.crossTrainingSports || [];
    summaryEl.textContent = selectedSports.length
      ? selectedSports.map(s=>t('sport_'+s)).join(', ')
      : t('perfil_crosstraining_summary_empty');
  }
}
function openCrossTrainingOverlay(){ renderPerfilCrossTraining(); openOverlaySheetEl(document.getElementById('crosstraining-overlay')); }
function closeCrossTrainingOverlay(){ document.getElementById('crosstraining-overlay').classList.remove('overlay-open'); }
function saveCrossTraining(){
  const sports = perfilSportsDraft;
  const days = DAY_KEYS.filter(d => document.querySelector(`#perfil-sport-days .day-pill[data-v="${d}"]`)?.classList.contains('active'));
  state.profile.crossTrainingSports = sports;
  // Si sacó todos los deportes, los días quedan sin sentido -- no los dejamos guardados sueltos.
  state.profile.crossTrainingDays = sports.length ? days : [];
  state.plan = preserveLivedDays(state.plan, generatePlan(state.profile, state.weekNumber||1));
  renderAll(); renderPerfilCrossTraining(); persist();
  flashSaved('save-crosstraining-btn');
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
  // today.declinedRunId (ver markSession): si el corredor tocó "Deshacer" a propósito sobre
  // una carrera YA vinculada, esa carrera sigue existiendo en state.runs (Deshacer solo
  // desvincula, no borra) -- sin este chequeo, la próxima vez que se abriera la app HOY
  // mismo, relinkTodayRun() volvía a encontrar esa misma carrera y la revinculaba sola,
  // deshaciendo en silencio el "Deshacer" del corredor sin ningún aviso. Reportado en una
  // auditoría.
  const todayRun = (state.runs||[]).find(r=>{
    if(r.id === today.declinedRunId) return false;
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
  personal:      { cardId: 'perfil-personal-card',      btnId: 'save-personal-btn',      run: savePersonalData },
  goals:         { cardId: 'perfil-goals-card',         btnId: 'save-goals-btn',         run: saveGoals },
  days:          { cardId: 'perfil-days-card',          btnId: 'save-days-btn',          run: saveTrainingDays },
  zones:         { cardId: 'perfil-zones-card',         btnId: 'save-zones-btn',         run: saveCustomZones },
  crosstraining: { cardId: 'perfil-crosstraining-card', btnId: 'save-crosstraining-btn', run: saveCrossTraining },
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
// savePersonalData()/saveGoals() ya mutan state.profile ANTES de abrir este modal (falta
// nada más que decidir CUÁNDO aplicarlo) -- así que "cancelar" acá no puede ser solo
// cerrar la ventana, tiene que devolver esos campos a como estaban, si no el corredor
// queda con un cambio a medio aplicar en memoria (nunca guardado ni mostrado en pantalla,
// pero ahí, esperando a la próxima vez que algo vuelva a tocar el perfil). Reportado en
// una auditoría: antes este modal no tenía ninguna forma de salir sin elegir "ahora" o
// "semana que viene".
let pendingPlanChangeBackup = null;
function openPlanChangeTimingModal(ctx, backup){
  pendingPlanChangeContext = ctx;
  pendingPlanChangeBackup = backup;
  document.getElementById('plan-change-timing-modal').style.display = 'block';
}
function cancelPlanChangeTiming(){
  document.getElementById('plan-change-timing-modal').style.display = 'none';
  if(pendingPlanChangeBackup) Object.assign(state.profile, pendingPlanChangeBackup);
  pendingPlanChangeContext = null;
  pendingPlanChangeBackup = null;
  renderPerfil(); // los inputs vuelven a mostrar los valores de verdad guardados, no lo que se había tipeado
}
function resolvePlanChangeTiming(choice){
  document.getElementById('plan-change-timing-modal').style.display = 'none';
  const ctx = pendingPlanChangeContext;
  pendingPlanChangeContext = null;
  pendingPlanChangeBackup = null;
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
  // El peso y los km actuales se muestran convertidos a la unidad elegida (ver
  // fmtWeight()/fmtDist() en renderPerfil()) -- hay que reconvertirlos a kg/km ANTES de
  // guardarlos, si no un usuario en modo imperial que tipea "150" (lb) queda con 150kg
  // guardados tal cual.
  const weightInput = document.getElementById('perfil-weight');
  const heightInput = document.getElementById('perfil-height');
  // Si el campo todavía muestra exactamente el mismo texto con el que renderPerfil lo
  // pobló (fmtWeight/fmtHeight del valor ya guardado), el corredor no tocó este campo --
  // guardamos el kg/cm original tal cual, sin re-parsear. Sin este chequeo, CUALQUIER guardado
  // de "Datos personales" en modo imperial (aunque solo se haya cambiado el terreno o el
  // género) reconvertía peso/altura ida y vuelta a través del valor redondeado que se ve en
  // pantalla (lb/ft, con menos precisión que el kg/cm guardado) y los pisaba con un número
  // levemente distinto -- ej. 70kg -> "154" lb -> 69.853kg -- un drift silencioso y
  // acumulativo en cada guardado, encontrado por testing adversarial reproduciendo
  // savePersonalData() de punta a punta.
  const weight = (state.profile.weight && weightInput.value === String(fmtWeight(state.profile.weight)))
    ? state.profile.weight : parseWeightInput(weightInput.value);
  const height = (state.profile.height && heightInput.value === String(fmtHeight(state.profile.height)))
    ? state.profile.height : parseHeightInput(heightInput.value);
  const terrainChoice = document.querySelector('#perfil-terrain-choice .choice.active');
  const genderChoice = document.querySelector('#perfil-gender-choice .choice.active');
  const goal = document.getElementById('perfil-goal').value;
  const raceDate = document.getElementById('perfil-racedate').value || null;
  const currentKmInput = document.getElementById('perfil-current-km');
  const backup = { weight: state.profile.weight, height: state.profile.height, terrain: state.profile.terrain, gender: state.profile.gender, goal: state.profile.goal, raceDate: state.profile.raceDate, currentWeeklyKm: state.profile.currentWeeklyKm, runnerType: state.profile.runnerType, weeklyKm: state.profile.weeklyKm };
  if(weight>0) state.profile.weight = weight;
  if(height>0) state.profile.height = height;
  if(terrainChoice) state.profile.terrain = terrainChoice.dataset.v;
  if(genderChoice) state.profile.gender = genderChoice.dataset.v;
  if(goal) state.profile.goal = goal;
  state.profile.raceDate = raceDate;
  if(currentKmInput && currentKmInput.value !== ''){
    // Mismo motivo que peso/altura arriba: si el campo sigue mostrando el fmtDist(...,1) con
    // el que se pobló, no lo tocó -- no lo re-parseamos, para no perder precisión (ej. 20km ->
    // "12.4" mi -> 19.956km) en un guardado que ni siquiera cambió este campo.
    const kmUnchanged = (state.profile.currentWeeklyKm===0 || state.profile.currentWeeklyKm)
      && currentKmInput.value === fmtDist(state.profile.currentWeeklyKm, 1);
    state.profile.currentWeeklyKm = kmUnchanged ? state.profile.currentWeeklyKm : parseDistInput(currentKmInput.value);
    state.profile.runnerType = 'active';
  }
  state.profile.weeklyKm = calcWeeklyKm(state.profile);
  openPlanChangeTimingModal('personal', backup);
}
// --- Objetivo/meta semanal: apartado "a partir de ahora" ---
function applyGoalsChangeNow(){
  // la meta semanal ahora es un input real del plan (acotado por seguridad en generatePlan),
  // no solo un número decorativo para la barra de progreso -- así que hay que regenerar
  // el plan de la semana y avisarle al coach para que quede todo conectado
  const fresh = generatePlan(state.profile, state.weekNumber||1);
  const merged = preserveLivedDays(state.plan, fresh);
  // generatePlan no sabe nada de "cuánto ya se corrió esta semana" -- reparte la meta nueva
  // (ya acotada por seguridad ahí adentro, ver effectiveWeeklyKm/minWk/maxWk) entre TODOS los
  // días de la semana como si arrancara de cero, y preserveLivedDays después deja los días ya
  // vividos (hechos/salteados/personalizados) con su distancia VIEJA. Sin esto, si el corredor
  // sube la meta a mitad de semana (ej. de 20 a 40km, con 13km ya corridos), el único día que
  // sobrevive de la regeneración terminaba con LA PORCIÓN que le tocaría en una semana entera
  // repartida entre TODOS los días -- no lo que en realidad falta -- y el total real de la
  // semana se quedaba pegado cerca de la meta VIEJA, aunque el coach dijera "listo, ajusté el
  // plan para tu nueva meta". Acá reescalamos SOLO los días que de verdad vienen del plan
  // recién generado (los que preserveLivedDays no reemplazó por el valor viejo) para que,
  // sumados a lo YA CORRIDO de verdad esta semana (state.runs, mismo criterio que ya usa la
  // barra de progreso de Inicio), den el total que generatePlan decidió para la semana entera
  // (fresh, ya acotado) -- así el tope de seguridad de effectiveWeeklyKm se sigue respetando
  // igual que en una regeneración de semana completa, sin tocar el TIPO de sesión elegido.
  if(state.profile.weeklyGoalKm > 0){
    const weekRuns = (state.runs||[]).filter(r => getMondayISO(new Date(r.date)) === state.weekStart);
    const doneKm = weekRuns.reduce((s,r)=>s+(r.distanceKm||0), 0);
    const freshTotal = fresh.reduce((s,d)=>s+(d.dist||0), 0);
    const remaining = Math.max(0, freshTotal - doneKm);
    const freshDays = merged.filter((d,i)=> d===fresh[i] && d.dist>0);
    const freshSum = freshDays.reduce((s,d)=>s+d.dist, 0);
    if(freshDays.length && freshSum>0){
      const factor = remaining / freshSum;
      freshDays.forEach(d=>{ d.dist = Math.max(0.1, Math.round(d.dist*factor*10)/10); });
    }
  }
  state.plan = merged;
  if(state.profile.weeklyGoalKm > 0){
    state.chat.push({role:'coach', text: t('coach_weekly_goal_updated', {km: fmtDist(state.profile.weeklyGoalKm,1), unit: distUnit()}), ts:Date.now()});
    renderChat();
  }
}
// --- Objetivo/meta semanal: apartado "desde la semana que viene" ---
function applyGoalsChangeNextWeek(){
  // Igual que en datos personales: no tocamos el plan de esta semana, la que viene ya
  // se calcula sola con el perfil actualizado.
  if(state.profile.weeklyGoalKm > 0){
    state.chat.push({role:'coach', text: t('coach_weekly_goal_updated_next_week', {km: fmtDist(state.profile.weeklyGoalKm,1), unit: distUnit()}), ts:Date.now()});
    renderChat();
  }
}
function finishGoalsSave(){
  renderAll(); persist();
  flashSaved('save-goals-btn');
}
function saveGoals(){
  const weeklyGoal = parseDistInput(document.getElementById('perfil-weekly-goal').value);
  const goalNote = document.getElementById('perfil-goal-note').value.trim();
  // "minutos disponibles por sesión" ahora sí topea las sesiones entre semana del plan real
  // (ver el cap en generatePlan) -- antes esto solo se podía cargar una vez en el onboarding
  // y nunca se podía tocar después. Mismo guard >0/null que en finishOnboard: un campo
  // vaciado a mano vuelve a "sin límite", no se queda pegado en 0.
  // Tope de 300min (5hs): generoso a propósito (cubre hasta la tirada larga de un
  // ultramaratonista), pero rechaza un típo obvio (ej. escribir minutos donde entraban
  // segundos) que antes quedaba guardado tal cual, sin ningún techo.
  const availMinRaw = parseFloat(document.getElementById('perfil-availmin').value);
  const availableMinPerSession = (availMinRaw>0 && availMinRaw<=300) ? Math.round(availMinRaw) : null;
  const goalChanged = (state.profile.weeklyGoalKm||0) !== weeklyGoal || (state.profile.availableMinPerSession||null) !== availableMinPerSession;
  const backup = { weeklyGoalKm: state.profile.weeklyGoalKm, goalNote: state.profile.goalNote, availableMinPerSession: state.profile.availableMinPerSession };
  state.profile.weeklyGoalKm = weeklyGoal;
  state.profile.goalNote = goalNote;
  state.profile.availableMinPerSession = availableMinPerSession;
  if(goalChanged){
    openPlanChangeTimingModal('goals', backup);
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
document.getElementById('perfil-gender-choice').addEventListener('click', e=>{
  const c=e.target.closest('.choice'); if(!c) return;
  [...document.getElementById('perfil-gender-choice').children].forEach(x=>x.classList.remove('active')); c.classList.add('active');
  markPerfilDirty('personal');
});
// Cuentas de antes de que peso/altura/fecha de nacimiento fueran obligatorios en el
// onboarding pueden tener birth=null todavía -- sin este chequeo, new Date(null) cae en el
// epoch (1970), y esa persona queda tratada como si tuviera ~56 años SIEMPRE (bump de cautela
// en trainingCaution, "Edad aprox" mal en el contexto del coach de chat) sin ningún aviso, sin
// importar la edad real. null acá significa "no sabemos", y cada lugar que lo usa decide qué
// hacer con esa falta de dato en vez de asumir un número inventado.
function ageFromBirth(dateStr){
  if(!dateStr) return null;
  // dateStr es un "YYYY-MM-DD" sin hora -- new Date(dateStr) sin 'T00:00:00' lo parsea como
  // medianoche UTC, no local (mismo bug ya encontrado en earliestMonday/buildContext). En
  // husos negativos (Argentina) eso corre el nacimiento 3 horas para atrás, así que en las
  // horas previas a la medianoche local del cumpleaños esta función ya sumaba un año de más.
  const b = new Date(dateStr+'T00:00:00');
  if(isNaN(b.getTime())) return null;
  return Math.max(10, Math.floor((Date.now()-b.getTime())/(365.25*24*3600*1000)));
}
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
// El calendario es un único widget compartido por 6 inputs con reglas muy distintas de qué
// fecha tiene sentido -- sin límites, por ejemplo ob-birth (nacimiento) aceptaba una fecha en
// el futuro, y ageFromBirth() la convertía silenciosamente en "10 años" (su piso de Math.max),
// lo que desactivaba sin aviso la cautela extra por edad (trainingCaution) y la estimación de
// FC máxima real. Cada entrada acá define, como mucho, un mínimo y/o máximo (YYYY-MM-DD).
function calBoundsFor(inputId){
  const today = todayLocalISO();
  // min: 120 años atrás -- generoso a propósito (nadie real hoy tiene más), pero antes el
  // año-picker (ver calShowMonths) dejaba retroceder sin ningún piso, así que se podía cargar
  // una fecha de nacimiento de hace, por ejemplo, 200 años, que después alimentaba
  // estimateHrMax/trainingCaution con una edad sin ningún chequeo de plausibilidad (a
  // diferencia de refRace, que sí valida su rango).
  if(inputId === 'ob-birth') return { max: today, min: `${Number(today.slice(0,4))-120}-01-01` }; // nadie nace en el futuro ni hace más de 120 años
  if(inputId === 'ob-racedate' || inputId === 'perfil-racedate' || inputId === 'ev-date') return { min: today }; // una carrera objetivo/próxima ya pasada no tiene sentido cargarla como futura
  if(inputId === 'man-date' || inputId === 'edit-run-date') return { max: today }; // no se puede cargar una carrera que todavía no corriste
  return {};
}
function calDateAllowed(dateStr, bounds){
  if(bounds.min && dateStr < bounds.min) return false;
  if(bounds.max && dateStr > bounds.max) return false;
  return true;
}
// Antes las flechas de mes no se fijaban en calBoundsFor() para nada -- se podía navegar
// (o hasta llegar con el teclado) a un mes ENTERO fuera de rango, donde las 30 y pico celdas
// salían todas deshabilitadas sin ningún cartel que explique por qué. Esto compara el MES
// candidato completo (no un día puntual) contra el límite: solo bloquea un paso que dejaría
// el mes de destino totalmente fuera de bounds, no el mes límite en sí (que sigue teniendo
// algunos días válidos, ver calDateAllowed por día).
function calMonthOutOfBounds(viewDate, delta, bounds){
  if(!bounds.min && !bounds.max) return false;
  const candidate = new Date(viewDate.getFullYear(), viewDate.getMonth()+delta, 1);
  const candidateYm = `${candidate.getFullYear()}-${String(candidate.getMonth()+1).padStart(2,'0')}`;
  if(bounds.max && candidateYm > bounds.max.slice(0,7)) return true;
  if(bounds.min && candidateYm < bounds.min.slice(0,7)) return true;
  return false;
}
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
  // calViewDate.setDate(1) ANTES de tocar mes/año, en las dos ramas de abajo: si el cursor
  // venía en un día 29/30/31 (heredado de calSelectedDate al abrir el calendario, ver
  // openCalendar) y el mes/año de destino es más corto (ej. 31 de enero → febrero, o 29 de
  // febrero de un año bisiesto → el mismo año sin serlo), setMonth/setFullYear no rechazan
  // ni recortan el día fuera de rango -- lo DESBORDAN al mes siguiente. "Mes que viene" desde
  // el 31 de enero terminaba mostrando marzo, saltándose febrero por completo, sin ninguna
  // forma de elegir un día de febrero con la flecha. El día del cursor no importa para elegir
  // qué mes mostrar, así que fijarlo en 1 antes de cada paso lo hace siempre seguro.
  if(calViewMode === 'months'){ calViewDate.setDate(1); calViewDate.setFullYear(calViewDate.getFullYear() + delta); renderCalMonths(); return; }
  // Tampoco se fijaba en calBoundsFor() -- se podía navegar más allá del mes límite hacia un
  // mes que queda ENTERO fuera de rango (ver el comentario junto a calMonthOutOfBounds). El
  // botón ya queda deshabilitado para ese lado en renderCalendar(), pero este chequeo es la
  // protección real (por si algo más dispara la navegación, ej. el teclado).
  if(calMonthOutOfBounds(calViewDate, delta, calBoundsFor(calTargetInputId))) return;
  calViewDate.setDate(1);
  calViewDate.setMonth(calViewDate.getMonth() + delta);
  renderCalendar();
}
function calShowYears(){
  calYearsRangeStart = Math.floor(calViewDate.getFullYear() / 16) * 16;
  renderCalYears();
}
function calShowMonths(year){
  calViewDate.setDate(1); // ver el comentario en calNavigate -- evita desbordar de año si el día era 29/30/31
  calViewDate.setFullYear(year);
  renderCalMonths();
}
function calSelectMonth(monthIndex){
  calViewDate.setDate(1); // idem
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
  makeClickablesFocusable(document.getElementById('cal-months-grid'));
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
  makeClickablesFocusable(document.getElementById('cal-years-grid'));
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
  const bounds = calBoundsFor(calTargetInputId);
  // Aviso visual de que no hay más nada de ese lado -- antes las flechas quedaban siempre
  // activas aunque el mes siguiente/anterior completo cayera fuera de rango, así que tocarlas
  // llevaba a un mes con TODAS las celdas deshabilitadas, sin ningún cartel de por qué.
  const prevBtn = document.getElementById('cal-prev-btn'), nextBtn = document.getElementById('cal-next-btn');
  if(prevBtn) prevBtn.disabled = calMonthOutOfBounds(calViewDate, -1, bounds);
  if(nextBtn) nextBtn.disabled = calMonthOutOfBounds(calViewDate, 1, bounds);

  let cells = [];
  for(let i=startOffset; i>0; i--) cells.push({day: daysInPrevMonth-i+1, other:true});
  for(let d=1; d<=daysInMonth; d++) cells.push({day:d, other:false});
  // El día del mes SIGUIENTE tiene que arrancar en 1, no en cells.length -- eso mostraba
  // el total acumulado de celdas como si fuera el número de día (ej. "34" en vez de "3").
  for(let d=1; cells.length % 7 !== 0; d++) cells.push({day:d, other:true});

  document.getElementById('cal-grid').innerHTML = cells.map(c=>{
    if(c.other) return `<div class="cal-day other-month">${c.day}</div>`;
    const cellDate = new Date(y,m,c.day);
    const isToday = cellDate.getTime()===today.getTime();
    const isSelected = selectedTime!==null && cellDate.getTime()===selectedTime;
    const cellDateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(c.day).padStart(2,'0')}`;
    const isDisabled = !calDateAllowed(cellDateStr, bounds);
    return `<div class="cal-day ${isToday?'today':''} ${isSelected?'selected':''} ${isDisabled?'disabled':''}" ${isDisabled?'':`onclick="calSelectDay(${c.day})"`}>${c.day}</div>`;
  }).join('');
  makeClickablesFocusable(document.getElementById('cal-grid'));
}
function calSelectDay(day){
  const y = calViewDate.getFullYear(), m = calViewDate.getMonth();
  const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  if(!calDateAllowed(dateStr, calBoundsFor(calTargetInputId))) return; // defensivo, por si algo dispara este click igual
  const input = document.getElementById(calTargetInputId);
  input.value = dateStr;
  dateBoxUpdaters[calTargetInputId] && dateBoxUpdaters[calTargetInputId]();
  if(calTargetInputId === 'perfil-racedate') markPerfilDirty('personal'); // set vía JS, no dispara 'change'
  if(calTargetInputId === 'ob-birth') updateObStep2ButtonState();
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
  document.getElementById('ob-progress-fill').style.transform = `scaleX(${n/OB_STEP_COUNT})`;
  document.getElementById('ob-back-btn').style.display = n>1 ? 'flex' : 'none';
  document.getElementById('onboard').scrollTop = 0;
}
// El paso 2 del onboarding (peso/altura/fecha de nacimiento) dejaba avanzar sin llenar nada
// -- finishOnboard() al final caía en defaults silenciosos (70kg, 170cm, nacido en 1995) sin
// avisarle a nadie, lo que descalibraba la FC máxima estimada y la cautela por edad desde el
// arranque. Mismo patrón que updateSignupButtonState(): el botón arranca deshabilitado (ver
// el atributo disabled en index.html) y solo se habilita cuando los 3 campos tienen un valor
// real -- oninput en peso/altura, y calSelectDay() para la fecha (se elige desde el calendario
// compartido, no dispara 'input').
function updateObStep2ButtonState(){
  const btn = document.getElementById('ob-step2-continue-btn');
  if(!btn) return;
  const weight = parseFloat(document.getElementById('ob-weight').value);
  const height = parseFloat(document.getElementById('ob-height').value);
  const birth = document.getElementById('ob-birth').value;
  btn.disabled = !(weight>0 && height>0 && birth);
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
  // "|| 70"/"|| 170" (como estaba antes) solo cubre NaN/0 -- un valor negativo (typo, un
  // signo de menos que se cuela) es truthy en JS y pasaba derecho, guardando un peso/altura
  // negativos para siempre. savePersonalData() (el mismo campo, pero editado después desde
  // Perfil) ya se protegía de esto con "if(weight>0)"; acá en el onboarding faltaba el mismo
  // chequeo. Reportado en una auditoría: un peso negativo hace que las calorías de cada
  // carrera se calculen y se muestren en negativo, siempre, hasta que alguien lo note y lo
  // corrija a mano desde Perfil.
  // parseWeightInput/parseHeightInput ya validan un rango de verdad (25-250kg, 100-230cm) y
  // no solo ">0" -- durante el onboarding isImperial() siempre da false (todavía no existe
  // state.profile.units), así que se comportan como un parseFloat metric puro, pero ahora
  // con el mismo piso de plausibilidad que savePersonalData (Perfil) ya tiene para este
  // mismo campo. Antes un típo como "5" (kg) o "900" quedaba guardado para siempre.
  const weightRaw = parseWeightInput(document.getElementById('ob-weight').value);
  const weight = weightRaw>0 ? weightRaw : 70;
  const heightRaw = parseHeightInput(document.getElementById('ob-height').value);
  const height = heightRaw>0 ? heightRaw : 170;
  const birth = document.getElementById('ob-birth').value || '1995-01-01';
  // Con guarda + default, igual que el mismo patrón en savePersonalData: hoy siempre hay
  // una opción marcada "active" de entrada en el HTML y los handlers de click nunca la
  // sacan sin poner otra en su lugar, pero sin esta guarda un cambio futuro en ese markup
  // rompería finishOnboard con un TypeError justo en el último paso del onboarding.
  const runnerType = document.querySelector('#ob-runnertype .choice.active')?.dataset.v || 'new';
  // "|| 0" (como estaba antes) tiene el mismo problema que ya se documentó arriba para
  // peso/altura: un valor negativo es truthy en JS y pasaba derecho, guardando un
  // kilometraje semanal negativo para siempre (isBeginnerProfile lo trataría como
  // principiante igual, pero el número crudo seguía mostrándose así en Perfil/el saludo
  // del coach).
  const currentWeeklyKmRaw = runnerType==='active' ? parseFloat(document.getElementById('ob-currentkm').value) : 0;
  const currentWeeklyKm = currentWeeklyKmRaw>0 ? currentWeeklyKmRaw : 0;
  const terrain = document.querySelector('#ob-terrain .choice.active')?.dataset.v || 'asfalto';
  const trainBy = document.querySelector('#ob-trainby .choice.active')?.dataset.v || 'distance';
  const trainingDays = DAY_KEYS.filter(d => document.querySelector(`#ob-days .day-pill[data-v="${d}"]`).classList.contains('active'));
  const goal = document.getElementById('ob-goal').value;
  const raceDate = document.getElementById('ob-racedate').value || null;
  const age = ageFromBirth(birth);
  const hrMax = estimateHrMax(age);
  const hrKnown = false;
  const gender = document.querySelector('#ob-gender .choice.active')?.dataset.v || 'x';
  // El toggle de embarazo/postparto solo se lee si eligió "femenino" -- si cambió de
  // género después de haberlo tildado, el wrap queda oculto y en "no" (ver el handler de
  // #ob-gender más arriba), así que leer el valor tal cual está en el DOM ya alcanza.
  const pregnancyPostpartum = gender==='f' && document.querySelector('#ob-pregnancy .choice.active')?.dataset.v === 'yes';
  const healthNotes = document.getElementById('ob-healthnotes').value.trim().slice(0,200);
  const returningFromBreak = runnerType==='active' && document.querySelector('#ob-returning .choice.active')?.dataset.v === 'yes';
  // Marca de referencia reciente (opcional): si la carga, sirve para calibrar el ritmo
  // base desde el día 1 en vez de depender del valor genérico (ver estimateBasePaceMinPerKm)
  // hasta que tenga 3+ carreras registradas.
  const refRaceDistRaw = parseFloat(document.getElementById('ob-refrace-dist').value);
  const refRaceMinRaw = parseFloat(document.getElementById('ob-refrace-min').value);
  // Sin ningún límite de ritmo, un tipeo (ej. "5" en distancia y "5" en minutos -- 1:00/km,
  // más rápido que cualquier plusmarca mundial) se guardaba tal cual y calibraba TODO el
  // ritmo base del plan (estimateBasePaceMinPerKm) hasta tener 3+ carreras reales que lo
  // reemplacen -- semanas enteras de sesiones a un ritmo imposible de sostener. El rango
  // (2:30/km a 20:00/km) es generoso a propósito: cubre desde un ritmo de élite real hasta
  // una carrera hecha caminando, sin bloquear ninguna marca legítima.
  const refRacePaceMinPerKm = (refRaceDistRaw>0 && refRaceMinRaw>0) ? refRaceMinRaw/refRaceDistRaw : null;
  const refRacePaceOk = refRacePaceMinPerKm!==null && refRacePaceMinPerKm>=2.5 && refRacePaceMinPerKm<=20;
  const refRace = (runnerType==='active' && refRaceDistRaw>0 && refRaceMinRaw>0 && refRacePaceOk)
    ? { distanceKm: refRaceDistRaw, durationSec: Math.round(refRaceMinRaw*60), date: todayLocalISO() }
    : null;
  // Mismo tope de 300min (5hs) que saveGoals() en Perfil -- ver ese comentario.
  const availableMinRaw = parseFloat(document.getElementById('ob-availmin').value);
  const availableMinPerSession = (availableMinRaw>0 && availableMinRaw<=300) ? Math.round(availableMinRaw) : null;
  // Alguien que ya hace otro deporte (fútbol, natación, etc.) tiene una base de
  // entrenamiento real aunque sea principiante EN RUNNING -- sin esto, un jugador de fútbol
  // de toda la vida que nunca corrió arrancaba tratado exactamente igual que alguien 100%
  // sedentario. Ver hasCrossTrainingBase()/beginnerPerSessionKm() más abajo, donde se usa.
  // obSelectedSports es el draft que arma el picker de deportes (ver openSportPicker/
  // closeSportPicker) -- ya NO hay un grid de .choice fijo en el DOM del que leer esto.
  const crossTrainingSports = obSelectedSports;
  const crossTrainingDays = crossTrainingSports.length ? DAY_KEYS.filter(d => document.querySelector(`#ob-sport-days .day-pill[data-v="${d}"]`)?.classList.contains('active')) : [];

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
  state.profile = {email:pendingEmail, name, weight, height, birth, gender, pregnancyPostpartum, coachNotes: healthNotes ? [healthNotes] : [], terrain, trainBy, trainingDays: trainingDays.length?trainingDays:['tue','thu','sun'], goal, raceDate, runnerType, currentWeeklyKm, returningFromBreak, refRace, availableMinPerSession, crossTrainingSports, crossTrainingDays, hrMax, hrKnown, hrZones:computeZones(hrMax), tz:detectDeviceTz(), createdAt: todayLocalISO()};
  // Antes esto era un flag propio (hasInjuryNote) que, a diferencia de toda otra señal de
  // cautela, no tenía forma de destildarse -- una molestia mencionada una sola vez en el
  // onboarding subía la cautela del plan para siempre, sin vencimiento ni botón en Perfil
  // para resolverla. Guardándola acá como una entrada más de painLog (misma forma que
  // savePainLog()/applyCoachNote(), bodyPart:'otro' porque el onboarding no pide zona
  // específica) reusa esa lógica ya resuelta: vence sola a los 21 días o el corredor la
  // marca resuelta desde Perfil > Molestias, en vez de agregar un flag nuevo que se queda
  // pegado para siempre.
  if(healthNotes){
    state.painLog = [{id:Date.now(), date:todayLocalISO(), bodyPart:'otro', note:healthNotes, active:true, checkinSent:false, fromOnboarding:true}];
  }
  state.profile.weeklyKm = calcWeeklyKm(state.profile);
  state.weekNumber = 1;
  state.weekStart = getMondayISO(new Date());
  state.plan = generatePlan(state.profile, state.weekNumber);
  // generatePlan() arma sesiones para toda la semana (lunes a domingo) sin importar qué día
  // de la semana es hoy -- si alguien termina el onboarding un miércoles, antes igual
  // aparecían entrenamientos armados para el lunes y el martes, días en los que la cuenta
  // ni existía. autoSkipPastDays() ya evitaba marcarlos como "sesión perdida", pero la
  // sesión en sí seguía ahí, mostrando un entrenamiento para un día que ya pasó. Acá los
  // convertimos directamente en descanso, así el plan arranca de verdad desde hoy.
  {
    const weekStartDate = new Date(state.weekStart+'T00:00:00');
    state.plan.forEach((d,i)=>{
      const dayDate = new Date(weekStartDate); dayDate.setDate(dayDate.getDate()+i);
      const dayIso = `${dayDate.getFullYear()}-${String(dayDate.getMonth()+1).padStart(2,'0')}-${String(dayDate.getDate()).padStart(2,'0')}`;
      if(dayIso < state.profile.createdAt){
        state.plan[i] = {day:d.day, typeKey:'rest', dist:0, terrain:null, zone:null, beginner:d.beginner};
      }
    });
  }
  state.onboarded = true;
  state.lang = lang;
  state.voiceEnabled = true;
  state.nextWeekOverrides = {};
  document.getElementById('onboard').style.display='none';
  document.getElementById('perfil-name').value = name;
  seedCoachGreeting();
  await persist();
  enterApp();
  // Primera vez que el personaje se muestra de verdad para esta cuenta -- un festejo (mismos
  // ojos/color que ya usa celebrate() para una marca personal) en vez del parpadeo genérico
  // de "recién cargó la página", para que arrancar el plan también se sienta como un logro.
  setMascotExpression('excited', {priority:2, duration:2600});
  setMascotColor('good', {duration:3200});
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
  checkPlanAlgoVersion();
  checkBeginnerGraduation();
  checkReturningBreakGraduation();
  autoSkipPastDays();
  repairSkippedDaysWithMatchingRuns();
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
  [...document.getElementById('theme-toggle').children].forEach(c=>c.classList.toggle('active', c.dataset.v===currentThemePref()));
  renderPerfilDays();
  renderPerfilCrossTraining();
  renderAll(); renderHistory(); renderZones();
  showView('inicio');
  setTimeout(checkPendingRating, 600);
  setTimeout(maybeShowInstallBanner, 1200);
  setTimeout(maybeShowWhatsNew, 1800);
  refreshDeviceConnections();
}
// checkWeekRollover/autoSkipPastDays/autoClearPastEvent dependen de la fecha real, y antes
// solo corrían una vez, al entrar a la app (dentro de enterApp()). El problema: una PWA que
// queda "viva" en segundo plano (común en Android/iOS si no se la cierra del todo) puede
// volver a primer plano días después SIN que la página se recargue -- enterApp() nunca se
// vuelve a llamar, y el plan se queda mostrando una semana vieja hasta que en algún momento
// SÍ haya una recarga de verdad (ej. una actualización de versión). Reportado por el usuario:
// la app le mostraba "semana del lunes 7" siendo ya lunes 14. Enganchar esto también a
// visibilitychange hace que, apenas la app vuelve a primer plano, se re-chequee contra la
// fecha real -- sin esperar a una recarga completa.
// checkProactiveCoachNudge()/checkPainCheckins() tienen el mismo problema (encontrado en
// una auditoría posterior): son chequeos de fecha con su propia guarda para no repetirse
// (proactiveNudgeFor / checkinSent), así que engancharlos acá es seguro -- no van a
// duplicar ningún mensaje, solo van a poder disparar antes si la app estuvo mucho tiempo
// de fondo. OJO: checkInactivityCheckin() NO se suma acá a propósito -- pisa
// state.lastAppOpenTs en cada llamada (es justo lo que mide "cuánto hace que no abrís la
// app"), así que si corriera en cada visibilitychange (un simple cambio de pestaña, no
// necesariamente reabrir la app) el contador nunca llegaría a acumular días de verdad.
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden || !currentUserId || !state.onboarded) return;
  checkWeekRollover();
  checkPlanAlgoVersion();
  checkBeginnerGraduation();
  checkReturningBreakGraduation();
  autoSkipPastDays();
  repairSkippedDaysWithMatchingRuns();
  autoClearPastEvent();
  checkProactiveCoachNudge();
  checkPainCheckins();
  renderAll(); renderHistory(); renderZones();
});
/* ================= BOTÓN FÍSICO DE ATRÁS (Android / gesto "atrás" del navegador) =========
   En una PWA instalada en Android, el botón físico de atrás dispara un evento 'popstate' --
   como esta es una SPA de una sola página (sin rutas ni más entradas de historial), sin
   nada de esto ese botón cerraba la APP ENTERA de una, aunque hubiera una pantalla
   superpuesta abierta (Perfil > Datos personales, el calendario, el detalle de una carrera,
   etc.) -- reportado en una auditoría. Ahora, cada vez que se abre CUALQUIER overlay/modal
   (todos comparten la clase .overlay, salvo el reproductor de video de detalle de carrera
   que usa su propia clase rd-video-overlay), empujamos una entrada al historial del
   navegador; el botón de atrás la consume y cierra solo esa pantalla en vez de salir de la
   app. Si no hay ningún overlay abierto, atrás sigue su comportamiento normal (salir de la
   app / página anterior) -- no interceptamos nada en ese caso.

   Un solo MutationObserver sobre body detecta las aperturas/cierres (mirando la clase
   overlay-open o el style.display, según el tipo de overlay) en vez de tener que tocar
   cada una de las ~28 funciones openX()/closeX() de la app -- así ningún cambio futuro en
   esas funciones puede romper esto sin querer, y viceversa.

   A propósito esto NO cubre el diálogo genérico showConfirm() (el Sí/No para confirmar
   acciones): ese usa su propia Promise, y esconderle el DOM "desde afuera" la dejaría
   colgada para siempre en vez de resolverla -- conectarlo bien requiere tocar showConfirm()
   directamente, no alcanza con el mismo mecanismo genérico de acá. Queda afuera a propósito,
   como una mejora aparte a futuro si hace falta. */
const openOverlayStack = [];
let ignoreNextPopstate = false;
let closingOverlayFromBackButton = false;
function isBackHandledOverlay(el){
  return el instanceof HTMLElement && (el.classList.contains('overlay') || el.id === 'rd-video-overlay');
}
function isOverlayCurrentlyVisible(el){
  if(el.classList.contains('overlay-sheet')) return el.classList.contains('overlay-open');
  return !!(el.style.display && el.style.display !== 'none');
}
function hideOverlayForBack(el){
  // rd-video-overlay es un caso especial: atrás de ese overlay hay un requestAnimationFrame
  // dibujando la cámara del video y un MediaRecorder grabando (ver closeDynamicVideo). Solo
  // ocultarlo con display:none (como cualquier otro overlay genérico) no para ninguna de las
  // dos cosas -- rdVideoState.cancelled seguía en false, así que la animación y la grabación
  // seguían corriendo invisibles hasta terminar solas (hasta 12s), gastando batería/CPU de
  // más, y el blob URL del video resultante (ya inalcanzable, el overlay sigue oculto) nunca
  // se liberaba con URL.revokeObjectURL -- quedaba pisado recién la próxima vez que alguien
  // abriera CUALQUIER video de ruta. Tocar atrás durante la grabación tiene que cortarla de
  // verdad, no solo esconder la pantalla.
  // sport-picker-overlay tampoco es un overlay-sheet genérico: closeSportPicker() aplica
  // sportPickerTemp (el draft de deportes tildados) al perfil/onboarding real y limpia
  // sportPickerCtx -- sacarle la clase overlay-open a mano, como a cualquier otro overlay-
  // sheet, deja el draft sin aplicar y sportPickerCtx colgado, así que atrás con el botón
  // físico/gesto de Android tiraba las selecciones del usuario sin avisar (a diferencia de
  // la flecha o "Listo" de su propia UI, que sí las guardan).
  if(el.id === 'rd-video-overlay') closeDynamicVideo();
  else if(el.id === 'sport-picker-overlay') closeSportPicker();
  else if(el.classList.contains('overlay-sheet')) el.classList.remove('overlay-open');
  else el.style.display = 'none';
}
// typeof MutationObserver !== 'undefined': el harness de tests (test/support/load-app.js)
// corre app.js en una sandbox de Node con un DOM mínimo simulado, sin MutationObserver ni
// document.body reales -- sin esta guarda, cargar app.js ahí reventaba directo con
// "MutationObserver is not defined" y tiraba abajo los 61 tests, no solo los que tocan
// overlays. En un navegador de verdad esto siempre está disponible.
if(typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.body){
  new MutationObserver(muts=>{
    muts.forEach(m=>{
      const el = m.target;
      if(!isBackHandledOverlay(el)) return;
      const visible = isOverlayCurrentlyVisible(el);
      const idx = openOverlayStack.indexOf(el);
      if(visible && idx===-1){
        openOverlayStack.push(el);
        history.pushState({zancadaOverlay:true}, '', location.href);
      } else if(!visible && idx!==-1){
        openOverlayStack.splice(idx,1);
        // Si este cierre NO vino de nuestro propio handler de popstate (más abajo), significa
        // que el usuario lo cerró desde la propia UI (botón X, tocar afuera, etc.) -- hay que
        // consumir la entrada de historial que habíamos empujado al abrirlo, si no el próximo
        // atrás no haría nada (la entrada ya "gastada" seguiría ahí).
        if(!closingOverlayFromBackButton){
          ignoreNextPopstate = true;
          history.back();
        }
      }
    });
  }).observe(document.body, {subtree:true, attributes:true, attributeFilter:['class','style']});
  window.addEventListener('popstate', ()=>{
    // Este popstate puede venir de nuestro propio history.back() de arriba (cierre iniciado
    // por la UI) -- en ese caso no hay que volver a cerrar nada, el DOM ya está escondido.
    if(ignoreNextPopstate){ ignoreNextPopstate = false; return; }
    if(!openOverlayStack.length) return; // no hay overlay abierto -- se deja el atrás normal
    const top = openOverlayStack[openOverlayStack.length-1];
    closingOverlayFromBackButton = true;
    hideOverlayForBack(top);
    // El observer de arriba corre en un microtask aparte (después de este mismo handler) --
    // recién ahí hay que volver a bajar la bandera, si no la bajamos antes de que el
    // observer llegue a leerla y terminaría llamando a history.back() de más.
    queueMicrotask(()=>{ closingOverlayFromBackButton = false; });
  });
}
/* Rendimiento: los overlay-sheet (ver el comentario grande junto a .overlay-sheet en
   index.html) quedan siempre display:block a propósito, para poder animar con
   opacity+transform -- pero eso significa que, una vez abierto una sola vez, un panel
   como "Datos personales" o "Zapatillas" se queda pintándose en CADA frame de scroll de
   CUALQUIER pantalla de la app para siempre (con sus tarjetas, sombras y botones), solo
   invisible por opacity:0 -- el corredor nunca lo nota, pero la WebView sigue trabajando
   por él. Medido en un celular real de gama baja con dumpsys gfxinfo: esto es parte real
   del 93-100% de frames trabados durante el scroll, en cualquier pantalla, incluso si el
   corredor nunca volvió a abrir ningún panel.

   Arreglo en dos partes:
   1) closeOverlaySheet* (cualquier camino: los ~12 closeX(), o el gesto de swipe de
      wireOverlaySheetSwipe) saca la clase overlay-open, que dispara la transición de
      opacity ya definida en CSS -- un solo listener de transitionend, delegado en
      document (no hace falta tocar cada función de cierre), recién ahí -- cuando la
      animación de cierre YA TERMINÓ, no antes -- pone display:none de verdad. Ponerlo
      antes cortaría el fundido de salida de un salto.
   2) openOverlaySheetEl() (usado por los ~12 openX(), reemplazando el
      .classList.add('overlay-open') que tenían cada uno) saca ese display:none al volver
      a abrir, con un reflow forzado (leer offsetHeight) en el medio -- sin este paso, sacar
      display:none y agregar overlay-open en el mismo tick no le da tiempo al navegador de
      "registrar" el fotograma de partida (opacity:0, ya visible) antes de animar hacia
      opacity:1, y la apertura se ve de un salto en vez de con el resorte de entrada. */
if(typeof document !== 'undefined'){
  document.addEventListener('transitionend', (e)=>{
    const el = e.target;
    if(e.propertyName !== 'opacity') return;
    if(!(el instanceof HTMLElement) || !el.classList.contains('overlay-sheet')) return;
    if(!el.classList.contains('overlay-open')) el.style.display = 'none';
  });
}
function openOverlaySheetEl(el){
  // display:'block' explícito (no '' /limpiar el inline) -- la regla base .overlay-sheet
  // en index.html ahora arranca en display:none (ver el comentario grande junto a esa
  // regla), así que limpiar el inline a '' dejaría el display:none de la regla base sin
  // pisar. El reflow forzado (offsetHeight) entre esto y agregar overlay-open sigue siendo
  // necesario: sin él, el navegador nunca "ve" el fotograma de partida (opacity:0, ya
  // display:block) antes de animar hacia opacity:1, y la apertura salta en vez de animarse.
  el.style.display = 'block';
  void el.offsetHeight;
  el.classList.add('overlay-open');
}
async function logout(){
  await waitForPendingPersist();
  // Ver el comentario de runProgressKey(): sin esto, una carrera sin terminar quedaba
  // recuperable por la próxima cuenta que inicie sesión en este mismo dispositivo.
  clearRunProgress();
  // Limpieza de la clave vieja sin user_id (versiones anteriores a este fix pueden
  // tener algo ahí guardado en este dispositivo) -- best-effort, no rompe nada si ya
  // no existe.
  try{ localStorage.removeItem('zancada_run_in_progress'); }catch(e){}
  await supabaseClient.auth.signOut();
  location.reload();
}
async function resetApp(){
  if(!(await showConfirm(t('reset_confirm_text'), {danger:true, confirmText:t('delete_word')}))) return;
  await waitForPendingPersist();
  if(currentUserId){
    try{ await supabaseClient.from('app_state').delete().eq('user_id', currentUserId); }catch(e){}
  }
  await supabaseClient.auth.signOut();
  location.reload();
}
async function deleteAccount(){
  if(!(await showConfirm(t('delete_account_confirm_text'), {danger:true, confirmText:t('delete_account_confirm_btn')}))) return;
  try{
    await waitForPendingPersist();
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
// Formulario "Ayudanos a mejorar" en Perfil -- a diferencia del link mailto de "Contactar
// soporte" (que depende de que el corredor tenga una app de mail configurada), esto manda
// el mensaje directo a api/send-feedback.js, que lo reenvía por email. El email del
// remitente lo saca el backend del propio token de sesión (nunca lo mandamos nosotros
// desde acá) para que no se pueda falsear mandando cualquier dirección en el body.
async function sendFeedback(){
  const textarea = document.getElementById('feedback-message');
  const message = textarea.value.trim();
  if(!message) return;
  const btn = document.getElementById('feedback-send-btn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = t('perfil_feedback_sending');
  try{
    const { data: { session } } = await supabaseClient.auth.getSession();
    if(!session) throw new Error('no session');
    const res = await fetch(apiUrl('/api/send-feedback'), {
      method:'POST',
      headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}`},
      body: JSON.stringify({message})
    });
    if(!res.ok) throw new Error('send-feedback failed');
    textarea.value = '';
    showToast(t('perfil_feedback_sent'));
  }catch(e){
    showToast(t('perfil_feedback_error'),'error');
  }finally{
    btn.disabled = false;
    btn.textContent = originalText;
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
  // El aviso "evitá cambiar de app" (run_bg_warning) ya no es cierto donde el GPS sigue
  // grabando en segundo plano de verdad (ver hasBackgroundGeo()/startGeoWatch()) -- dejarlo
  // visible ahí sería directamente desinformar al corredor.
  if(hasBackgroundGeo()){
    const bgLine = document.getElementById('run-bg-warning-line');
    if(bgLine) bgLine.style.display = 'none';
  }
  const { data: { session } } = await supabaseClient.auth.getSession();
  if(session && session.user){ await loadUserAndEnter(session.user); }
  // Contraparte del script inline en <head> (clase zc-maybe-session): ese script solo
  // adivina rápido, por la PRESENCIA de algo con forma de sesión guardada, para ocultar
  // splash/login antes de pintar nada -- welcomeUserAndEnter() de arriba (si corrió) ya se
  // encarga de esconderlos del todo cuando la sesión resulta válida de verdad. Pero si NO
  // había sesión real (token vencido, storage corrupto, lo que sea), esa clase se queda
  // pegada y splash/login nunca vuelven a aparecer -- el corredor queda mirando una
  // pantalla en blanco sin ninguna forma de iniciar sesión. Sacarla acá cubre ese caso.
  else { document.documentElement.classList.remove('zc-maybe-session'); }
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
  // Mismo motivo que todayLocalISO() de arriba: toISOString() convierte a UTC antes de
  // recortar la fecha, así que en husos horarios positivos (Europa, gran parte de Asia --
  // justo mercados que este app soporta en en/fr/it/de/pt) la medianoche local del lunes
  // cae todavía el domingo en UTC, y esta función devolvía la fecha del domingo. Se arma
  // el string a mano con los componentes LOCALES, igual que todayLocalISO().
  const dt = new Date(d);
  const day = dt.getDay();
  dt.setDate(dt.getDate() + (day===0 ? -6 : 1-day));
  return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
}
function addDaysToIsoLocal(iso, days){
  // Mismo motivo que getMondayISO()/todayLocalISO() de arriba: `new Date(iso)` con un string
  // "YYYY-MM-DD" lo parsea como medianoche UTC (no local), y toISOString() vuelve a pasar por
  // UTC al serializar -- las dos conversiones juntas pueden correr la fecha resultante un día
  // para el lado equivocado según el huso horario, y justo alrededor de un cambio de horario
  // de verano. Acá se arma el Date con los componentes locales desde el arranque y se vuelve
  // a armar el string a mano, sin tocar UTC en ningún paso.
  const [y,m,d] = iso.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  dt.setDate(dt.getDate() + days);
  return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
}
function isCutbackWeek(n){ return n % 4 === 0; }
// Compartidas con el RATIO de generatePlan (ver ahí) -- top-level para que
// estimateBeginnerWeeklyKm() de acá abajo nunca pueda desincronizarse de la fórmula real que
// arma las sesiones de un principiante.
const EASY_SESSION_RATIO = 0.9, BEGINNER_LONG_RATIO = 1.3;
// Jugar al fútbol, nadar, ir al gimnasio, etc. construye una base aeróbica/muscular real,
// aunque sea alguien 100% principiante EN RUNNING específicamente -- 2+ días por semana es el
// piso que consideramos "hábito real" y no solo algo ocasional. Compartida por
// estimateBeginnerWeeklyKm() y generatePlan() (mismo motivo que EASY_SESSION_RATIO de
// arriba: un solo lugar, sin riesgo de que las dos fórmulas se desincronicen) y por
// checkBeginnerGraduation() (gradúa más rápido a quien ya tiene esa base).
function hasCrossTrainingBase(p){
  return !!(p && p.crossTrainingDays && p.crossTrainingDays.length >= 2);
}
// De los deportes de la lista, estos son los que ya implican correr/sprintear de manera
// repetida como parte del juego (fútbol, rugby, básquet, handball, hockey, tenis/pádel) --
// alguien que juega alguno de estos 2+ días por semana ya viene absorbiendo el impacto
// específico de correr en las piernas, algo que la base aeróbica de nadar o andar en
// bici NO da (por eso un ciclista de toda la vida igual puede lastimarse las primeras
// semanas si arranca a correr de golpe). Se usa en generatePlan para sacarlo del "todo
// zona 1, solo rodajes suaves" apenas arranca -- ver la nota junto a "impactBase" ahí.
const RUNNING_IMPACT_SPORTS = ['futbol','basquet','rugby','futbol_americano','handball','hockey_cesped','hockey_hielo','tenis_padel'];
function hasRunningImpactBase(p){
  return hasCrossTrainingBase(p) && !!(p.crossTrainingSports || []).some(s => RUNNING_IMPACT_SPORTS.includes(s));
}
const CROSS_TRAINING_BASE_BOOST = 1.3;
function beginnerPerSessionKm(p){
  return hasCrossTrainingBase(p) ? 2.5 * CROSS_TRAINING_BASE_BOOST : 2.5;
}
function estimateBeginnerWeeklyKm(profile){
  const trainingDays = profile && profile.trainingDays;
  const days = (trainingDays && trainingDays.length) ? trainingDays.length : 3; // mismo default de 3 días que generatePlan
  const per = beginnerPerSessionKm(profile); // mismo valor que generatePlan en semana 1 (mult=1 siempre en la primera semana)
  const long = Math.round(per * BEGINNER_LONG_RATIO);
  const easy = Math.round(per * EASY_SESSION_RATIO);
  return long + easy * Math.max(0, days - 1);
}
function calcWeeklyKm(profile){
  // Antes esto ignoraba por completo la fórmula real que generatePlan() usa para un
  // principiante -- devolvía el kilometraje PICO del objetivo /1.8, sin ninguna relación con
  // lo que el plan realmente termina armando. Reportado por un usuario: el saludo del coach
  // le decía "armé tu plan pensando en tus 19km semanales" a alguien cuyo plan real (el que
  // genera generatePlan para un principiante) sumaba 7km -- el número que ve el corredor
  // tiene que coincidir con el plan de verdad, no con una proyección del objetivo final que
  // ni siquiera se usa para calcular sus sesiones cuando es principiante.
  if(isBeginnerProfile(profile)) return estimateBeginnerWeeklyKm(profile);
  // isBeginnerProfile ya exige currentWeeklyKm>0 y runnerType!=='new' para devolver false (ver
  // su definición) -- con solo esos dos runnerType posibles ('new'/'active'), no ser
  // principiante implica SIEMPRE runnerType==='active' && currentWeeklyKm>0. Antes había acá
  // una segunda rama (proyección del kilometraje pico del objetivo, con "urgencia" si la
  // carrera estaba cerca) para el caso "activo pero sin currentWeeklyKm real" -- ese caso ya
  // no existe: isBeginnerProfile lo trata como principiante (con razón, es el mismo criterio
  // que el fix de "alguien que dice 'ya corro' pero declaró 0km/semana"), así que esa rama
  // había quedado inalcanzable. Se saca en vez de dejarla como código muerto.
  const base = Math.round(profile.currentWeeklyKm); // arranca desde su realidad actual, no de una fórmula genérica
  // Si viene de una pausa larga, ese volumen "actual" declarado es en realidad el que
  // tenía ANTES de parar -- arrancar ahí de nuevo, de golpe, es un patrón clásico de
  // lesión por sobrecarga. Empezamos más abajo y dejamos que weekMultiplier (con la
  // progresión más lenta que ya le da el caution.level>=1 de este perfil) lo vaya
  // recuperando de a poco en las semanas siguientes.
  return profile.returningFromBreak ? Math.round(base*0.6) : base;
}
function weekMultiplier(n, caution, skipCutback){
  n = n || 1;
  const growthSteps = n - Math.floor(n/4) - 1;
  // corredores con más cautela (mayor edad y/o contextura) progresan más despacio
  // semana a semana y con un techo de volumen más bajo, en vez de la misma curva para todos
  const growthRate = caution && caution.level>=2 ? 1.04 : caution && caution.level>=1 ? 1.05 : 1.06;
  const cap = caution && caution.level>=2 ? 1.5 : caution && caution.level>=1 ? 1.65 : 1.8;
  let mult = Math.pow(growthRate, Math.max(0, growthSteps));
  // skipCutback: esta semana YA tiene una reducción de volumen deliberada y más específica
  // (taper antes de la carrera objetivo, recuperación post-carrera, o la semana puntual de
  // una carrera de "Próximos eventos") -- el recorte de descarga PERIÓDICO (cada 4 semanas,
  // pensado para el bloque normal de entrenamiento) no debe sumarse encima. Mismo criterio
  // ya usado en eventRaceWeekMultiplier para no descontar dos veces la misma carrera cargada
  // en Perfil > Metas Y en Próximos eventos -- acá es el mismo problema, pero entre la
  // descarga periódica y CUALQUIERA de las otras reducciones puntuales, no solo esa.
  if(isCutbackWeek(n) && !skipCutback) mult *= 0.75;
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
  // días de por medio y el criterio sería más ambiguo. Miramos tanto state.event.date
  // como state.lastEventDate (no uno u otro con ||) porque autoClearPastEvent() borra
  // state.event apenas pasó la fecha y lo guarda en lastEventDate como respaldo -- pero si
  // el corredor carga la PRÓXIMA carrera justo esa misma semana de recuperación (algo bien
  // común: recién corrió, ya anota la siguiente), state.event.date pasa a apuntar a esa
  // carrera futura, que nunca cae "ayer" -- con || eso ganaba siempre y apagaba la
  // recuperación de la carrera que sí acababa de pasar. Evaluamos los dos candidatos y
  // alcanza con que UNO cumpla la condición real (cayó ayer, domingo).
  if(!weekStartDate) return false;
  const start = new Date(weekStartDate+'T00:00:00');
  if(isNaN(start.getTime())) return false;
  const candidates = [state.event && state.event.date, state.lastEventDate].filter(Boolean);
  return candidates.some(eventDateStr=>{
    const raceDate = new Date(eventDateStr+'T00:00:00');
    if(isNaN(raceDate.getTime())) return false;
    if(raceDate.getDay() !== 0) return false; // 0 = domingo
    const daysSinceRace = Math.round((start - raceDate) / 86400000);
    return daysSinceRace === 1;
  });
}
function recoveryMultiplier(weekStartDate){
  return isRecoveryWeek(weekStartDate) ? 0.6 : 1;
}
function postGoalRaceRecoveryMultiplier(p, weekStartDate){
  // recoveryMultiplier() ya cubre la semana de recuperación posterior a una carrera cargada
  // en "Próximos eventos" (state.event/state.lastEventDate) -- pero si el corredor solo carga
  // la carrera OBJETIVO en Perfil > Metas (p.raceDate) y nunca la duplica en "Próximos
  // eventos" (caso bien común: es la única carrera que le importa, no ve motivo para anotarla
  // dos veces), taperMultiplier() vuelve a 1 apenas "esa carrera ya pasó" -- la semana
  // siguiente arrancaba de nuevo a full volumen, sin ningún descanso post-carrera, justo lo
  // opuesto de lo que ya hace el mecanismo de recuperación para el otro caso. Mismo criterio
  // que isRecoveryWeek (solo si la carrera cayó en domingo, para que "la semana que sigue" sea
  // lunes a domingo completo, sin ambigüedad).
  if(!p || !p.raceDate || !weekStartDate) return 1;
  // Si la carrera objetivo es la MISMA que la cargada en "Próximos eventos" (mismo raceDate),
  // recoveryMultiplier ya la cubre -- no descontar dos veces.
  if(state.event && state.event.date === p.raceDate) return 1;
  if(state.lastEventDate === p.raceDate) return 1;
  const start = new Date(weekStartDate+'T00:00:00');
  const raceDate = new Date(p.raceDate+'T00:00:00');
  if(isNaN(start.getTime()) || isNaN(raceDate.getTime())) return 1;
  if(raceDate.getDay() !== 0) return 1; // 0 = domingo
  const daysSinceRace = Math.round((start - raceDate) / 86400000);
  return daysSinceRace === 1 ? 0.6 : 1;
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
function eventRaceWeekMultiplier(weekStartDate, p){
  if(!isEventRaceWeek(weekStartDate)) return 1;
  // Si la carrera cargada en "Próximos eventos" es LA MISMA que la carrera objetivo de
  // Perfil > Metas (mismo raceDate), taperMultiplier ya le aplica su propio recorte a esa
  // semana (0.55, más fuerte que este 0.75) -- sin este chequeo, generatePlan multiplicaba
  // los dos descuentos entre sí (0.55 * 0.75 = 0.4125) por cargar la misma carrera real en
  // los dos lugares de la app, dejando el volumen de la semana de carrera mucho más bajo de
  // lo que cualquiera de los dos mecanismos buscaba por separado.
  if(p && p.raceDate && state.event && state.event.date === p.raceDate) return 1;
  return 0.75;
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
// Repara días de ESTA semana que quedaron marcados 'skipped' pero en realidad tienen una
// carrera real ese mismo día local -- típicamente por una sincronización que llegó después
// de que autoSkipPastDays() ya diera el día por perdido, o por el bug de fecha de
// Strava/Polar (ya arreglado, ver esos archivos) que atribuía una carrera nocturna al día
// siguiente y dejaba el día real "salteado" para siempre en el Plan aunque Historial sí
// tuviera la carrera. autoMarkSessionDone() no alcanza para estos casos porque los runs
// sincronizados se linkean del lado del servidor (merge_strava_runs.sql y equivalentes), no
// llamando a esa función -- este repaso corre del lado del cliente, sobre el estado ya
// fusionado, cada vez que puede haber cambiado (entrar a la app, volver de segundo plano,
// pull-to-refresh).
function repairSkippedDaysWithMatchingRuns(){
  if(!state.onboarded || !state.weekStart || !state.runs.length) return;
  const weekStartDate = new Date(state.weekStart+'T00:00:00');
  let changed = false;
  state.plan.forEach((d,i)=>{
    if(d.status !== 'skipped' || d.linkedRunId) return;
    const dayDate = new Date(weekStartDate); dayDate.setDate(dayDate.getDate()+i);
    const dayIso = `${dayDate.getFullYear()}-${String(dayDate.getMonth()+1).padStart(2,'0')}-${String(dayDate.getDate()).padStart(2,'0')}`;
    const match = state.runs.find(r => localDateISO(r.date) === dayIso);
    if(match){ d.status = 'done'; d.linkedRunId = match.id; changed = true; }
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
async function callSyncEndpoint(path, session){
  try{
    const controller = new AbortController();
    const timeoutId = setTimeout(()=>controller.abort(), 12000);
    const res = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}` },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return await res.json().catch(()=>null);
  }catch(e){ console.error('sync-now error', path, e); return {error: e.message}; }
}
// Pide sincronizar tanto Strava como Polar en paralelo -- alguien puede tener
// las dos conectadas, o solo una; cada endpoint devuelve {synced:false,
// reason:'not_connected'} solito si esa cuenta en particular no está
// vinculada, así que no hace falta chequear antes cuál está activa.
async function syncTodayNow(){
  const btn = document.getElementById('sync-today-btn');
  if(btn){ btn.disabled = true; btn.innerHTML = `<span class="icon-sq spin-icon" style="width:14px; height:14px;">${ICONS.refresh}</span> ${t('plan_syncing')}`; }
  let stravaResult = null, polarResult = null, wahooResult = null, corosResult = null;
  try{
    const { data: { session } } = await supabaseClient.auth.getSession();
    if(session && session.access_token){
      [stravaResult, polarResult, wahooResult, corosResult] = await Promise.all([
        callSyncEndpoint('/api/strava-sync-now', session),
        callSyncEndpoint('/api/polar-sync-now', session),
        callSyncEndpoint('/api/wahoo-sync-now', session),
        callSyncEndpoint('/api/coros-sync-now', session)
      ]);
    }
  }catch(e){ console.error('sync-now error', e); }
  await refreshStateFromServer();
  // Health Connect va DESPUÉS de refreshStateFromServer(): es un merge en memoria
  // (no hay backend de por medio, ver el comentario grande junto a
  // healthConnectExerciseToRun), así que si corriera antes, el refresh de arriba
  // pisaría lo que acabamos de agregar sin enterarse. persist() lo manda al server
  // recién con la carrera de Health Connect ya adentro.
  let hcResult = null;
  if(state.healthConnectConnected) hcResult = await syncHealthConnectNow();
  if(relinkTodayRun() || (hcResult && hcResult.synced)) persist();
  renderPlan(); renderHome(); renderHistory();
  const anySynced = (stravaResult && stravaResult.synced) || (polarResult && polarResult.synced) || (wahooResult && wahooResult.synced) || (corosResult && corosResult.synced) || (hcResult && hcResult.synced);
  const allDisconnected = (!stravaResult || stravaResult.reason==='not_connected') && (!polarResult || polarResult.reason==='not_connected') && (!wahooResult || wahooResult.reason==='not_connected') && (!corosResult || corosResult.reason==='not_connected') && !state.healthConnectConnected;
  if(!anySynced){
    const anyError = (stravaResult && stravaResult.error) || (polarResult && polarResult.error) || (wahooResult && wahooResult.error) || (corosResult && corosResult.error) || (hcResult && hcResult.error);
    const reasonMsg = allDisconnected ? 'Tu cuenta no está conectada a Strava, Polar, Wahoo, COROS ni Health Connect.' : anyError ? `Error: ${anyError}` : 'No encontramos actividades nuevas.';
    showToast(reasonMsg,'error');
  }
  if(btn){ btn.disabled = false; btn.innerHTML = `<span class="icon-sq" style="width:14px; height:14px;">${ICONS.refresh}</span> ${t('plan_sync_button')}`; }
  setTimeout(checkPendingRating, 300);
}
// Promedio real de km corridos en las últimas `weeks` semanas YA CERRADAS (nunca la semana
// actual, que todavía está en curso y subestimaría el promedio) -- lo usa renderPerfil para
// mostrar cuánto viene corriendo el corredor de verdad, en vez de solo p.weeklyKm (que es la
// META que calcula el plan, no un reflejo de lo corrido). Pedido del usuario: quería ver ese
// promedio en Perfil para saber "cuánto corrió o viene corriendo". Como solo cuenta semanas
// cerradas, se actualiza solo apenas cierra una semana (lunes) -- no hace falta ningún
// proceso aparte disparado justo ese día, alcanza con recalcularlo cada vez que se renderiza
// Perfil. Las semanas sin ninguna carrera suman 0 al promedio, no se excluyen -- así alguien
// que viene de una pausa ve un promedio bajo de verdad, no uno inflado con carreras viejas.
function computeActualWeeklyKmAvg(weeks){
  weeks = weeks || 3;
  const currentMonday = state.weekStart || getMondayISO(new Date());
  const byWeek = {};
  (state.runs||[]).forEach(r=>{
    if(!r.date) return;
    const wk = getMondayISO(new Date(r.date));
    if(wk >= currentMonday) return;
    byWeek[wk] = (byWeek[wk]||0) + (r.distanceKm||0);
  });
  // Mismo motivo que addDaysToIsoLocal(): createdAt es un "YYYY-MM-DD" sin hora, y
  // `new Date(iso)` con ese formato lo parsea como MEDIANOCHE UTC, no local. En husos
  // negativos (Argentina, el mercado principal de este app) eso cae en la noche del día
  // ANTERIOR en hora local, así que getMondayISO() -- que lee día/fecha locales -- podía
  // devolver el lunes de la semana anterior cuando createdAt caía justo un lunes,
  // adelantando earliestMonday una semana entera y diluyendo el promedio real con una
  // semana de antes de que existiera la cuenta. Se arma el Date con componentes locales.
  let earliestMonday = null;
  if(state.profile.createdAt){
    const [cy,cm,cd] = state.profile.createdAt.split('-').map(Number);
    earliestMonday = getMondayISO(new Date(cy, cm-1, cd));
  }
  let sum = 0, count = 0;
  for(let i=1; i<=weeks; i++){
    const wk = addDaysToIsoLocal(currentMonday, -7*i);
    if(earliestMonday && wk < earliestMonday) break;
    sum += byWeek[wk] || 0;
    count++;
  }
  return count>0 ? sum/count : null;
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
  const nextStartIso = addDaysToIsoLocal(state.weekStart || getMondayISO(new Date()), 7);
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
function buildWeeklyRecapMessage(weekPlan, weekStartIso, diffWeeks){
  // Resumen factual de la semana que se cierra, sin juicio de valor (eso ya lo cubren
  // el ajuste automático y el aviso proactivo) -- así el corredor tiene noticias del
  // coach todas las semanas, no solo cuando algo anda mal.
  // d.status==='done' solo (sin exigir d.dist>0) contaba también los días "Carrera extra"
  // -- una carrera corrida en un día sin nada planeado (ver relinkTodayRun/
  // autoMarkSessionDone, que vinculan cualquier carrera del día sin fijarse si ese día tenía
  // sesión). Alguien que corrió sus 3 sesiones planeadas MÁS 2 extras terminaba viendo "5 de
  // 3 sesiones planificadas" en el resumen -- un número que no tiene sentido (5 de 3). El
  // numerador tiene que contar lo mismo que el denominador: sesiones planeadas Y cumplidas.
  const doneCount = weekPlan.filter(d=>d.dist>0 && d.status==='done').length;
  const plannedCount = weekPlan.filter(d=>d.dist>0).length;
  const weekRuns = (state.runs||[]).filter(r => getMondayISO(new Date(r.date)) === weekStartIso);
  const km = weekRuns.reduce((s,r)=>s+r.distanceKm, 0);
  // t('coach_weekly_recap') tiene un {unit} en el texto (ver locales) que nunca se
  // completaba -- quedaba literalmente "0.0 {unit}" en el chat. De paso, km.toFixed(1)
  // tampoco convertía a millas para quien usa imperial: mostraba el número en km igual,
  // aunque el cartel dijera "mi". fmtDist()/distUnit() son las mismas funciones que ya usa
  // el resto de la app para esto (ver Historial, Plan, etc.), nunca hay que reinventar la
  // conversión a mano.
  let msg = t('coach_weekly_recap', {km: fmtDist(km, 1), unit: distUnit(), done:doneCount, planned:plannedCount});
  // Racha de constancia: cuenta semanas seguidas cumpliendo (al menos 70%) lo planeado.
  // Se corta apenas una semana no llega a ese umbral. Solo la mencionamos a partir de
  // la segunda semana seguida, para no sonar como un contador vacío en la primera.
  const metGoal = plannedCount>0 && (doneCount/plannedCount) >= 0.7;
  // diffWeeks>1 significa que hubo al menos una semana entera de calendario sin cerrar
  // entre el último recap y este (el corredor desapareció y volvió) -- la racha mide
  // semanas SEGUIDAS, así que un salto la corta aunque esta última semana activa haya
  // cumplido su propio 70%. Sin este chequeo, alguien que entrenaba bien una semana y
  // después desaparecía un mes recibía a la vez el aviso de "volviste de una pausa" Y
  // "¡vas racha de semanas!" en el mismo momento -- dos mensajes contradictorios -- y esa
  // racha inflada quedaba grabada para siempre en bestStreakWeeks (la pantalla de Logros).
  const brokeStreak = (diffWeeks||1) > 1;
  state.streakWeeks = (metGoal && !brokeStreak) ? (state.streakWeeks||0)+1 : 0;
  // Guardamos también la racha más larga alcanzada alguna vez (no solo la actual) --
  // la usa la pantalla de Logros para no perder un hito ya conseguido cuando la racha
  // en curso se corta.
  state.bestStreakWeeks = Math.max(state.bestStreakWeeks||0, state.streakWeeks);
  if(state.streakWeeks >= 2){
    msg += ' ' + t('coach_streak_line', {n: state.streakWeeks});
    setMascotExpression('excited', {priority:2, duration:2600});
    setMascotColor('good', {duration:3200});
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
function detectTrainingGapWeeks(fallbackSinceIso){
  // Hace cuántas semanas fue la última carrera REGISTRADA -- a diferencia de diffWeeks
  // (que solo mide cuánto tiempo de calendario pasó desde que se abrió la app la última
  // vez), esto mide si el corredor realmente dejó de entrenar. Alguien puede entrenar
  // puntual sin abrir la app todos los días -> eso no es una pausa real.
  const now = Date.now();
  // d<=now: una fecha en el futuro (clock skew del dispositivo, o un típo de año al cargar
  // una carrera a mano) no puede ser "la última carrera real" -- sin este chequeo, una sola
  // carrera mal fechada hacía que lastRunMs quedara en el futuro y Math.max(0, ...) diera
  // directamente 0, escondiendo una pausa real de semanas detrás de esa carrera fantasma.
  let lastRunMs = 0;
  (state.runs||[]).forEach(r=>{ const d = new Date(r.date).getTime(); if(!isNaN(d) && d>lastRunMs && d<=now) lastRunMs = d; });
  if(!lastRunMs){
    // Ni una carrera con fecha real y pasada -- ya sea porque no hay ninguna carrera cargada
    // nunca, o porque las que hay tienen fechas rotas/en el futuro. En cualquiera de los dos
    // casos, sin una última fecha confiable de la cual partir, calculamos la pausa desde la
    // referencia que nos pasaron (el inicio de la semana que veníamos mostrando) en vez de
    // asumir que nunca hubo pausa.
    if(!fallbackSinceIso) return 0;
    const sinceMs = new Date(fallbackSinceIso+'T00:00:00').getTime();
    if(isNaN(sinceMs)) return 0;
    return Math.max(0, Math.floor((now - sinceMs) / (7*86400000)));
  }
  return Math.max(0, Math.floor((now - lastRunMs) / (7*86400000)));
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
// Antes, un arreglo al algoritmo del plan (ej. el fartlek mostrando metros en vez de minutos,
// o el tope de 30% para series/cuestas) solo se veía en sesiones generadas DESPUÉS del cambio
// -- un día ya generado y guardado se quedaba con el número/texto viejo para siempre, hasta
// que algo disparara una regeneración a mano (guardar el perfil, un cambio de semana).
// Reportado por un usuario: "¿por qué tengo que tocar Días de entrenamiento a mano, que se
// actualice solo". Subí PLAN_ALGO_VERSION cada vez que generatePlan (o algo que llama, como
// buildFartlekStructure/buildHillStructure/el reparto semanal) cambie de verdad lo que
// calcula -- si lo guardado no coincide, esto regenera solo al entrar a la app, con el mismo
// merge seguro de siempre (preserveLivedDays: nunca toca un día ya vivido, cancelado, o
// editado a mano por el chat -- solo refresca los días de acá en adelante que el algoritmo
// generó sin que nadie los haya tocado).
const PLAN_ALGO_VERSION = 3;
function checkPlanAlgoVersion(){
  if(!state.onboarded || !state.plan || !state.plan.length) return;
  if(state.planAlgoVersion === PLAN_ALGO_VERSION) return;
  state.plan = preserveLivedDays(state.plan, generatePlan(state.profile, state.weekNumber||1));
  state.planAlgoVersion = PLAN_ALGO_VERSION;
  persist();
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
    const breakAdj = computeReturnFromBreakAdjustment(detectTrainingGapWeeks(state.weekStart));
    if(state.weekStart && state.plan && state.plan.length){
      state.planHistory.push({weekNumber: state.weekNumber||1, weekStart: state.weekStart, plan: state.plan});
      recapMsg = buildWeeklyRecapMessage(state.plan, state.weekStart, diffWeeks);
      let adjustedDown = false;
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
        // checkWeekRollover() solo corre una vez por transición real de semana (no en cada
        // render), así que esto es un "che, tanto tiempo" genuino, no algo que se repita cada
        // vez que se abre la app -- reusa la expresión "happy" (contento, sin la intensidad
        // de un festejo real) en vez de sumar una cuarta forma de ojos solo para esto.
        setMascotExpression('happy', {priority:1, duration:2600});
        setMascotColor('good', {duration:3200});
      } else {
        // el ajuste semanal de siempre (sesiones salteadas/mal calificadas) solo aplica
        // cuando NO hubo una pausa real -- si la hubo, ya está cubierto (y mejor explicado)
        // por el mensaje de arriba, y aplicar los dos juntos sería redundante
        const adj = computeWeekAdjustment(state.plan);
        if(adj.factor !== 1){
          state.profile.weeklyKm = Math.max(5, Math.round(state.profile.weeklyKm*adj.factor));
          adjustNote = adj.note;
          adjustedDown = adj.factor < 1;
        }
      }
      // checkGoalUpsell() sugiere pasar a un objetivo más exigente -- pero se puede cumplir
      // el plan casi entero (streak sigue en pie, metGoal en buildWeeklyRecapMessage solo
      // mira cuántas sesiones se hicieron) y AUN ASÍ tener varias calificadas "mal" ese
      // mismo lapso, disparando un recorte de volumen. Sin este chequeo, el coach podía
      // mandar en la misma ráfaga "bajé el volumen porque la costó esta semana" seguido de
      // "¡veniste tan constante, animate a un objetivo más difícil!" -- dos mensajes que se
      // pisan entre sí. No lo marcamos como "ya mostrado" acá: si la próxima semana cierra
      // bien, sigue disponible, solo se pospone en vez de perderse.
      if(!breakMsg && !adjustedDown) goalUpsellMsg = checkGoalUpsell();
    }
    state.weekNumber = promotedWeekNumber;
    state.weekStart = promotedWeekStart;
    state.plan = promotedPlan || generatePlan(state.profile, state.weekNumber);
    // Ver checkPlanAlgoVersion(): esto ya corrió generatePlan con el código de HOY, así que
    // queda al día por definición -- sin este sello, checkPlanAlgoVersion() (que corre justo
    // después, en enterApp) no tendría forma de saberlo y regeneraría todo de nuevo un
    // segundo después, con el mismo resultado pero un persist() de más.
    state.planAlgoVersion = PLAN_ALGO_VERSION;
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
function pickSpacedDays(days, count, avoidDay){
  // Elige `count` días del array (ya en orden cronológico lunes->domingo) tratando
  // de separarlos lo más posible entre sí -- antes se tomaban siempre los primeros
  // `count` días de la lista, así que en un plan de 4 días las dos sesiones fuertes
  // podían caer en días seguidos (ej. series martes + tempo miércoles), sin un día
  // de por medio para absorber la carga.
  // avoidDay (opcional, típicamente el día de la tirada larga) se suma como un "ancla"
  // más en el cálculo de separación, sin ser un día elegible -- así la búsqueda evita
  // sola dejar un día fuerte pegado a la sesión más grande de la semana, cuando hay
  // alternativa. Antes esto no se tenía en cuenta para nada: un plan de 5-6 días (ej.
  // lun/mié/vie/sáb/dom) podía terminar con series el sábado y fondo el domingo,
  // exactamente lo que cualquier criterio real de entrenamiento evita -- llegar a la
  // sesión más larga de la semana con las piernas ya cargadas de un esfuerzo fuerte del
  // día anterior. Con 1 solo día fuerte (antes: siempre el primero cronológico de
  // `days`, sin importar si caía pegado al día largo) pasa por el mismo cálculo ahora,
  // en vez de tener su propio atajo aparte.
  if(count<=0) return [];
  if(count>=days.length) return days.slice();
  const idx = d => DAY_KEYS.indexOf(d);
  const avoidIdx = avoidDay ? idx(avoidDay) : null;
  let best = null, bestScore = -1;
  const combo = (start, chosen) => {
    if(chosen.length===count){
      const anchors = chosen.map(idx).concat(avoidIdx!==null ? [avoidIdx] : []).sort((a,b)=>a-b);
      let minGap = Infinity;
      for(let i=1;i<anchors.length;i++) minGap = Math.min(minGap, anchors[i]-anchors[i-1]);
      if(minGap>bestScore){ bestScore = minGap; best = chosen.slice(); }
      return;
    }
    for(let i=start;i<days.length;i++){ chosen.push(days[i]); combo(i+1, chosen); chosen.pop(); }
  };
  combo(0, []);
  return best;
}
function distributeSessionTypes(trainingDays, beginner, weekNumber, caution, isCutback, goal, varietyOk){
  if(!trainingDays.length) return {};
  const pref = ['sun','sat','fri','thu','wed','tue','mon'];
  let longDay = trainingDays[trainingDays.length-1];
  for(const d of pref){ if(trainingDays.includes(d)){ longDay = d; break; } }
  const remaining = trainingDays.filter(d=>d!==longDay);
  const sessions = {}; sessions[longDay] = 'long';
  if((beginner && !varietyOk) || !remaining.length){
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
  let rotation = hardSessionRotation(goal, caution);
  // Alguien que TODAVÍA es principiante en running (nunca corrió solo) pero ya tiene base
  // de un deporte de impacto (ver hasRunningImpactBase) puede salir de "todo zona 1" -- pero
  // no le sirve de nada una sesión de series o ritmo medio con técnica y paces que todavía no
  // tiene: lo único que pidió explícitamente el entrenador acá es "algún fartlek de vez en
  // cuando", así que la rotación de calidad para este grupo queda fija en fartlek nomás.
  if(beginner && varietyOk) rotation = ['fartlek'];
  let maxHardDays, hardOccurrence;
  if(remaining.length<=2){
    if(caution.level>=2 || (beginner && varietyOk)){
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
    maxHardDays = (caution.level>=2 || (beginner && varietyOk)) ? 1 : Math.min(2, remaining.length-1);
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
    const [chosenDay] = pickSpacedDays(remaining, 1, longDay);
    remaining.forEach(d=>{ sessions[d] = d===chosenDay ? hardType : 'easy'; });
    return sessions;
  }
  const first = rotation[(hardOccurrence-1) % rotation.length];
  let second = rotation[hardOccurrence % rotation.length];
  if(second === first) second = 'tempo';
  const [dayA, dayB] = pickSpacedDays(remaining, 2, longDay);
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
  else options = [{repMeters:1000, recoveryMin:2}, {repMeters:800, recoveryMin:2}];
  const wn = weekNumber || 1;
  const { repMeters, recoveryMin } = options[(wn-1) % options.length];
  // con más edad o más masa corporal, el impacto de cada repetición pesa más sobre
  // articulaciones y tendones -> capamos la cantidad de repeticiones aunque el volumen
  // "en papel" pediría más, en vez de tratar a todos los corredores igual. Esto puede
  // dejar reps*repMeters por debajo de qualityKm -- ver intervalActualKm, que es lo
  // que generatePlan usa como distancia real de la sesión en vez de qualityKm.
  const maxReps = caution && caution.level>=2 ? 8 : caution && caution.level>=1 ? 10 : 12;
  const totalMeters = qualityKm * 1000;
  const reps = Math.max(4, Math.min(maxReps, Math.round(totalMeters / repMeters)));
  return { reps, repMeters, recoveryMin };
}
function buildHillStructure(qualityKm, caution){
  // Repeticiones en subida, en distancia (no en tiempo): antes esta función fijaba
  // effortSec/baseReps por tiers SIN relación con qualityKm, así que el total
  // mostrado ("9.0 km") podía quedar totalmente desconectado de la sesión descripta
  // (ej: "10 subidas de 90 segundos" no suma ningún 9km reconocible).
  let repMeters;
  if(qualityKm <= 4) repMeters = 150;
  else if(qualityKm <= 7) repMeters = 250;
  else repMeters = 400;
  const maxReps = caution && caution.level>=2 ? 5 : caution && caution.level>=1 ? 7 : 10;
  // La "recuperación" de una cuesta es volver BAJANDO la misma subida (ver
  // desc_hills_detail: "bajando trotando suave como recuperación") -- a diferencia de
  // las series en llano, donde la recuperación se describe en MINUTOS, no en metros (ver
  // buildIntervalStructure). Cada repetición cubre entonces repMeters de ida MÁS otros
  // repMeters de vuelta, así que hay que dividir por el doble para que reps*repMeters*2
  // (ver hillActualKm) se acerque a qualityKm -- reportado por un usuario que hizo la
  // cuenta a mano: "400m fuertes y 400m volviendo tranquilo, séría 8km" para 10
  // repeticiones, exactamente el ida y vuelta que había que contar acá (antes se dividía
  // solo por repMeters, como si la bajada no fuera distancia real recorrida).
  const totalMeters = qualityKm * 1000;
  const reps = Math.max(4, Math.min(maxReps, Math.round(totalMeters / (repMeters * 2))));
  return { reps, repMeters };
}
// Distancia REAL de una sesión de series en llano, a partir de la estructura ya
// construida (reps*repMeters, solo el tramo fuerte) -- ni esto ni qualityKm garantizan
// coincidir, porque maxReps puede capar la cantidad de repeticiones antes de llegar a esa
// distancia. La recuperación entre repeticiones NO se suma acá a propósito: se describe en
// minutos (desc_intervals_detail), no en metros, igual que la entrada en calor/vuelta a la
// calma -- convención estándar en planes de entrenamiento (la "distancia de la sesión" es
// el tramo de calidad, el trote de recuperación se indica aparte, no infla el número).
// generatePlan usa esto para que el km que ve el corredor sea siempre el que sale de sumar
// las repeticiones descriptas, nunca uno más alto que no se corresponde con las
// instrucciones reales.
function intervalActualKm(interval){
  return Math.max(0.1, Math.round(interval.reps * interval.repMeters / 100) / 10);
}
// Distancia REAL de una sesión de cuestas: a diferencia de intervalActualKm, acá SÍ se
// cuenta la vuelta (ver el comentario de buildHillStructure) -- reps repeticiones de
// repMeters de ida MÁS repMeters de vuelta cada una.
function hillActualKm(interval){
  return Math.max(0.1, Math.round(interval.reps * interval.repMeters * 2 / 100) / 10);
}
// Antes el fartlek era "alterná tramos fuertes de 2-4 min con recuperación de 1-2 min,
// variando el ritmo a sensación" -- una sesión real, pero sin ningún número concreto para
// seguir con cronómetro, a diferencia de series/cuestas (que ya dan reps y distancia/tiempo
// exactos). Reportado por un usuario: "los fartlek no aclaran bien cómo hacer el ejercicio,
// quiero todo detallado, en distancia o tiempo". Ahora se arma con reps y duraciones FIJAS
// (rotando por semana, mismo criterio que buildIntervalStructure) en vez de rangos.
//
// maxReps=10 puede capar el cálculo antes de llegar a qualityKm -- mismo problema que ya se
// había arreglado para hills/intervals (ver hillActualKm/intervalActualKm): reportado por un
// usuario en un caso real, un fartlek con qualityKm=6 quedaba capado en 10 repeticiones de
// 2+1min, que a ritmo base son solo ~4.8km reales -- el número de arriba (6km) no se
// correspondía con lo que las repeticiones realmente sumaban. dayObj.dist se recalcula ahora
// a partir de esta estructura (ver fartlekActualKm), igual que hills/intervals.
function buildFartlekStructure(qualityKm, weekNumber, profile){
  const options = [{workMin:3, restMin:1.5}, {workMin:2, restMin:1}, {workMin:4, restMin:2}];
  const wn = weekNumber || 1;
  const { workMin, restMin } = options[(wn-1) % options.length];
  const pace = estimateBasePaceMinPerKm(profile);
  const totalMin = qualityKm * pace;
  const cycleMin = workMin + restMin;
  const reps = Math.max(4, Math.min(10, Math.round(totalMin / cycleMin)));
  return { reps, workMin, restMin };
}
// Distancia REAL de una sesión de fartlek a partir de la estructura ya construida -- reps
// repeticiones de (workMin+restMin) minutos cada una, convertidas a km con el mismo ritmo
// base que ya usó buildFartlekStructure para dimensionar cuántas reps entraban.
function fartlekActualKm(interval, profile){
  const pace = estimateBasePaceMinPerKm(profile);
  const cycleMin = interval.workMin + interval.restMin;
  return Math.max(0.1, Math.round((interval.reps * cycleMin / pace) * 10) / 10);
}
function calcBmi(p){
  if(!p || !p.weight || !p.height) return null;
  const h = p.height/100;
  if(!(h>0)) return null;
  return p.weight / (h*h);
}
// pregnancyPostpartum se tilda una sola vez en el onboarding y, a diferencia de TODAS las
// otras señales que suben la cautela (molestia de painLog: vence a los 21 días; principiante/
// returningFromBreak: se gradúan solos con checkBeginnerGraduation/checkReturningBreakGraduation),
// no tenía ningún vencimiento -- se quedaba subiendo la cautela para siempre, aunque el propio
// mensaje que el coach del chat le manda al modelo (buildContext) ya asume que es algo de "los
// últimos 6 meses". Sin este chequeo, alguien que marcó esto en el onboarding quedaba con el
// plan tapado en cautela nivel 2 de por vida, sin ninguna forma de destildarlo (no hay ningún
// toggle en Perfil para esto). Reusado acá y en buildContext para que las dos lecturas del
// mismo dato (el plan determinístico y lo que el coach de IA le dice al corredor) coincidan
// siempre -- mismo motivo que ya justificó el aviso de principiante en el chat.
const PREGNANCY_CAUTION_DAYS = 182;
function pregnancyStillRecent(p){
  if(!p || !p.pregnancyPostpartum) return false;
  if(!p.createdAt) return true; // sin fecha de referencia (cuenta vieja): mantenemos la cautela, heurística conservadora
  const createdMs = new Date(p.createdAt+'T00:00:00').getTime();
  if(isNaN(createdMs)) return true;
  return (Date.now() - createdMs) < PREGNANCY_CAUTION_DAYS*86400000;
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
  if(age !== null){
    if(age >= 60) level = Math.max(level, 2);
    else if(age >= 45) level = Math.max(level, 1);
  }
  if(bmi !== null){
    if(bmi >= 30) level = Math.max(level, 2);
    else if(bmi >= 27) level = Math.max(level, 1);
  }
  // una molestia activa (registrada en los últimos 21 días y todavía sin marcar como
  // resuelta) también sube la cautela -- menos sesiones de impacto (series/cuestas, ver
  // hardSessionRotation) y una progresión de volumen más lenta (ver weekMultiplier),
  // hasta que el corredor la marque como resuelta desde Perfil.
  if(activePainEntries(21).length) level = Math.max(level, 1);
  // Embarazo/postparto reciente (ver pregnancyStillRecent, vence a los ~6 meses) o volver
  // de una pausa larga: mismo criterio conservador que la edad/IMC, se combinan con
  // Math.max en vez de sumarse, así ningún combo de señales empuja el nivel más allá de 2
  // (el techo que ya define weekMultiplier/hardSessionRotation). Una lesión o condición
  // declarada en el onboarding ya no es un flag propio -- se guarda como una entrada más de
  // painLog (ver finishOnboard), así que activePainEntries(21) de arriba ya la cubre, con
  // el mismo vencimiento a los 21 días o "ya no me duele" desde Perfil que cualquier otra.
  if(pregnancyStillRecent(p)) level = Math.max(level, 2);
  if(p.returningFromBreak) level = Math.max(level, 1);
  return { age, bmi, level };
}
// Techo a la porción del volumen semanal que una sola sesión de alto impacto (series o
// cuestas) puede cargar -- ver el comentario en generatePlan, donde se usa.
const HIGH_IMPACT_SHARE_CAP = 0.3;
// "Principiante" acá es un criterio de CARGA actual, no de autopercepción. Antes solo
// miraba runnerType==='new'/goal==='start' -- alguien que eligió "Ya corro" pero puso 0 km
// semanales actuales (por ejemplo, viene de una pausa muy larga sin marcar el toggle de
// "volver de una pausa", o completó ese campo rápido sin pensarlo) caía en la rama genérica
// basada en el volumen pico del objetivo (calcWeeklyKm), con el mismo arranque agresivo que
// cualquier corredor activo real. Reportado por un usuario: cuenta nueva, "nunca corrí",
// semana 1 con series/fartlek y ~19km totales -- para alguien que hoy corre 0km/semana, la
// carga inicial tiene que basarse en ESO, no en a dónde apunta el objetivo final.
function isBeginnerProfile(p){
  return p.weeklyKm === 0 || p.goal === 'start' || p.runnerType === 'new' || !(p.currentWeeklyKm > 0);
}
// isBeginnerProfile() por sí sola nunca deja de ser true: si nadie entra a Perfil a mano a
// cambiar runnerType/km actuales, alguien que arrancó como principiante se queda en zona 1 y
// sin ningún fartlek para siempre, aunque entrene consistente semana tras semana y su
// condición mejore un montón (reportado por un usuario: "¿no sería mejor que después de un
// tiempo entrene en zona 2 con algo de fartlek?"). Esta función SÍ actualiza el perfil de
// verdad (no es un chequeo de solo lectura como isBeginnerProfile) cuando el promedio REAL de
// los últimos BEGINNER_GRADUATION_WEEKS (no solo que haya pasado el tiempo -- tiene que haber
// corrido de verdad) supera BEGINNER_GRADUATION_MIN_KM. Al graduarlo, currentWeeklyKm queda en
// su promedio real (no en una fórmula genérica del objetivo) para que el volumen que seleccione
// calcWeeklyKm a partir de ahí parta de su capacidad demostrada, no de un salto al kilometraje
// pico del objetivo -- el mismo tipo de salto brusco que ya se corrigió en isBeginnerProfile.
const BEGINNER_GRADUATION_WEEKS = 4;
// La mitad de tiempo para quien ya venía con una base real de otro deporte (ver
// hasCrossTrainingBase) -- su sistema cardiovascular ya no arranca de cero, así que
// adaptarse a correr en zona 2 con algo de variedad le lleva menos semanas de verdad
// entrenando que a alguien 100% sedentario antes de esto.
const BEGINNER_GRADUATION_WEEKS_WITH_BASE = 2;
const BEGINNER_GRADUATION_MIN_KM = 8;
function checkBeginnerGraduation(){
  if(!state.onboarded || !state.profile) return;
  const p = state.profile;
  if(!isBeginnerProfile(p)) return; // ya no está en modo principiante, nada que graduar
  const graduationWeeks = hasCrossTrainingBase(p) ? BEGINNER_GRADUATION_WEEKS_WITH_BASE : BEGINNER_GRADUATION_WEEKS;
  const avgKm = computeActualWeeklyKmAvg(graduationWeeks);
  if(avgKm === null || avgKm < BEGINNER_GRADUATION_MIN_KM) return;
  p.runnerType = 'active';
  p.currentWeeklyKm = Math.round(avgKm);
  p.weeklyKm = calcWeeklyKm(p);
  // Igual que checkPlanAlgoVersion(): regenera YA los días de esta semana que el algoritmo
  // generó sin que nadie los haya tocado, para que el cambio de zona/variedad se vea de
  // entrada junto con el mensaje -- sin esto, quedaría el plan viejo hasta el lunes que viene.
  state.plan = preserveLivedDays(state.plan, generatePlan(state.profile, state.weekNumber||1));
  state.chat.push({role:'coach', text: t('coach_beginner_graduated'), ts:Date.now()});
  renderChat();
  persist();
}
// "Volver de una pausa larga" (ob-returning en el onboarding) es OTRO flag que, igual que el
// de principiante antes de este fix, se guardaba una sola vez y nunca se sacaba solo -- baja
// el punto de partida a un 60% de lo declarado (ver calcWeeklyKm) y sube la cautela para
// siempre, aunque la persona vuelva a entrenar consistente y su volumen real ya haya alcanzado
// lo de antes. Sin esto, alguien que declaró "volver de una pausa" en el onboarding queda con
// ese 40% de descuento PERMANENTE en su kilometraje semanal, para siempre, sin ninguna forma
// de sacarlo (ni siquiera editando "Datos personales" en Perfil -- ese campo no está ahí).
const RETURNING_BREAK_GRADUATION_WEEKS = 4;
function checkReturningBreakGraduation(){
  if(!state.onboarded || !state.profile) return;
  const p = state.profile;
  // Sin currentWeeklyKm > 0 no hay una referencia real de "lo de antes" contra la cual medir
  // que ya volvió -- ese caso ya cae en isBeginnerProfile de todos modos (ver calcWeeklyKm:
  // el *0.6 de returningFromBreak solo pesa en la rama de corredor activo con km actual>0),
  // así que el flag no le afecta el volumen igual, no hay apuro en sacarlo.
  if(!p.returningFromBreak || !(p.currentWeeklyKm > 0)) return;
  const avgKm = computeActualWeeklyKmAvg(RETURNING_BREAK_GRADUATION_WEEKS);
  // El piso es lo que la persona declaró que corría ANTES de parar, no un número fijo --
  // alguien que volvía a 15km/semana no debería esperar lo mismo que alguien que volvía a
  // 60km/semana.
  if(avgKm === null || avgKm < p.currentWeeklyKm * 0.8) return;
  p.returningFromBreak = false;
  p.currentWeeklyKm = Math.round(avgKm);
  p.weeklyKm = calcWeeklyKm(p);
  state.plan = preserveLivedDays(state.plan, generatePlan(state.profile, state.weekNumber||1));
  state.chat.push({role:'coach', text: t('coach_returning_break_graduated'), ts:Date.now()});
  renderChat();
  persist();
}
function generatePlan(p, weekNumber, weekStartDate){
  weekNumber = weekNumber || 1;
  weekStartDate = weekStartDate || state.weekStart;
  const caution = trainingCaution(p);
  const isRecovery = isRecoveryWeek(weekStartDate);
  const taperMult = taperMultiplier(p, weekStartDate);
  const postGoalRaceMult = postGoalRaceRecoveryMultiplier(p, weekStartDate);
  // La descarga periódica (isCutbackWeek, cada 4 semanas) está pensada para el bloque normal
  // de entrenamiento -- si esta semana YA tiene una reducción de volumen más específica y
  // deliberada (taper antes de la carrera objetivo, recuperación post-carrera de esa MISMA
  // carrera objetivo, recuperación post-carrera de "Próximos eventos", o la semana puntual de
  // una carrera de "Próximos eventos"), sumarle la descarga genérica encima recorta MÁS de lo
  // que cualquiera de esos mecanismos buscaba por separado -- mismo problema, mismo criterio,
  // que el chequeo de más abajo en eventRaceWeekMultiplier (no descontar la misma carrera dos
  // veces), generalizado a cualquier combinación de estos recortes en vez de solo ese caso
  // puntual.
  const skipPeriodicCutback = taperMult < 1 || isRecovery || postGoalRaceMult < 1 || isEventRaceWeek(weekStartDate);
  const mult = weekMultiplier(weekNumber, caution, skipPeriodicCutback) * taperMult * postGoalRaceMult * recoveryMultiplier(weekStartDate) * eventRaceWeekMultiplier(weekStartDate, p);
  const beginner = isBeginnerProfile(p);
  // Un principiante con base de un deporte de impacto (ver hasRunningImpactBase) ya tolera el
  // golpe de correr aunque nunca haya salido a correr solo -- a ese lo sacamos del "todo zona 1,
  // solo rodaje suave" desde el día 1 (zona 2 + algún fartlek), aunque siga siendo "principiante"
  // para el CÁLCULO DE VOLUMEN (effectiveWeeklyKm/beginnerPerSessionKm más abajo no cambian: la
  // base de otro deporte no le da eficiencia de carrera, solo tolerancia al impacto). easyOnly es
  // el que de verdad decide zona/variedad de sesión; beginner sigue decidiendo el volumen.
  const varietyOk = beginner && hasRunningImpactBase(p);
  const easyOnly = beginner && !varietyOk;
  // si el corredor puso una meta semanal propia, la usamos como referencia de volumen en vez
  // del cálculo genérico -- pero acotada para no saltar de golpe a algo que podría lesionarlo
  let effectiveWeeklyKm = p.weeklyKm;
  if(p.weeklyGoalKm > 0 && !beginner){
    const maxWk = Math.max(p.weeklyKm * 1.3, p.weeklyKm + 5);
    const minWk = p.weeklyKm * 0.7;
    effectiveWeeklyKm = Math.min(maxWk, Math.max(minWk, p.weeklyGoalKm));
  }
  const zoneMap = {easy:easyOnly?1:2, intervals:4, tempo:3, long:2, fartlek:3, hills:4, progression:3};
  const defaultDays = beginner ? ['tue','thu','sun'] : ['tue','wed','fri','sun'];
  const trainingDays = DAY_KEYS.filter(d => (p.trainingDays && p.trainingDays.length ? p.trainingDays : defaultDays).includes(d));
  const sessionMap = distributeSessionTypes(trainingDays, beginner, weekNumber, caution, isCutbackWeek(weekNumber), p.goal, varietyOk);
  if(isRecovery || postGoalRaceMult < 1){
    // En la semana de recuperación evitamos series/tempo/cuestas/fartlek/progresivo/rodaje
    // largo -- todo eso suma carga justo cuando el cuerpo todavía está absorbiendo el
    // esfuerzo de la carrera. Se reemplaza por rodaje suave (o descanso, si ese día ya
    // no tenía sesión) hasta la semana siguiente, que retoma el plan normal. Mismo criterio
    // sea la recuperación de una carrera de "Próximos eventos" (isRecovery) o de la carrera
    // OBJETIVO de Perfil > Metas cuando nunca se duplicó ahí (postGoalRaceMult).
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
  const RATIO = {easy:EASY_SESSION_RATIO, intervals:1.15, tempo:0.85, long:beginner?BEGINNER_LONG_RATIO:1.5, fartlek:1.0, hills:0.9, progression:1.0};
  let distMap;
  if(beginner){
    const per = beginnerPerSessionKm(p) * mult;
    distMap = {};
    Object.keys(RATIO).forEach(type=>{ distMap[type] = Math.round(per * RATIO[type]); });
  } else {
    const usedTypes = trainingDays.map(d=>sessionMap[d]).filter(Boolean);
    const weightSum = usedTypes.reduce((a,type)=> a + (RATIO[type]||1), 0);
    const targetTotal = Math.max(9, effectiveWeeklyKm) * mult;
    const perUnit = weightSum>0 ? targetTotal/weightSum : 0;
    distMap = {};
    Object.keys(RATIO).forEach(type=>{ distMap[type] = Math.round(perUnit * RATIO[type]); });
    // El reparto proporcional de arriba no tiene techo por sí solo -- con pocos días de
    // entreno (2-3 por semana) le puede tocar a una sola sesión de alto impacto (series o
    // cuestas) una porción desmedida del total semanal, porque el peso de RATIO se reparte
    // entre menos "unidades". Reportado por un usuario que corre ~20km/semana: con un plan
    // de 2 días (tirada larga + cuestas), su única sesión de cuestas (10 subidas de 400m ida
    // y vuelta) le representaba el 38% de TODO su volumen semanal en un solo esfuerzo de alto
    // impacto -- muy por encima de lo que cualquier criterio real de entrenamiento
    // consideraría razonable (la regla 80/20 que ya sigue el resto del generador, ver RATIO,
    // reserva las sesiones fuertes para una porción chica del total). Achicamos esa sesión a
    // lo sumo a HIGH_IMPACT_SHARE_CAP del volumen semanal y repartimos lo que sobra entre las
    // demás sesiones de esa semana, en la misma proporción que ya tenían entre sí -- así el
    // total semanal sigue coincidiendo con effectiveWeeklyKm*mult (ver el comentario de más
    // arriba), solo que mejor repartido.
    const occurrences = {};
    usedTypes.forEach(type=>{ occurrences[type] = (occurrences[type]||0) + 1; });
    ['hills','intervals'].forEach(type=>{
      const occ = occurrences[type] || 0;
      if(!occ || distMap[type]<=0) return;
      const cap = Math.max(1, Math.round(targetTotal * HIGH_IMPACT_SHARE_CAP));
      if(distMap[type] <= cap) return;
      const totalExcess = (distMap[type] - cap) * occ;
      distMap[type] = cap;
      const remainingWeight = weightSum - (RATIO[type]||1) * occ;
      if(remainingWeight>0){
        Object.keys(occurrences).forEach(t=>{
          if(t===type) return;
          distMap[t] += Math.round(totalExcess * (RATIO[t]||1) / remainingWeight);
        });
      }
    });
  }
  // "¿Cuántos minutos tenés disponibles por sesión?" (onboarding, opcional) se guardaba en el
  // perfil pero nunca tocaba el plan de verdad -- solo se lo pasábamos al coach del chat como
  // sugerencia ("si una sesión se pasa de esto, comentaselo"), así que alguien con 30 minutos
  // reales entre semana igual podía recibir una sesión de 8km calculada sin que nada en el
  // plan lo supiera. Acá SÍ lo usamos como techo real de las sesiones entre semana (no de la
  // tirada larga -- esa es a propósito la sesión más grande del fin de semana, caparla
  // también la dejaría sin sentido). Restamos los 20 min fijos de entrada en calor + vuelta a
  // la calma (ver desc_warmup_prefix/desc_cooldown_suffix, no están adentro de d.dist) antes
  // de convertir minutos a km con el ritmo estimado del corredor. No reparte el km "perdido"
  // en otro lado -- si de verdad tiene poco tiempo, el total semanal real es más bajo, así de
  // simple, en vez de inflarle la tirada larga para compensar.
  if(p.availableMinPerSession > 0){
    const pace = estimateBasePaceMinPerKm(p);
    const maxSessionKm = Math.max(10, p.availableMinPerSession - 20) / pace;
    Object.keys(distMap).forEach(type=>{ if(type!=='long') distMap[type] = Math.min(distMap[type], Math.round(maxSessionKm*10)/10); });
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
    if(typeKey==='intervals' && !easyOnly){
      dayObj.interval = buildIntervalStructure(distMap[typeKey], caution, weekNumber);
      dayObj.dist = intervalActualKm(dayObj.interval);
    }
    if(typeKey==='hills' && !easyOnly){
      dayObj.interval = buildHillStructure(distMap[typeKey], caution);
      dayObj.dist = hillActualKm(dayObj.interval);
    }
    if(typeKey==='fartlek' && !easyOnly){
      dayObj.interval = buildFartlekStructure(distMap[typeKey], weekNumber, p);
      dayObj.dist = fartlekActualKm(dayObj.interval, p);
    }
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
  // Sin carreras registradas todavía, usamos la marca de referencia que haya cargado en
  // el onboarding (ob-refrace-dist/min) antes de caer al valor genérico por perfil -- así
  // alguien con una marca real conocida arranca con ritmos calibrados desde el día 1, en
  // vez de esperar a acumular 3 carreras para que este cálculo deje de ser un promedio
  // fijo por perfil (7.5/6.2).
  const anyPR = Object.values(getPersonalRecords())[0]
    || (profile.refRace && profile.refRace.distanceKm>0 && profile.refRace.durationSec>0 ? profile.refRace : null);
  if(anyPR && anyPR.distanceKm>0 && anyPR.durationSec>0){
    return (anyPR.durationSec/60)/anyPR.distanceKm + 1.3;
  }
  return isBeginnerProfile(profile) ? 7.5 : 6.2;
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
// Conversión inversa a repDurationSec -- de minutos a metros, usando el mismo ritmo base del
// corredor. La usa el fartlek en modo distancia (buildFartlekStructure arma sus repeticiones
// siempre en minutos, ver el comentario ahí) para poder mostrarlas en metros igual que series
// y cuestas cuando el corredor entrena por distancia, en vez de mezclar minutos ahí en medio de
// un plan que por lo demás está todo en km -- reportado por un usuario que entrena por
// distancia y notó que SOLO el fartlek se le mostraba en minutos.
function repMetersFromMin(min, profile){
  const pace = estimateBasePaceMinPerKm(profile);
  const raw = (min / pace) * 1000;
  // Redondeado a la baldosa de 50m más cercana -- el cálculo directo (minutos * ritmo) da
  // cualquier número (262m, 484m...), no una cifra que alguien elegiría a mano para correr
  // con el reloj (100, 150, 200, 250, 300...). Mismo espíritu que los tiers fijos que ya usan
  // buildIntervalStructure/buildHillStructure para SU distancia, solo que acá el punto de
  // partida es una conversión continua (minutos a metros), no una tabla de opciones fija.
  // Reportado por un usuario viendo el fartlek en modo distancia.
  return Math.max(50, Math.round(raw/50)*50);
}
function planAmountText(d){
  if(!(d.dist>0)) return '';
  return isTimeMode() ? `${planDurationMin(d)} ${t('time_unit_min')}` : `${fmtDist(d.dist,1)} ${distUnit()}`;
}
// Separada de planLabel() (más abajo) para que quien necesite guardar el texto de una sesión
// SIN la envoltura de entrada en calor/vuelta a la calma pueda pedirla así -- ver
// applyMoveSession/applyVolumeAdjust, que "congelan" un día del algoritmo (d.custom pasa a
// true) guardando el texto resuelto en d.desc. Si esas funciones guardaran el resultado YA
// envuelto de planLabel(), la PRÓXIMA vez que algo llame a planLabel() sobre ese mismo día
// (ahora custom) -- que es exactamente lo que hace CUALQUIER render posterior (Plan, Inicio,
// Correr, el modal de calificación, la exportación .ics) -- la rama "custom" de planLabel()
// volvería a agregar la envoltura encima de un texto que YA la tenía adentro, duplicando
// "Comenzá con 10 minutos de entrada en calor..."/"...vuelta a la calma..." para siempre en
// ese día. Encontrado en una auditoría con pruebas adversariales (ejecutando las herramientas
// del coach, no solo leyendo el código) -- pasaba en el camino más común de las dos
// herramientas (mover_sesion y ajustar_volumen_semana), cada vez que "congelan" un día que
// todavía era del algoritmo puro.
function planLabelBody(d){
  if(d.custom){
    // Una sesión "custom" es texto libre que el coach (IA) escribió a partir de un pedido
    // del usuario (modificar_sesion) -- pero sigue siendo una sesión de running como
    // cualquier otra, así que también lleva la estructura de entrada en calor / vuelta a
    // la calma cuando tiene distancia (antes se mostraba SOLO el texto del coach, sin esa
    // estructura, lo que hacía que un día editado por chat se viera "distinto" al resto
    // del plan). Esa envoltura se agrega en planLabel(), no acá -- ver el comentario de arriba.
    let body = d.desc;
    if(d.interval){
      // d.interval llega SIEMPRE en minutos (resolveCustomInterval, en workMin/restMin) --
      // acá se convierte a la unidad que corresponda, mismo criterio que ya usa esta función
      // con el fartlek armado por el algoritmo (repMetersFromMin/fmtDurationShort). Así el
      // número que ve el corredor coincide SIEMPRE con su modo de entreno, sin depender de
      // que el modelo haya elegido bien la unidad al escribir el texto libre -- reportado por
      // un usuario: el coach seguía escribiendo minutos para alguien que entrena por
      // distancia, aunque ya se le había pedido explícitamente que no lo hiciera.
      const timeModeNow = isTimeMode();
      const work = timeModeNow ? fmtDurationShort(d.interval.workMin*60) : `${repMetersFromMin(d.interval.workMin, state.profile)}m`;
      const rest = timeModeNow ? fmtDurationShort(d.interval.restMin*60) : `${repMetersFromMin(d.interval.restMin, state.profile)}m`;
      body = `${d.desc}\n${t('desc_custom_reps_detail', {reps:d.interval.reps, work, rest, zone:d.zone})}`;
    }
    return {type:d.type, desc:body};
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
      // Antes redondeaba a un km entero (Math.round(d.dist/3)) -- para un progresivo de
      // 10km eso daba "3 tramos de 3km", que suman 9, no 10 (reportado por un usuario: "me
      // falta 1 km"). Con un decimal (fmtDist) el error queda en ~0.1km, no un km entero.
      // También le faltaba convertir a millas en modo imperial -- {third}km estaba fijo en
      // el texto en vez de usar distUnit() como el resto de la app.
      : t('desc_progression_detail', {third: fmtDist(Math.max(0.1, d.dist/3), 1), unit: distUnit()});
  } else if(d.typeKey==='fartlek' && d.interval){
    // buildFartlekStructure arma sus repeticiones siempre en minutos (workMin/restMin) --
    // eso es interno, no significa que haya que MOSTRARLAS en minutos sin importar el modo
    // del corredor. Antes se mostraban siempre en tiempo, así que alguien que entrena por
    // distancia (todo el resto del plan en km) veía el fartlek como la única sesión en
    // minutos, sin ninguna razón visible. Acá sí hace falta la rama por modo, igual que
    // series/cuestas -- en distancia se convierten los minutos a metros con
    // repMetersFromMin (mismo ritmo base que ya usa repDurationSec para la conversión
    // inversa).
    desc = timeMode
      ? t('desc_fartlek_detail_time', {reps:d.interval.reps, work:fmtDurationShort(d.interval.workMin*60), rest:fmtDurationShort(d.interval.restMin*60), zone:d.zone})
      : t('desc_fartlek_detail', {reps:d.interval.reps, work:repMetersFromMin(d.interval.workMin, state.profile), rest:repMetersFromMin(d.interval.restMin, state.profile), zone:d.zone});
  } else if(d.zone && d.dist>0 && d.typeKey!=='intervals' && d.typeKey!=='fartlek'){
    // el fartlek SIN estructura (sesiones viejas guardadas antes de este cambio, o un
    // custom del coach) sigue siendo "alternar ritmos por sensación" -- decirle "mantenete
    // en zona X durante el tramo principal" encima se contradice con la sesión misma. Con
    // d.interval (rama de arriba) la zona ya va adentro del texto detallado, así que este
    // caso nunca se llega a evaluar para un fartlek nuevo.
    desc += t('desc_zone_suffix', {zone:d.zone});
  }
  return {type:t('type_'+d.typeKey), desc};
}
function planLabel(d){
  if(d.raceDay) return {type: t('plan_race_day_type'), desc: t('plan_race_day_desc', {name: escapeHtml(d.raceEventName || '')})};
  const lbl = planLabelBody(d);
  // Entrada en calor y vuelta a la calma para toda sesión que implique correr (no en
  // días de descanso). Antes era una frase agregada al final ("...y sumale 5 a 15 min
  // de trote suave al principio y al final"); ahora el pedido es una ESTRUCTURA fija de
  // 3 partes -- entrada en calor, el detalle de la sesión, vuelta a la calma, cada una
  // en su propio párrafo -- con 10 minutos fijos en vez de un rango. El \n se ve como
  // salto de línea real en todos los lugares donde se muestra esto (home, plan, correr)
  // gracias a white-space:pre-line en .muted y .day-detail. Se agrega UNA sola vez, acá --
  // planLabelBody() nunca la agrega (ver su comentario) para que quien necesite el texto sin
  // envolver (applyMoveSession/applyVolumeAdjust, al congelar un día del algoritmo) lo pueda
  // pedir sin duplicarla en el próximo render.
  const desc = d.dist>0 ? `${t('desc_warmup_prefix')}\n${lbl.desc}\n${t('desc_cooldown_suffix')}` : lbl.desc;
  return {type:lbl.type, desc};
}

/* ---- suscripción al calendario (webcal://) -----
   Antes "Agregar semana al calendario" bajaba un .ics nuevo cada vez que se tocaba el
   botón. Apple/Google Calendar tratan un .ics importado como eventos sueltos, no como una
   fuente que se pueda refrescar -- cada semana exportada se sumaba a las anteriores en vez
   de reemplazarlas, y la app nunca tuvo (ni puede tener) permiso para borrar lo que ya
   quedó adentro del Calendario del usuario. Reportado por el usuario: después de varios
   cambios de plan, terminó con un montón de eventos viejos pegoteados sin forma de
   limpiarlos desde acá.
   La solución de raíz es un feed SUSCRIBIBLE (ver api/calendar-feed.js): en vez de un
   archivo de una sola vez, es una URL que el propio Calendario del usuario vuelve a pedir
   solo, periódicamente. Como siempre devuelve el estado actual de la semana en curso con
   los mismos UID de siempre, un evento que ya no aplica (semana vieja, día cambiado)
   simplemente deja de aparecer en el próximo refresco, en vez de quedar duplicado para
   siempre. state.calendarToken identifica al usuario en esa URL pública sin necesitar
   login (ningún cliente de calendario sabe autenticarse) -- se genera una sola vez y viaja
   con el resto de state a app_state.data, igual que cualquier otro campo. */
function ensureCalendarToken(){
  if(!state.calendarToken){
    state.calendarToken = (typeof crypto!=='undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    persist();
  }
  return state.calendarToken;
}
function calendarFeedUrl(){
  return `https://zancada.org/api/calendar-feed?t=${ensureCalendarToken()}`;
}
function openCalendarSubscribe(){
  if(!state.plan.some(d=>d.dist>0)){ showToast(t('plan_export_ics_empty'),'error'); return; }
  document.getElementById('cal-sub-link').textContent = calendarFeedUrl();
  openOverlaySheetEl(document.getElementById('calendar-sub-modal'));
}
function closeCalendarSubscribe(){
  document.getElementById('calendar-sub-modal').classList.remove('overlay-open');
}
// webcal:// es el esquema que Calendario de iOS/macOS reconoce para abrir directo su
// pantalla nativa de "Suscribirse" -- en Android, en general ningún cliente de calendario
// lo maneja, por eso el botón de abajo ("Compartir enlace") es la vía que de verdad
// funciona ahí (pegar la URL en Google Calendar > Configuración > Agregar calendario >
// Desde URL).
function subscribeToCalendarIOS(){
  window.location.href = calendarFeedUrl().replace('https://','webcal://');
}
async function shareCalendarLink(){
  const url = calendarFeedUrl();
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const Share = isNative && window.Capacitor.Plugins && window.Capacitor.Plugins.Share;
  if(Share){
    try{ await Share.share({ url, title:'Zancada' }); }catch(e){ /* usuario canceló el panel nativo */ }
    return;
  }
  if(navigator.share){
    try{ await navigator.share({ url, title:'Zancada' }); return; }catch(e){ /* canceló -- cae a copiar */ }
  }
  try{
    await navigator.clipboard.writeText(url);
    showToast(t('cal_sub_copied'));
  }catch(e){ /* sin Share API ni Clipboard API no queda más que dejarlo seleccionable en pantalla */ }
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

// Intercambia el CONTENIDO de la sesión (tipo, distancia, terreno, zona, estructura de
// series, y también si es una sesión "custom" escrita por el coach vía chat) entre dos
// días del plan -- cada objeto conserva su propio "day" (la clave del día de la semana no
// se mueve, lo que se mueve es qué entrenamiento le toca a cada uno). La usa
// applyMoveSession (herramienta mover_sesion del coach); también la usaba el botón
// "reprogramar por lluvia" del aviso de clima, ya sacado de la app.
function swapPlanDaySessions(dayA, dayB){
  const fields = ['typeKey','dist','terrain','zone','interval','custom','cancelled','type','desc'];
  const aCopy = {};
  fields.forEach(f=>{ aCopy[f] = dayA[f]; });
  fields.forEach(f=>{ if(dayB[f]===undefined) delete dayA[f]; else dayA[f] = dayB[f]; });
  fields.forEach(f=>{ if(aCopy[f]===undefined) delete dayB[f]; else dayB[f] = aCopy[f]; });
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
    // Fase de entrenamiento respecto a esta carrera. OJO: taperMultiplier() (el recorte
    // gradual de 3 semanas) solo mira p.raceDate (la carrera OBJETIVO de Perfil > Metas) --
    // si esta carrera de "Próximos Eventos" es una carrera de PRÁCTICA distinta, el plan NO
    // baja volumen semanas antes (a propósito, ver changelog_event_plan_decouple), solo la
    // semana puntual en la que cae (eventRaceWeekMultiplier/isEventRaceWeek). Antes acá se
    // usaban los mismos cortes de 7/21 días sin importar cuál de los dos casos era, así que
    // un corredor con su carrera objetivo real recién en meses, pero con una carrera de
    // práctica cargada para la semana que viene, veía "puesta a punto" en Inicio 3 semanas
    // seguidas aunque el plan siguiera en carga normal hasta esa semana puntual.
    const phaseTag = document.getElementById('home-race-phase-tag');
    const phaseNote = document.getElementById('home-race-phase-note');
    const isGoalRace = state.profile.raceDate && state.event.date === state.profile.raceDate;
    let phaseKey, noteKey;
    if(isGoalRace){
      if(daysToRace < 7){ phaseKey = 'home_race_phase_taper_final'; noteKey = 'home_race_phase_taper_final_note'; }
      else if(daysToRace < 21){ phaseKey = 'home_race_phase_taper'; noteKey = 'home_race_phase_taper_note'; }
      else { phaseKey = 'home_race_phase_build'; noteKey = null; }
    } else if(isEventRaceWeek(state.weekStart)){
      phaseKey = 'home_race_phase_taper_final'; noteKey = 'home_race_phase_taper_final_note';
    } else {
      phaseKey = 'home_race_phase_build'; noteKey = null;
    }
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
  // Colapsado de nuevo en cada render (cambiar de pestaña y volver, o cualquier otro cambio
  // de estado) -- no tiene sentido arrastrar "abierto" de una sesión anterior del día de hoy.
  document.getElementById('home-next-detail').classList.remove('open');
  document.getElementById('home-next-hint').classList.remove('open');
  document.getElementById('home-next-hint-label').textContent = t('home_next_see_detail');

  // Si ya corrimos hoy, mostramos el resumen de esa sesión en lugar del cartel de
  // "próxima sesión" -- ver getTodayRun().
  const todayRun = getTodayRun();
  // Encontrado en una auditoría: esta tarjeta tenía SIEMPRE el brillo lima completo, incluso
  // en un día de descanso sin nada que hacer -- la regla de la única señal (ver DESIGN.md)
  // dice que el lima significa "esto es lo único para actuar ahora", y gastarlo en un
  // descanso le resta peso al resto de la app. Ahora el brillo queda reservado para un día
  // con una sesión real planeada, o un día de descanso donde igual se corrió algo extra
  // (todayRun sin sesión planeada) -- ahí sí hay algo que celebrar.
  const cardEarnsGlow = today.dist > 0 || !!todayRun;
  document.getElementById('home-next-card-shell').classList.toggle('card-shell-hivis', cardEarnsGlow);
  document.getElementById('home-next-card').classList.toggle('card-highlight', cardEarnsGlow);
  const doneBlock = document.getElementById('home-session-done-block');
  const nextSessionBlock = document.getElementById('home-next-session');
  const nextDetailBlock = document.getElementById('home-next-detail');
  const nextHintBlock = document.getElementById('home-next-hint');
  const cardTitleEl = document.getElementById('home-next-card-title');
  if(todayRun){
    cardTitleEl.textContent = t('home_session_done_title');
    nextSessionBlock.style.display = 'none';
    nextDetailBlock.style.display = 'none';
    nextHintBlock.style.display = 'none';
    // El "pop" de reconocimiento (mismo keyframe que ya usa confirm-card) solo se dispara la
    // primera vez que este bloque pasa de oculto a visible -- renderHome() se re-llama seguido
    // (cambio de pestaña, cualquier cambio de estado) mientras la carrera de hoy sigue cargada,
    // así que sin este chequeo la animación se repetiría en cada render en vez de sentirse
    // como el momento puntual de "recién terminaste".
    const justRevealed = doneBlock.style.display !== 'block';
    doneBlock.style.display = 'block';
    doneBlock.style.animation = justRevealed ? 'confirmPop .32s var(--ease-spring)' : 'none';
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
    nextDetailBlock.style.display = '';
    nextHintBlock.style.display = '';
    doneBlock.style.display = 'none';
  }

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
    document.getElementById('goal-progress-bar').style.transform = `scaleX(${pct/100})`;
    if(rawPct >= 100 && state.weekStart && state.lastGoalCelebratedWeek !== state.weekStart){
      state.lastGoalCelebratedWeek = state.weekStart;
      haptic([15,40,15,40,25]);
      showToast(t('goal_reached_msg'), 'success');
      celebrate();
      // Mismo mecanismo enlatado que checkNewPR/checkAchievementUnlocks -- celebrate() por sí
      // sola nunca manda nada al chat (la usan tres lugares distintos, cada uno con su propio
      // mensaje si le hace falta), así que antes esto solo se veía en el toast, nunca quedaba
      // registrado en la conversación con el coach.
      state.chat.push({role:'coach', text: t('coach_goal_reached_msg', {km: fmtDist(state.profile.weeklyGoalKm,1), unit: distUnit()}), ts:Date.now()});
      renderChat();
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
  barsEl.setAttribute('role', 'list');
  barsEl.innerHTML = state.plan.map((d,i)=>{
    const isRest = d.dist===0;
    const isToday = i===todayIdx;
    const h = isRest ? 4 : Math.max(10, Math.round((d.dist/maxPlanDist)*44));
    // --zc (color de zona) viaja como custom property, no como `background` directo --
    // así .wd-col.today sigue pudiendo pisarlo por cascada normal (mismo criterio que
    // ya usaba esta tira: hoy siempre se destaca en lima, sin importar la zona del día).
    const zc = (!isRest && d.zone) ? `--zc:var(--zone${d.zone})` : '';
    // Encontrado en una auditoría: esta tira codificaba todo (día, distancia, zona) solo con
    // la altura y el color de un <div> -- un lector de pantalla no tenía forma de saber qué
    // entrenamiento había cada día. dayLabel repite en texto exactamente lo que el ojo ya ve.
    const dayName = t('day_'+d.day);
    const dayLabel = isRest ? `${dayName}: ${planLabel(d).type}` : `${dayName}: ${planAmountText(d)}${d.zone ? ', '+t('zone_word')+' '+d.zone : ''}`;
    return `<div class="wd-col ${isRest?'rest':'training'} ${isToday?'today':''}" role="listitem" aria-label="${escapeHtml(dayLabel)}">
      <div class="wd-bar-wrap" aria-hidden="true"><div class="wd-bar" style="height:${h}px; ${zc}"></div></div>
      <div class="wd-lbl" aria-hidden="true">${t('day_'+d.day).slice(0,2)}</div>
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
    return;
  }
  doneCard.style.display = 'none';
}
// Elegir entre el ejercicio programado de hoy y correr libre -- pedido del usuario. Vive en
// una variable de módulo (no en state): es una elección de "esta vez que voy a arrancar",
// no algo que tenga sentido recordar entre aperturas de la app -- cada visita a la pantalla
// de Correr vuelve a elegir el default sola (ver renderRunModeChoice()).
let selectedRunMode = 'scheduled';
function getTodayPlanSession(){
  const idx = (new Date().getDay()+6)%7;
  const today = state.plan[idx];
  if(!today || today.typeKey==='rest') return null;
  return today;
}
function renderRunModeChoice(){
  const wrap = document.getElementById('run-mode-choice');
  const today = getTodayPlanSession();
  if(!today){ wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';
  // planLabelBody(), no planLabel(): acá hace falta el resumen de la sesión sola (tipo +
  // detalle), sin la envoltura de entrada en calor/vuelta a la calma de 3 párrafos que sí
  // tiene sentido durante la carrera (ver renderWorkoutGuide()) pero sería demasiado texto
  // para una tarjeta de elección chica.
  const lbl = planLabelBody(today);
  document.getElementById('run-mode-scheduled-type').textContent = lbl.type;
  document.getElementById('run-mode-scheduled-desc').textContent = lbl.desc;
  // Si ya corrió hoy la sesión programada, el default pasa a "libre" (sigue pudiendo elegir
  // la programada de nuevo a mano si quiere repetirla) -- si todavía no corrió, el default
  // es la programada.
  selectedRunMode = getTodayRun() ? 'free' : 'scheduled';
  updateRunModeCardStyles();
}
function selectRunMode(mode){
  selectedRunMode = mode;
  updateRunModeCardStyles();
}
function updateRunModeCardStyles(){
  document.getElementById('run-mode-scheduled').classList.toggle('active', selectedRunMode==='scheduled');
  document.getElementById('run-mode-free').classList.toggle('active', selectedRunMode==='free');
}
function getPlanStartDate(){
  // la fecha más vieja de weekStart que tengamos registrada (historial de semanas + la semana actual)
  // marca desde cuándo existe ESTE plan, sin importar si hay carreras de Strava de antes importadas.
  const starts = (state.planHistory||[]).map(w=>w.weekStart).filter(Boolean);
  if(state.weekStart) starts.push(state.weekStart);
  if(!starts.length) return null;
  return starts.reduce((min,s)=> (s < min ? s : min), starts[0]);
}
// OJO -- acuteKm (más abajo) es una ventana MÓVIL de 7 días terminando ahora mismo, no la
// semana calendario (esa es state.weekStart, lo que muestra la card de "Esta semana" en
// Inicio). Es la forma correcta de medir carga aguda:crónica (ACWR) en deportes -- pero
// puede mostrar "corriste de más" el jueves de una semana calendario en la que todavía no
// corriste nada, si el finde pasado (todavía dentro de estos 7 días) fue muy exigente.
// Reportado por un usuario ("a mi amigo le aparece 'corriste de más' pero todavía no
// corrió esta semana") -- no es un bug de cálculo, era el texto (home_load_hint_caution)
// el que decía "esta semana" en vez de "los últimos 7 días", dando a entender que
// contradecía a la card de arriba cuando en realidad miden cosas distintas a propósito.
function calcTrainingLoad(){
  const runs = state.runs || [];
  if(!runs.length) return null;
  const planStart = getPlanStartDate();
  if(!planStart) return null;
  const now = Date.now();
  // planStart es un "YYYY-MM-DD" (getMondayISO), pensado como medianoche LOCAL -- pero
  // new Date("YYYY-MM-DD") sin hora lo interpreta como medianoche UTC, no local (mismo bug
  // ya arreglado en detectTrainingGapWeeks más abajo, que sí le agrega 'T00:00:00'). Para
  // alguien en UTC-3 esto corría el gate de "hace 14 días" unas 3hs, según el huso horario.
  const daysSincePlan = (now - new Date(planStart+'T00:00:00').getTime()) / 86400000;
  if(daysSincePlan < 14) return null; // hace menos de 2 semanas que existe este plan: todavía no hay con qué comparar de forma confiable
  const kmWithin = days => runs.reduce((a,r)=>{
    // r.distanceKm>0: una carrera corrupta/mal editada a mano con distancia negativa no
    // debería poder arrastrar el promedio hacia abajo y disfrazarse de "corriste de menos"
    // (level:'low') en vez de simplemente ignorarse como el dato inválido que es.
    if(!(r.distanceKm>0)) return a;
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
  const futureStartIso = addDaysToIsoLocal(state.weekStart, offset*7);
  if(offset > 12) return { plan: [], weekNumber: wn, editable: false, exists: false, mode:'future', weekStart: futureStartIso };
  return { plan: generatePlan(state.profile, wn, futureStartIso), weekNumber: wn, editable: false, exists: true, mode:'future', weekStart: futureStartIso };
}
// Extraído de renderPlan() -- sigue siendo el día-por-día completo y editable de la
// pestaña Plan. La pantalla de "Semanas anteriores" (ver openWeekDetail/
// buildWeekDoneListHtml más abajo) NO reusa esto: pedido explícito del usuario, esa
// pantalla muestra solo los ejercicios hechos, sin el resto de la semana ni el
// desplegado de detalle.
function buildDayListHtml(wd){
  const z = state.profile.hrZones;
  const todayIdx = (new Date().getDay()+6)%7;
  return wd.plan.map((d,i)=>{
    const lbl = planLabel(d);
    // d.custom viene de texto libre que el coach (IA) escribió a partir de un pedido del
    // usuario (modificar_sesion / ajuste de volumen) -- a diferencia de las descripciones
    // fijas de las traducciones o el nombre del evento (que ya se escapa en planLabel), acá
    // nunca escapamos antes, así que hay que hacerlo recién en este punto, al insertarlo
    // como HTML, para no habilitar un XSS guardado en el plan.
    let lblType = d.custom ? escapeHtml(lbl.type) : lbl.type;
    let lblDesc = d.custom ? escapeHtml(lbl.desc) : lbl.desc;
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
    } else if(!isEventDay){
      if(d.dist>0){
        // d.dist>0 acá es a propósito, no solo d.terrain/d.zone: un día de
        // descanso nunca debería mostrar cartel de terreno/zona, ni siquiera
        // si por algún dato viejo esos campos quedaran seteados.
        if(d.terrain) meta += `<span class="tag tag-${d.terrain}">${t('ob_terrain_'+d.terrain)}</span>`;
        if(d.zone) meta += `<span class="zone-chip zone-${d.zone}">${t('zone_word')} ${d.zone}</span>`;
      }
    }
    // El día de una carrera de "Próximos eventos" sigue generando y guardando la sesión de
    // entrenamiento normal por debajo (d.dist/d.typeKey no cambian -- eso es lo que ya
    // decidimos antes: no le reprograma nada al resto del plan, y marcar "hecho"/sincronizar
    // ese día sigue funcionando igual). Lo que cambia acá es SOLO la presentación: el corredor
    // pidió que ese día se vea de una directamente como la carrera que es, con su nombre y su
    // distancia, en vez de aparecer disfrazado de "Rodaje suave" con una etiqueta chica al
    // costado que ni mostraba la distancia de la carrera.
    if(isEventDay){
      lblType = t('plan_race_day_type')+': '+escapeHtml(state.event.name);
      lblDesc = t('plan_race_day_desc', {name: escapeHtml(state.event.name)});
    }
    const eventAmountText = isEventDay && state.event.distanceKm>0 ? `${fmtDist(state.event.distanceKm,1)} ${distUnit()}` : '';
    // Correr un día sin nada planeado (día de descanso, pero apareció una carrera vinculada
    // -- ver relinkTodayRun/autoMarkSessionDone, que enlazan cualquier carrera del día sin
    // fijarse si ese día tenía sesión) dejaba la tarjeta diciendo "Descanso" para siempre,
    // aunque tuviera el tilde de hecho y el km/ritmo real en el detalle -- reportado por el
    // usuario, que la primera vez se llevó la duda de si el extra había quedado registrado
    // en el Plan o no. Ahora ese título cambia a "Carrera extra" y el badge de arriba
    // muestra el km real corrido, en vez de quedar en blanco.
    const extraRun = (!(d.dist>0) && !d.raceDay && !isEventDay && d.status==='done' && d.linkedRunId)
      ? state.runs.find(r=>r.id===d.linkedRunId) : null;
    if(extraRun) lblType = t('plan_extra_run_title');
    const extraRunAmountText = extraRun ? `${fmtDist(extraRun.distanceKm)}${distUnit()}` : '';
    const isRestDay = !(d.dist>0) && !d.raceDay && !isEventDay && !extraRun;
    // color:var(--hivis-text) acá (no --hivis puro): --hivis es el lima de marca tal cual,
    // que en modo claro sigue siendo el mismo lima brillante casi sin contraste sobre
    // blanco -- --hivis-text es la versión oscurecida pensada justo para texto/íconos
    // legibles (ver el comentario grande del sistema de temas en el <style> de
    // index.html). Antes este tilde de "hecho" usaba --hivis puro y quedaba casi invisible
    // en modo claro -- reportado por el usuario.
    const statusIcon = d.status==='done' ? `<div class="icon-sq" style="width:16px; height:16px; color:var(--hivis-text);">${ICONS.check}</div>` : d.status==='skipped' ? `<div class="icon-sq" style="width:16px; height:16px; color:var(--danger);">${ICONS.cross}</div>` : '';
    const zoneDetail = (d.zone && !isEventDay) ? `<br><br><span class="zone-chip zone-${d.zone}">${t('zone_word')} ${d.zone}</span> <span class="mono muted">${z[d.zone].min}-${z[d.zone].max} bpm</span>` : '';
    let statusBlock = '';
    if(d.status==='done'){
      const run = d.linkedRunId ? state.runs.find(r=>r.id===d.linkedRunId) : null;
      let doneText = t('plan_status_done');
      if(run){
        // Clickeable -- pedido del usuario: "si tocamos un ejercicio, que nos manda el
        // ejercicio del historial". stopPropagation() porque esto vive adentro de
        // .day-detail, que ya está abierto cuando se ve (toggleDay() en la fila de arriba) --
        // sin esto, el click también le llegaba al toggle del día entero y lo volvía a
        // cerrar de golpe en vez de abrir el detalle de la carrera.
        const pMin = run.distanceKm>0.02 ? (run.durationSec/60)/run.distanceKm : 0;
        doneText += `: <button class="small-link" onclick="event.stopPropagation(); openRunDetail('${run.id}')">${fmtDist(run.distanceKm)}${distUnit()} · ${fmtPace(pMin)}/${distUnit()}</button>`;
      }
      statusBlock = canEdit ? `<p style="color:var(--hivis-text); font-weight:700; margin-top:12px;">${doneText} · <button class="small-link" onclick="markSession(${i},null)">${t('plan_undo')}</button></p>` : `<p style="color:var(--hivis-text); font-weight:700; margin-top:12px;">${doneText}${isPastDay?' · '+t('plan_locked'):''}</p>`;
    }
    else if(d.status==='skipped') statusBlock = canEdit ? `<p style="color:var(--danger); font-weight:700; margin-top:12px;">${t('plan_status_skipped')} · <button class="small-link" onclick="markSession(${i},null)">${t('plan_undo')}</button></p>` : `<p style="color:var(--danger); font-weight:700; margin-top:12px;">${t('plan_status_skipped')}${isPastDay?' · '+t('plan_locked'):''}</p>`;
    else if(d.dist>0 && canEdit){
      // El botón "Sincronizar" solo tiene sentido si hay al menos una fuente conectada
      // (Strava/Polar/Wahoo/Health Connect) -- mostrarlo siempre, aunque no haya nada
      // conectado, era confuso: tocarlo no traía nada y no explicaba por qué. Mismo
      // criterio para "Enviar a mi reloj", pero solo mirando Wahoo (es la única que
      // recibe datos). Ver deviceConnections / refreshDeviceConnections() más arriba.
      const anyDeviceConnected = deviceConnections.strava || deviceConnections.polar || deviceConnections.wahoo || deviceConnections.coros || !!state.healthConnectConnected;
      const showSyncBtn = isToday && anyDeviceConnected;
      const showWahooPushBtn = isToday && deviceConnections.wahoo;
      statusBlock = `<div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;"><button class="btn btn-outline btn-sm" onclick="markSession(${i},'done')"><span class="icon-sq" style="width:14px; height:14px;">${ICONS.check}</span> ${t('plan_mark_done')}</button><button class="btn btn-outline btn-sm" onclick="markSession(${i},'skipped')"><span class="icon-sq" style="width:14px; height:14px;">${ICONS.cross}</span> ${t('plan_mark_skipped')}</button>${showSyncBtn?`<button class="btn btn-outline btn-sm" id="sync-today-btn" onclick="syncTodayNow()"><span class="icon-sq" style="width:14px; height:14px;">${ICONS.refresh}</span> ${t('plan_sync_button')}</button>`:''}${showWahooPushBtn?`<button class="btn btn-outline btn-sm" id="wahoo-push-btn" onclick="pushTodayToWahoo()"><span class="icon-sq" style="width:14px; height:14px;">${ICONS.send}</span> ${t('wahoo_push_button')}</button>`:''}</div>`;
    }
    return `<div>
      <div class="day-row ${isRestDay?'day-row-rest':''} ${isToday?'day-row-today':''}" onclick="toggleDay(${i})">
        <div class="day-badge"><div class="d">${t('day_'+d.day).slice(0,3)}</div>${dateLbl?`<div class="mono muted" style="font-size:10px; margin-top:2px;">${dateLbl}</div>`:''}</div>
        <div class="day-info">
          <div class="day-info-title-row"><span class="t">${lblType}</span>${isEventDay?(eventAmountText?`<span class="day-km-inline">${eventAmountText}</span>`:''):(d.dist>0?`<span class="day-km-inline">${planAmountText(d)}</span>`:(extraRunAmountText?`<span class="day-km-inline">${extraRunAmountText}</span>`:''))}</div>
          ${meta?`<div class="day-row-chips">${meta}</div>`:''}
        </div>
        <div class="day-row-end">${statusIcon}</div>
      </div>
      <div class="day-detail" id="detail-${i}"><div>${lblDesc}${zoneDetail}${statusBlock}</div></div>
    </div>`;
  }).join('');
}
function renderPlan(){
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
  // "Semana N" solo -- las etiquetas de estado van en #plan-week-tags, una fila aparte (ver
  // el comentario largo junto a esa clase en el CSS). Antes se concatenaban todas acá mismo,
  // en una sola línea con overflow:ellipsis, y un texto largo como "Estimado, puede
  // ajustarse" terminaba mostrando apenas "..." sin nada legible -- reportado por el usuario.
  const label = t('plan_week_label',{n:wn});
  let tagsHtml = '';
  if(wd.exists && (isCutbackWeek(wn) || isEventWeek) && wd.mode!=='future') tagsHtml += `<span class="tag tag-asfalto">${t('plan_cutback')}</span>`;
  if(wd.mode==='future') tagsHtml += `<span class="tag tag-soon">${t('plan_estimate')}</span>`;
  if(wd.mode==='past') tagsHtml += `<span class="tag tag-soon">${t('plan_past')}</span>`;
  const taperMult = (wd.exists && wd.mode!=='past' && wd.weekStart) ? taperMultiplier(state.profile, wd.weekStart) : 1;
  const isTapering = taperMult < 1;
  // el aviso de taper (etiqueta + mensaje) solo se muestra en semanas "firmes" (actual y la que
  // sigue) -- en una semana "estimado, puede ajustarse" no tiene sentido afirmar algo puntual
  // como "acá empieza tu puesta a punto" sobre una proyección que todavía puede cambiar entera
  const showTaperUi = isTapering && wd.mode!=='future';
  if(showTaperUi) tagsHtml += `<span class="tag tag-asfalto">${t('plan_taper_tag')}</span>`;
  // La semana de recuperación se recalcula siempre en base a wd.weekStart -- no depende de
  // que state.event siga cargado (isRecoveryWeek() ya contempla que se haya limpiado solo
  // al pasar la fecha, ver autoClearPastEvent()), así que se puede mostrar toda la semana,
  // no solo el día del rollover.
  const showRecoveryUi = wd.exists && wd.mode!=='past' && wd.mode!=='future' && wd.weekStart && isRecoveryWeek(wd.weekStart);
  if(showRecoveryUi) tagsHtml += `<span class="tag tag-asfalto">${t('plan_recovery_tag')}</span>`;
  document.getElementById('plan-week-info').textContent = label;
  const tagsRow = document.getElementById('plan-week-tags');
  tagsRow.innerHTML = tagsHtml;
  tagsRow.style.display = tagsHtml ? 'flex' : 'none';
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

  document.getElementById('plan-list').innerHTML = buildDayListHtml(wd);
  makeClickablesFocusable(document.getElementById('plan-list'));
  renderPastWeeks();
}
function renderPastWeeks(){
  const card = document.getElementById('past-weeks-card');
  if(!state.planHistory || state.planHistory.length===0){ card.style.display='none'; return; }
  card.style.display='block';
  document.getElementById('past-weeks-list').innerHTML = state.planHistory.slice().reverse().map(w=>{
    // Mismo bug (y mismo arreglo) que buildWeeklyRecapMessage: sin el d.dist>0, un día
    // "Carrera extra" (corrida sin nada planeado ese día) contaba en el numerador pero no en
    // el denominador -- "5 de 3 sesiones" en una semana con extras.
    const doneCount = w.plan.filter(d=>d.dist>0 && d.status==='done').length;
    const totalSessions = w.plan.filter(d=>d.dist>0).length;
    const plannedAmount = isTimeMode() ? `${w.plan.reduce((a,d)=>a+planDurationMin(d),0)} ${t('time_unit_min')}` : `${fmtDist(w.plan.reduce((a,d)=>a+d.dist,0),1)}${distUnit()}`;
    // Antes esto hacía onclick="viewingWeekOffset=${offset}; renderPlan();", que pisaba la
    // semana que el usuario tenía abierta en la pestaña Plan -- pedido explícito del usuario:
    // tocar una semana pasada debe abrir una pantalla aparte (ver openWeekDetail), sin tocar
    // el navegador de semana de arriba.
    return `<div style="padding:10px 0; border-bottom:1px solid var(--asphalt-3); cursor:pointer;" onclick="openWeekDetail(${w.weekNumber})">
      <div style="display:flex; justify-content:space-between;"><span style="font-weight:700;">${t('plan_week_label',{n:w.weekNumber})}</span><span class="muted mono" style="font-size:11.5px;">${w.weekStart}</span></div>
      <p class="muted" style="margin-top:4px; font-size:12.5px;">${doneCount}/${totalSessions} ${t('home_sessions').toLowerCase()} · ${plannedAmount} ${t('home_km_planned').toLowerCase()}</p>
    </div>`;
  }).join('');
}
// Lista de "lo que hice" para la pantalla de una semana pasada (ver openWeekDetail) --
// pedido explícito del usuario: NO el día-por-día completo de la semana (con descansos y
// el desplegado de detalle, como en Plan), solo una fila por cada ejercicio con
// status==='done', mostrando el día y lo que se hizo. Tocar la fila manda derecho a
// Historial (openRunDetail) -- sin un paso intermedio de desplegar el día primero, que es
// justo lo que el usuario pidió sacar.
function buildWeekDoneListHtml(wd){
  const doneDays = wd.plan.map((d,i)=>({d,i})).filter(({d}) => d.status==='done');
  if(!doneDays.length) return `<p class="muted" style="margin:0;">${t('plan_week_detail_empty')}</p>`;
  return doneDays.map(({d,i})=>{
    const lbl = planLabel(d);
    let lblType = d.custom ? escapeHtml(lbl.type) : lbl.type;
    // Mismo criterio que en buildDayListHtml: un día sin nada planeado pero con una
    // corrida vinculada (extra, fuera del plan) se llama "Carrera extra", no el nombre
    // del día de descanso.
    const extraRun = !(d.dist>0) && !d.raceDay && d.linkedRunId ? state.runs.find(r=>r.id===d.linkedRunId) : null;
    if(extraRun) lblType = t('plan_extra_run_title');
    let dateLbl = '';
    if(wd.weekStart){
      const dt = new Date(wd.weekStart+'T00:00:00'); dt.setDate(dt.getDate()+i);
      dateLbl = `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
    }
    const run = d.linkedRunId ? state.runs.find(r=>r.id===d.linkedRunId) : null;
    const pMin = run && run.distanceKm>0.02 ? (run.durationSec/60)/run.distanceKm : 0;
    const summary = run ? `${fmtDist(run.distanceKm)}${distUnit()} · ${fmtPace(pMin)}/${distUnit()}` : t('plan_status_done');
    return `<div style="padding:12px 0; border-bottom:1px solid var(--asphalt-3);${run?' cursor:pointer;':''}"${run?` onclick="openRunDetail('${run.id}')"`:''}>
      <div style="display:flex; justify-content:space-between; align-items:baseline;"><span style="font-weight:700;">${lblType}</span><span class="muted mono" style="font-size:11.5px;">${t('day_'+d.day).slice(0,3)} ${dateLbl}</span></div>
      <p class="muted mono" style="margin-top:4px; font-size:13px;">${summary}</p>
    </div>`;
  }).join('');
}
// Pantalla de solo lectura para una semana pasada -- separada de viewingWeekOffset/
// renderPlan a propósito: tocar una semana en "Semanas anteriores" NO debe cambiar la
// semana que se ve en la pestaña Plan, solo mostrar la de esa semana en una pantalla
// aparte, de la que se puede volver atrás sin haber modificado nada arriba.
function openWeekDetail(weekNumber){
  const offset = weekNumber - (state.weekNumber||1);
  const wd = getWeekData(offset);
  document.getElementById('week-detail-title').textContent = t('plan_week_label',{n:weekNumber});
  document.getElementById('week-detail-list').innerHTML = wd.exists ? buildWeekDoneListHtml(wd) : `<p class="muted" style="margin:0;">${t('plan_no_data')}</p>`;
  openOverlaySheetEl(document.getElementById('week-detail-modal'));
}
function closeWeekDetail(){
  document.getElementById('week-detail-modal').classList.remove('overlay-open');
}
function toggleDay(i){ if(planSwipeSuppressClick) return; document.getElementById('detail-'+i).classList.toggle('open'); }
// Tarjeta de "próxima sesión" en Inicio: colapsada solo muestra tipo + km (pedido del
// usuario -- antes mostraba siempre la descripción completa, mucho texto para lo que en
// general es solo un vistazo rápido). "Ver detalle" avisa que hay más para tocar; mismo
// mecanismo de expandido que los días del Plan (.day-detail), sin el sangrado de 54px.
function toggleHomeNextDetail(){
  const isOpen = document.getElementById('home-next-detail').classList.toggle('open');
  document.getElementById('home-next-hint').classList.toggle('open', isOpen);
  document.getElementById('home-next-hint-label').textContent = t(isOpen ? 'home_next_hide_detail' : 'home_next_see_detail');
  // Encontrado en una auditoría: los dos disparadores (la tarjeta entera y el hint de
  // "ver detalle") tenían role="button" pero nunca actualizaban aria-expanded, a
  // diferencia de toggleInstallHelp() que sí lo hace -- un lector de pantalla anunciaba
  // "botón" sin decir si al activarlo se expande o se colapsa, ni avisar el cambio.
  const expanded = isOpen ? 'true' : 'false';
  document.getElementById('home-next-session')?.setAttribute('aria-expanded', expanded);
  document.getElementById('home-next-hint')?.setAttribute('aria-expanded', expanded);
}
function markSession(i, status){
  state.plan[i].status = status;
  // Recordamos qué carrera se desvinculó a propósito (ver el chequeo en relinkTodayRun) --
  // Deshacer solo saca el LINK, la carrera en sí sigue en state.runs (no se borra nada), así
  // que sin este dato relinkTodayRun() la volvía a encontrar y revincular sola en la próxima
  // apertura de la app, el mismo día.
  if(!status){
    if(state.plan[i].linkedRunId) state.plan[i].declinedRunId = state.plan[i].linkedRunId;
    state.plan[i].linkedRunId = null;
    // Si no, una calificación vieja quedaba pegada al día: al re-marcarlo hecho más tarde
    // (con otra carrera, o a mano) no volvía a pedirse la devolución, y encima esa
    // calificación fantasma seguía contando en el ajuste semanal de volumen.
    delete state.plan[i].rating;
  }
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
  // classifyHR() recorre las zonas 1→5 en orden y devuelve la primera cuyo máximo no
  // se supere -- si no exigimos min<max por zona y máximos estrictamente ascendentes,
  // una carga a mano invertida (ej. zona 1 con max 190) hace que TODAS las pulsaciones
  // caigan en zona 1 y las zonas 2-5 queden inalcanzables sin que nadie se entere.
  // 30-250bpm: mismo rango generoso-pero-no-absurdo que ya usa activity-sanity.js del lado
  // del servidor (MIN_HR/MAX_HR) -- sin este chequeo, un min/max negativo o de 3 dígitos de
  // más (típo, o pegar del campo equivocado) pasaba derecho con solo min<max/máximos
  // ascendentes, y como classifyHR() solo mira el max (nunca el min), quedaba corrompiendo en
  // silencio la clasificación de zona de CADA pulsación real registrada desde ese momento
  // (casi siempre cayendo en zona 5) -- encontrado por testing adversarial.
  for(let n=1;n<=5;n++){
    if(newZones[n].min >= newZones[n].max || (n>1 && newZones[n].max <= newZones[n-1].max)
       || newZones[n].min<30 || newZones[n].min>250 || newZones[n].max<30 || newZones[n].max>250){
      showToast(t('zones_invalid_error'), 'error');
      return;
    }
  }
  state.profile.hrZones = newZones;
  state.profile.hrKnown = true;
  // hrZonesCustom distingue "estas zonas se cargaron a mano, número por número" (acá) de
  // "estas zonas son la fórmula estándar aplicada a un hrMax conocido" (onboarding,
  // modificar_perfil). Sin esta distinción, checkHrMaxFromRuns() -- que sube el hrMax solo
  // cuando un pico real de FC en 2+ carreras supera lo guardado -- volvía a calcular las
  // zonas con computeZones(nuevoMax) apenas eso pasaba, pisando en silencio zonas cargadas a
  // mano (por ejemplo, de un test de lactato) con las de la fórmula genérica.
  state.profile.hrZonesCustom = true;
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
function openPainOverlay(){ openOverlaySheetEl(document.getElementById('pain-overlay')); }
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
  setMascotColor('bad', {duration:5000});
  setMascotExpression('concerned', {priority:1, duration:5000});
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
  renderPainLog();
  // Espejo de la cara "concerned" que puso savePainLog() al cargarla -- si se preocupó al
  // anotarla, tiene sentido que se alivie al cerrarla. Sin cambio de color (no es un festejo
  // grande como una marca personal, solo una carita contenta breve).
  setMascotExpression('happy', {priority:1, duration:2200});
  // Mensaje enlatado, mismo motivo que en checkShoeWearAlerts: es un aviso, no algo que
  // necesite una respuesta personalizada de la IA (a diferencia de savePainLog, que sí simula
  // que el corredor escribió el mensaje para pedir consejo específico).
  state.chat.push({role:'coach', text: t('coach_pain_resolved_msg', {part: t('pain_body_'+entry.bodyPart)}), ts:Date.now()});
  renderChat();
  // persist() al final, después del push al chat -- antes se llamaba justo después de
  // renderPainLog(), una línea antes de agregar este mensaje; movido para que el mensaje
  // nuevo quede guardado en la misma llamada, no en una futura (persist() no espera a que
  // termine el guardado remoto, así que un persist() anterior al push corría el riesgo real
  // de mandar el estado sin este mensaje todavía adentro).
  persist();
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
  // Encontrado en una auditoría: con activeCount===1 esto mostraba "1 molestias activas"
  // (y el mismo problema de plural en las otras 5 traducciones) -- perfil_pain_summary_active
  // nunca tenía una forma singular propia.
  if(summaryEl) summaryEl.textContent = !entries.length ? t('perfil_pain_summary_empty') : (activeCount === 1 ? t('perfil_pain_summary_active_one') : activeCount ? t('perfil_pain_summary_active', {n: activeCount}) : t('perfil_pain_summary_none_active'));
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
    setMascotColor('bad', {duration:5000});
    setMascotExpression('concerned', {priority:1, duration:5000});
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
  // Muestra el promedio REAL de las últimas semanas corridas (computeActualWeeklyKmAvg) en vez
  // de p.weeklyKm (la meta que calcula el plan) -- ver el comentario de esa función. Sin
  // semanas cerradas todavía (cuenta recién creada) cae al viejo comportamiento (la meta),
  // que sigue siendo la mejor referencia disponible hasta que haya algo real para promediar.
  const avgKm = computeActualWeeklyKmAvg(3);
  document.getElementById('perfil-sub').textContent = avgKm!=null
    ? `${t('perfil_avg_weekly_label')} ${fmtDist(avgKm,1)}${distUnit()}/sem · ${t('ob_goal_'+p.goal)}`
    : `${fmtDist(p.weeklyKm,1)}${distUnit()}/sem · ${t('ob_goal_'+p.goal)}`;
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

  updateProfileUnitLabels();
  const editingPersonal = ['perfil-weight','perfil-height','perfil-racedate','perfil-current-km'].includes(document.activeElement && document.activeElement.id);
  if(!editingPersonal){
    document.getElementById('perfil-weight').value = p.weight ? fmtWeight(p.weight) : '';
    document.getElementById('perfil-height').value = p.height ? fmtHeight(p.height) : '';
    // 0 es un valor real y guardado a propósito (alguien nuevo que arranca desde cero) --
    // "|| ''" lo mostraba como campo vacío, indistinguible de "todavía no se cargó nada".
    document.getElementById('perfil-current-km').value = (p.currentWeeklyKm===0 || p.currentWeeklyKm) ? fmtDist(p.currentWeeklyKm,1) : '';
    document.getElementById('perfil-goal').value = p.goal || 'start';
    document.getElementById('perfil-racedate').value = p.raceDate || '';
    dateBoxUpdaters['perfil-racedate'] && dateBoxUpdaters['perfil-racedate']();
    [...document.getElementById('perfil-terrain-choice').children].forEach(c=>c.classList.toggle('active', c.dataset.v===p.terrain));
    // Sin género guardado todavía (cuentas de antes de este campo, o quien lo dejó sin
    // elegir en el onboarding) no marcamos ninguna opción -- forzar "x" acá pisaría el
    // guardado con un valor que la persona nunca eligió, apenas abra este panel.
    [...document.getElementById('perfil-gender-choice').children].forEach(c=>c.classList.toggle('active', c.dataset.v===p.gender));
  }
  const editingGoals = ['perfil-weekly-goal','perfil-goal-note','perfil-availmin'].includes(document.activeElement && document.activeElement.id);
  if(!editingGoals){
    document.getElementById('perfil-weekly-goal').value = p.weeklyGoalKm ? fmtDist(p.weeklyGoalKm,1) : '';
    document.getElementById('perfil-goal-note').value = p.goalNote || '';
    document.getElementById('perfil-availmin').value = p.availableMinPerSession || '';
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
          <div class="muted mono" style="font-size:11.5px; margin-top:2px;">${fmtDist(s.km,0)} / ${fmtDist(threshold,0)} ${distUnit()}</div>
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
      <p class="mono" style="font-size:20px; font-weight:800; color:var(--hivis-text); margin:0;">${fmtPace((prediction.predictedSec/60)/goalKm)} /${distUnit()}</p>
      <p class="muted" style="margin:6px 0 0; font-size:11.5px;">${t('perfil_predicted_pace_note', {ref: fmtDist(prediction.refDistanceKm,1)+' '+distUnit(), time: fmtTime(Math.round(prediction.predictedSec))})}</p>
    </div>` : '';
    evBox.innerHTML = `<p style="font-size:14.5px; font-weight:700;">${escapeHtml(state.event.name)} <span class="tag tag-${state.event.type==='ruta'?'asfalto':state.event.type==='trail'?'trail':'mixto'}">${t('ev_type_'+state.event.type)}</span></p>
      <p class="display" style="font-size:34px; color:var(--hivis-text); margin-top:4px;">${Math.max(0,days)} <span style="font-size:13px; font-family:Inter; color:var(--mist);">${t('perfil_event_days')}</span></p>
      <div style="display:flex; align-items:center; gap:14px; margin-top:6px; flex-wrap:wrap;">
        <button class="small-link" style="display:flex; align-items:center; gap:5px;" onclick="downloadEventIcs()"><span class="icon-sq" style="width:14px; height:14px;">${ICONS.calendar}</span>${t('add_to_calendar')}</button>
        <button class="small-link" style="color:var(--danger);" onclick="deleteEvent()">${t('delete_event')}</button>
      </div>
      ${paceBlock}`;
    document.getElementById('ev-name').value = state.event.name;
    document.getElementById('ev-distance').value = state.event.distanceKm>0 ? fmtDist(state.event.distanceKm,2) : '';
    document.getElementById('ev-date').value = state.event.date;
    dateBoxUpdaters['ev-date'] && dateBoxUpdaters['ev-date']();
    document.getElementById('ev-type').value = state.event.type;
  } else { evBox.innerHTML = `<div style="text-align:center; padding:10px 0;"><div class="icon-sq" style="width:24px; height:24px; margin:0 auto 8px; color:var(--mist-dim);">${ICONS.flag}</div><p class="muted" style="margin:0; font-size:13px;">${t('perfil_no_event')}</p></div>`; }

  const shoesSummaryEl = document.getElementById('perfil-shoes-summary');
  if(shoesSummaryEl) shoesSummaryEl.textContent = state.shoes.length ? t('perfil_shoes_count', {n: state.shoes.length}) : t('perfil_no_shoes');

  const devicesSummaryEl = document.getElementById('perfil-devices-summary');
  if(devicesSummaryEl){
    const connectedNames = [];
    if(deviceConnections.strava) connectedNames.push('Strava');
    if(deviceConnections.polar) connectedNames.push('Polar');
    if(deviceConnections.wahoo) connectedNames.push('Wahoo');
    if(deviceConnections.coros) connectedNames.push('COROS');
    if(state.healthConnectConnected) connectedNames.push('Health Connect');
    devicesSummaryEl.textContent = connectedNames.length ? connectedNames.join(', ') : t('perfil_devices_none');
  }

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
function openDevicesOverlay(){ openOverlaySheetEl(document.getElementById('devices-overlay')); }
function closeDevicesOverlay(){ document.getElementById('devices-overlay').classList.remove('overlay-open'); }
function openPersonalDataOverlay(){ openOverlaySheetEl(document.getElementById('personal-data-overlay')); }
function closePersonalDataOverlay(){ document.getElementById('personal-data-overlay').classList.remove('overlay-open'); }
function openGoalsOverlay(){ openOverlaySheetEl(document.getElementById('goals-overlay')); }
function closeGoalsOverlay(){ document.getElementById('goals-overlay').classList.remove('overlay-open'); }
function openShoesOverlay(){ openOverlaySheetEl(document.getElementById('shoes-overlay')); }
function closeShoesOverlay(){ document.getElementById('shoes-overlay').classList.remove('overlay-open'); }
function openEventOverlay(){ openOverlaySheetEl(document.getElementById('event-overlay')); }
function closeEventOverlay(){ document.getElementById('event-overlay').classList.remove('overlay-open'); }
// Tema/Unidades/Entrenar por/Avisos de voz consolidados en un solo botón "Preferencias" --
// ver el comentario junto a preferences-overlay en index.html.
function openPreferencesOverlay(){ openOverlaySheetEl(document.getElementById('preferences-overlay')); }
function closePreferencesOverlay(){ document.getElementById('preferences-overlay').classList.remove('overlay-open'); }
function openLangOverlay(){ openOverlaySheetEl(document.getElementById('lang-overlay')); }
function closeLangOverlay(){ document.getElementById('lang-overlay').classList.remove('overlay-open'); }
function openDaysOverlay(){ openOverlaySheetEl(document.getElementById('days-overlay')); }
function closeDaysOverlay(){ document.getElementById('days-overlay').classList.remove('overlay-open'); }
function openZonesOverlay(){ openOverlaySheetEl(document.getElementById('zones-overlay')); }
function closeZonesOverlay(){ document.getElementById('zones-overlay').classList.remove('overlay-open'); }
/* ---- Resorte estilo Apple (WWDC 2018, "Designing Fluid Interfaces") ----
   damping 1 = crítico, sin rebote; response = segundos hasta asentarse -- no es una
   duración fija, la física decide cuánto tarda. Se integra cuadro a cuadro (Euler
   semi-implícito) en vez de animar con un CSS transition de duración fija, así se puede
   interrumpir en cualquier instante: si el usuario agarra el sheet de nuevo a mitad de
   un resorte, se cancela y el próximo arranca desde el valor real en pantalla (nunca
   desde el valor lógico final, o saltaría). */
const activeSprings = new WeakMap();
function springTo(el, target, {from, velocity = 0, damping = 1, response = 0.35, onUpdate, onComplete} = {}){
  const prev = activeSprings.get(el);
  if(prev) prev.cancel();
  let pos = from != null ? from : target, vel = velocity;
  const w = 2 * Math.PI / response, dampCoef = 2 * w * damping, stiffness = w * w;
  let raf, cancelled = false;
  const handle = {value: pos, cancel(){ cancelled = true; if(raf) cancelAnimationFrame(raf); activeSprings.delete(el); }};
  function step(){
    if(cancelled) return;
    const dt = 1 / 60;
    vel += (-stiffness * (pos - target) - dampCoef * vel) * dt;
    pos += vel * dt;
    if(Math.abs(pos - target) < 0.5 && Math.abs(vel) < 20){
      handle.value = target; onUpdate(target);
      activeSprings.delete(el);
      if(onComplete) onComplete();
      return;
    }
    handle.value = pos; onUpdate(pos);
    raf = requestAnimationFrame(step);
  }
  activeSprings.set(el, handle);
  raf = requestAnimationFrame(step);
  return handle;
}
// Proyecta hasta dónde llegaría el sheet si se lo soltara y siguiera frenando solo,
// igual que la desaceleración de un scroll nativo -- así un tirón rápido pero corto
// alcanza igual el cierre, en vez de exigir arrastrarlo físicamente hasta el borde.
function projectMomentum(velocity, decel = 0.998){
  return (velocity / 1000) * decel / (1 - decel);
}
function prefersReducedMotion(){
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
/* ---- Overlays "hoja" de Perfil/Logros: arrastrar hacia abajo para cerrar -----
   Antes estos overlays (Datos personales, Objetivos, Zapatillas, Evento, Idioma, Días,
   Zonas, Molestias, Logros) aparecían y desaparecían de un salto y solo se podían cerrar
   tocando la flecha de arriba a la izquierda. Ahora entran/salen con un deslizamiento +
   fade (ver .overlay-sheet en el CSS) y además se pueden cerrar arrastrando hacia abajo,
   como una hoja modal nativa -- con velocidad real: un tirón corto y rápido cierra igual
   que uno largo y lento (ver projectMomentum arriba), y soltar lo entrega a un resorte en
   vez de a un CSS transition de duración fija, así se puede volver a agarrar a mitad de
   camino sin que salte. Pointer Events en vez de solo touch: funciona también con mouse,
   útil para probarlo en desktop. Solo si ya se llegó al tope del scroll interno del
   overlay, para no interferir con el scroll normal de su contenido. Un solo listener
   delegado en document sirve para los nueve overlays: todos comparten la clase
   .overlay-sheet y el mismo criterio de "cerrar" (sacar la clase overlay-open), así que no
   hace falta cablear el gesto overlay por overlay. */
(function wireOverlaySheetSwipe(){
  let dragEl = null, grabStartY = 0, grabStartPos = 0, history = [];
  document.addEventListener('pointerdown', e=>{
    const sheet = e.target.closest('.overlay-sheet.overlay-open');
    if(!sheet || sheet.scrollTop > 0) return;
    const spring = activeSprings.get(sheet);
    grabStartPos = spring ? spring.value : 0;
    if(spring) spring.cancel();
    dragEl = sheet;
    grabStartY = e.clientY;
    history = [{y: e.clientY, t: e.timeStamp}];
    sheet.style.transition = 'none';
    try{ sheet.setPointerCapture(e.pointerId); }catch(err){ /* el navegador ya soltó ese pointer -- el listener en document sigue el gesto igual */ }
  });
  document.addEventListener('pointermove', e=>{
    if(!dragEl) return;
    if(dragEl.scrollTop > 0){ dragEl.style.transition = ''; dragEl.style.transform = ''; dragEl = null; return; }
    const dy = grabStartPos + (e.clientY - grabStartY);
    if(dy <= 0){ dragEl.style.transform = ''; return; }
    dragEl.style.transform = `translateY(${dy}px)`;
    history.push({y: e.clientY, t: e.timeStamp});
    if(history.length > 5) history.shift();
  });
  function endDrag(e){
    if(!dragEl) return;
    const sheet = dragEl; dragEl = null;
    const current = Math.max(0, grabStartPos + (e.clientY - grabStartY));
    let velocity = 0;
    if(history.length >= 2){
      const a = history[0], b = history[history.length - 1], dt = b.t - a.t;
      if(dt > 0) velocity = (b.y - a.y) / dt * 1000;
    }
    const reduced = prefersReducedMotion();
    const projected = current + (reduced ? 0 : projectMomentum(velocity));
    const sheetHeight = sheet.getBoundingClientRect().height || 300;
    if(projected > sheetHeight * 0.35){
      springTo(sheet, sheetHeight + 60, {from: current, velocity, damping: reduced ? 1 : 0.86, response: reduced ? 0.22 : 0.34,
        onUpdate: v => { sheet.style.transform = `translateY(${v}px)`; },
        // sport-picker-overlay es el único de estos nueve overlays cuyo cierre real tiene que
        // aplicar un draft (ver closeSportPicker) -- sacarle la clase a mano como al resto
        // dejaba las selecciones tildadas sin guardar si el usuario cerraba arrastrando en vez
        // de con la flecha o "Listo".
        onComplete: () => { if(sheet.id === 'sport-picker-overlay') closeSportPicker(); else sheet.classList.remove('overlay-open'); sheet.style.transform = ''; sheet.style.transition = ''; }
      });
    } else {
      springTo(sheet, 0, {from: current, velocity, damping: 1, response: reduced ? 0.22 : 0.32,
        onUpdate: v => { sheet.style.transform = v <= 0 ? '' : `translateY(${v}px)`; },
        onComplete: () => { sheet.style.transform = ''; sheet.style.transition = ''; }
      });
    }
  }
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);
})();
// El bloque "Recordá que..." de la sección de Strava era una lista siempre visible --
// ahora arranca colapsada detrás de este botón, para no abrumar la tarjeta de Strava con
// texto largo apenas se entra a Perfil. Nada de esto se persiste: siempre arranca cerrado.
// Antes solo existía para Strava (única marca con un "Recordá que..." con tips propios).
// Ahora Polar/Wahoo/COROS también tienen su versión, más corta y genérica (ver
// perfil_remember_generic_check_app) -- prefix identifica qué lista/chevron tocar.
function toggleRememberList(e, prefix){
  const list = document.getElementById(prefix+'-remember-list');
  const chevron = document.getElementById(prefix+'-remember-chevron');
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
    const { data } = await supabaseClient.from('app_state').select('data, updated_at').eq('user_id', currentUserId).maybeSingle();
    if(data && data.data && Object.keys(data.data).length){
      const incomingRuns = (data.data.runs||[]).length;
      const currentRuns = (state.runs||[]).length;
      if(incomingRuns < currentRuns){
        // el servidor tiene menos carreras que las que ya tenemos acá (por ejemplo, una que se guardó sin
        // conexión y todavía no se sincronizó) -> no pisamos lo que ya tenemos, reintentamos guardarlo
        persist();
      } else if(persistInFlight || persistQueued){
        // Reportado en una auditoría: el único chequeo de esta función era "el servidor
        // tiene MENOS carreras", así que un cambio que no cambia la cantidad (borrar una
        // carrera y agregar otra en el mismo instante, o cualquier edición que no toca
        // state.runs -- perfil, plan, chat) no lo detectaba, y esta función pisaba state
        // con una lectura del servidor más vieja que el guardado que todavía está en
        // vuelo (persist() nunca se espera en varios call sites, ej. deleteRun()). Ahora,
        // si hay un persist() en curso o encolado (persistInFlight/persistQueued, ver más
        // arriba), no tocamos state esta vez -- el próximo refresh (cambiar de pestaña,
        // pull-to-refresh) va a agarrar los datos ya al día, una vez que ese guardado
        // termine.
      } else {
        const prevRunIds = new Set((state.runs||[]).map(r=>String(r.id)));
        state = data.data;
        // Reportado en una auditoría: esto pisaba state con lo que acaba de llegar del servidor
        // pero nunca actualizaba loadedStateVersion -- checkForRemoteConflict() (más arriba en
        // este archivo) compara justo esta variable contra el updated_at real del servidor para
        // decidir si avisar "guardaste desde otro dispositivo". Sin este ajuste, cualquier
        // refresco (cambiar de pestaña Inicio/Historial/Plan, o "Sincronizar ahora") dejaba
        // loadedStateVersion vieja, y el próximo chequeo de conflicto disparaba una falsa alarma
        // -- avisando de un "conflicto" contra datos que ya están al día, incluso sin haber
        // ningún otro dispositivo involucrado (alcanza con que el cron de Strava/Polar/COROS
        // haya tocado app_state de fondo).
        if(data.updated_at) loadedStateVersion = data.updated_at;
        checkShoeWearAlerts();
        checkHrMaxFromRuns();
        // Las carreras que llegan nuevas por la sincronización con Strava también pueden ser récord
        // o cruzar una medalla de Logros (checkAchievementUnlocks ya se llama junto a checkNewPR en
        // closeSummary/saveManualRun/saveEditRun -- faltaba acá, así que sumar km/carreras vía un
        // reloj sincronizado nunca disparaba el festejo/aviso de medalla, aunque Logros sí mostrara
        // el hito correcto al entrar a mirar por su cuenta, igual que pasaba con checkNewPR antes
        // de que este mismo comentario se agregara para esa función).
        const newRuns = (state.runs||[]).filter(r=>!prevRunIds.has(String(r.id)));
        if(newRuns.length){ newRuns.forEach(checkNewPR); checkAchievementUnlocks(); persist(); }
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
// Se mide el ancho REAL de .swipe-action-delete en cada touchstart (ver más abajo) en vez
// de un ancho fijo a mano acá -- así el arrastre siempre coincide exactamente con lo que
// el CSS declaró para ese elemento puntual (96px en zapatillas, 50% del ancho de la
// tarjeta en Historial -- "que el rojo llegue hasta la mitad", pedido del usuario), sin
// tener que mantener sincronizados un número en JS y otro en CSS a mano.
let swipeRevealPx = 96;
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
  const deleteEl = item.querySelector('.swipe-action-delete');
  // Tope de 100px en lo que de verdad se arrastra/revela, aunque .swipe-action-delete sea
  // más ancho (50% de la tarjeta en Historial, a propósito -- ver su CSS): ese ancho extra
  // es fondo que sigue "detrás" del ejercicio sin exponerse entero, no distancia real de
  // arrastre. Pedir que el dedo recorra la mitad de la pantalla para llegar al tacho (y
  // verlo perdido en el medio de una franja roja enorme) era el problema reportado.
  swipeRevealPx = deleteEl ? Math.min(deleteEl.getBoundingClientRect().width, 100) : 96;
  swipeCloseAll(swipeContentEl);
  swipeStartX = e.touches[0].clientX;
  swipeStartY = e.touches[0].clientY;
  swipeDragging = false;
  swipeBaseX = swipeContentEl.classList.contains('swipe-open') ? -swipeRevealPx : 0;
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
  // Antes se permitía arrastrar 12px más allá del ancho del botón (rebote elástico), lo
  // que dejaba ver una tira del fondo oscuro de atrás pasado el rojo -- reportado por el
  // usuario ("se ve algo negro"). Ahora el arrastre nunca pasa del ancho real del botón.
  let x = swipeBaseX + dx;
  x = Math.max(-swipeRevealPx, Math.min(0, x));
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
    if(swipeLastX < -swipeRevealPx/2){
      swipeSetX(el, -swipeRevealPx);
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
// Último window.innerHeight medido con el teclado CERRADO -- de referencia para el chequeo
// de abajo (¿el WebView ya se achicó solo?). OJO: a propósito esto NO se actualiza en cada
// corrida de syncCoachChatLayout() con kbOpen=false -- esta función también se llama desde
// el listener genérico de "resize" (ver más abajo), que en un WebView con resize real puede
// dispararse al toque de que el teclado empieza a abrirse, ANTES de que llegue el evento
// keyboardWillShow del plugin (que es el que recién agrega la clase chat-kb-open). Capturar
// acá adentro alcanzaba a guardarse el alto YA achicado como si fuera "sin teclado", lo que
// rompía por completo el chequeo de abajo (primera versión de este mismo fix, encontrada
// con el mismo bug todavía presente en un dispositivo real). En cambio, solo se actualiza
// desde los dos lugares que de verdad garantizan "el teclado está confirmado cerrado": una
// vez al cargar (ver el IIFE de más abajo) y en keyboardDidHide (la animación de cierre ya
// terminó del todo).
let nativeFullHeightPx = 0;
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
    // guardamos en nativeKeyboardHeightPx.
    if(!kbOpen){
      viewportH = window.innerHeight;
    } else {
      // Antes esto siempre restaba nativeKeyboardHeightPx de window.innerHeight, asumiendo
      // que ese valor queda "estable" (sin achicarse solo) mientras el teclado está
      // abierto -- cierto en algunos WebView, pero NO en todos: confirmado en un Moto E6
      // Plus real (Android 9) que, en esta versión de la app, window.innerHeight YA baja
      // de ~810 a ~522 con el teclado abierto (un resize de verdad del WebView, no una
      // medida "estable"). Restarle ADEMÁS nativeKeyboardHeightPx (336px en ese caso)
      // encima de un valor que ya venía achicado dejaba un viewportH de apenas 186px --
      // la barra de escribir quedaba apretada pegada abajo del header, con un hueco negro
      // enorme entre ella y el teclado, y el chat prácticamente invisible (exactamente el
      // mismo síntoma que el comentario de más abajo describe para Safari/iOS, pero acá
      // en Android nativo). Comparamos contra nativeFullHeightPx (la última medida con el
      // teclado confirmado cerrado) para detectar cuál de los dos comportamientos tiene
      // este WebView en este momento, en vez de asumir uno fijo para siempre.
      const alreadyShrunk = nativeFullHeightPx > 0 && (nativeFullHeightPx - window.innerHeight) >= nativeKeyboardHeightPx * 0.5;
      viewportH = alreadyShrunk ? window.innerHeight : window.innerHeight - nativeKeyboardHeightPx;
    }
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
    //
    // Captura inicial de nativeFullHeightPx -- en este punto el teclado todavía no se tocó
    // nunca, así que window.innerHeight es, con seguridad, la medida real sin teclado.
    nativeFullHeightPx = window.innerHeight;
    nativeKeyboard.addListener('keyboardWillShow', (info) => {
      nativeKeyboardHeightPx = (info && typeof info.keyboardHeight === 'number') ? info.keyboardHeight : 0;
      openKeyboardUI();
      syncCoachChatLayout();
      // #coachChatWrap es flex-column con #chatLog como único hijo flex:1 -- al abrir el
      // teclado, wrap.style.height (seteado arriba, en syncCoachChatLayout) se achica y por
      // lo tanto #chatLog también, pero su scrollTop (un valor absoluto en px) se queda
      // como estaba. Si el chat ya estaba pegado al fondo (el caso normal: leíste el último
      // mensaje y tocás para escribir), ese mismo scrollTop deja de llegar al fondo del
      // #chatLog más chico -- el último mensaje queda tapado arriba, exactamente lo que
      // reportó el usuario ("no se va para arriba, se queda donde está"). Mismo mecanismo
      // que reapplyDuringAnimation ya usa para la versión web/iOS más abajo.
      scrollChatToBottom();
    });
    nativeKeyboard.addListener('keyboardDidShow', (info) => {
      nativeKeyboardHeightPx = (info && typeof info.keyboardHeight === 'number') ? info.keyboardHeight : nativeKeyboardHeightPx;
      syncCoachChatLayout();
      scrollChatToBottom();
    });
    nativeKeyboard.addListener('keyboardWillHide', () => {
      closeKeyboardUI();
      nativeKeyboardHeightPx = 0;
      syncCoachChatLayout();
    });
    nativeKeyboard.addListener('keyboardDidHide', () => {
      nativeKeyboardHeightPx = 0;
      // Acá sí es seguro recapturar nativeFullHeightPx -- la animación de cierre ya terminó
      // del todo (a diferencia de keyboardWillHide, que recién empieza a cerrarse), así que
      // window.innerHeight ya volvió a su valor real sin teclado. También cubre sola un
      // cambio real de tamaño de pantalla (rotación, modo split-screen) entre una apertura
      // de teclado y la siguiente.
      nativeFullHeightPx = window.innerHeight;
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
let appUpdateFound = false;
async function checkForAppUpdate(){
  // Adentro del wrapper nativo no hay nada que "detectar" -- app.js viene empaquetado
  // en el binario y las actualizaciones llegan por la tienda, no recargando la página.
  if(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return false;
  // appUpdateChecking se suelta en el finally de ABAJO, que corre antes de que el
  // setTimeout de 700ms (más abajo) llegue a navegar de verdad -- si la pestaña vuelve a
  // estar visible en esa ventana (un swipe rápido en el selector de apps del celular
  // alcanza para eso), este chequeo podía reentrar, volver a encontrar la MISMA versión
  // nueva, y disparar el toast/haptic y un segundo timer de recarga de nuevo. appUpdateFound
  // es la bandera que sigue en pie durante toda esa ventana (no solo mientras el fetch está
  // en vuelo), para no repetir el aviso de algo que ya se está por recargar solo.
  if(appUpdateChecking || appUpdateFound) return false;
  appUpdateChecking = true;
  try{
    /* Pide solo los primeros bytes de app.js (Range) en vez del archivo entero (498KB,
       ~156KB comprimido) -- esto se dispara cada vez que la pestaña/app vuelve a estar
       visible (ver visibilitychange más abajo) y en el celular eso pasa muy seguido
       (cada desbloqueo, cada vuelta de otra app), así que pedir el archivo completo cada
       vez tira datos del celular a la basura solo para leer una constante. APP_VERSION
       tiene que seguir siendo literalmente la primera línea del archivo para que este
       Range chico alcance a incluirla (ver el comentario junto a la constante). Si el
       hosting no respeta Range, cae solo al comportamiento de siempre (200 con el
       archivo completo) sin romper nada. */
    const res = await fetch('/app.js?_v=' + Date.now(), { cache:'no-store', headers:{'Range':'bytes=0-200'} });
    if(!res.ok) return false;
    const text = await res.text();
    const m = text.match(/const APP_VERSION\s*=\s*'([^']+)'/);
    if(m && m[1] && m[1] !== APP_VERSION){
      appUpdateFound = true;
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
  // Antes SOLO se chequeaba al volver a la app (visibilitychange) o al hacer
  // pull-to-refresh a mano -- alguien que la deja abierta en primer plano sin cambiar
  // nunca de pestaña/app (el caso reportado: "no se me actualiza sola") nunca disparaba
  // ninguno de los dos. Este intervalo cubre justo ese caso, sin ser agresivo (10 min,
  // y solo corre mientras la pestaña está visible -- no tiene sentido gastar red de
  // fondo revisando una pantalla que nadie está mirando).
  setInterval(()=>{
    if(document.visibilityState === 'visible') checkForAppUpdate();
  }, 10*60*1000);
}
async function doPullRefresh(){
  const indicator = document.getElementById('pull-refresh-indicator');
  if(indicator) indicator.style.display = 'flex';
  const updating = await checkForAppUpdate();
  if(updating) return;
  await refreshStateFromServer();
  autoSkipPastDays();
  repairSkippedDaysWithMatchingRuns();
  autoClearPastEvent();
  renderAll(); renderHistory();
  if(indicator) setTimeout(()=>{ indicator.style.display='none'; }, 500);
  setTimeout(checkPendingRating, 400);
}
// El botón flotante del coach se esconde en dos casos: parado sobre su propia vista (v==='coach',
// taparía el chat) o en medio de un ejercicio (pedido del usuario: "cuando estemos en un
// ejercicio que no se vea el personaje del chat") -- NO mientras está en runIdle (la pantalla
// de "Comenzar a correr" antes de arrancar), solo mientras #runActive ya está en pantalla
// (corriendo o pausado, isTrackingActive() no importa acá porque las dos cuentan como "estar
// en un ejercicio"). Se llama desde showView() (cambiar de pestaña) y también desde
// actuallyStartRun()/showRunSummaryUI() directamente, porque arrancar o terminar una carrera
// no siempre pasa por showView() -- el corredor se queda en la misma pestaña "Correr" todo el
// tiempo en el caso normal.
function updateCoachFabVisibility(){
  // view-coach.active (no un .nav-btn) porque el chat se abre también desde el FAB mismo
  // (openCoachWithWink()) y otros atajos sin pasar por un tab propio en la tabbar -- esta
  // vista es la única fuente de verdad confiable sobre si estamos ahí en este momento.
  const inCoach = document.getElementById('view-coach').classList.contains('active');
  // !== 'none' (no === 'block'/'flex') -- actuallyStartRun() pone 'flex' (columna flex, ver
  // CSS), no 'block'; comparar contra un valor exacto de display es frágil, esto no depende
  // de cuál sea.
  const inExercise = document.getElementById('runActive').style.display !== 'none' && document.getElementById('runActive').style.display !== '';
  document.getElementById('coach-fab-wrap').style.display = (inCoach || inExercise) ? 'none' : 'block';
}
// Ver el comentario junto a .coach-fab-scrolling en el CSS: el personaje se achica y
// atenúa mientras la página se mueve, y vuelve a su tamaño normal 300ms después del
// último evento de scroll (no instantáneo, para no parpadear entre scrolleos cortos
// seguidos).
(function(){
  const fabWrap = document.getElementById('coach-fab-wrap');
  if(!fabWrap) return;
  let scrollEndTimer = null;
  window.addEventListener('scroll', ()=>{
    fabWrap.classList.add('coach-fab-scrolling');
    clearTimeout(scrollEndTimer);
    scrollEndTimer = setTimeout(()=>fabWrap.classList.remove('coach-fab-scrolling'), 300);
  }, {passive:true});
})();
async function showView(v){
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
  document.getElementById('view-'+v).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.view===v));
  updateCoachFabVisibility();
  document.getElementById('chatBar').classList.toggle('active', v==='coach');
  (document.scrollingElement || document.documentElement).scrollTop = 0;
  // syncAppMinHeight() acá también: #view-coach es la única vista sin contenido real
  // en el flujo (ver el comentario largo junto a syncAppMinHeight) -- si --app-min-h
  // quedó corta por cualquier motivo, es justo ENTRAR a esta vista el momento en que
  // eso se nota (barra gris debajo de la tabbar). Volver a medir acá autocorrige el
  // caso aunque los reintentos de la carga inicial no hayan alcanzado.
  // checkWeekRollover() acá (además de enterApp()/visibilitychange, ver esos comentarios):
  // si la app queda ABIERTA Y EN PRIMER PLANO cruzando la medianoche del domingo al lunes
  // (sin que el usuario cambie de pestaña ni la minimice -- típico en desktop/tablet), ni
  // enterApp() ni el listener de visibilitychange vuelven a correr, así que state.plan/
  // state.weekStart se quedan pegados a la semana vieja. Sin este chequeo, abrir el chat en
  // ese estado y pedirle al coach algo sobre "hoy" hacía que buildContext() (más abajo, en
  // sendChat()) describiera el día de HOY apuntando al casillero de un array que en realidad
  // sigue siendo el de la semana pasada -- y una herramienta como cancelar_sesion/
  // modificar_sesion terminaba mutando esa semana vieja en vez de la real, mostrando "listo"
  // por un cambio que después se pierde en silencio en el próximo rollover real. Reportado en
  // una auditoría de punta a punta.
  if(v==='coach') checkWeekRollover();
  if(v==='coach'){ syncAppMinHeight(); syncCoachChatLayout(); scrollChatToBottom(); state.lastSeenChatTs = Date.now(); persist(); updateChatBadge(); } else { updateChatScrollBtn(); }
  // Renderizamos primero con lo que ya está guardado en el celular (renderHome/renderPlan/
  // renderHistory tardan ~5ms, medido en un dispositivo real) y recién DESPUÉS salimos a
  // buscar la versión del servidor -- no lo pedimos y ESPERAMOS antes de mostrar nada. El
  // pedido a Supabase en sí tarda ~650-800ms en una red hogareña normal (a veces mucho
  // más), y antes bloqueaba el cambio de pestaña entero: tocar Inicio/Plan/Historial se
  // sentía "trabado" aunque la app en sí no tuviera nada lento que hacer, medido en un
  // Moto E6 Plus real. refreshStateFromServer() se sigue llamando siempre igual (con sus
  // efectos de fondo -- alertas de zapatillas, FCmax, PRs nuevos -- que no dependen de qué
  // pantalla esté mirando el corredor), solo que ya no bloquea el primer pintado; si la
  // respuesta trae algo distinto, volvemos a renderizar en cuanto llega -- pero solo si el
  // corredor sigue en esa misma pestaña (si ya se fue a otra, no tiene sentido pisarle la
  // pantalla que está mirando ahora con datos de la que dejó).
  if(v==='inicio'){
    renderHome(); renderPlan();
    refreshStateFromServer().then(()=>{ if(document.getElementById('view-inicio').classList.contains('active')){ renderHome(); renderPlan(); } });
  }
  if(v==='history'){
    renderHistory();
    refreshStateFromServer().then(()=>{ if(document.getElementById('view-history').classList.contains('active')){ renderHistory(); } });
  }
  if(v==='plan'){
    viewingWeekOffset = 0; renderPlan();
    refreshStateFromServer().then(()=>{ if(document.getElementById('view-plan').classList.contains('active')){ renderPlan(); } });
  }
  if(v==='perfil'){ renderPerfilDays(); renderPerfilCrossTraining(); updatePushStatusDisplay(); updateStravaStatusDisplay(); updatePolarStatusDisplay(); updateWahooStatusDisplay(); updateCorosStatusDisplay(); updateHealthConnectStatusDisplay(); }
  if(v==='correr'){ renderRunTodayCard(); renderRunModeChoice(); initIdleMap(); }
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
  // Cambiar el terreno cambia el umbral de desgaste (600/500/400 km) -- sin este chequeo,
  // una zapatilla que cruza el 80% solo por el cambio de terreno (sin correr un km más)
  // se queda con la barra en rojo pero sin haber disparado nunca el aviso de reemplazo.
  checkShoeWearAlerts();
  renderPerfil(); persist();
}
async function deleteShoe(id){
  if(!(await showConfirm(t('confirm_delete'), {danger:true, confirmText:t('delete_word')}))) return;
  state.shoes = state.shoes.filter(s=>s.id!==id);
  // Las carreras que tenían esta zapatilla asignada se quedaban con un shoeId colgado,
  // apuntando a una zapatilla que ya no existe -- el detalle de la carrera lo mostraba bien
  // igual ("sin registrar", el render ya hace shoe?escapeHtml(shoe.name):t('hist_no_shoe')),
  // pero el dato de fondo seguía siendo un id inválido para siempre, hasta que alguien
  // volviera a editar esa carrera puntual a mano. Lo limpiamos acá, mismo criterio que ya usa
  // deleteRun() para desvincular el día del plan cuando borra la carrera correspondiente --
  // borrar algo también limpia lo que quedaba apuntándole.
  state.runs.forEach(r=>{ if(String(r.shoeId)===String(id)) r.shoeId = null; });
  renderPerfil(); renderHistory(); persist();
}
function checkShoeWearAlerts(){
  (state.shoes||[]).forEach(s=>{
    const threshold = s.terrain==='trail'?400:s.terrain==='mixto'?500:600;
    const pct = (s.km/threshold)*100;
    if(pct>80 && !s.wearAlerted){
      s.wearAlerted = true;
      haptic(20);
      showToast(t('shoe_wear_alert_msg', {name:s.name}), 'error');
      // Mismo gesto que dormir mal o cargar una molestia -- "algo para tomarse con calma",
      // no un festejo ni un error grave. wearAlerted ya garantiza que esto dispare una sola
      // vez por par de zapatillas (se resetea solo si el km vuelve a bajar del umbral).
      setMascotColor('bad', {duration:5000});
      setMascotExpression('concerned', {priority:1, duration:5000});
      // Mensaje enlatado en el chat (mismo mecanismo que checkNewPR/el "che, tanto tiempo" de
      // checkWeekRollover), no el de simular que el corredor escribió algo (eso lo usan
      // savePainLog/logReadiness porque ahí sí hace falta un consejo personalizado de la IA;
      // acá alcanza con el aviso, no hay nada que la IA tenga que analizar caso por caso).
      // persist() sin await a propósito -- checkShoeWearAlerts() se llama desde muchos
      // lugares del archivo, sync y async, y no todos guardan el estado enseguida después.
      state.chat.push({role:'coach', text: t('coach_shoe_wear_msg', {name:s.name}), ts:Date.now()});
      renderChat();
      persist();
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
     220 evita que un pico raro de sensor (glitch del reloj) rompa las zonas.
     Exigimos además que el pico se alcance en al menos 2 carreras (no necesariamente
     consecutivas) antes de adoptarlo -- antes bastaba UN solo run con un pico espurio
     (glitch del sensor óptico de muñeca, correa floja) para fijar una FC máxima falsa para
     siempre, descalibrando las zonas de entrenamiento hasta que el corredor lo notara y lo
     corrigiera a mano. Tomar el 2do valor más alto entre todos los runs (en vez del máximo
     histórico) exige que al menos dos carreras hayan llegado a esa marca o más. */
  // Si el corredor cargó sus zonas a mano (saveCustomZones, ver hrZonesCustom) -- por
  // ejemplo, de un test de lactato, no de una fórmula sobre un hrMax -- no las pisamos con
  // computeZones(observedMax) solo porque un par de carreras superaron el hrMax guardado:
  // esas zonas custom fueron a propósito, y "más FC máxima" no dice nada de si siguen
  // siendo las zonas correctas para esta persona.
  if(state.profile.hrZonesCustom) return;
  const observedMax = (state.runs||[]).map(r=>r.maxHr).filter(v=>typeof v==='number' && v<=220).sort((a,b)=>b-a)[1];
  if(observedMax && observedMax > (state.profile.hrMax||0)){
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
  const distanceKm = parseDistInput(document.getElementById('ev-distance').value);
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
// 12 m/s (~43km/h) está muy por encima de lo que corre cualquier persona real (más rápido
// que el récord mundial de 100m de Bolt sostenido) -- de sobra para nunca rechazar una
// bajada empinada o un sprint final real, pero suficiente para descartar el "salto" clásico
// de un fix de GPS ruidoso (multipath entre edificios altos, rebote después de un túnel/
// arboleda) que onPosition() aceptaba igual porque su accuracy reportada (<=50m) pasaba el
// único filtro que existía. speedMps ya se calculaba para la auto-pausa -- este es el mismo
// número, solo que ahora también se usa para decidir si ese paso es creíble.
const MAX_PLAUSIBLE_SPEED_MPS = 12;
function isImplausibleRunSpeed(speedMps){
  return speedMps!=null && speedMps > MAX_PLAUSIBLE_SPEED_MPS;
}
function isTrackingActive(){ return tracker.running && !tracker.autoPaused; }
// Mutear sin salir de la pantalla de Correr -- pedido del usuario ("agrega un boton de
// mutear por si la persona no quiere escuchar"). Comparte state.voiceEnabled con el toggle
// de Perfil > Voz (ver el listener de #voice-toggle más arriba en este archivo) en vez de
// tener su propio flag aparte -- cambiarlo acá también deja a Perfil al día, y viceversa.
function toggleRunVoice(){
  state.voiceEnabled = state.voiceEnabled===false;
  persist();
  updateRunMuteBtn();
  const voiceToggle = document.getElementById('voice-toggle');
  if(voiceToggle) [...voiceToggle.children].forEach(c=>c.classList.toggle('active', c.dataset.v === (state.voiceEnabled===false ? 'off' : 'on')));
}
function updateRunMuteBtn(){
  const btn = document.getElementById('run-mute-btn');
  if(!btn) return;
  const muted = state.voiceEnabled===false;
  btn.innerHTML = muted ? ICONS.speakerMute : ICONS.speaker;
  btn.setAttribute('aria-label', t(muted ? 'run_unmute' : 'run_mute'));
  btn.classList.toggle('muted', muted);
}
function updateRecordingLabel(){
  const dot = document.getElementById('run-rec-dot');
  const label = document.getElementById('run-recording-label');
  // is-paused maneja el cambio de fondo lima<->carbón de toda la pantalla de carrera en
  // vivo (ver #runActive en index.html) -- corre acá, no solo en togglePause(), porque
  // updateRecordingLabel() es el único punto en común que YA se llama tanto en una pausa
  // manual como en la auto-pausa por quietud (ver onPosition()), y el color tiene que
  // reaccionar a las dos, no solo a tocar el botón.
  const runActiveEl = document.getElementById('runActive');
  const wasPaused = runActiveEl && runActiveEl.classList.contains('is-paused');
  const nowPaused = !isTrackingActive();
  if(runActiveEl) runActiveEl.classList.toggle('is-paused', nowPaused);
  // El mapa vive en .track-paused-group (ver index.html), escondido con display:none
  // mientras se corre de verdad -- Leaflet lo inicializa en initLiveMap() con ese
  // contenedor todavía en 0x0 (una carrera recién arrancada siempre empieza activa, no
  // pausada), así que se queda con los tiles mal calculados/en blanco hasta que alguien le
  // avise que el contenedor cambió de tamaño. invalidateSize() recién sirve de algo DESPUÉS
  // de que el contenedor ya es visible -- por eso se dispara acá, justo al entrar a pausado
  // (no en cada llamada), con un frame de margen para que el display:none->flex ya haya
  // aplicado. Mismo patrón que ya usan detailMap/idleMap más abajo en este archivo.
  if(nowPaused && !wasPaused && liveMap){
    requestAnimationFrame(()=>{ if(liveMap) liveMap.invalidateSize(); });
  }
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
// true mientras el mapa en vivo sigue solo la posición del corredor. Se apaga apenas el
// corredor arrastra el mapa a mano (para mirar algo alrededor) -- sin esto, cada punto GPS
// nuevo (varias veces por minuto) llamaba a setView() sin importar nada, y el mapa volvía
// solo a la posición actual apenas el dedo se despegaba de la pantalla, deshaciendo
// cualquier intento de mirar otra parte del mapa mientras corre.
let liveMapFollowing = true;
// Ventana chica para distinguir un setView() NUESTRO (updateLiveMap/recenterMap) de un
// zoom/arrastre real del corredor -- dragstart/zoomstart de Leaflet no traen esa
// información, así que marcamos el instante justo antes de cada setView propio y, si el
// evento llega dentro de esta ventana, lo ignoramos.
let liveMapProgrammaticMoveAt = 0;
let wakeLockSentinel = null;

async function requestWakeLock(){ try{ if('wakeLock' in navigator) wakeLockSentinel = await navigator.wakeLock.request('screen'); }catch(e){} }
async function releaseWakeLock(){ try{ if(wakeLockSentinel){ await wakeLockSentinel.release(); wakeLockSentinel=null; } }catch(e){} }
document.addEventListener('visibilitychange', async ()=>{ if(document.visibilityState==='visible' && tracker.running && !wakeLockSentinel) await requestWakeLock(); });

/* ---- guardado automático de la carrera en curso ----
   Si el navegador se cierra solo (poca batería, la app se va a segundo plano
   y el sistema mata la pestaña, etc.) mientras estás corriendo, esto permite
   recuperar lo ya recorrido en vez de perder el entrenamiento entero. Se
   guarda en el almacenamiento local del teléfono, no en el servidor. */
// Con clave global (sin el usuario en el nombre, como quedó al principio) esto se
// prestaba a un problema serio en un dispositivo compartido: si la Cuenta A cierra la
// app a la fuerza a mitad de una carrera y después cierra sesión (logout() no la
// borraba), la Cuenta B podía "recuperar" esa carrera al abrir Correr y seguir grabando
// GPS/FC encima del entrenamiento de otra persona. Mismo criterio que pendingBackupKey()
// más arriba: la clave incluye el user_id.
function runProgressKey(){ return currentUserId ? ('zancada_run_in_progress_'+currentUserId) : null; }
function saveRunProgress(finished){
  if(!tracker || !tracker.startedAt) return;
  const key = runProgressKey();
  if(!key) return;
  try{
    localStorage.setItem(key, JSON.stringify({
      startedAt: tracker.startedAt,
      points: tracker.points,
      distanceKm: tracker.distanceKm,
      hrLog: tracker.hrLog,
      lastAnnouncedKm: tracker.lastAnnouncedKm,
      elapsedSec: tracker.elapsedSec,
      // running: togglePause() llama a saveRunProgress() justo al pausar (ver su comentario)
      // para poder recuperar el progreso lo más cerca posible del momento real de la pausa --
      // pero sin guardar ESTE campo, actuallyStartRun() no tenía forma de saber que la carrera
      // estaba pausada al cerrarse la app, y la recuperaba siempre como si estuviera corriendo.
      running: !!tracker.running,
      // autoPaused: sin esto, cerrar la app mientras la auto-pausa por quietud estaba activa
      // (semáforo, agua) y reabrirla la recuperaba como si estuviera corriendo de verdad --
      // isTrackingActive() (running && !autoPaused) volvía a dar true de golpe, así que el
      // timer sumaba elapsedSec real durante los primeros ~10s+ que tarda en detectar de
      // nuevo la quietud (AUTO_PAUSE_HOLD_MS), inflando el tiempo total de esa carrera con
      // tiempo parado.
      autoPaused: !!tracker.autoPaused,
      finished: !!finished
    }));
  }catch(e){}
}
function clearRunProgress(){ const key = runProgressKey(); if(!key) return; try{ localStorage.removeItem(key); }catch(e){} }
function readRunProgress(){
  const key = runProgressKey();
  if(!key) return null;
  try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }catch(e){ return null; }
}
// Caché de la mejor voz nativa encontrada por idioma -- getSupportedVoices() devuelve TODAS
// las voces instaladas (120+ entre todos los idiomas), así que esto evita pedirla de nuevo
// antes de cada aviso; una vez resuelta para un idioma, se reusa siempre.
let bestVoiceIndexCache = {};
// Preferimos una voz de RED (localService:false) sobre las "embedded" (local, siempre
// instaladas, pero notoriamente más robóticas) -- reportado por un usuario: "la voz es muy
// robotica, hacela mas humana". El motor de Google en Android instala VARIAS voces de red
// en español, no una sola (confirmado en un dispositivo real: 7 distintas entre es-ES/es-US,
// cada una con su propio timbre) -- se le hicieron escuchar las 7 al usuario una por una y
// "es-us-x-esd-network" fue la que eligió como la más natural, así que esa es la preferida
// de verdad cuando está disponible (no es solo "cualquier voz de red"). Si el dispositivo no
// la tiene instalada (otro Android, otra versión), cae a cualquier voz de red del idioma
// exacto, y si tampoco hay (no existe ninguna "es-AR" en ningún Android visto, caen todas a
// es-ES/es-US) probamos el prefijo del idioma nomás, y como último recurso cualquier voz
// instalada para ese idioma. Si de verdad no hay red en el momento de hablar (corriendo
// afuera, sin señal), el motor nativo mismo ya trae su propio fallback a la voz embedded --
// no hace falta manejar ese caso acá.
async function getBestVoiceIndex(targetLang){
  if(targetLang in bestVoiceIndexCache) return bestVoiceIndexCache[targetLang];
  let idx = null;
  try{
    const {voices} = await window.Capacitor.Plugins.TextToSpeech.getSupportedVoices();
    let found = voices.findIndex(v => v.voiceURI==='es-us-x-esd-network');
    if(found<0) found = voices.findIndex(v => v.lang===targetLang && v.localService===false);
    if(found<0) found = voices.findIndex(v => v.lang.slice(0,2)===targetLang.slice(0,2) && v.localService===false);
    if(found<0) found = voices.findIndex(v => v.lang===targetLang);
    idx = found>=0 ? found : null;
  }catch(e){ idx = null; }
  bestVoiceIndexCache[targetLang] = idx;
  return idx;
}
// El WebView nativo de Android NO implementa window.speechSynthesis (es una limitación
// conocida del WebView del sistema, a diferencia de Chrome de escritorio) -- hasta este
// cambio, CUALQUIER aviso de voz (éste, los de km, los de fase de series/cuestas/fartlek)
// hacía if(!('speechSynthesis' in window)) return directo y nunca sonaba nada en el celular
// real, aunque en una prueba de escritorio pareciera andar. Reportado por un usuario: "cuando
// pongo comenzar no escucho una voz". @capacitor-community/text-to-speech (agregado en este
// mismo cambio) usa el motor de TTS real de Android/iOS -- se prueba primero (plataforma
// nativa + el plugin registrado), y si no está (web/PWA/escritorio) cae al
// speechSynthesis de siempre, que ahí sí funciona.
function speak(text){
  if(state.voiceEnabled===false) return;
  const isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  const nativeTTS = isNative && window.Capacitor.Plugins && window.Capacitor.Plugins.TextToSpeech;
  if(nativeTTS){
    const targetLang = LOCALE_MAP[lang];
    getBestVoiceIndex(targetLang).then(voiceIdx => {
      const opts = {text, lang: targetLang, rate: 0.95};
      if(voiceIdx!=null) opts.voice = voiceIdx;
      nativeTTS.speak(opts).catch(()=>{});
    });
    return;
  }
  if(!('speechSynthesis' in window)) return;
  try{ const u = new SpeechSynthesisUtterance(text); u.lang = LOCALE_MAP[lang]; window.speechSynthesis.speak(u); }catch(e){}
}
function maybeAnnounceKm(){
  // Antes esto anunciaba siempre en km ("Kilómetro 1... Kilómetro 2...") y el ritmo en
  // min/km, sin importar si el corredor eligió sistema imperial -- mientras que el resto de
  // esta misma pantalla (track-dist, track-pace) sí se convierte a millas con fmtDist/fmtPace.
  // Ahora el anuncio por voz respeta la misma unidad que ya se ve en pantalla.
  const currentUnit = Math.floor(isImperial() ? tracker.distanceKm*MI_PER_KM : tracker.distanceKm);
  if(currentUnit>0 && currentUnit>tracker.lastAnnouncedKm){
    // Un solo fix de GPS puede sumar de golpe más de 1 unidad (ver onPosition: un fix con
    // accuracy>50 -- típico después de un túnel, un bosque denso, o edificios altos -- se
    // descarta entero, así que el siguiente fix bueno mide la distancia contra el último punto
    // ACEPTADO, no el anterior). Antes esto solo anunciaba el número final (currentUnit) y
    // marcaba lastAnnouncedKm de un salto -- si la distancia pasó de 2.94km a 4.15km en un
    // solo fix, el corredor escuchaba "kilómetro 4" y el "kilómetro 3" desaparecía para
    // siempre, sin ningún aviso. Recorremos cada unidad saltada -- speechSynthesis encola los
    // anuncios en vez de superponerlos, así que se escuchan en orden, uno atrás del otro.
    const paceMin = (tracker.elapsedSec/60)/tracker.distanceKm;
    for(let km=tracker.lastAnnouncedKm+1; km<=currentUnit; km++){
      speak(t(isImperial() ? 'voice_mi' : 'voice_km', {km, pace:fmtPace(paceMin)}));
    }
    tracker.lastAnnouncedKm = currentUnit;
    // Antes cada km se anunciaba solo por voz -- sin nada en pantalla, es el momento más
    // repetido de toda la carrera (varias veces por sesión) y no tenía ningún refuerzo para
    // quien corre con el volumen bajo o mira el teléfono en vez de escuchar.
    haptic(20);
    const distEl = document.getElementById('track-dist');
    if(distEl){
      distEl.classList.remove('km-pulse'); void distEl.offsetWidth; // reinicia la animación si dos km caen muy seguidos
      distEl.classList.add('km-pulse');
    }
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
  if(!today || today.typeKey==='rest') return null;
  if(today.interval){
    // Si el corredor entrena "por tiempo", las repeticiones (series/cuestas) se completan
    // por tiempo transcurrido (repSec) en vez de por distancia GPS (repMeters) -- ver
    // tickWorkoutGuide() y renderWorkoutGuide(). En modo distancia repSec queda undefined
    // y el comportamiento es exactamente el de siempre.
    const repSec = isTimeMode() ? repDurationSec(today.interval.repMeters) : undefined;
    if(today.typeKey==='intervals') return {typeKey:'intervals', reps:today.interval.reps, repMeters:today.interval.repMeters, repSec, recoveryMin:today.interval.recoveryMin};
    if(today.typeKey==='hills') return {typeKey:'hills', reps:today.interval.reps, repMeters:today.interval.repMeters, repSec};
    // Fartlek se completa siempre por TIEMPO en las dos fases, sea que el corredor entrene por
    // distancia o por tiempo -- a diferencia de series/cuestas, acá no hay una distancia
    // objetivo por tramo (el ritmo del tramo fuerte es "a sensación", ver
    // buildFartlekStructure), así que medirlo con GPS no tendría sentido; el minuto/segundo es
    // el único dato real de la prescripción. Reportado por un usuario: la guía en vivo
    // funcionaba para series y cuestas pero no hacía nada en un día de fartlek.
    if(today.typeKey==='fartlek') return {typeKey:'fartlek', reps:today.interval.reps, workSec:Math.round(today.interval.workMin*60), restSec:Math.round(today.interval.restMin*60), restMin:today.interval.restMin};
  }
  // Sesión sin repeticiones (rodaje suave, tempo, tirada larga, progresivo) -- antes esta
  // función devolvía null acá y la carrera arrancaba sin ninguna guía ni aviso de voz, aunque
  // el plan SÍ tuviera algo puntual para hoy. Pedido del usuario: "que los ejercicios del
  // plan se puedan enviar a correr, y que la voz nos diga qué hacer". 'continuous' no
  // necesita fases/reps -- es un objetivo único que se muestra fijo toda la carrera (ver
  // renderWorkoutGuide()), con un solo aviso de voz al arrancar (announceContinuousWorkoutStart).
  if(today.dist>0 || today.zone) return {typeKey:'continuous', label:planLabelBody(today), targetDist:today.dist, zone:today.zone, planTypeKey:today.typeKey};
  return null;
}
function setupWorkoutGuide(){
  // selectedRunMode (ver selectRunMode() y el selector en #runIdle) -- "correr libre" nunca
  // arma guía ni aviso de voz, aunque hoy el plan tenga algo programado.
  const structure = selectedRunMode==='free' ? null : getTodayWorkoutStructure();
  tracker.workout = structure ? {structure, phase: structure.typeKey==='continuous' ? 'continuous' : 'pending', currentRep:0, phaseStartDistanceKm:0, phaseStartElapsedSec:0} : null;
  renderWorkoutGuide();
  if(structure && structure.typeKey==='continuous') announceContinuousWorkoutStart(structure);
}
function announceContinuousWorkoutStart(s){
  const type = t('type_'+s.planTypeKey);
  const target = isTimeMode()
    ? fmtDurationShort(planDurationMin({dist:s.targetDist})*60)
    : `${fmtDist(s.targetDist)} ${distUnit()}`;
  speak(s.zone ? t('voice_continuous_start_zone', {type, target, zone:s.zone}) : t('voice_continuous_start', {type, target}));
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
// Versión HABLADA de una duración -- distinta de fmtCountdown() (esa da "1:30" para la
// pantalla, que leído en voz alta por un sintetizador suena como "uno dos puntos tres cero"
// en vez de "un minuto treinta"). Pedido del usuario: que el aviso de voz diga el objetivo
// real de la fase ("2da pasada, 200 metros" o el tiempo que corresponda), no solo el número
// de repetición.
function fmtDurationSpoken(sec){
  sec = Math.round(sec);
  const m = Math.floor(sec/60), s = sec%60;
  if(m===0) return t('voice_duration_sec', {sec: s});
  if(s===0) return t('voice_duration_min', {min: m});
  return t('voice_duration_min_sec', {min: m, sec: s});
}
function announceWorkoutPhase(){
  const w = tracker.workout; if(!w) return;
  const s = w.structure;
  // El objetivo real de ESTA fase (metros o tiempo) -- mismo cálculo que ya usa el cartel en
  // pantalla (getWorkoutPhaseTarget(), ver más abajo), así el número que se escucha nunca
  // puede ser distinto del que se ve ("Faltan Xm"/el target grande de la tarjeta).
  const target = getWorkoutPhaseTarget(w);
  const targetSpoken = target.sec!=null ? fmtDurationSpoken(target.sec) : t('voice_target_meters', {meters: target.meters});
  if(w.phase==='effort'){
    // "Repetición" (genérico) sirve igual de bien para series y fartlek -- solo cuestas
    // tiene su propia palabra ("Subida").
    speak(s.typeKey==='hills' ? t('voice_hill_start',{cur:w.currentRep, total:s.reps, target:targetSpoken}) : t('voice_rep_start',{cur:w.currentRep, total:s.reps, target:targetSpoken}));
  } else if(w.phase==='recovery'){
    speak(s.typeKey==='hills' ? t('voice_hill_recovery',{cur:w.currentRep, target:targetSpoken}) : t('voice_rep_recovery',{cur:w.currentRep, target:targetSpoken}));
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
// Único lugar que sabe "cuánto dura esta fase" para series/cuestas/fartlek -- antes
// tickWorkoutGuide() y renderWorkoutGuide() tenían cada uno su propia copia de esta misma
// rama por tipo (intervals/fartlek/hills), con el riesgo real de que se desincronizaran si
// alguien tocaba una sin la otra. Devuelve {sec} o {meters} (nunca los dos), igual que antes
// cada rama elegía entre tiempo y distancia según corresponda.
function getWorkoutPhaseTarget(w){
  const s = w.structure, isEffort = w.phase==='effort';
  if(s.typeKey==='intervals'){
    if(isEffort) return s.repSec!=null ? {sec:s.repSec} : {meters:s.repMeters};
    return {sec: s.recoveryMin*60};
  }
  if(s.typeKey==='fartlek') return {sec: isEffort ? s.workSec : s.restSec}; // ver getTodayWorkoutStructure(): fartlek siempre por tiempo
  // hills: tanto la subida (esfuerzo) como la bajada trotando (recuperación) se miden con
  // la misma distancia repMeters -- salvo en modo "por tiempo", donde ambas fases usan repSec.
  return s.repSec!=null ? {sec:s.repSec} : {meters:s.repMeters};
}
function fmtCountdown(sec){
  sec = Math.max(0, Math.round(sec));
  return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;
}
function tickWorkoutGuide(){
  const w = tracker.workout;
  // 'continuous' (rodaje/tempo/tirada larga/progresivo, ver getTodayWorkoutStructure()) no
  // tiene fases que avanzar -- es un objetivo único mostrado fijo toda la carrera.
  if(!w || w.phase==='pending' || w.phase==='done' || w.phase==='continuous') return;
  const target = getWorkoutPhaseTarget(w);
  const complete = target.sec!=null
    ? (tracker.elapsedSec - w.phaseStartElapsedSec) >= target.sec
    : (tracker.distanceKm - w.phaseStartDistanceKm)*1000 >= target.meters;
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
  const continuousEl = document.getElementById('workout-guide-continuous');
  pendingEl.style.display = w.phase==='pending' ? 'block' : 'none';
  activeEl.style.display = (w.phase==='effort' || w.phase==='recovery') ? 'block' : 'none';
  doneEl.style.display = w.phase==='done' ? 'block' : 'none';
  continuousEl.style.display = w.phase==='continuous' ? 'block' : 'none';
  if(w.phase==='continuous'){
    // Objetivo fijo (tipo + detalle) toda la carrera -- sin barra de progreso ni fases,
    // a diferencia de series/cuestas/fartlek: acá no hay reps que avanzar, es una sola
    // instrucción que el corredor tiene que tener a mano todo el tiempo que dure la sesión.
    document.getElementById('workout-guide-continuous-type').textContent = w.structure.label.type;
    document.getElementById('workout-guide-continuous-desc').textContent = w.structure.label.desc;
  } else if(w.phase==='pending'){
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
    // Objetivo + cuánto falta de ESTA fase, en números -- antes la única referencia era la
    // barra de progreso (un % visual, sin unidad). Pedido del usuario: "que se vea en la
    // pantalla... cuantos metros o tiempo y cuanto queda". target.sec/target.meters viene de
    // getWorkoutPhaseTarget(), el mismo cálculo que ya usa tickWorkoutGuide() para decidir
    // cuándo termina la fase -- así el número que ve el corredor SIEMPRE coincide con el
    // momento real en que la fase avanza, nunca puede desincronizarse.
    const target = getWorkoutPhaseTarget(w);
    let pct, targetLabel, remainingLabel;
    if(target.sec!=null){
      const elapsedInPhase = tracker.elapsedSec - w.phaseStartElapsedSec;
      pct = (elapsedInPhase / target.sec) * 100;
      targetLabel = fmtCountdown(target.sec);
      remainingLabel = fmtCountdown(target.sec - elapsedInPhase);
    } else {
      const progressMeters = (tracker.distanceKm - w.phaseStartDistanceKm) * 1000;
      pct = (progressMeters / target.meters) * 100;
      targetLabel = `${target.meters}m`;
      remainingLabel = `${Math.max(0, Math.round(target.meters - progressMeters))}m`;
    }
    document.getElementById('workout-guide-target').textContent = targetLabel;
    document.getElementById('workout-guide-remaining').textContent = t('run_guide_remaining', {value: remainingLabel});
    document.getElementById('workout-guide-progress-bar').style.transform = `scaleX(${Math.max(0,Math.min(100,pct))/100})`;
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
// Token público de Mapbox (pensado para vivir en el cliente, a diferencia de la clave de
// Anthropic -- restringido en el dashboard de Mapbox a zancada.org/localhost, así que aunque
// cualquiera lo vea en el código no sirve desde otro dominio). Estilo "streets-v12": el
// equivalente de Mapbox al look tipo Google Maps que ya buscaba Voyager, con mejor
// tipografía/detalle. {r} es el mismo mecanismo que ya usaba CartoDB: Leaflet lo reemplaza
// solo por "@2x" en pantallas retina (con detectRetina:true en cada tileLayer de acá abajo)
// o por nada en pantallas normales -- sin esto el mapa se veía pixelado en la mayoría de
// los celulares actuales, que son retina. El mosaico de la cámara dinámica del video de
// carrera (más abajo, MAP_TILE_SIZE/routeTileUrl) queda aparte, en 256px fijo sin retina.
const MAPBOX_TOKEN = 'pk.eyJ1IjoiemFuY2FkYSIsImEiOiJjbXU0cm9sbGEwM2tzMndwczE4emExdzVnIn0.kzrV4ltOY_PjTd_YIuh1vQ';
const MAPBOX_STYLE = 'streets-v12';
const MAPBOX_TILE_URL = `https://api.mapbox.com/styles/v1/mapbox/${MAPBOX_STYLE}/tiles/256/{z}/{x}/{y}{r}?access_token=${MAPBOX_TOKEN}`;
const MAPBOX_ATTRIBUTION = '&copy; <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener">Mapbox</a> &copy; OpenStreetMap contributors';
// Implementación del "Encoded Polyline Algorithm Format" (el mismo que usan Google Maps y
// la API de imágenes estáticas de Mapbox) -- codifica un array de puntos GPS en un string
// compacto para mandarlo en la URL de un pedido de imagen. Sin librería de por medio:
// es un algoritmo chico y bien documentado, no vale la pena traer una dependencia entera
// solo por esto.
// Suaviza el trazado SOLO para dibujarlo (acá y en buildColoredRouteSegments) -- nunca toca
// r.points real, que sigue crudo para distancia/ritmo/splits. Reportado por el usuario: el
// trazado se veía "pixelado" en los giros -- cada fix de GPS conectado con el siguiente por
// una línea recta hace que el ruido típico de GPS urbano (multipath entre edificios altos,
// bajo un puente) se note como un camino de quiebres angulosos en vez de una curva natural,
// más marcado todavía en las esquinas donde el corredor dobla de verdad. Promedio móvil
// simple en lat/lon (cada punto pasa a ser el promedio de sí mismo y sus `radius` vecinos a
// cada lado) -- radius chico (2) a propósito, para parejar el ruido fino sin "cortar camino"
// en una esquina real de 90°. El primer y último punto quedan SIN tocar, así el trazado
// sigue arrancando y terminando exactamente donde arrancó/terminó la carrera de verdad.
// passes=2 (antes un solo pase): pedido por el usuario, "afiná un poco más" el trazado.
// En vez de agrandar el radius de un pase único (eso SÍ corta camino de verdad en una
// esquina de 90°, porque promedia simétrico contra puntos más lejanos del otro lado del
// giro), repetimos el mismo pase chico (radius=2) dos veces -- un desenfoque de caja
// aplicado varias veces se acerca a un desenfoque gaussiano (más suave, sin el "escalón"
// de un box blur de radius grande) conservando mejor la forma real de los giros.
function smoothRouteForDisplay(points, radius, passes){
  radius = radius || 2;
  passes = passes || 2;
  if(points.length < 5) return points;
  let current = points;
  for(let p=0; p<passes; p++){
    const out = new Array(current.length);
    for(let i=0;i<current.length;i++){
      let sumLat=0, sumLon=0, n=0;
      for(let j=Math.max(0,i-radius); j<=Math.min(current.length-1,i+radius); j++){
        sumLat += current[j].lat; sumLon += current[j].lon; n++;
      }
      out[i] = {lat: sumLat/n, lon: sumLon/n};
    }
    current = out;
  }
  current[0] = {lat: points[0].lat, lon: points[0].lon};
  current[current.length-1] = {lat: points[points.length-1].lat, lon: points[points.length-1].lon};
  return current;
}
// Pedido por el usuario tras el suavizado de arriba: "que se vea como los de Strava" --
// Strava no solo despeja el ruido, dibuja una curva de verdad entre los fixes (en vez de
// segmentos rectos). smoothRouteForDisplay() sigue sin tocar la CANTIDAD de puntos (clave
// para que buildColoredRouteSegments pueda cortar tramos por índice, ver su comentario) --
// esta función es el paso aparte que inserta puntos interpolados ENTRE cada par de puntos
// ya desruidados, sobre una spline de Catmull-Rom (pasa exactamente por cada punto real,
// a diferencia de una curva de Bézier que solo se acerca -- no queremos que la curva se
// "despegue" de dónde el GPS dijo que estuvo el corredor). Solo se usa en el mapa
// interactivo del detalle (nunca en las miniaturas estáticas de Historial: ahí multiplicar
// la cantidad de puntos puede pasarse del límite de largo de URL/complejidad de la API de
// Mapbox, y una miniatura de 108px de alto no necesita esta curva para verse bien).
function catmullRomCurve(points, segmentsPerPoint){
  segmentsPerPoint = segmentsPerPoint || 6;
  if(points.length < 3) return points;
  const n = points.length;
  const at = (i) => points[Math.max(0, Math.min(n-1, i))];
  const out = [];
  for(let i=0; i<n-1; i++){
    const p0 = at(i-1), p1 = at(i), p2 = at(i+1), p3 = at(i+2);
    out.push(p1);
    for(let s=1; s<segmentsPerPoint; s++){
      const t = s/segmentsPerPoint, t2 = t*t, t3 = t2*t;
      out.push({
        lat: 0.5*((2*p1.lat) + (-p0.lat+p2.lat)*t + (2*p0.lat-5*p1.lat+4*p2.lat-p3.lat)*t2 + (-p0.lat+3*p1.lat-3*p2.lat+p3.lat)*t3),
        lon: 0.5*((2*p1.lon) + (-p0.lon+p2.lon)*t + (2*p0.lon-5*p1.lon+4*p2.lon-p3.lon)*t2 + (-p0.lon+3*p1.lon-3*p2.lon+p3.lon)*t3),
      });
    }
  }
  out.push(points[n-1]);
  return out;
}
function encodePolylinePoints(points){
  let output = '', prevLat = 0, prevLng = 0;
  const encodeNum = (num) => {
    let sgn = num << 1;
    if(num < 0) sgn = ~sgn;
    let out = '';
    while(sgn >= 0x20){ out += String.fromCharCode((0x20 | (sgn & 0x1f)) + 63); sgn >>= 5; }
    out += String.fromCharCode(sgn + 63);
    return out;
  };
  points.forEach(([lat, lng]) => {
    const lat5 = Math.round(lat * 1e5), lng5 = Math.round(lng * 1e5);
    output += encodeNum(lat5 - prevLat) + encodeNum(lng5 - prevLng);
    prevLat = lat5; prevLng = lng5;
  });
  return output;
}
// Las miniaturas de mapa de la lista de Historial usan una imagen estática de Mapbox (un
// solo <img>) en vez de un mapa de Leaflet interactivo de verdad -- medido en un celular
// real de gama baja con dumpsys gfxinfo: cada mini-mapa interactivo (con su propia capa de
// mosaicos retina pedidos por red, aunque arrastrar/zoom estén deshabilitados) era carísimo
// de mantener vivo, y con 10+ tarjetas en la lista el scroll de Historial quedaba mucho más
// trabado que el resto de la app. Tiene sentido acá porque estos mini-mapas de la lista YA
// estaban configurados sin ninguna interacción (dragging/zoom/etc. todos en false) -- son
// una vista previa nomás, así que no se pierde nada de funcionalidad real. El mapa del
// DETALLE de una carrera puntual (pestaña Ruta, sí interactivo) sigue siendo un Leaflet de
// verdad -- ahí sí hace falta poder explorar el recorrido de verdad, y es UN mapa a la vez,
// no 10+ compitiendo durante el scroll de una lista.
// maxPoints=120: decimado a propósito -- una carrera larga puede traer miles de puntos GPS,
// mucho más detalle del que se nota en una miniatura de 108px de alto, y la URL de la API
// de Mapbox tiene un límite de longitud.
// width/height acá son en píxeles CSS (el tamaño en pantalla de .hist-map, no el tamaño
// real del archivo que hay que pedir) -- multiplicamos por devicePixelRatio adentro. Sin
// esto, en cualquier celular con pantalla de densidad alta (la gran mayoría hoy: probado
// en un Moto E6 Plus real con devicePixelRatio 1.75, donde .hist-map mide 326x108px de
// CSS pero necesita 571x189px de verdad) se pedía la imagen más chica de lo que ocupa en
// pantalla, y el navegador la estira -- exactamente lo que se ve "pixelado/feo" al
// agrandar cualquier imagen de trama más chica que su tamaño de despliegue. Tope en 3x
// (no devicePixelRatio directo) para no pedir un archivo innecesariamente pesado en
// pantallas de densidad rarísima.
function buildHistMapStaticUrl(r, width, height){
  // Suavizado ANTES de muestrear -- muestrear primero y suavizar después perdería la forma
  // real del ruido (ya estaría diezmado) y el promedio móvil terminaría promediando puntos
  // que en el trazado real no eran vecinos directos.
  const pts = smoothRouteForDisplay(r.points);
  const maxPoints = 120;
  const step = pts.length > maxPoints ? pts.length / maxPoints : 1;
  const sampled = [];
  for(let i=0; i<pts.length; i += step) sampled.push(pts[Math.floor(i)]);
  if(sampled[sampled.length-1] !== pts[pts.length-1]) sampled.push(pts[pts.length-1]);
  const encoded = encodeURIComponent(encodePolylinePoints(sampled.map(p=>[p.lat, p.lon])));
  const dpr = Math.min((typeof devicePixelRatio!=='undefined' && devicePixelRatio) || 1, 3);
  const w = Math.min(1280, Math.round(width * dpr)), h = Math.min(1280, Math.round(height * dpr));
  return `https://api.mapbox.com/styles/v1/mapbox/${MAPBOX_STYLE}/static/path-3+0B5D2E-1(${encoded})/auto/${w}x${h}?access_token=${MAPBOX_TOKEN}`;
}
function initLiveMap(){
  if(liveMap){ liveMap.remove(); liveMap=null; }
  liveMap = L.map('liveMap', {zoomControl:false, attributionControl:true}).setView([0,0], 15);
  L.tileLayer(MAPBOX_TILE_URL, {maxZoom:20, detectRetina:true, attribution:MAPBOX_ATTRIBUTION}).addTo(liveMap);
  livePolyline = L.polyline([], {color:'#0B5D2E', weight:5, lineCap:'round', lineJoin:'round'}).addTo(liveMap);
  liveMarker = null; startMarker = null;
  liveMapFollowing = true;
  document.querySelector('.map-recenter-btn')?.classList.remove('visible');
  // dragstart/zoomstart de Leaflet también disparan con nuestros propios setView() de acá
  // abajo (no solo con un gesto real del corredor) -- liveMapProgrammaticMoveAt filtra esos
  // casos. Antes solo escuchaba 'dragstart', así que hacer zoom (pellizcar, doble tap) sin
  // mover el mapa no mostraba el botón de recentrar, y el siguiente punto GPS lo deshacía
  // igual que antes de este arreglo.
  liveMap.on('dragstart zoomstart', ()=>{
    if(Date.now() - liveMapProgrammaticMoveAt < 50) return;
    liveMapFollowing = false;
    document.querySelector('.map-recenter-btn')?.classList.add('visible');
  });
  setTimeout(()=>{ if(liveMap) liveMap.invalidateSize(); }, 250);
}
function updateLiveMap(lat, lon){
  if(!liveMap) return;
  livePolyline.addLatLng([lat,lon]);
  if(!startMarker){
    startMarker = L.circleMarker([lat,lon], {radius:6, color:'#fff', weight:2, fillColor:'#4ADE80', fillOpacity:1}).addTo(liveMap);
  }
  // Antes se destruía y se creaba de nuevo el marcador en cada punto GPS (varias veces
  // por minuto durante toda la carrera) -- moverlo con setLatLng es una operación mucho
  // más liviana y el resultado visual es idéntico.
  if(liveMarker){ liveMarker.setLatLng([lat,lon]); }
  else{ liveMarker = L.circleMarker([lat,lon], {radius:8, color:'#121415', weight:3, fillColor:'#D6FF3F', fillOpacity:1}).addTo(liveMap); }
  if(liveMapFollowing){
    liveMapProgrammaticMoveAt = Date.now();
    liveMap.setView([lat,lon], Math.max(liveMap.getZoom(),16));
  }
}
// Mapa de fondo de la pantalla de Correr ANTES de arrancar a correr -- reemplaza el
// trazado decorativo que había antes por un mapa real (mismos tiles que initLiveMap) con
// un punto en la ubicación actual, estilo Google Maps. A diferencia del mapa en vivo de la
// carrera (que sigue moviéndose todo el tiempo), acá alcanza con una sola lectura de
// posición -- es una vista previa de "dónde estoy", no un tracking continuo -- así que
// getCurrentPosition (más liviano que watchPosition) con maximumAge alto para poder
// reusar una lectura reciente del sistema en vez de forzar un fix de GPS nuevo cada vez
// que se abre la pestaña.
let idleMap = null;
function initIdleMap(){
  const container = document.getElementById('idleMap');
  // Guarda por si esto se llama alguna vez con la carrera ya arrancada (runIdle oculto) --
  // no tiene sentido pedir geolocalización ni armar un mapa que nadie va a ver.
  if(!container || document.getElementById('runIdle').style.display === 'none') return;
  if(idleMap){ idleMap.remove(); idleMap = null; }
  if(!('geolocation' in navigator)) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      // La pestaña pudo haberse cerrado/cambiado mientras esperábamos el fix de GPS.
      if(!document.getElementById('idleMap') || document.getElementById('runIdle').style.display === 'none') return;
      const { latitude, longitude } = pos.coords;
      idleMap = L.map('idleMap', {zoomControl:false, dragging:false, scrollWheelZoom:false, doubleClickZoom:false, touchZoom:false, boxZoom:false, keyboard:false, tap:false, attributionControl:true})
        .setView([latitude, longitude], 16);
      L.tileLayer(MAPBOX_TILE_URL, {maxZoom:20, detectRetina:true, attribution:MAPBOX_ATTRIBUTION}).addTo(idleMap);
      const dotIcon = L.divIcon({
        className: '',
        html: '<div class="idle-map-dot-ring" style="position:absolute; inset:0;"></div><div class="idle-map-dot" style="position:absolute; inset:0; margin:auto;"></div>',
        iconSize: [16,16],
      });
      L.marker([latitude, longitude], {icon: dotIcon, interactive:false}).addTo(idleMap);
      setTimeout(()=>{ if(idleMap) idleMap.invalidateSize(); }, 200);
    },
    () => { /* sin permiso, sin señal, lo que sea -- el mapa se queda vacío (el fondo
              oscuro de .idle-map ya cubre ese caso) en vez de romper la pantalla */ },
    {enableHighAccuracy:true, timeout:8000, maximumAge:30000}
  );
}
function recenterMap(){
  if(!liveMap || !liveMarker) return;
  liveMapFollowing = true;
  document.querySelector('.map-recenter-btn')?.classList.remove('visible');
  liveMapProgrammaticMoveAt = Date.now();
  liveMap.setView(liveMarker.getLatLng(), 17);
}
// En Android/iOS nativos usamos @capacitor-community/background-geolocation para que el GPS
// siga grabando aunque el corredor salga de la app o se le apague la pantalla -- a
// diferencia de navigator.geolocation (la API web de siempre, que seguimos usando tal cual
// en el sitio/PWA), el WebView de Android pausa o corta watchPosition en cuanto deja de estar
// en primer plano. El plugin usa un foreground service con una notificación persistente
// (obligatoria por Android mientras graba en segundo plano) en vez del permiso especial de
// ubicación "todo el tiempo", así que no dispara el formulario extra de permisos sensibles
// de Play Store. Ver mobile/capacitor.config.json (useLegacyBridge, que el propio plugin
// exige para no cortar la grabación a los 5 minutos) y mobile/android/.../strings.xml (color
// del canal de la notificación).
function hasBackgroundGeo(){
  return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform()
    && Capacitor.Plugins && Capacitor.Plugins.BackgroundGeolocation;
}
// El foreground service de arriba necesita mostrar su notificación persistente para poder
// seguir grabando en segundo plano -- pero en Android 13+ (API 33+) mostrar CUALQUIER
// notificación exige el permiso POST_NOTIFICATIONS en tiempo de ejecución, y el plugin de
// tracking NO lo pide solo (su requestPermissions:true de más abajo únicamente cubre
// ubicación). Antes esto solo se pedía si el corredor prendía a mano el toggle de
// recordatorios push en Perfil -- alguien que nunca toca ese toggle (la mayoría, es opt-in)
// arrancaba a correr en un Android 13+ sin que el sistema le preguntara nada, y la
// notificación de "Zancada — Registrando tu carrera" nunca aparecía (el GPS en segundo
// plano seguía andando igual, pero sin ningún aviso visible ni forma fácil de cancelar
// desde la notificación). En Android <13 checkPermissions()/requestPermissions() del
// plugin de push nativo devuelven 'granted' sin preguntar nada (ese permiso ni existe en
// versiones tan viejas), así que esto no le agrega ningún diálogo de más a esos usuarios.
async function ensureTrackingNotifPermission(){
  const nativePush = nativePushPlugin();
  if(!nativePush) return;
  try{
    let status = await nativePush.checkPermissions();
    if(status.receive === 'prompt' || status.receive === 'prompt-with-rationale'){
      await nativePush.requestPermissions();
    }
  }catch(e){ console.error('no se pudo pedir el permiso de notificaciones para el tracking', e); }
}
// Devuelve un "handle" opaco -- nunca el watchId crudo -- porque las dos APIs son de tipos
// incompatibles (un number en la web, un string acá) y stopGeoWatch necesita saber cuál de
// las dos usar para limpiarlo bien.
async function startGeoWatch(onPos, onErr){
  if(hasBackgroundGeo()){
    await ensureTrackingNotifPermission();
    try{
      const id = await Capacitor.Plugins.BackgroundGeolocation.addWatcher(
        {
          // backgroundMessage es lo que le pide al plugin seguir entregando ubicaciones
          // con la app en segundo plano -- sin este campo, solo funciona en primer plano,
          // ni un poco mejor que navigator.geolocation (ver el comentario grande de arriba).
          backgroundTitle: t('run_bg_notif_title'),
          backgroundMessage: t('run_bg_notif_body'),
          requestPermissions: true,
          stale: false,
          // 0 (el default) = nos siguen llegando fixes por tiempo, no por distancia mínima
          // recorrida -- onPosition() ya hace su propio filtrado de precisión/velocidad
          // implausible/auto-pausa por quietud, y esa auto-pausa necesita fixes seguidos
          // incluso parado (distancia ~0) para darse cuenta de que el corredor no se mueve.
          distanceFilter: 0
        },
        (location, error) => {
          if(error){ onErr(error); return; }
          // Adaptamos la forma del location del plugin (plano: latitude/longitude/...) a la
          // misma forma que ya arma navigator.geolocation (anidado bajo .coords) para no
          // tener que tocar nada de onPosition() -- una sola función de procesamiento sirve
          // para las dos fuentes.
          onPos({
            coords: { latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy, altitude: location.altitude },
            timestamp: location.time
          });
        }
      );
      return {native:true, id};
    }catch(e){
      console.error('BackgroundGeolocation.addWatcher falló, seguimos con navigator.geolocation', e);
    }
  }
  if(!navigator.geolocation) return null;
  const id = navigator.geolocation.watchPosition(onPos, onErr, {enableHighAccuracy:true, maximumAge:1000, timeout:15000});
  return {native:false, id};
}
function stopGeoWatch(handle){
  if(!handle || typeof handle !== 'object') return; // typeof 'object' descarta el sentinel string 'pending' de abajo
  if(handle.native){ if(hasBackgroundGeo()) Capacitor.Plugins.BackgroundGeolocation.removeWatcher({id: handle.id}).catch(()=>{}); }
  else navigator.geolocation.clearWatch(handle.id);
}
// Probado en un dispositivo real con el tracking en segundo plano nuevo: mientras la app está
// oculta, Android frena el setInterval que dispara esto (puede tardar minutos en volver a
// disparar, no exactamente cada 1000ms) -- pero el GPS en segundo plano (BackgroundGeolocation)
// SIGUE entregando fixes real durante ese rato. Antes esto sumaba tracker.elapsedSec++ a
// ciegas cada vez que el timer disparaba, asumiendo que siempre pasó exactamente 1 segundo
// real -- con el timer frenado, una carrera con varios minutos en segundo plano terminaba con
// elapsedSec bien por debajo del tiempo real corrido (confirmado en un dispositivo real: ~90s
// en segundo plano sumaron ~11s de elapsedSec), lo que además inflaba el ritmo mostrado (mismos
// km en menos tiempo "oficial" del que en realidad tardaron) y atrasaba tickWorkoutGuide() en
// sesiones con series/cuestas. Ahora medimos el delta real contra el reloj de pared en cada
// disparo (se dispare cuando se dispare) en vez de sumar un "+1" ciego -- cuando el timer se
// pone al día de golpe tras volver de segundo plano, el elapsedSec también se pone al día de
// golpe. Función nombrada aparte (no una closure inline del setInterval) para poder probarla
// sin depender de temporizadores reales en los tests.
function tickRunTimer(){
  const now = Date.now();
  const deltaSec = Math.round((now - tracker.lastTickAt) / 1000);
  tracker.lastTickAt = now;
  if(isTrackingActive() && deltaSec > 0){
    tracker.elapsedSec += deltaSec;
    updateLiveStats(); tickWorkoutGuide();
    if(tracker.elapsedSec - (tracker.lastSavedSec||0) >= 15){ tracker.lastSavedSec = tracker.elapsedSec; saveRunProgress(); }
  }
}
function startRun(){
  // Evita un doble-tap en "Comenzar a correr": actuallyStartRun() más abajo siempre arma un
  // tracker NUEVO y pide un watchPosition nuevo -- el watchId del anterior, que solo vivía en
  // el objeto tracker recién descartado, se perdía sin llamar nunca a clearWatch(). Ese primer
  // watcher seguía disparando onPosition() (que lee SIEMPRE el tracker global vigente) el
  // resto de la sesión (incluso en la carrera SIGUIENTE), duplicando puntos GPS, updateLiveMap()
  // y anuncios de voz por km, y arruinando la cuenta de auto-pausa (dos fixes casi al mismo
  // tiempo dan un dtSec cercano a cero). Esto pasaba justo en la ventana de milisegundos ANTES
  // de que llegara el primer fix de GPS: ahí `saved.points` todavía está en `[]`, así que
  // ninguna de las dos ramas de recuperación de abajo lo detecta, y las dos caen por defecto a
  // actuallyStartRun(null) -- "carrera nueva" otra vez, con un watcher de más ya corriendo.
  if(tracker && tracker.watchId !== null) return;
  if(!navigator.geolocation){ document.getElementById('geo-warning').style.display='block'; document.getElementById('geo-warning').textContent=t('geo_err_support'); return; }
  const saved = readRunProgress();
  // Una carrera ya FINALIZADA (el usuario tocó "Finalizar", ver saveRunProgress(true) en
  // stopRun()) nunca debería descartarse por el paso del tiempo -- no queda tracking en
  // vivo que pueda quedar "viejo", son datos ya cerrados esperando que el usuario confirme
  // el resumen. Reportado en una auditoría: esto antes compartía el límite de 6 horas de
  // abajo (pensado para la recuperación de una carrera INTERRUMPIDA, medido desde que
  // ARRANCÓ, no desde que terminó) -- una carrera larga (maratón, ultra) o simplemente
  // reabrir la app varias horas después de tocar "Finalizar" hacía que nunca se llegara a
  // esta rama, y actuallyStartRun(null) más abajo pisaba en el momento el resumen ya
  // guardado, perdiendo la carrera entera sin ningún aviso.
  // OJO -- a diferencia de la rama de abajo (carrera INTERRUMPIDA, ver su comentario sobre
  // el double-tap), esta NO exige (saved.points||[]).length: una carrera ya finalizada puede
  // legítimamente tener cero puntos de GPS (corrida en cinta, o el celular nunca llegó a
  // conseguir señal) y aun así tener distancia/duración válidas guardadas por
  // saveRunProgress(true) en stopRun() -- exigir puntos acá hacía que ese resumen ya cerrado
  // cayera derecho a actuallyStartRun(null) más abajo, arrancando una carrera nueva vacía y
  // perdiendo la sesión entera (con su tiempo ya corrido) sin ningún aviso, si la app se
  // cerraba antes de que el usuario llegara a confirmar el resumen. Encontrado en una
  // auditoría de punta a punta.
  if(saved && saved.finished){
    restoreTrackerFromSaved(saved);
    showRunSummaryUI();
    return;
  }
  if(saved && saved.startedAt && (Date.now()-saved.startedAt) < 6*3600*1000 && (saved.points||[]).length){
    // hay una carrera sin terminar de hace menos de 6 horas (por ejemplo, la app
    // se cerró sola a mitad de un entrenamiento) -> ofrecemos recuperarla en vez
    // de arrancar una nueva y perder lo ya corrido
    showConfirm(t('run_recover_text'), {confirmText:t('run_recover_confirm'), cancelText:t('run_recover_discard')}).then(resume=>{
      // La cuenta regresiva (ver startRunWithCountdown() más abajo) es solo para un arranque
      // GENUINAMENTE nuevo -- recuperar una carrera ya en curso no es "empezar", es seguir
      // donde quedó, así que esa rama sigue llamando a actuallyStartRun() directo. Si el
      // corredor elige descartar el progreso guardado, ahí sí es un arranque nuevo de verdad.
      if(resume){ actuallyStartRun(saved); } else { clearRunProgress(); startRunWithCountdown(); }
    });
    return;
  }
  startRunWithCountdown();
}
function restoreTrackerFromSaved(saved){
  tracker = {watchId:null, timerId:null, points:saved.points||[], distanceKm:saved.distanceKm||0, elapsedSec:saved.elapsedSec||0, running:false, hrLog:saved.hrLog||[], lastAnnouncedKm:saved.lastAnnouncedKm||0, startedAt:saved.startedAt, autoPaused:false, lastMoveMs:Date.now(), lastFixMs:null};
}
// Cuenta regresiva de 3 segundos antes de arrancar a correr (pedido del usuario: "crea una
// cinemática de 3 segundos cuando comenzamos a correr") -- ver #runCountdown en el CSS/HTML.
// countdownActive evita que un doble-tap en "Comenzar" (la cuenta regresiva deja #runIdle
// escondido, pero por las dudas) apile dos secuencias a la vez. El chequeo de
// view-correr.active al final es defensivo: si el corredor cambia de pestaña a mitad de la
// cuenta regresiva, no arrancamos una carrera de verdad (GPS + timer) en segundo plano sin que
// la vea -- en vez de eso, dejamos #runIdle como estaba.
let countdownActive = false;
function startRunWithCountdown(){
  if(countdownActive) return;
  countdownActive = true;
  document.getElementById('runIdle').style.display = 'none';
  const overlay = document.getElementById('runCountdown');
  const numEl = document.getElementById('countdown-num');
  overlay.style.display = 'flex';
  const steps = ['3','2','1', t('run_countdown_go')];
  let i = 0;
  function showStep(){
    numEl.textContent = steps[i];
    numEl.classList.toggle('go', i === steps.length - 1);
    numEl.classList.remove('pop'); void numEl.offsetWidth; numEl.classList.add('pop');
    i++;
    if(i < steps.length){ setTimeout(showStep, 800); return; }
    setTimeout(()=>{
      overlay.style.display = 'none';
      numEl.classList.remove('go');
      countdownActive = false;
      if(document.getElementById('view-correr').classList.contains('active')){
        actuallyStartRun(null);
      } else {
        document.getElementById('runIdle').style.display = '';
      }
    }, 600);
  }
  showStep();
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
  // running: si la carrera guardada estaba pausada A MANO cuando se cerró la app (togglePause
  // guarda al toque, ver saveRunProgress), recuperarla tenía que respetar esa pausa -- antes
  // se forzaba running:true sin importar nada, así que reabrir la app después de una pausa
  // manual arrancaba a trackear GPS/distancia solo, sin que el corredor tocara nada (el botón
  // encima seguía mostrando "Pausar", escondiendo que en realidad ya estaba corriendo de
  // nuevo). saved.running puede faltar en progreso guardado por una versión vieja de la app,
  // de ahí el default a true (siempre se guardaba corriendo, antes de este cambio).
  const restoredRunning = saved ? (saved.running !== false) : true;
  // autoPaused: mismo criterio que restoredRunning arriba -- si la app se cerró mientras la
  // auto-pausa por quietud estaba activa, recuperarla tiene que respetar eso (si no,
  // isTrackingActive() da true de nuevo apenas se reabre y el timer suma tiempo real hasta
  // que una nueva racha de quietud vuelva a disparar la auto-pausa, ~10s+ después). saved
  // puede faltar este campo por una versión vieja de la app -- default a false, mismo
  // comportamiento que tenía siempre antes de este cambio.
  const restoredAutoPaused = saved ? !!saved.autoPaused : false;
  tracker = saved
    ? {watchId:null, timerId:null, points:saved.points||[], distanceKm:saved.distanceKm||0, elapsedSec:saved.elapsedSec||0, running:restoredRunning, hrLog:saved.hrLog||[], lastAnnouncedKm:saved.lastAnnouncedKm||0, startedAt:saved.startedAt, autoPaused:restoredAutoPaused, lastMoveMs:Date.now(), lastFixMs:null}
    : {watchId:null, timerId:null, points:[], distanceKm:0, elapsedSec:0, running:true, hrLog:[], lastAnnouncedKm:0, startedAt:Date.now(), autoPaused:false, lastMoveMs:Date.now(), lastFixMs:null};
  requestWakeLock();
  document.getElementById('runIdle').style.display='none';
  document.getElementById('runSummary').style.display='none';
  document.getElementById('runActive').style.display='block';
  updateRecordingLabel();
  updateRunMuteBtn();
  // Mientras se corre (o está pausado) el personaje del chat no se ve -- pedido del usuario,
  // ver updateCoachFabVisibility().
  updateCoachFabVisibility();
  initLiveMap();
  updateLiveStats();
  setupWorkoutGuide();
  saveRunProgress();
  // Sentinel string (no null) apenas arranca la carrera: el guard de doble-tap de startRun()
  // (if(tracker && tracker.watchId !== null) return;) tiene que ver ALGO no-null desde este
  // mismo instante sincrónico -- startGeoWatch() de acá abajo es async (el plugin nativo
  // resuelve con una Promise), así que sin este sentinel quedaba una ventana real de
  // milisegundos con watchId todavía en null donde un doble-tap repetía exactamente el bug
  // grande que describe el comentario de startRun(), esta vez por la parte async.
  tracker.watchId = 'pending';
  const startedTracker = tracker;
  startGeoWatch(onPosition, onPosError).then(handle => {
    if(tracker === startedTracker && tracker.watchId === 'pending') tracker.watchId = handle;
    else stopGeoWatch(handle); // stopRun() (u otra carrera) ya corrió mientras esto resolvía -- no lo dejamos vivo sin nadie que lo pueda parar
  });
  // Probado en un dispositivo real con el tracking en segundo plano nuevo: mientras la app
  // está oculta, Android frena este setInterval (puede tardar minutos en volver a disparar,
  // no exactamente cada 1000ms) -- pero el GPS en segundo plano (BackgroundGeolocation) SIGUE
  // entregando fixes real durante ese rato. Antes esto sumaba tracker.elapsedSec++ a ciegas
  // cada vez que el timer disparaba, asumiendo que siempre pasó exactamente 1 segundo real --
  // con el timer frenado, una carrera con varios minutos en segundo plano terminaba con
  // elapsedSec bien por debajo del tiempo real corrido (confirmado: ~90s en segundo plano
  // sumaron ~11s de elapsedSec), lo que además inflaba el ritmo mostrado (mismos km en menos
  // tiempo "oficial" del que en realidad tardaron) y atrasaba tickWorkoutGuide() en sesiones
  // con series/cuestas. Ahora medimos el delta real contra el reloj de pared en cada disparo
  // (se dispare cuando se dispare) en vez de sumar un "+1" ciego -- cuando el timer se pone al
  // día de golpe tras volver de segundo plano, el elapsedSec también se pone al día de golpe.
  tracker.lastTickAt = Date.now();
  tracker.timerId = setInterval(tickRunTimer, 1000);
}
function onPosition(pos){
  const {latitude:lat, longitude:lon, accuracy, altitude} = pos.coords;
  const nowMs = pos.timestamp || Date.now();
  if(accuracy && accuracy>50){
    // Igual actualizamos la referencia de tiempo del último fix aceptado -- si no, el
    // próximo fix bueno calcula la velocidad sobre TODO el hueco de fixes filtrados
    // (túnel, arboleda, edificios altos) en vez de solo su propio intervalo, y eso puede
    // disparar una auto-pausa falsa por "quietud" que en realidad nunca existió.
    tracker.lastFixMs = nowMs;
    return;
  }
  const last = tracker.lastRawPoint || tracker.points[tracker.points.length-1];
  const stepKm = last ? haversine(last.lat,last.lon,lat,lon) : 0;

  // Auto-pausa: la velocidad instantánea sale del propio timestamp del fix del GPS
  // (pos.timestamp), no de tracker.elapsedSec -- porque elapsedSec es justo lo que
  // queremos poder congelar sin perder la referencia de tiempo real para el cálculo.
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
  // Guardamos siempre la última posición cruda (se grabe o no el punto) para que el
  // próximo fix mida el paso desde acá -- si no, al reanudar de una pausa el primer
  // stepKm se mediría contra el último punto grabado ANTES de pausar, sumando de golpe
  // a distanceKm todo lo caminado/manejado durante la pausa.
  tracker.lastRawPoint = {lat, lon};
  if(active && !isImplausibleRunSpeed(speedMps)){
    // Antes cualquier paso menor a 2m se descartaba directo -- a paso de caminata o
    // entrada en calor (~1 m/s) los fixes seguidos suelen quedar por debajo de esos 2m,
    // y ese movimiento real se perdía para siempre en vez de acumularse. Ahora se guarda
    // en un remanente y se suma a distanceKm apenas el acumulado cruza el umbral.
    tracker.pendingStepKm = (tracker.pendingStepKm||0) + stepKm;
    if(tracker.pendingStepKm > 0.002){
      tracker.distanceKm += tracker.pendingStepKm;
      tracker.pendingStepKm = 0;
    }
    // t = segundos desde el arranque de la carrera, alt = altitud del GPS si el
    // dispositivo la da (no todos la reportan, y aun cuando la dan puede faltar
    // en puntos sueltos -- por eso el resto del código nunca asume que todos
    // los puntos la tienen). Con esto podemos calcular ritmo real por tramo y
    // ascenso/descenso para carreras trackeadas desde el celular, algo que
    // antes solo teníamos para las carreras sincronizadas de Strava.
    // Solo se graba el punto (mapa + splits) mientras la carrera está activa -- si no,
    // una pausa manual o automática (semáforo, descanso) seguía dibujando el recorrido
    // y esos puntos quedaban para siempre en la ruta guardada.
    tracker.points.push({lat, lon, t:tracker.elapsedSec, alt:(typeof altitude==='number' && !isNaN(altitude)) ? altitude : null});
    updateLiveMap(lat,lon);
    maybeAnnounceKm(); tickWorkoutGuide();
  }
  updateLiveStats();
  // Se sacó el saveRunProgress() de acá -- se llamaba en cada fix de GPS (varias veces
  // por minuto durante toda la carrera), reserializando y regrabando en localStorage el
  // array de puntos COMPLETO cada vez, que no para de crecer -- una carrera larga hacía
  // esa escritura sincrónica cada vez más pesada a medida que pasaba el tiempo. El timer
  // de arriba (setInterval, línea ~4642) ya guarda cada 15s, y pausar/reanudar guarda al
  // toque -- de sobra para no perder progreso real ante un cierre inesperado.
}
function onPosError(){ document.getElementById('geo-warning').style.display='block'; document.getElementById('geo-warning').textContent=t('geo_err_permission'); }
function updateRunUnitLabels(){
  const distLbl = distUnit().toUpperCase();
  const paceLbl = `${t('run_pace_word')} /${distUnit()}`;
  ['track-dist-label','track-pdist-label','sum-dist-label'].forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent = distLbl; });
  ['track-pace-label','track-ppace-label','sum-pace-label'].forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent = paceLbl; });
}
function updateLiveStats(){
  document.getElementById('track-timer').textContent = fmtTime(tracker.elapsedSec);
  document.getElementById('track-dist').textContent = fmtDist(tracker.distanceKm);
  const paceMin = tracker.distanceKm>0.02 ? (tracker.elapsedSec/60)/tracker.distanceKm : 0;
  document.getElementById('track-pace').textContent = fmtPace(paceMin);
  // Misma info que arriba, para la grilla de .track-paused-group (ver index.html) -- se
  // actualiza siempre junto con los stats chicos de arriba, no solo mientras está pausado,
  // así ya está al día apenas is-paused la muestra en vez de esperar el próximo tick.
  document.getElementById('track-ptime').textContent = fmtTime(tracker.elapsedSec);
  document.getElementById('track-pdist').textContent = fmtDist(tracker.distanceKm);
  document.getElementById('track-ppace').textContent = fmtPace(paceMin);
  document.getElementById('track-pcal').textContent = Math.round((state.profile.weight||70)*tracker.distanceKm*1.036);
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
  updateRecordingLabel();
  // Guardamos el progreso justo al pausar/reanudar a mano -- si la app se cierra
  // segundos después de tocar "Pausar" (llamada, se apaga el teléfono, etc.), el
  // elapsedSec recuperado más tarde queda lo más cerca posible del momento real de la
  // pausa, en vez de depender de que llegue el próximo fix de GPS o el timer de 15s.
  saveRunProgress();
}
function stopRun(){
  clearInterval(tracker.timerId);
  if(tracker.watchId!==null) stopGeoWatch(tracker.watchId);
  // Sin esto, tracker.watchId se quedaba con el id ya limpiado (clearWatch no lo pone en
  // null solo) -- el guard contra doble-tap de startRun() (if(tracker.watchId!==null)
  // return;) lo hubiera confundido con una carrera todavía activa, bloqueando arrancar la
  // PRÓXIMA carrera para siempre.
  tracker.watchId = null;
  releaseWakeLock();
  tracker.workout = null;
  // Guardamos el progreso final ANTES de mostrar el resumen -- si la app se cierra
  // entre este momento y que el usuario confirme el resumen (se queda sin batería, la
  // mata el sistema operativo), la próxima apertura recupera el resumen ya calculado
  // en vez de perder la carrera por completo (ver saved.finished en startRun()).
  saveRunProgress(true);
  showRunSummaryUI();
}
function showRunSummaryUI(){
  document.getElementById('workout-guide-card').style.display = 'none';
  document.getElementById('runIdle').style.display='none';
  document.getElementById('runActive').style.display='none';
  document.getElementById('runSummary').style.display='block';
  updateCoachFabVisibility();
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
// Reportado en una auditoría: rating-modal no tenía ninguna forma de cerrarse sin elegir
// una calificación -- puede aparecer sin que el usuario lo pida (checkPendingRating() se
// llama solo, después de loguearse, de sincronizar un reloj, etc.), así que forzarlo a
// elegir "Mal/Bien/Excelente" para poder seguir usando la app era un mal momento. Cerrar
// acá sin tocar d.rating simplemente deja ese día como "sin calificar" -- va a volver a
// aparecer la próxima vez que se dispare checkPendingRating(), como un recordatorio, no
// como una obligación inmediata.
function dismissRating(){
  document.getElementById('rating-modal').style.display = 'none';
  ratingTargetIdx = null;
}
// Devolución de una sesión puntual: compara lo planeado (tipo, distancia) contra lo que la
// carrera vinculada realmente sumó (distancia, ritmo), y arma un mensaje del coach que varía
// según la calificación (mal/bien/excelente) -- antes de esto, calificar "bien" o "excelente"
// no generaba NINGÚN mensaje del coach, y "mal" solo mandaba una línea genérica sin ningún
// dato real de la sesión. Sin d.linkedRunId (no debería pasar -- un día 'done' siempre lo
// tiene, ver autoMarkSessionDone/relinkTodayRun) no hay número real que mostrar, así que no
// se manda nada en vez de inventar una devolución sin datos.
function buildSessionFeedbackMessage(d, run, rating){
  if(!run || !(run.distanceKm>0) || !(run.durationSec>0)) return null;
  const pace = (run.durationSec/60)/run.distanceKm;
  const vars = {
    actual: `${fmtDist(run.distanceKm,2)} ${distUnit()}`,
    pace: `${fmtPace(pace)}/${distUnit()}`
  };
  // d.dist>0 es el mismo criterio que ya usa renderPlan para distinguir un día CON sesión
  // planeada de uno sin ella (descanso, o una carrera espontánea sin nada armado ese día) --
  // ahí la devolución no tiene con qué comparar, así que usa la variante "_extra".
  if(d.dist>0){
    const typeLabel = t('type_'+d.typeKey);
    vars.type = typeLabel.charAt(0).toLowerCase() + typeLabel.slice(1);
    vars.planned = `${fmtDist(d.dist,1)} ${distUnit()}`;
    return t('coach_feedback_'+rating, vars);
  }
  return t('coach_feedback_'+rating+'_extra', vars);
}
async function submitRating(value){
  if(ratingTargetIdx===null) return;
  const idx = ratingTargetIdx;
  const d = state.plan[idx];
  d.rating = value;
  document.getElementById('rating-modal').style.display = 'none';
  ratingTargetIdx = null;
  await persist();
  const run = d.linkedRunId ? (state.runs||[]).find(r=>r.id===d.linkedRunId) : null;
  const feedbackMsg = buildSessionFeedbackMessage(d, run, value);
  if(feedbackMsg){ state.chat.push({role:'coach', text: feedbackMsg, ts:Date.now()}); renderChat(); }
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
  // Redondear al KM ENTERO (Math.round sin /10) se comía el recorte entero en sesiones
  // chicas -- típico de un principiante: una sesión de 2km con -15% da 1.7km, que
  // Math.round vuelve a redondear a... 2km, exactamente el mismo número de antes. Quien
  // pedía bajar la intensidad por una molestia se quedaba con el plan IDÉNTICO, sin ningún
  // aviso de que el recorte no hizo nada. Un decimal (mismo criterio que intervalActualKm/
  // hillActualKm/fartlekActualKm en el resto del generador) alcanza para que el cambio se
  // note incluso en sesiones de pocos km.
  state.plan.forEach(d=>{
    if(!(d.dist>0) || d.status) return;
    // Reportado en una auditoría, dos problemas separados en este mismo recorte:
    //
    // 1. Nunca marcaba d.custom=true -- preserveLivedDays() (el único guardia contra que
    // una regeneración del plan pise un día) solo respeta old.custom/old.cancelled. Sin
    // esto, la PRÓXIMA vez que se regenerara el plan (guardar cualquier cosa en Perfil,
    // cambiar una carrera en "Próximos eventos", o simplemente que checkPlanAlgoVersion()
    // detecte un algoritmo nuevo al abrir la app) el recorte por dolor/mala sensación
    // desaparecía sin ningún aviso, volviendo a la carga completa. Mismo criterio que ya
    // usan applyMoveSession/applyVolumeAdjust para protegerse de esto.
    //
    // 2. Para una sesión con estructura (series/cuestas/fartlek), reescalar SOLO d.dist
    // dejaba la tarjeta con un número que contradice su propia descripción -- ej. "5.1 km"
    // arriba pero "6 repeticiones de 1000m" (que suman 6km) en el detalle. Acá, si el día
    // tiene d.interval, se reescala reps (con un piso de 1 repetición) y se recalcula
    // d.dist a partir de la estructura YA reducida, con la misma fórmula que usa el propio
    // generador (intervalActualKm/hillActualKm/fartlekActualKm) -- así el número grande y
    // la descripción siempre están de acuerdo, para cualquier tipo de sesión.
    if(d.interval && (d.typeKey==='intervals' || d.typeKey==='hills' || d.typeKey==='fartlek')){
      d.interval.reps = Math.max(1, Math.round(d.interval.reps*factor));
      d.dist = d.typeKey==='intervals' ? intervalActualKm(d.interval)
        : d.typeKey==='hills' ? hillActualKm(d.interval)
        : fartlekActualKm(d.interval, state.profile);
    } else {
      d.dist = Math.max(0.1, Math.round(d.dist*factor*10)/10);
    }
    d.custom = true;
  });
  renderPlan(); renderHome(); persist();
}
async function closeSummary(){
  const shoeId = parseInt(document.getElementById('sum-shoe').value);
  const shoe = state.shoes.find(s=>s.id===shoeId);
  if(shoe) shoe.km += tracker.distanceKm;
  checkShoeWearAlerts();
  // tracker.startedAt (no el reloj actual): si el corredor terminó de correr, tocó
  // "Finalizar" y recién confirma este resumen más tarde (reabre la app después de medianoche,
  // por ejemplo, ver el comentario en startRun sobre por qué saved.finished no expira),
  // usar Date.now() acá le pone a la carrera la fecha del momento de confirmar, no la del
  // momento real en que corrió -- termina marcando "hecho" el día equivocado del plan.
  const runDate = new Date(tracker.startedAt || Date.now()).toISOString();
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
  checkAchievementUnlocks();
  autoMarkSessionDone(runDate, runId);
  clearRunProgress();
  document.getElementById('runSummary').style.display='none';
  document.getElementById('runIdle').style.display='block';
  renderAll(); renderHistory(); renderRunTodayCard();
  await persist();
  showView('inicio');
  showToast(t('run_completed_toast'), 'success');
  // Prioridad 1: si checkNewPR() de arriba ya disparó celebrate() (prioridad 2, marca
  // personal nueva), esta expresión genérica de "terminaste una carrera" no la corta antes
  // de tiempo -- ver el comentario de setMascotExpression.
  setMascotExpression('happy', {priority:1, duration:2200});
  haptic([15,40,15]);
  setTimeout(checkPendingRating, 500);
}
function autoMarkSessionDone(dateIso, runId){
  const monday = getMondayISO(new Date(dateIso));
  if(monday !== state.weekStart) return;
  const idx = (new Date(dateIso).getDay()+6)%7;
  // 'skipped' además de sin status: un día que autoSkipPastDays() ya había dado por
  // perdido (por ejemplo por el bug de fecha de Strava/Polar que atribuía una carrera
  // nocturna al día siguiente -- ver strava/polar-activity-helpers.js) tiene que poder
  // reclamarse apenas aparece la carrera real de ese día, en vez de quedar "salteado" para
  // siempre aunque la carrera ya esté en Historial. Un día ya 'done' sí se respeta tal cual
  // -- no le robamos el link a un run distinto que ya cuenta para ese día.
  const d = state.plan[idx];
  if(d && (!d.status || d.status === 'skipped')){ d.status = 'done'; d.linkedRunId = runId; }
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
    // El label decía "Distancia (km)" fijo sin importar el modo del corredor -- alguien en
    // millas tipeaba un número pensando en millas (lo que ve en todo el resto de la app) y
    // ese valor se guardaba tal cual como si fueran km, corrompiendo la distancia real.
    document.getElementById('man-dist-label').textContent = t(isImperial() ? 'hist_manual_dist_mi' : 'hist_manual_dist');
  }
}
function saveManualRun(){
  const date = document.getElementById('man-date').value;
  const dist = parseDistInput(document.getElementById('man-dist').value);
  const durMin = parseFloat(document.getElementById('man-dur').value);
  // Antes solo chequeaba "truthy" (!dist), asi que un valor negativo (o -0) pasaba
  // derecho -- mismo criterio que ya usa saveEditRun, exigiendo que sean positivos de
  // verdad. Sin esto, una distancia negativa terminaba restando km de la zapatilla
  // elegida en vez de sumarlos (ver mas abajo).
  // MAX_MANUAL_DIST_KM/48hs: mismo techo que api/_lib/activity-sanity.js ya usa del lado
  // del servidor para las carreras sincronizadas de cada marca, acá para la carga manual --
  // un típo (un cero de más, confundir minutos con horas) antes quedaba guardado tal cual,
  // sin ningún techo, corrompiendo para siempre cualquier estadística que sume totalKm
  // (Logros, la tendencia de Historial, el kilometraje de la zapatilla elegida). Encontrado
  // con pruebas adversariales: 99999km y 999999min pasaban derecho.
  if(!date || !(dist>0) || !(durMin>0) || dist>500 || durMin>48*60){ showToast(t('edit_run_invalid'),'error'); return; }
  // La fecha del <input type="date"> viene validada por el navegador en la inmensa mayoría
  // de los casos, pero no hay ninguna garantía real (un valor cargado a mano vía devtools,
  // un webview raro) -- sin este chequeo, toISOString() más abajo tiraba una excepción sin
  // atrapar (RangeError: Invalid time value) en vez del mismo toast de "dato inválido" que
  // ya usa el resto de esta función. Encontrado con pruebas adversariales.
  const parsedDate = new Date(date+'T12:00:00');
  if(isNaN(parsedDate.getTime())){ showToast(t('edit_run_invalid'),'error'); return; }
  const hrRaw = parseInt(document.getElementById('man-hr').value);
  // Mismo rango humano plausible que activity-sanity.js (30-250bpm) -- un típo en el campo
  // de FC (ej. "900" en vez de "90") no bloquea la carga entera (la FC es un dato opcional),
  // pero tampoco se guarda tal cual: se descarta, igual que si el campo hubiera quedado vacío.
  const hr = (hrRaw>=30 && hrRaw<=250) ? hrRaw : null;
  const shoeId = parseInt(document.getElementById('man-shoe').value) || null;
  const isoDate = parsedDate.toISOString();
  const runId = Date.now();
  state.runs.push({id:runId, date:isoDate, distanceKm:dist, durationSec:Math.round(durMin*60), hrLog: hr?[{t:0,bpm:hr}]:[], points:[], shoeId, manual:true});
  checkNewPR(state.runs[state.runs.length-1]);
  checkAchievementUnlocks();
  const shoe = state.shoes.find(s=>s.id===shoeId);
  if(shoe) shoe.km += dist;
  checkShoeWearAlerts();
  autoMarkSessionDone(isoDate, runId);
  document.getElementById('man-dist').value=''; document.getElementById('man-dur').value=''; document.getElementById('man-hr').value='';
  renderAll(); renderHistory(); persist();
  // Antes la tarjeta se cerraba de golpe apenas guardado, sin ninguna señal de que el
  // entrenamiento efectivamente se había guardado -- ahora el botón muestra "Guardado" un
  // instante (mismo flashSaved() que ya usan Perfil/Metas/Zonas) y recién ahí se cierra.
  flashSaved('man-save-btn');
  setTimeout(toggleManualForm, 700);
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
    const km = (state.runs||[]).filter(r => localDateISO(r.date) === dateStr).reduce((a,r)=>a+r.distanceKm,0);
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
  // (state.runs||[]): renderHistory() llama a esto (y a computeDailyTrend) ANTES de su
  // propio chequeo de "sin carreras" -- si state.runs llegara undefined (ej. un estado
  // parcial cargado del servidor sin esa clave), esto reventaba antes de llegar siquiera
  // al estado vacío que ya maneja bien más abajo.
  const totalKm = (state.runs||[]).reduce((a,r)=>a+r.distanceKm,0);
  return {totalKm, totalRuns: (state.runs||[]).length};
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
// sesión). Cuando la carrera está vinculada a un día real del plan usamos su tipo real
// (mirando tanto la semana actual como planHistory, para no perder el tipo real de una
// carrera de una semana ya cerrada); si no está vinculada
// a ningún día (carga manual, importada de Strava sin vincular), la clasificamos por
// distancia/ritmo relativos al resto del historial -- no es una ciencia exacta, pero da una
// devolución razonable.
function runBenefitKey(r){
  let linkedDay = (state.plan||[]).find(d => d.linkedRunId === r.id);
  if(!linkedDay){
    for(const h of (state.planHistory||[])){
      linkedDay = (h.plan||[]).find(d => d.linkedRunId === r.id);
      if(linkedDay) break;
    }
  }
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
    // fmtDist(km-totalKm, 0) redondea al entero más cercano -- a menos de medio km/milla
    // del umbral (ej. a 0.4km de la medalla de 50km) el faltante daba "0", un cartel de
    // "Faltan 0 km" en una medalla que sigue bloqueada, como si ya estuviera. El faltante
    // NUNCA puede mostrar 0 mientras siga bloqueado -- redondeamos siempre para arriba
    // (Math.ceil) en la unidad ya convertida, con un piso de 1.
    const remainingKm = km - totalKm;
    const remainingDisplay = Math.max(1, Math.ceil(isImperial() ? remainingKm*MI_PER_KM : remainingKm));
    return {achieved, label: `${fmtDist(km,0)} ${distUnit()}`,
      progressText: achieved ? null : t('ach_locked_distance_left', {n: `${remainingDisplay} ${distUnit()}`})};
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
// A diferencia de checkNewPR (que sí avisa al toque), las medallas de arriba son 100%
// pasivas: getAchievementSections() las recalcula al vuelo cada vez que se abre la pantalla
// de Logros, pero nada detecta el momento en que una se desbloquea de verdad -- alguien podía
// cruzar los 100km totales en una carrera cualquiera y no enterarse hasta entrar a mirar por
// su cuenta. Esta función sí detecta el cruce real, comparando contra
// state.notifiedAchievements (mismo espíritu que wearAlerted en checkShoeWearAlerts: un
// registro de qué ids ya se avisaron, para no festejar la misma medalla en cada carrera
// nueva). Se llama desde los mismos lugares que ya llaman a checkNewPR() -- terminar una
// carrera trackeada, cargar una a mano, o editar distancia/duración de una existente --
// porque son los únicos momentos en que el total de km o de carreras puede cruzar un umbral.
//
// Ojo con las rachas: NO se incluyen acá a propósito. Toda semana con racha >=2 ya festeja y
// avisa por chat en buildWeeklyRecapMessage() (con el número real de esa semana, no solo en
// los hitos 2/4/8/12/26) -- agregar una segunda notificación acá duplicaría el aviso justo
// las semanas en que la racha cae en uno de esos números.
function checkAchievementUnlocks(){
  const isFirstCheck = !state.notifiedAchievements;
  if(!state.notifiedAchievements) state.notifiedAchievements = [];
  const totalKm = (state.runs||[]).reduce((a,r)=>a+r.distanceKm,0);
  const totalRuns = (state.runs||[]).length;
  const newlyUnlocked = [];
  ACH_DISTANCE_KM.forEach(km=>{
    const id = 'dist_'+km;
    if(totalKm >= km && !state.notifiedAchievements.includes(id)){
      state.notifiedAchievements.push(id);
      newlyUnlocked.push({key:'coach_achievement_distance', vars:{label: `${fmtDist(km,0)} ${distUnit()}`}});
    }
  });
  ACH_RUN_COUNT.forEach(n=>{
    const id = 'runs_'+n;
    if(totalRuns >= n && !state.notifiedAchievements.includes(id)){
      state.notifiedAchievements.push(id);
      newlyUnlocked.push({key:'coach_achievement_runs', vars:{n}});
    }
  });
  // Primera vez que corre esto para esta cuenta (recién actualizó a esta versión): alguien
  // con meses de historial real puede tener ya varias medallas cruzadas de antes -- sin este
  // corte, la primera carrera después de actualizar dispararía un festejo (y un mensaje de
  // chat) por CADA medalla vieja de golpe. Las marcamos como ya vistas en silencio, sin
  // festejar nada retroactivo; a partir de la próxima carrera, cualquier medalla realmente
  // nueva sí avisa.
  if(isFirstCheck){ persist(); return; }
  if(!newlyUnlocked.length) return;
  newlyUnlocked.forEach(a=>{ state.chat.push({role:'coach', text: t(a.key, a.vars), ts:Date.now()}); });
  renderChat();
  celebrate();
  persist();
}
// Espejo de checkAchievementUnlocks(), pero para cuando el total BAJA (borrar una carrera, o
// achicarle la distancia al editarla) en vez de subir. Sin esto, borrar una carrera que había
// cruzado una medalla dejaba ese id marcado "ya avisado" en state.notifiedAchievements para
// siempre, aunque la pantalla de Logros (que recalcula todo en vivo desde state.runs, sin
// memoria de nada) ya la mostrara de nuevo bloqueada. Si el corredor volvía a cruzar ese mismo
// umbral más adelante -- un caso real y plausible: borra una carrera duplicada de Strava y
// sigue entrenando hasta volver a superarlo -- checkAchievementUnlocks() nunca volvía a
// festejar ni avisar por chat, aunque para el corredor esa fuera la primera vez que de verdad
// llega a VER la medalla desbloqueada (la vez anterior la carrera que la cruzó se borró casi
// enseguida). Encontrado con pruebas adversariales.
function unmarkLostAchievements(){
  if(!state.notifiedAchievements || !state.notifiedAchievements.length) return;
  const totalKm = (state.runs||[]).reduce((a,r)=>a+r.distanceKm,0);
  const totalRuns = (state.runs||[]).length;
  state.notifiedAchievements = state.notifiedAchievements.filter(id=>{
    const distMatch = id.match(/^dist_([\d.]+)$/);
    if(distMatch) return totalKm >= Number(distMatch[1]);
    const runsMatch = id.match(/^runs_(\d+)$/);
    if(runsMatch) return totalRuns >= Number(runsMatch[1]);
    return true; // id con un formato inesperado -- no tocar lo que no reconocemos
  });
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
    if(rec) return `<div class="pr-medal achieved">
      <button class="pr-medal-share-btn" onclick="event.stopPropagation(); sharePRImage('${b.key}')" aria-label="${t('aria_share_pr')}">${ICONS.share}</button>
      <span class="icon-sq">${ICONS.medal}</span><span class="pr-medal-label">${t('pr_label_'+b.key)}</span><span class="pr-medal-time">${fmtTime(rec.durationSec)}</span></div>`;
    return `<div class="pr-medal"><span class="icon-sq">${ICONS.medal}</span><span class="pr-medal-label">${t('pr_label_'+b.key)}</span><span class="pr-medal-locked">${t('pr_medal_locked')}</span></div>`;
  }).join('')}</div></div>`;
}
// Comparte (o descarga, si no hay share nativo) un blob de imagen ya generado -- mismo
// patrón que repetían sharePRImage/shareRunImage/shareWeeklyRecapImage cada una por su
// lado, unificado acá. En la app nativa (Capacitor/Android) usa los plugins Share +
// Filesystem para abrir el panel real de compartir de Android -- navigator.share y
// navigator.canShare NO están disponibles dentro del WebView de Capacitor (confirmado en
// un Moto E6 Plus real: ambos dan `false`), así que sin esto el código caía siempre a la
// rama de "descarga" (un <a download> con una blob: URL) -- y esa rama tampoco funciona
// ahí: Android WebView no sabe qué hacer con la descarga de una blob: URL sin un
// DownloadListener nativo registrado (que esta app no tiene, a propósito -- lo que
// corresponde acá es compartir, no descargar). Resultado: tocar "compartir" no hacía
// nada, sin ningún error visible para el usuario. En la web (navegador de escritorio o
// PWA) sigue exactamente el comportamiento de antes.
async function shareImageBlobFile(blob, filename){
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const Share = isNative && window.Capacitor.Plugins && window.Capacitor.Plugins.Share;
  const Filesystem = isNative && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem;
  if(Share && Filesystem){
    try{
      const base64 = await new Promise((resolve, reject)=>{
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const written = await Filesystem.writeFile({ path: filename, data: base64, directory: 'CACHE' });
      await Share.share({ files: [written.uri], title: 'Zancada' });
    }catch(e){ /* usuario canceló el panel de compartir nativo, o algo falló -- no rompemos la UI por esto */ }
    return;
  }
  const file = new File([blob], filename, {type:'image/png'});
  if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title:'Zancada'}); }catch(e){ /* usuario canceló */ }
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
  }
}
async function sharePRImage(bucketKey){
  const rec = getPersonalRecords()[bucketKey];
  if(!rec) return;
  const blob = await buildPRShareImageBlob(bucketKey, rec);
  if(!blob) return;
  await shareImageBlobFile(blob, 'zancada-pr.png');
}
function drawSunburstRays(ctx, cx, cy, rInner, count){
  // Rayos alrededor del círculo de la medalla, largo y corto alternado -- mismo recurso
  // que usa Strava en su tarjeta de "New PR" para las redes, adaptado a nuestro lima en
  // vez de su dorado.
  ctx.save();
  ctx.strokeStyle = '#D6FF3F';
  ctx.lineCap = 'round';
  for(let i=0;i<count;i++){
    const angle = (i/count)*Math.PI*2;
    const long = i%2===0;
    const len = long ? rInner*0.55 : rInner*0.28;
    const gap = rInner*1.2;
    const x1 = cx + Math.cos(angle)*gap;
    const y1 = cy + Math.sin(angle)*gap;
    const x2 = cx + Math.cos(angle)*(gap+len);
    const y2 = cy + Math.sin(angle)*(gap+len);
    ctx.lineWidth = long ? rInner*0.045 : rInner*0.028;
    ctx.beginPath();
    ctx.moveTo(x1,y1);
    ctx.lineTo(x2,y2);
    ctx.stroke();
  }
  ctx.restore();
}
function drawPRBadge(ctx, cx, cy, r){
  // Círculo lima sólido con rayos, y adentro una copa/trofeo en silueta oscura con "PR"
  // encima -- misma composición que la insignia de Strava, en nuestra paleta (lima +
  // tinta oscura) en vez de dorado + negro.
  ctx.save();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  drawSunburstRays(ctx, cx, cy, r, 20);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fillStyle = '#D6FF3F';
  ctx.fill();

  // Copa: contorno curvo (borde redondeado arriba, panza, se angosta al cuello) en vez
  // de un trapecio de lados rectos -- se veía muy anguloso/tosco para ser un trofeo.
  ctx.fillStyle = '#121415';
  ctx.beginPath();
  ctx.moveTo(cx - r*0.46, cy - r*0.34);
  ctx.quadraticCurveTo(cx, cy - r*0.52, cx + r*0.46, cy - r*0.34);
  ctx.bezierCurveTo(cx + r*0.5, cy - r*0.05, cx + r*0.34, cy + r*0.14, cx + r*0.15, cy + r*0.16);
  ctx.lineTo(cx - r*0.15, cy + r*0.16);
  ctx.bezierCurveTo(cx - r*0.34, cy + r*0.14, cx - r*0.5, cy - r*0.05, cx - r*0.46, cy - r*0.34);
  ctx.closePath();
  ctx.fill();

  // Asas: lazo cerrado y relleno (no un simple trazo curvo) que sale de la panza y
  // vuelve a ella, como un asa real -- antes eran arcos sueltos que no se leían como
  // parte del mismo objeto.
  const handle = (sign)=>{
    ctx.beginPath();
    ctx.moveTo(cx + sign*r*0.42, cy - r*0.3);
    ctx.bezierCurveTo(cx + sign*r*0.82, cy - r*0.32, cx + sign*r*0.86, cy + r*0.08, cx + sign*r*0.5, cy + r*0.08);
    ctx.bezierCurveTo(cx + sign*r*0.68, cy + r*0.05, cx + sign*r*0.64, cy - r*0.16, cx + sign*r*0.44, cy - r*0.14);
    ctx.closePath();
    ctx.fill();
  };
  handle(-1); handle(1);

  // Cuello + base en dos escalones, como el pie real de un trofeo
  ctx.fillRect(cx - r*0.09, cy + r*0.16, r*0.18, r*0.16);
  ctx.fillRect(cx - r*0.26, cy + r*0.32, r*0.52, r*0.08);
  ctx.fillRect(cx - r*0.34, cy + r*0.4, r*0.68, r*0.06);

  ctx.fillStyle = '#EDEFEF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 ' + Math.round(r*0.26) + 'px "Inter", Arial, sans-serif';
  ctx.fillText('PR', cx, cy - r*0.14);

  ctx.restore();
}
function buildPRShareImageBlob(bucketKey, rec){
  // Misma estructura que la tarjeta de "New PR" de Strava (insignia con rayos arriba,
  // distancia, tiempo, ritmo y marca al pie) pero con nuestra identidad -- fondo
  // transparente, lima #D6FF3F, Bebas Neue + JetBrains Mono, igual que
  // shareRunImage/shareWeeklyRecapImage.
  return new Promise(async (resolve)=>{
    try{
      try{
        await Promise.all([
          document.fonts.load('400 64px "Bebas Neue"'),
          document.fonts.load('700 92px "JetBrains Mono"'),
          document.fonts.load('700 28px "Inter"'),
          document.fonts.load('800 40px "Inter"'),
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

      drawPRBadge(ctx, W/2, 580, 165);

      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 3;

      ctx.fillStyle = '#EDEFEF';
      ctx.font = '400 90px "Bebas Neue", Arial, sans-serif';
      ctx.fillText(t('pr_label_'+bucketKey), W/2, 895);

      ctx.fillStyle = '#EDEFEF';
      ctx.font = '700 92px "JetBrains Mono", monospace';
      ctx.fillText(fmtTime(rec.durationSec), W/2, 1080);

      const paceMin = rec.distanceKm>0.02 ? (rec.durationSec/60)/rec.distanceKm : 0;
      ctx.fillStyle = '#8B9296';
      ctx.font = '700 40px "JetBrains Mono", monospace';
      ctx.fillText(`${fmtPace(paceMin)}/${distUnit()}`, W/2, 1155);

      ctx.fillStyle = '#D6FF3F';
      ctx.font = '400 76px "Bebas Neue", Arial, sans-serif';
      ctx.fillText('ZANCADA', W/2, 1350);

      canvas.toBlob((blob)=>resolve(blob||null), 'image/png');
    }catch(e){ resolve(null); }
  });
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
    <div class="ob-progress" style="margin-bottom:16px;"><div class="ob-progress-fill" style="width:100%; transform:scaleX(${pct/100}); transform-origin:left;"></div></div>
    ${renderPersonalRecordsCard()}
    <div class="card"><h3>${t('ach_section_distance')}</h3>${renderAchievementBadgeGrid(distanceBadges)}</div>
    <div class="card"><h3>${t('ach_section_runs')}</h3>${renderAchievementBadgeGrid(runBadges)}</div>
    <div class="card"><h3>${t('ach_section_streak')}</h3>${renderAchievementBadgeGrid(streakBadges)}</div>
  `;
  openOverlaySheetEl(document.getElementById('achievements-modal'));
}
function closeAchievements(){
  document.getElementById('achievements-modal').classList.remove('overlay-open');
}

function predictRaceTime(targetKm){
  // Estima el tiempo objetivo para `targetKm` con la fórmula de Riegel (T2 = T1 *
  // (D2/D1)^1.06), usando como referencia la marca personal más cercana en distancia
  // (cuanto más parecidas son las distancias, más confiable es la proyección).
  const records = Object.values(getPersonalRecords());
  // Misma lógica que estimateBasePaceMinPerKm: si todavía no hay carreras registradas
  // como para tener una PR real, la marca de referencia del onboarding sirve igual de
  // base para la proyección de Riegel.
  const refRace = state.profile && state.profile.refRace;
  if(refRace && refRace.distanceKm>0 && refRace.durationSec>0) records.push(refRace);
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
// El selector de distancias estándar (5k/10k/etc.) se queda en km a propósito -- son nombres
// de carrera reconocidos así en cualquier país ("un 5K"), no una medida que haga falta
// traducir a millas. Pero el campo de distancia LIBRE (custom) sí es una medida real que el
// corredor tipea con sus propios números -- antes se trataba siempre como km sin importar el
// sistema elegido, así que alguien en modo imperial que tipeaba "8" pensando en 8 millas
// terminaba con una predicción de ritmo calculada para 8km (casi la mitad de la distancia
// real). parseDistInput ya sabe convertir según isImperial(), igual que en el resto de la app.
function paceCalcCurrentKm(){
  const sel = document.getElementById('pc-distance');
  if(!sel) return null;
  if(sel.value==='custom'){
    const km = parseDistInput(document.getElementById('pc-custom-km').value);
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
  const customLbl = document.getElementById('pc-custom-km-label');
  if(customLbl) customLbl.textContent = t(isImperial() ? 'pace_calc_custom_km_label_mi' : 'pace_calc_custom_km_label');
  if(goalKm && knownOptions.includes(String(goalKm))){
    sel.value = String(goalKm);
    document.getElementById('pc-custom-km-field').style.display = 'none';
  } else if(goalKm){
    sel.value = 'custom';
    document.getElementById('pc-custom-km').value = fmtDist(goalKm,1);
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
  // La tabla de tramos parciales marcaba siempre "1, 2, 3..." en bloques de 1KM, aunque el
  // corredor estuviera en modo imperial (donde el resto de esta misma pantalla -- ritmo
  // promedio, ritmo por tramo -- sí se muestra en min/milla) -- alguien viendo "millas" en el
  // encabezado de arriba pero filas que en realidad son marcas de kilómetro es información
  // que no se corresponde entre sí. unitStepKm es 1 milla (en km) en modo imperial, 1km si no.
  const unitStepKm = isImperial() ? KM_PER_MI : 1;
  const numFullUnits = Math.floor(km/unitStepKm);
  const remainderKm = km - numFullUnits*unitStepKm;
  const segments = []; // {label, distKm}
  for(let i=1;i<=numFullUnits;i++) segments.push({label:String(i), distKm:unitStepKm});
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
      <p class="mono" style="font-size:22px; font-weight:800; color:var(--hivis-text); margin:0 0 14px;">${fmtPace(avgPaceMin)} /${distUnit()}</p>
      <div style="max-height:260px; overflow-y:auto;">
        <table class="rd-seg-table">
          <thead><tr><th>${t(isImperial() ? 'pace_calc_km_col_mi' : 'pace_calc_km_col')}</th><th>${t('pace_calc_cum_col')}</th><th>${t('pace_calc_pace_col')}</th></tr></thead>
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
      <button onclick="shareWeeklyRecapImage()" style="background:none; border:1.5px solid var(--asphalt-4); color:var(--hivis-text); font-size:12px; cursor:pointer; padding:5px 9px; border-radius:6px; display:flex; align-items:center; gap:5px; font-weight:700; flex-shrink:0;">${t('hist_share')}</button>
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
  // Los récords personales se muestran ahora en Logros (Perfil), junto con el resto de
  // los hitos del corredor -- ver renderPersonalRecordsCard() y openAchievements().
  // El icono generico de "historial" (reloj+flecha) no decia nada de running -- se
  // reemplaza por el mismo perfil de elevacion que ya es la firma visual de la app
  // (hoy usado como separador en Perfil), agrandado como pieza central acá: "todavia
  // no recorriste este camino" en vez de un ícono de reloj cualquiera.
  if(!state.runs || state.runs.length===0){ el.innerHTML = stravaSyncCard + trendsCard + `<div class="card" style="text-align:center; padding:32px 18px;"><svg viewBox="0 0 60 14" style="width:90px; height:21px; margin:0 auto 14px; display:block; opacity:.7;"><polyline points="0,12 10,12 16,4 22,10 28,2 34,9 40,12 60,12" fill="none" stroke="#C06A2E" stroke-width="1.6"/></svg><p class="muted" style="margin:0;">${t('hist_empty')}</p></div>`; animateHistTrendBars(); return; }
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
    const haystack = [longDateStr, shoe?shoe.name:'', r.manual?t('hist_manual_tag'):'', SOURCE_LABELS[r.source]||''].join(' ').toLowerCase();
    return haystack.includes(query);
  });
  if(query && !filteredRuns.length){
    el.innerHTML = stravaSyncCard + trendsCard + `<div class="card" style="text-align:center; padding:32px 18px;"><p class="muted" style="margin:0;">${t('hist_search_empty')}</p></div>`;
    animateHistTrendBars();
    return;
  }
  let lastMonthKey = null;
  el.innerHTML = stravaSyncCard + trendsCard + filteredRuns.map(r=>{
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
        <div class="hist-top"><span style="font-weight:700;">${dateStr}</span>${hasMap ? '' : `<span class="hist-date">${r.manual? `<span class="tag tag-asfalto" style="margin-right:6px;">${t('hist_manual_tag')}</span>`:''}${sourceBadgeHtml(r.source, true)}${fmtTime(r.durationSec)}</span>`}</div>
        ${hasMap ? `<div class="hist-map" data-run-id="${r.id}"><img class="hist-map-img" src="${buildHistMapStaticUrl(r, 400, 108)}" loading="lazy" alt="" decoding="async"><div class="hist-map-badge">${r.manual? `<span class="tag tag-asfalto">${t('hist_manual_tag')}</span>`:''}${sourceBadgeHtml(r.source, false)}<span class="hist-map-duration">${fmtTime(r.durationSec)}</span></div></div>` : ''}
        <div class="stat-row-divided">
          <div class="stat-cell"><div class="n">${fmtDist(r.distanceKm)}</div><div class="l">${distUnit()}</div></div>
          <div class="stat-cell"><div class="n">${fmtPace(paceMin)}</div><div class="l">${t('run_pace_word')}</div></div>
          <div class="stat-cell"><div class="n">${avgHr||'—'}</div><div class="l">${t('hist_avg_hr')}</div></div>
          <div class="stat-cell"><div class="n">${cal}</div><div class="l">${t('run_calories')}</div></div>
        </div>
        <p class="muted" style="margin-top:10px; font-size:12.5px;">${t('hist_benefit_'+runBenefitKey(r))}</p>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; gap:8px;">
          <p class="muted" style="margin:0;">${t('hist_shoe')}: ${shoe? escapeHtml(shoe.name) : t('hist_no_shoe')}</p>
          <button onclick="event.stopPropagation(); shareRunImage('${r.id}')" style="background:none; border:1.5px solid var(--asphalt-4); color:var(--hivis-text); font-size:12px; cursor:pointer; padding:5px 9px; border-radius:6px; display:flex; align-items:center; gap:5px; font-weight:700; flex-shrink:0;">${t('hist_share')}</button>
        </div>
      </div>
    </div>`;
  }).join('');
  // Los mini-mapas de esta lista son <img> con loading="lazy" (ver buildHistMapStaticUrl()
  // más arriba) -- ya no hace falta crear/destruir mapas de Leaflet acá ni un
  // IntersectionObserver a mano, el navegador se encarga solo de no pedir la imagen hasta
  // que la tarjeta esté por entrar en pantalla.
  // Reportado en una auditoría: makeClickablesFocusable() solo corría una vez al cargar la
  // página -- las .hist-card de esta lista (armadas siempre por este render dinámico) nunca
  // pasaban por ahí, así que ninguna carrera del historial era alcanzable por teclado.
  makeClickablesFocusable(el);
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
// --zoneN-fill (no --zoneN a secas): esto pinta fondos sólidos con texto --ink encima
// (barras de ritmo, gráfico de rosquilla, línea de ruta en el mapa) -- --zoneN es la
// variante pensada para TEXTO sobre un fondo claro (los chips zone-N de index.html), que
// en el tema claro es demasiado oscura para servir de fondo con --ink (igual de oscuro)
// encima. --zoneN-fill son las mismas 5 tonalidades vívidas del tema oscuro en los dos
// temas -- ver el comentario grande junto a --zone1-fill en el <style> de index.html.
function zoneColorVar(n){
  return (getComputedStyle(document.documentElement).getPropertyValue('--zone'+n+'-fill') || '').trim() || '#8B9296';
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
// r.splits siempre viene armado en tramos de 1KM (se calcula una sola vez, del lado del
// servidor, al sincronizar la carrera -- ver api/_lib/fit-activity-helpers.js) sin importar
// la unidad que el corredor tenga elegida. En modo imperial, renderRDSegmentos/renderRDRitmo
// mostraban esos mismos tramos de 1km bajo un ritmo/distancia ya CONVERTIDOS a millas (ej.
// "0.62 mi" para lo que en realidad es un tramo entero de 1km) -- el número no es solo una
// etiqueta rara, describe mal el tramo real. Acá se recalculan los tramos de cero por milla,
// a partir del recorrido real (r.points, con la misma distancia acumulada por Haversine que
// ya usa buildColoredRouteSegments/computeVideoRouteData) -- mismo criterio de "tiempo real si
// hay marca de tiempo por punto GPS, si no repartido proporcional a la distancia" que ya usa
// computeVideoRouteData para carreras sincronizadas sin marca de tiempo por punto.
function rebucketSplitsByDistance(r, segmentKm){
  const points = r.points||[];
  if(points.length<3 || !(segmentKm>0)) return null;
  const cum=[0];
  for(let i=1;i<points.length;i++) cum.push(cum[i-1]+haversine(points[i-1].lat,points[i-1].lon,points[i].lat,points[i].lon));
  const totalDistKm = cum[cum.length-1];
  if(!(totalDistKm>0)) return null;
  const hasRealTime = points[0].t!=null && points[points.length-1].t!=null && points[points.length-1].t > points[0].t;
  const totalSec = r.durationSec || 0;
  const timeAt = i => hasRealTime ? (points[i].t - points[0].t) : (totalSec * (cum[i]/totalDistKm));

  const numFull = Math.floor(totalDistKm / segmentKm);
  const splits = [];
  let startIdx = 0, startTime = 0;
  for(let seg=1; seg<=numFull; seg++){
    const targetDist = seg*segmentKm;
    let idx = startIdx;
    while(idx<points.length-1 && cum[idx]<targetDist) idx++;
    const segDistKm = cum[idx]-cum[startIdx];
    const segTime = timeAt(idx)-startTime;
    const paceMin = segDistKm>0 ? (segTime/60)/segDistKm : 0;
    splits.push({km: seg, paceMin: Math.round(paceMin*100)/100, avgHr:null, avgCadence:null});
    startIdx = idx; startTime = timeAt(idx);
  }
  const lastIdx = points.length-1;
  const remainderKm = cum[lastIdx]-cum[startIdx];
  if(remainderKm > segmentKm*0.05){
    const segTime = timeAt(lastIdx)-startTime;
    const paceMin = remainderKm>0 ? (segTime/60)/remainderKm : 0;
    // Mismo motivo que el tope en 0.99 del lado del servidor (ver el comentario junto a
    // buildSplitsAndSeriesFromFitRecords): un remainder redondeado que caiga justo en un
    // número entero se confundiría con un tramo completo (Number.isInteger(s.km), más abajo
    // en renderRDSegmentos, es lo que distingue un tramo lleno de uno suelto).
    const remainderLabel = Math.min(Math.round((remainderKm/segmentKm)*100)/100, 0.99);
    splits.push({km: remainderLabel, paceMin: Math.round(paceMin*100)/100, avgHr:null, avgCadence:null});
  }
  return splits.length ? splits : null;
}
function getDisplaySplits(r){
  if(!isImperial()) return r.splits||[];
  return rebucketSplitsByDistance(r, KM_PER_MI) || r.splits || [];
}
// Una carrera sincronizada de Polar/Wahoo trae splits reales (calculados del lado del
// servidor a partir del archivo FIT, siempre en tramos de 1km -- ver
// buildSplitsAndSeriesFromFitRecords en api/_lib/fit-activity-helpers.js) pero NUNCA
// guarda la ruta (r.points queda [] siempre, ver exerciseToRun en
// polar-activity-helpers.js/wahoo-activity-helpers.js) -- sin los puntos GPS,
// rebucketSplitsByDistance no tiene de dónde recalcular tramos reales por milla (haría
// falta la distancia acumulada punto a punto, que acá no existe) y getDisplaySplits cae
// de vuelta a los mismos tramos de 1km de r.splits tal cual. Mostrar esos tramos bajo el
// rótulo "MI" (como pasaba antes de este chequeo) repite el mismo bug que ya se había
// arreglado para el caso con ruta real: "0.62 mi" para lo que en realidad es un tramo
// entero de 1km (ver el comentario grande junto a rebucketSplitsByDistance). Sin una ruta
// real no hay forma honesta de mostrar tramos por milla, así que renderRDSegmentos/
// renderRDRitmo usan esto para decidir si el resultado de getDisplaySplits está de verdad
// en millas (mismo chequeo -- identidad de referencia -- que ya usa rebucketSplitsByDistance
// para devolver un array nuevo) o si hay que mostrarlo en km pese a que el corredor eligió
// millas como unidad.
function displaySplitsAreMiles(r, splits){
  return isImperial() && splits.length>0 && splits!==r.splits;
}
// Corta el recorrido (r.points) en tramos por km alineados con r.splits, y le
// asigna a cada tramo el color de zona de ritmo (relativa al promedio de ESA
// carrera, ver classifyPaceRelative) -- así el mapa de la pestaña Ruta se ve
// coloreado por velocidad como en la referencia, en vez de una línea plana.
function buildColoredRouteSegments(r){
  const points = r.points||[];
  if(points.length<2) return [];
  // smoothed: mismo largo y orden que points (ver smoothRouteForDisplay), así los índices
  // startIdx/idx calculados más abajo contra el acumulado de distancia REAL (cum, sobre
  // points sin suavizar -- tiene que coincidir con split.km tal cual) valen igual para
  // cortar smoothed en los mismos tramos.
  const smoothed = smoothRouteForDisplay(points);
  if(!r.splits || !r.splits.length || points.length<3){
    return [{latlngs:catmullRomCurve(smoothed).map(p=>[p.lat,p.lon]), color: zoneColorVar(3)}];
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
    const chunk = smoothed.slice(startIdx, idx+1);
    if(chunk.length>=2){
      const zone = classifyPaceRelative(split.paceMin, avgPace);
      const curved = chunk.length>=3 ? catmullRomCurve(chunk) : chunk;
      segs.push({latlngs:curved.map(p=>[p.lat,p.lon]), color: zoneColorVar(zone)});
    }
    startIdx = idx;
  });
  return segs.length ? segs : [{latlngs:catmullRomCurve(smoothed).map(p=>[p.lat,p.lon]), color: zoneColorVar(3)}];
}
function renderRDRuta(panel){
  const {r, paceMin, cal} = rdCurrent;
  const dateStr = new Date(r.date).toLocaleDateString(LOCALE_MAP[lang], {weekday:'long', day:'numeric', month:'long'});
  const timeStr = new Date(r.date).toLocaleTimeString(LOCALE_MAP[lang], {hour:'numeric', minute:'2-digit'});
  const paces = getDisplaySplits(r).map(s=>s.paceMin).filter(p=>p>0);
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
  document.querySelector('.rd-map-controls button')?.classList.remove('visible');
  setTimeout(()=>{
    if(detailMap){ detailMap.remove(); detailMap=null; }
    detailMap = L.map('rd-route-map', {zoomControl:false, attributionControl:true});
    L.tileLayer(MAPBOX_TILE_URL, {maxZoom:20, detectRetina:true, attribution:MAPBOX_ATTRIBUTION}).addTo(detailMap);
    const segs = buildColoredRouteSegments(r);
    const allLatLngs = [];
    segs.forEach(seg=>{ L.polyline(seg.latlngs, {color:seg.color, weight:5, lineCap:'round', lineJoin:'round'}).addTo(detailMap); allLatLngs.push(...seg.latlngs); });
    rdMapProgrammaticMoveAt = Date.now();
    if(allLatLngs.length) detailMap.fitBounds(L.latLngBounds(allLatLngs), {padding:[20,20]});
    // dragstart/zoomstart también disparan con nuestros propios fitBounds() (acá arriba,
    // en rdRecenterMap() y al expandir/achicar el mapa) -- rdMapProgrammaticMoveAt filtra
    // esos casos, igual que el mismo mecanismo en el mapa en vivo (ver recenterMap()).
    detailMap.on('dragstart zoomstart', ()=>{
      if(Date.now() - rdMapProgrammaticMoveAt < 50) return;
      document.querySelector('.rd-map-controls button')?.classList.add('visible');
    });
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
// Mismo mecanismo que liveMapProgrammaticMoveAt: distingue un fitBounds() nuestro de un
// zoom/arrastre real del corredor sobre el mapa de detalle de carrera.
let rdMapProgrammaticMoveAt = 0;
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
  // Antes esto arrancaba con CUALQUIER toque dentro de #rd-map-full (toda la tarjeta del
  // mapa), no solo la agarradera -- un toque para hacer pinch-zoom en el mapa de Leaflet
  // (que vive adentro, en #rd-route-map) también contaba como el arranque de "arrastrar
  // para agrandar/achicar", y el primer temblor del dedo (>8px, algo normal al pellizcar)
  // disparaba rdRecenterMap() en touchmove -- el mapa volvía solo al encuadre completo de
  // la ruta, cancelando el zoom que el corredor estaba haciendo. Restringir el arranque a
  // la agarradera (#rd-map-handle, la única con touch-action:none en el CSS) deja que
  // Leaflet maneje sus propios gestos de pan/zoom sin que este código se meta.
  const onHandle = e.target.closest ? e.target.closest('#rd-map-handle') : null;
  if(!onHandle){ rdMapDragging = false; return; }
  const mapEl = document.getElementById('rd-map-full');
  if(!mapEl) return;
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
  document.querySelector('.rd-map-controls button')?.classList.remove('visible');
  const pts = rdCurrent.r.points;
  if(pts && pts.length){
    rdMapProgrammaticMoveAt = Date.now();
    detailMap.fitBounds(L.latLngBounds(pts.map(p=>[p.lat,p.lon])), {padding:[20,20]});
  }
}
function renderRDRitmo(panel){
  const {r, paceMin} = rdCurrent;
  const splits = getDisplaySplits(r);
  // Mismo motivo que en renderRDSegmentos: sin ruta real (Polar/Wahoo) los tramos siguen
  // siendo de 1km aunque el corredor esté en modo imperial -- el rótulo de la columna
  // izquierda tiene que reflejar eso, no asumir ciegamente distUnit().
  const unitLabel = displaySplitsAreMiles(r, splits) ? 'mi' : 'km';
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
    <div class="muted" style="font-size:11px; margin-bottom:8px; display:flex; justify-content:space-between;"><span>${unitLabel}</span><span>${t('run_pace_word')} (/${distUnit()})</span></div>
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
  const splits = getDisplaySplits(r);
  // milesOk: si getDisplaySplits de verdad devolvió tramos recalculados por milla a partir
  // de la ruta real (rebucketSplitsByDistance), o si cayó de vuelta a los tramos de 1km de
  // r.splits porque esta carrera no tiene puntos GPS guardados (Polar/Wahoo, ver el
  // comentario junto a displaySplitsAreMiles). En ese segundo caso NO hay forma honesta de
  // mostrar la tabla en millas -- se muestra en km pese a que el corredor eligió millas,
  // en vez de repetir el bug ya arreglado para el caso con ruta real ("0.62 mi" para lo que
  // en realidad es un tramo entero de 1km).
  const milesOk = displaySplitsAreMiles(r, splits);
  const unitLabel = milesOk ? 'mi' : 'km';
  // Un tramo "lleno" mide 1 unidad INTERNA -- 1km para r.splits (siempre en km, ver el
  // comentario junto a rebucketSplitsByDistance) o 1 milla (KM_PER_MI km) para los tramos
  // recalculados por milla en modo imperial. Sin esto, un tramo entero de milla se trataba
  // como si fuera de 1km para calcular su duración/distancia real.
  const unitKm = milesOk ? KM_PER_MI : 1;
  // fmtDist() convierte siempre según isImperial() global -- acá hace falta formatear según
  // milesOk (la unidad REAL de esta tabla, que puede ser km aunque el corredor esté en modo
  // imperial), así que no se puede reusar tal cual para esta columna en particular.
  const fmtSegDist = km => milesOk ? fmtDist(km) : km.toFixed(2);
  const anyHr = splits.some(s=>s.avgHr!=null);
  const anyCad = splits.some(s=>s.avgCadence!=null);
  const rows = splits.map(s=>{
    const segDistKm = (Number.isInteger(s.km) ? 1 : s.km) * unitKm;
    const segSec = Math.round(s.paceMin*60*segDistKm);
    return `<tr>
      <td>${s.km}</td>
      <td>${fmtTime(segSec)}</td>
      <td>${fmtSegDist(segDistKm)}</td>
      <td>${fmtPace(s.paceMin)}</td>
      ${anyHr ? `<td>${s.avgHr!=null ? s.avgHr : '–'}</td>` : ''}
      ${anyCad ? `<td>${s.avgCadence!=null ? s.avgCadence : '–'}</td>` : ''}
    </tr>`;
  }).join('');
  panel.innerHTML = `
    <div style="overflow-x:auto;">
    <table class="rd-seg-table">
      <thead><tr>
        <th>${unitLabel.toUpperCase()}</th><th>${t('rd_seg_dur')}</th><th>${t('rd_seg_dist')} (${unitLabel})</th><th>${t('run_pace_word')} (/${distUnit()})</th>
        ${anyHr ? `<th>${t('hist_avg_hr')}</th>` : ''}
        ${anyCad ? `<th>${t('hist_cadence')}</th>` : ''}
      </tr></thead>
      <tbody>
        ${rows}
        <tr>
          <td>${t('rd_total')}</td><td>${fmtTime(r.durationSec)}</td><td>${fmtSegDist(r.distanceKm)}</td><td>${fmtPace(paceMin)}</td>
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
  // avgPower/maxPower: solo Wahoo y Polar los traen por ahora (del archivo FIT de la
  // actividad, ver wahoo-activity-helpers.js/polar-activity-helpers.js) -- si el
  // dispositivo no tenía sensor de potencia (ej. sin Stryd emparejado), el campo
  // directamente no está (null) y estas tiles no se muestran. A diferencia de
  // avgCadence/maxHr de arriba, acá SÍ hace falta comparar contra null en vez de un
  // check "truthy": buildSplitsAndSeriesFromFitRecords devuelve null vs. 0 a propósito
  // (un tramo parado/de pie con sensor real puede promediar 0W de verdad), y con
  // if(r.avgPower) ese 0 legítimo escondía la tile igual que si no hubiera sensor.
  if(r.avgPower!=null) tiles.push([t('hist_power'), Math.round(r.avgPower)+' W']);
  if(r.maxPower!=null) tiles.push([t('hist_max_power'), Math.round(r.maxPower)+' W']);
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
  unmarkLostAchievements();
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
  // Reportado por el usuario: en la app nativa de Android (Capacitor) seguía apareciendo
  // la tarjeta/banner de "cómo instalar la app en tu pantalla de inicio" -- no tenía ningún
  // sentido, la app ya está instalada de verdad (no es la PWA). El WebView de Capacitor NO
  // matchea "(display-mode: standalone)" (esa media query es específica de una PWA agregada
  // a inicio, no de un WebView nativo cualquiera) ni setea navigator.standalone (eso es
  // solo de Safari/iOS), así que esta función devolvía false ahí y el banner/acordeón de
  // instalación -- pensados solo para la PWA web -- se colaban en la app nativa.
  try{
    if(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return true;
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }catch(e){ return false; }
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

  await shareImageBlobFile(blob, 'zancada.png');
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
  await shareImageBlobFile(blob, 'zancada-semana.png');
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
// subdomain ya no se usa (Mapbox sirve todo desde api.mapbox.com, sin el
// esquema de subdominios en paralelo que sí usaba CartoDB) -- se deja el
// parámetro para no tener que tocar el round-robin de subdominios del
// llamador de más abajo.
// @2x -- reportado por un usuario: el mapa Y el texto del video de carrera se veían
// pixelados. La causa real era el canvas de grabación entero (ver el ctx.scale(dpr,dpr)
// en startDynamicVideo), pero las tiles en sí también pedían la versión de menor
// resolución -- @2x le da al drawImage() de abajo el doble de detalle fuente para
// reducir a MAP_TILE_SIZE, en vez de una tile ya de baja resolución estirada.
let routeTileUrl = function(subdomain, zoom, x, y){
  return `https://api.mapbox.com/styles/v1/mapbox/${MAPBOX_STYLE}/tiles/256/${zoom}/${x}/${y}@2x?access_token=${MAPBOX_TOKEN}`;
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
      img.src = routeTileUrl(s, zoom, wrappedX, ty);
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
      // Tamaño de destino explícito (MAP_TILE_SIZE): la imagen @2x llega al doble de esa
      // resolución (512px reales para una tile "de 256"), así el navegador la reduce con
      // buena calidad en vez de estirarla 1:1 como hacía el drawImage de 2 argumentos.
      try{ octx.drawImage(img, (tl.tx-txMin)*MAP_TILE_SIZE, (tl.ty-tyMin)*MAP_TILE_SIZE, MAP_TILE_SIZE, MAP_TILE_SIZE); }catch(e){}
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
  // W/H son el tamaño LÓGICO (720x1280, los atributos fijos del <canvas> en el HTML) --
  // todo el resto de esta función posiciona con estos números. El canvas en sí se muestra
  // en pantalla a `max-width:100%; max-height:70vh` (bastante más grande que 720px real en
  // la mayoría de los celulares), así que sin agrandar también su resolución de verdad
  // (canvas.width/height) el navegador estira ese buffer chico -- mapa Y texto quedan
  // pixelados por igual, reportado por un usuario. ctx.scale(dpr,dpr) hace que todos los
  // dibujos que ya asumen coordenadas de 720x1280 caigan bien en el buffer más grande, sin
  // tocar ninguna otra cuenta de esta función. Tope en 2x (no el dpr real, que puede ser 3
  // en algunos celulares) para no disparar el costo de grabar+codificar un video enorme.
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  const videoDpr = Math.min(window.devicePixelRatio || 1, 2);
  if(videoDpr > 1){
    canvas.width = W * videoDpr;
    canvas.height = H * videoDpr;
    ctx.scale(videoDpr, videoDpr);
  }

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
// Valores de distancia/duración TAL COMO quedan precargados en el formulario (redondeados a
// 2 decimales y a bloques de 0.1min/6s respectivamente -- ver más abajo), no los crudos del
// GPS (r.distanceKm/r.durationSec, con muchos más decimales). saveEditRun() compara contra
// ESTOS, no contra los crudos -- si comparara contra los crudos, guardar sin tocar ninguno de
// los dos campos igual daba "cambió" (el valor redondeado que viaja de ida y vuelta por el
// campo del formulario casi nunca es bit-a-bit igual al float crudo original), lo que hacía
// perder la precisión real del GPS en CADA edición (se sobrescribía igual, sin condición) y
// además re-disparaba una falsa "marca personal nueva" en la primera edición de cualquier
// carrera que fuera el récord vigente de su distancia (getPersonalRecords la excluye a ELLA
// misma al recalcular, así que sin otra carrera en el mismo casillero siempre parece "sin
// marca previa" y checkNewPR la anuncia como nueva).
let editingRunOrigDist = null, editingRunOrigDurMin = null;
function openEditRun(runId){
  const r = state.runs.find(x => String(x.id) === String(runId));
  if(!r) return;
  editingRunId = runId;
  document.getElementById('edit-run-name').value = r.name || '';
  // localDateISO, no toISOString().slice(0,10): esto último muestra el día en UTC, que
  // para una carrera cargada a última hora de la noche puede ser el día SIGUIENTE al
  // real (ver el comentario junto a localDateISO/getTodayRun).
  document.getElementById('edit-run-date').value = localDateISO(r.date);
  dateBoxUpdaters['edit-run-date'] && dateBoxUpdaters['edit-run-date']();
  // Mismo motivo que en toggleManualForm: el campo mostraba el km crudo aunque el label diga
  // "(mi)" en modo imperial -- se precarga en la unidad que el corredor está viendo (la misma
  // que ya usa la tarjeta de esta carrera en Historial, ver fmtDist), no en km sin convertir.
  document.getElementById('edit-run-dist-label').textContent = t(isImperial() ? 'hist_manual_dist_mi' : 'hist_manual_dist');
  document.getElementById('edit-run-dist').value = fmtDist(r.distanceKm, 2);
  document.getElementById('edit-run-dur').value = Math.round((r.durationSec/60)*10)/10;
  // Releemos los campos que acabamos de escribir (en vez de recalcular la misma fórmula acá
  // aparte) para que la comparación en saveEditRun() sea contra el valor EXACTO que
  // parseDistInput/parseFloat le van a dar a esos mismos strings, sin depender de que la
  // fórmula de acá y la de allá se mantengan en sincro a mano.
  editingRunOrigDist = parseDistInput(document.getElementById('edit-run-dist').value);
  editingRunOrigDurMin = parseFloat(document.getElementById('edit-run-dur').value);
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
  const dist = parseDistInput(document.getElementById('edit-run-dist').value);
  const durMin = parseFloat(document.getElementById('edit-run-dur').value);
  if(!date || !(dist>0) || !(durMin>0)){ showToast(t('edit_run_invalid'),'error'); return; }
  const hr = parseInt(document.getElementById('edit-run-hr').value);
  const newShoeId = document.getElementById('edit-run-shoe').value || null;
  const newName = document.getElementById('edit-run-name').value.trim().slice(0,60);
  // checkNewPR(), unas líneas más abajo, recalcula el récord EXCLUYENDO esta misma carrera --
  // si esta carrera YA era el récord vigente de su distancia, excluirla deja como "anterior"
  // a la que le sigue, así que checkNewPR() volvía a anunciarla como marca nueva cada vez que
  // se guardaba una edición, aunque el cambio fuera solo la zapatilla, la FC o la fecha (nada
  // que afecte el ritmo real). Comparamos contra editingRunOrigDist/editingRunOrigDurMin (los
  // valores YA REDONDEADOS que quedaron precargados en el formulario al abrirlo, ver
  // openEditRun), NO contra r.distanceKm/r.durationSec crudos del GPS -- comparar contra los
  // crudos casi siempre daba "cambió" aunque el corredor no hubiera tocado ninguno de los dos
  // campos, porque un valor redondeado que va y vuelve por un input rara vez cae bit-a-bit
  // igual al float crudo original. Eso truncaba la precisión real en cada edición (ver más
  // abajo, la asignación ahora también depende de este flag) y además disparaba una falsa
  // marca personal nueva en la primera edición de cualquier carrera que fuera récord vigente.
  const pacedChanged = dist !== editingRunOrigDist || durMin !== editingRunOrigDurMin;

  // reacomodamos el kilometraje acumulado de zapatillas: se lo restamos al par viejo
  // (con la distancia vieja) y se lo sumamos al par nuevo (con la distancia nueva) --
  // puede ser el mismo par, en cuyo caso el resultado neto es solo el ajuste de km.
  const oldShoe = state.shoes.find(s => String(s.id) === String(r.shoeId));
  if(oldShoe) oldShoe.km = Math.max(0, oldShoe.km - r.distanceKm);

  // Si este run estaba linkeado a un día del plan (autoMarkSessionDone lo marca "hecho"
  // al grabar la carrera), cambiarle la fecha acá lo deja huérfano -- el día viejo seguía
  // mostrando "hecho" para una carrera que ya no ocurrió ese día. deleteRun ya hace este
  // mismo desvínculo al borrar; acá hace falta al mover la fecha por el mismo motivo.
  const staleLinkedDay = state.plan.find(d => d.linkedRunId === r.id);
  if(staleLinkedDay){ staleLinkedDay.status = null; staleLinkedDay.linkedRunId = null; }

  // conservamos la hora original de la carrera, solo cambiamos el día -- así no se
  // desordena si en algún lado se usa la hora para algo.
  const oldMoment = new Date(r.date);
  const newDate = new Date(date+'T00:00:00');
  newDate.setHours(oldMoment.getHours(), oldMoment.getMinutes(), oldMoment.getSeconds());
  r.date = newDate.toISOString();
  // Solo pisamos distancia/duración si de verdad cambiaron (pacedChanged) -- si no, dejamos
  // los valores crudos del GPS tal cual estaban, en vez de truncarlos a la precisión
  // redondeada del formulario (2 decimales / bloques de 0.1min) en CADA edición, aunque el
  // corredor solo haya tocado la zapatilla, la FC o la fecha.
  if(pacedChanged){ r.distanceKm = dist; r.durationSec = Math.round(durMin*60); }
  if(hr>0){ r.avgHr = hr; if(!r.hrLog || r.hrLog.length<=1) r.hrLog = [{t:0,bpm:hr}]; }
  r.shoeId = newShoeId;
  r.name = newName || null; // vacío cae de vuelta al título por fecha, ver openRunDetail
  // Reclama el día NUEVO si corresponde a esta semana -- antes solo se desvinculaba el día
  // viejo (arriba) y quedaba huérfano para siempre, incluso si el motivo de editar la fecha
  // era justamente corregir a qué día pertenecía de verdad la carrera.
  autoMarkSessionDone(r.date, r.id);

  // r.distanceKm (ya actualizado arriba si pacedChanged, o el crudo original si no) -- no
  // el "dist" recién parseado del formulario -- para que el neto sea exactamente cero cuando
  // la distancia no cambió, incluso si distinta zapatilla (oldShoe!==newShoe): restar el
  // crudo viejo arriba y sumar el crudo (sin redondear) acá evita un goteo de precisión en
  // el kilometraje acumulado de la zapatilla en cada edición que no toca la distancia.
  const newShoe = state.shoes.find(s => String(s.id) === String(newShoeId));
  if(newShoe) newShoe.km += r.distanceKm;
  checkShoeWearAlerts();
  // editar distancia también puede cruzar un umbral de km total hacia arriba (checkAchievementUnlocks)
  // o hacerlo bajar de uno que ya estaba cruzado (unmarkLostAchievements, ver su comentario) --
  // las dos son no-ops si no corresponden, así que llamar a ambas siempre es seguro.
  if(pacedChanged){ checkNewPR(r); checkAchievementUnlocks(); unmarkLostAchievements(); }

  const savedRunId = r.id;
  closeEditRun();
  renderHistory(); renderPerfil(); renderAll();
  openRunDetail(savedRunId); // refresca el detalle con los datos nuevos, por si vuelve a mirarlo
  await persist();
  showToast(t('save_confirmed'));
}

/* ================= COACH CHAT (con tool-use real para editar el plan) ================= */
function seedCoachGreeting(){
  // Mismo bug que había en buildWeeklyRecapMessage: faltaba pasar {unit} (quedaba literal
  // en el primer mensaje que ve un usuario nuevo) y el km no se convertía a millas para
  // quien entrena en imperial.
  state.chat = [{role:'coach', text: t('coach_greeting', {name:state.profile.name, km:fmtDist(state.profile.weeklyKm,1), unit:distUnit(), goal:t('ob_goal_'+state.profile.goal)}), ts:Date.now()}];
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
    // Cada llamada a renderChat() reconstruye toda la lista, así que "el último mensaje"
    // es siempre el que genuinamente acaba de aparecer (mensaje propio recién mandado,
    // respuesta del coach recién llegada, aviso proactivo, etc.) -- se lo anima a él
    // solo, no a la charla entera (ver el comentario junto a .msg-enter en el CSS).
    const enterCls = i===msgs.length-1 ? ' msg-enter' : '';
    html += `<div class="msg ${m.role} ${groupCls}${enterCls}">${safeText}</div>`;
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
// Aviso de que hay un mensaje del coach (proactivo o de ajuste automático) que todavía no
// viste, para no depender de entrar "porque sí" a mirar -- antes era un puntito chico sobre
// el personaje (nav-badge-dot/chat-tab-badge), reemplazado del todo por la burbuja de 3
// puntitos (ver updateMascotBubble) después de que el usuario reportara que el puntito se
// veía como un elemento suelto de más.
let mascotBadgeWasVisible = false;
// true mientras sendChat() está esperando la respuesta de /api/chat -- ver los dos toggles
// en sendChat() (el que la prende apenas manda el mensaje, el que la apaga al terminar,
// se cancele, falle la red o llegue bien). Mientras está en true, updateMascotBubble() no
// toca la burbuja: "pensando" manda por sobre "sin leer" (ver el comentario de la burbuja
// en index.html) -- evita un parpadeo si un mensaje proactivo llega justo en el medio de
// una respuesta que ya se está esperando.
let mascotThinking = false;
function updateChatBadge(){
  const lastSeen = state.lastSeenChatTs || 0;
  const hasUnread = (state.chat||[]).some(m => m.role==='coach' && m.ts && m.ts > lastSeen);
  // "pop" del personaje solo en la TRANSICIÓN de sin-leer a con-leer -- updateChatBadge()
  // se llama en cada renderChat() (bastante seguido mientras se habla con el coach), así
  // que sin este chequeo el botón pegaría un salto en cada re-render mientras el mensaje
  // sigue sin leerse, no solo cuando de verdad llega uno nuevo.
  if(hasUnread && !mascotBadgeWasVisible){
    const fab = document.querySelector('.coach-fab');
    if(fab && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)){
      fab.classList.remove('pop'); void fab.offsetWidth; fab.classList.add('pop');
      setTimeout(()=>fab.classList.remove('pop'), 500);
    }
  }
  mascotBadgeWasVisible = hasUnread;
  updateMascotBubble(hasUnread);
}
// Burbuja de 3 puntitos arriba del personaje -- ver el comentario grande junto a
// .coach-fab-thinking en index.html para el porqué del doble uso (pensando/sin leer).
function updateMascotBubble(hasUnread){
  const bubble = document.getElementById('coach-fab-thinking');
  if(!bubble || mascotThinking) return;
  bubble.classList.toggle('show', hasUnread);
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
  // Sin esto, el coach no tenía NINGÚN dato explícito de qué día es hoy -- tenía que
  // adivinarlo mirando qué días del plan ya tienen status (done/skipped), algo frágil
  // que fallaba apenas la semana recién empezaba o el corredor no había entrenado
  // todavía esa semana. Reportado por un usuario: le pidió al coach mover el entrenamiento
  // de "hoy" (un martes) para "mañana", y el coach movió domingo→lunes -- confundió
  // completamente qué día era. Se lo decimos siempre, explícito y primero, con el
  // código de DAY_KEYS de hoy y de mañana para que mover_sesion/modificar_sesion/
  // cancelar_sesion reciban el día correcto sin que el modelo tenga que inferirlo.
  const todayIdx = (new Date().getDay()+6)%7;
  const tomorrowIdx = (todayIdx+1)%7;
  const todayLabel = new Date().toLocaleDateString(LOCALE_MAP[lang], {weekday:'long', day:'numeric', month:'long'});
  // Hora actual y huso horario del corredor (p.tz ya se guarda desde el onboarding, hoy solo
  // se usaba para programar el recordatorio push del lado del servidor -- nunca había llegado
  // al contexto del coach). Sirve para dos cosas: saber si es de mañana/tarde/noche (para no
  // sugerir, por ejemplo, salir a correr "ahora mismo" si son las 23hs), y para inferir de qué
  // parte del mundo es el corredor -- importante para hemisferio (estación del año/clima) y
  // para no asumir que todos entrenan en el huso horario de Argentina.
  const nowTimeLabel = new Date().toLocaleTimeString(LOCALE_MAP[lang], {hour:'2-digit', minute:'2-digit', hour12:false});
  // Cuando hoy es domingo (todayIdx=6), "mañana" (lunes, tomorrowIdx=0) es en realidad el
  // lunes de LA SEMANA QUE VIENE, no el de esta semana -- state.plan solo tiene la semana
  // actual, así que ese "mon" ya cuenta como pasado para isDayLocked. Sin este aviso, un
  // pedido de domingo como "movéme lo de hoy para mañana" terminaba rechazado con "ese día
  // ya pasó", que es confuso: mañana obviamente no pasó todavía.
  const tomorrowIsNextWeek = todayIdx === 6;
  const tomorrowNote = tomorrowIsNextWeek
    ? `, pero OJO: es el ${t('day_'+DAY_KEYS[tomorrowIdx])} de LA SEMANA QUE VIENE, no el de esta semana (hoy es domingo, el último día de la semana actual). Para un pedido sobre "mañana" en este caso: con modificar_sesion o cancelar_sesion usá semana:'siguiente'; mover_sesion NO sirve porque no puede cruzar de una semana a la otra -- si piden mover la sesión de hoy para mañana, usá cancelar_sesion en el día de hoy (dia:'sun') y modificar_sesion con semana:'siguiente' en el lunes que viene, repitiendo el mismo tipo/distancia/zona/terreno que tenía la sesión de hoy`
    : '';
  // Espejo del caso de arriba: cuando hoy es LUNES, "ayer" (domingo) fue de LA SEMANA
  // PASADA, ya cerrada -- no confundir con dia:'sun' de este bloque, que es el domingo que
  // TODAVÍA VIENE (el último día de ESTA semana, a 6 días). isDayLocked() no rechaza ese
  // domingo (no es "menor" al índice de hoy en un lunes), así que sin este aviso un pedido
  // sobre "ayer" ("ayer no pude entrenar, cancelala") podía terminar cancelando por error
  // el domingo FUTURO de esta semana en vez de no hacer nada (correcto: un día de una
  // semana ya cerrada no se puede tocar, ninguna herramienta lo permite).
  const yesterdayIsLastWeek = todayIdx === 0;
  const yesterdayNote = yesterdayIsLastWeek
    ? ` OJO con "ayer": hoy es lunes, así que ayer fue domingo de LA SEMANA PASADA, ya cerrada -- NO es el mismo domingo (dia:'sun') que aparece en el plan de esta semana más abajo, que es el que todavía viene (a 6 días). No existe ninguna herramienta para modificar o cancelar un día de una semana ya cerrada -- si te piden algo sobre "ayer" en este caso, explicaselo así y NO llames a ninguna herramienta con dia:'sun'.`
    : '';
  // getNextWeekPlan() se calcula acá arriba (antes de necesitarse para el bloque de la
  // semana que viene, más abajo) porque también hace falta para poder describir la sesión
  // de "mañana" cuando hoy es domingo (tomorrowIsNextWeek) -- ese "mañana" vive en el plan
  // de la semana que viene, no en el de esta.
  const nw = getNextWeekPlan();
  // Reportado por un usuario (charla real): con el día y el plan completo YA en el
  // contexto, el modelo (sobre todo Haiku) igual se confundía tratando de cruzar "hoy es
  // viernes" contra la lista larga del plan semanal para deducir qué le tocaba -- terminó
  // inventando que la sesión de mañana era "la de 9km que movimos" cuando esos 9km ya
  // eran los de HOY (y encima con dolor), y tardó varios mensajes en corregirse solo. Acá
  // se le arma la respuesta YA resuelta, en una sola frase corta, sin que tenga que buscar
  // ni cruzar nada -- mismo criterio que el aviso de "citá el número exacto" más abajo:
  // cuanto menos tenga que inferir el modelo, menos margen para que se equivoque.
  const describePlanDayForCtx = d=>{
    if(!d) return 'sin datos';
    if(!(d.dist>0)) return 'descanso';
    const label = d.custom ? d.type : t('type_'+d.typeKey);
    let s = `${label}, ${d.dist}km`;
    if(d.status==='done') s += ' (ya hecho' + (d.rating?', calificó: '+d.rating:'') + ')';
    else if(d.status==='skipped') s += ' (salteado)';
    return s;
  };
  const todaySessionDesc = describePlanDayForCtx(state.plan[todayIdx]);
  const tomorrowSessionDesc = describePlanDayForCtx(tomorrowIsNextWeek ? nw.plan[tomorrowIdx] : state.plan[tomorrowIdx]);
  let ctx = `HOY es ${todayLabel}, ${nowTimeLabel} hs (código de día: ${DAY_KEYS[todayIdx]}). Mañana es ${t('day_'+DAY_KEYS[tomorrowIdx])} (código: ${DAY_KEYS[tomorrowIdx]})${tomorrowNote}. Usá esto como la referencia exacta para cualquier pedido con "hoy", "mañana", "ayer" u otro día relativo, y para saber si es de mañana/tarde/noche -- nunca lo adivines mirando el estado del plan NI un "hoy es..." que vos mismo hayas dicho en un mensaje anterior de esta charla: los mensajes viejos pueden ser de otro día, así que este dato (el de ESTE mensaje) manda siempre, incluso si contradice algo que dijiste antes. La sesión de HOY es: ${todaySessionDesc}. La sesión de MAÑANA es: ${tomorrowSessionDesc}. Estos dos datos ya están resueltos -- no hace falta que los recalcules ni los cruces contra el resto del plan más abajo, y si contradicen algo que vos mismo dijiste antes en esta charla, estos mandan siempre.${yesterdayNote}${p.tz ? ` Zona horaria del corredor: ${p.tz} (usala para inferir de qué país/región es -- por ejemplo para saber si está en el hemisferio sur o norte a la hora de hablar de estaciones del año, clima o época de carreras).` : ''} `;
  const ageForCtx = ageFromBirth(p.birth);
  ctx += `Nombre: ${p.name}.${ageForCtx !== null ? ` Edad aprox: ${ageForCtx}.` : ''} Peso: ${p.weight}kg. Altura: ${p.height}cm. Corre ${p.weeklyKm}km/semana (calculado automáticamente según objetivo y fecha de carrera). Terreno: ${p.terrain}. Objetivo: ${t('ob_goal_'+p.goal)}. Zonas de FC (bpm): ${JSON.stringify(p.hrZones)}.`;
  // El plan generado (generatePlan) YA sabe si es principiante y le arma sesiones en
  // consecuencia (zona 1 fija, sin series/tempo/cuestas -- o zona 2 + algún fartlek si ya
  // tiene base de otro deporte de impacto, ver hasRunningImpactBase), pero el coach del chat
  // no tenía NINGÚN dato de esto -- podía recibir "dame una serie de 400s" de alguien que
  // nunca corrió y arma la sesión con modificar_sesion sin saber que el plan la evita a
  // propósito. Reportado en una auditoría de coherencia: dos sistemas (el generador
  // determinístico y el coach de IA) tomando la misma decisión con información distinta.
  if(isBeginnerProfile(p)){
    ctx += hasRunningImpactBase(p)
      ? ` Es principiante EN RUNNING (nunca entrenó corriendo solo de forma constante), aunque ya tiene base de otro deporte de impacto (${(p.crossTrainingSports||[]).map(s=>t('sport_'+s)).join(', ')}) -- por eso el plan ya lo tiene en zona 2 con algún fartlek libre cada tanto, en vez del "todo zona 1" de un principiante sin esa base. Si pide series estructuradas, ritmo medio o cuestas, explicale que todavía no le conviene esa carga técnica específica de correr (aunque esté en forma) y ofrecé como mucho más fartlek -- no uses modificar_sesion para darle series/tempo/cuestas.`
      : ` Es TOTALMENTE principiante en running (nunca entrenó corriendo de forma constante) -- el plan lo tiene a propósito solo en zona 1, con rodajes suaves y sin ninguna sesión de velocidad, para construir base sin lesionarlo. Si pide series, ritmo fuerte, cuestas o fartlek, explicale con calidez por qué todavía no (se gana con constancia, no arrancando fuerte) y no uses modificar_sesion para dárselo -- el sistema lo va a graduar solo a zona 2 con variedad apenas demuestre unas semanas reales de constancia.`;
  }
  if(p.trainingDays && p.trainingDays.length) ctx += ` Días de entreno habituales (cronograma de base, permanente): ${p.trainingDays.map(d=>t('day_'+d)).join(', ')}. Si el corredor pide cambiar este cronograma de forma permanente (no solo esta semana), usá modificar_perfil con dias_entreno.`;
  if(p.raceDate){
    // p.raceDate es un "YYYY-MM-DD" sin hora -- new Date(p.raceDate) SIN el 'T00:00:00' lo
    // parsea como medianoche UTC, no local (mismo bug ya encontrado en earliestMonday). En
    // husos negativos (Argentina) eso corre la cuenta regresiva: una carrera de hoy o mañana
    // a la tarde podía aparecer como "ya pasó" en el contexto que lee el coach del chat.
    const weeksLeft = Math.round((new Date(p.raceDate+'T00:00:00') - new Date()) / (7*86400000));
    ctx += ` Fecha de la carrera objetivo: ${p.raceDate} (${weeksLeft>0?`faltan ${weeksLeft} semanas`:'ya pasó'}).`;
  }
  if(p.weeklyGoalKm > 0) ctx += ` Meta de km que el corredor se puso para esta semana: ${p.weeklyGoalKm}km (esto ya se usó para ajustar el volumen del plan actual, dentro de márgenes seguros).`;
  if(p.goalNote) ctx += ` Objetivo personal, en sus propias palabras: "${p.goalNote}".`;
  const gapWeeks = detectTrainingGapWeeks(state.weekStart);
  if(gapWeeks >= 2) ctx += ` Hace ${gapWeeks} semanas que no registra una carrera -- si el volumen del plan actual parece bajo, es porque ya se lo redujo automáticamente por esta pausa.`;
  // Mismo problema que gapWeeks de arriba: generatePlan multiplica el volumen real de esta
  // semana por taperMultiplier/recoveryMultiplier/eventRaceWeekMultiplier, pero antes el
  // coach no tenía ningún aviso de cuál de estos aplicaba -- solo veía el plan.weeklyKm
  // "de crucero" (arriba) contra el plan real (más abajo) sin saber por qué no coinciden,
  // y podía dar una explicación inventada si le preguntaban por qué bajó el volumen.
  if(taperMultiplier(p, state.weekStart) < 1) ctx += ` Esta semana el corredor está en la puesta a punto (tapering) antes de su carrera OBJETIVO del ${p.raceDate} -- el volumen de esta semana ya bajó a propósito por eso, es normal y esperable que sea menor a los ${p.weeklyKm}km/semana de crucero.`;
  if(recoveryMultiplier(state.weekStart) < 1) ctx += ` Esta semana es de recuperación, la que sigue a la carrera que corrió (cargada en "Próximos eventos") -- el volumen bajó a propósito por eso.`;
  if(postGoalRaceRecoveryMultiplier(p, state.weekStart) < 1) ctx += ` Esta semana es de recuperación, la que sigue a la carrera OBJETIVO del ${p.raceDate} que el corredor ya corrió -- el volumen bajó a propósito por eso.`;
  if(eventRaceWeekMultiplier(state.weekStart, p) < 1) ctx += ` Esta semana cae la carrera cargada en "Próximos eventos" -- el volumen de esta semana bajó a propósito, como una semana de descarga más, para no llegar reventado a correrla.`;
  if(p.coachNotes && p.coachNotes.length) ctx += ` Notas permanentes guardadas sobre el corredor (lesiones, preferencias u otros datos a tener en cuenta siempre): ${p.coachNotes.map(n=>`"${n}"`).join('; ')}.`;
  if(pregnancyStillRecent(p)) ctx += ` El corredor indicó en el onboarding que está embarazada o dio a luz en los últimos 6 meses -- el plan ya se generó con volumen e intensidad reducidos por precaución. Si pregunta por esto, recordale que consulte con su médico/a antes de cualquier cambio de intensidad; no le des indicaciones médicas específicas vos.`;
  if(p.availableMinPerSession) ctx += ` Dispone de unos ${p.availableMinPerSession} minutos en promedio por sesión -- el plan ya limita las sesiones entre semana a ese tiempo (la tirada larga del fin de semana queda afuera de ese límite a propósito). Si igual pregunta por el tiempo de una sesión, tené esto en cuenta.`;
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
  // Antes estos dos planes iban uno pegado al otro, en el mismo párrafo, con el mismo
  // formato denso -- reportado por un usuario: el coach terminaba mezclando los km de la
  // semana que viene con los de esta semana (le decía "hoy te toca 6km" cuando ese 6km en
  // realidad era de martes/jueves de LA SEMANA QUE VIENE, no de hoy). Separarlos en
  // bloques bien marcados, con su propio título en mayúsculas y una instrucción explícita
  // de cuándo usar cada uno, hace mucho más difícil que el modelo los confunda -- sobre
  // todo con un modelo más chico (Haiku), que sigue mejor una estructura clara que un
  // párrafo largo y denso.
  // Fechas de calendario de cada día de las dos semanas, ya resueltas -- mismo motivo que
  // todaySessionDesc/tomorrowSessionDesc más arriba: el modelo NO es confiable haciendo
  // aritmética de calendario de memoria. Reportado por un usuario real: preguntó "¿qué
  // lunes?" sobre la semana que viene, y el coach contestó una fecha que ni siquiera caía
  // un lunes (calculó mal cuántos días faltaban) -- el bloque de abajo solo traía nombres
  // de día ("mon", "tue"...) sin ninguna fecha de calendario asociada, así que cualquier
  // pregunta por "qué día del mes" cae en la misma trampa que ya se documentó para "hoy"/
  // "mañana" al principio de esta función. addDaysToIsoLocal ya es la misma función segura
  // contra DST que usa el resto del archivo para esto.
  const datesForWeek = weekStartIso => DAY_KEYS.map((d,i)=>`${d}=${addDaysToIsoLocal(weekStartIso, i)}`).join(', ');
  ctx += `\n\nFechas de calendario de cada día de esta semana: ${datesForWeek(state.weekStart)}. Fechas de calendario de cada día de la semana que viene: ${datesForWeek(nw.weekStart)}. Si te preguntan qué fecha del mes cae tal día, usá estos datos directo -- nunca calcules vos cuántos días faltan ni a qué fecha corresponde un día, aunque te parezca un cálculo simple.`;
  ctx += `\n\n=== PLAN DE ESTA SEMANA (semana ${state.weekNumber}, la semana ACTUAL -- usá SIEMPRE este bloque para responder sobre "hoy", "mañana", "ayer" o "esta semana") ===\n${state.plan.map(d=>`${d.day}=${d.custom?d.type:d.typeKey}${d.zone?'/Z'+d.zone:''}/${d.dist}km(~${planDurationMin(d)}min)${d.status?'/'+d.status:''}${d.rating?'/calificó:'+d.rating:''}`).join(', ')}.\n=== FIN plan de esta semana ===`;
  ctx += `\n\n=== PLAN DE LA SEMANA QUE VIENE (semana ${nw.weekNumber}, todavía NO empezó -- es DISTINTA a la de arriba, ya calculada pero puede ajustarse según cómo termine esta semana. NUNCA uses estos km para responder sobre "hoy" o "mañana", esos están en el bloque de arriba) ===\n${nw.plan.map(d=>`${d.day}=${d.custom?d.type:d.typeKey}${d.zone?'/Z'+d.zone:''}/${d.dist}km(~${planDurationMin(d)}min)`).join(', ')}.\n=== FIN plan de la semana que viene ===\n`;
  // Reportado por un usuario: le preguntó al coach cuánto tocaba un día puntual y respondió
  // con un número (7km) distinto al que estos mismos bloques ya traían (8km) -- no un dato
  // mal cargado, el bloque de arriba siempre tiene el número real, solo hacía falta pedirle
  // explícitamente que lo cite tal cual en vez de recordarlo/redondearlo de memoria.
  ctx += `\n\nCuando cites la distancia, zona o tipo de una sesión de estos dos bloques, copiá el número EXACTO tal como está ahí -- nunca lo redondees ni lo digas de memoria.`;
  return ctx;
}
const TOOLS = [
  {
    name:"modificar_sesion",
    description:"Modifica UNA sesión puntual del plan semanal: tipo, distancia, zona de frecuencia cardíaca objetivo, terreno y descripción. Usala cuando el corredor pida un cambio en un día específico, de esta semana o de la que sigue. Si semana es 'actual' y el día pedido ya pasó (o ya se corrió/salteó), la herramienta va a rechazar el cambio -- avisale al corredor que ese día ya cerró y ofrecele ajustar desde hoy en adelante, o la semana que viene. IMPORTANTE: incluí siempre distancia_km (o duracion_min) con un valor apropiado para el tipo de sesión NUEVA -- si lo omitís, la sesión se queda con la distancia que tenía ese día ANTES del cambio, que casi nunca tiene sentido para un tipo distinto (ej. no dejes una sesión de 'series' con los 20km que tenía la tirada larga que reemplaza).",
    input_schema:{type:"object", properties:{
      semana:{type:"string", enum:["actual","siguiente"], description:"Si el cambio es para la semana en curso o para la que sigue. Por defecto 'actual'. Ya tenés el plan de ambas semanas en el contexto."},
      dia:{type:"string", enum:DAY_KEYS, description:"Código del día: mon,tue,wed,thu,fri,sat,sun (siempre en estos códigos, sin importar el idioma de la charla)"},
      tipo:{type:"string", description:"Nombre del tipo de sesión en el idioma de la conversación, ej. 'Rodaje suave', 'Easy run'"},
      tipo_categoria:{type:"string", enum:["easy","intervals","tempo","long","fartlek","hills","progression"], description:"Categoría técnica de la sesión en estos códigos fijos, SIN traducir (independiente de 'tipo', que va en el idioma de la charla). Se usa para las estadísticas de variedad de entrenamientos y para relacionar la carrera registrada con el tipo de sesión que tocaba -- elegí la que mejor corresponda a la sesión nueva."},
      distancia_km:{type:"number", description:"Distancia total de la sesión, SOLO si NO incluís repeticiones/esfuerzo_min -- si la sesión tiene repeticiones, la app calcula la distancia real sumando reps*esfuerzo_min sola e IGNORA este campo, así que no tiene sentido mandar acá un número que no coincida con esa cuenta (ej. no pongas '7' acá si tus 6 repeticiones de 3min a este ritmo dan 2.4km reales -- mejor subí la cantidad de repeticiones o los minutos de esfuerzo hasta llegar a los 7km que querés, y dejá que la app calcule el total)."},
      duracion_min:{type:"number", description:"Duración de la sesión en minutos. Usalo en vez de distancia_km si el corredor entrena por tiempo (fijate en el contexto) o si pide la sesión directamente en minutos -- se convierte sola a km internamente."},
      zona:{type:"integer", minimum:1, maximum:5, description:"Zona de frecuencia cardíaca objetivo para la sesión NUEVA, no un dato libre: 1-2 para rodaje suave y tirada larga, 3 para tempo/progresivo/fartlek, 4-5 para series/cuestas. No le pongas una zona alta a una sesión suave ni una zona baja a una sesión fuerte -- tiene que ser coherente con tipo_categoria."},
      terreno:{type:"string", enum:["asfalto","trail","mixto"]},
      repeticiones:{type:"integer", description:"SOLO si la sesión tiene estructura de repeticiones (series, cuestas, fartlek): cantidad de repeticiones. Junto con esfuerzo_min, hace que la app le muestre al corredor el número SIEMPRE en la unidad correcta (metros o minutos, según cómo entrena) -- vos no tenés que elegir la unidad, la app convierte sola. No lo incluyas para sesiones sin repeticiones (rodaje suave, tirada larga, ritmo medio, progresivo). IMPORTANTE: elegí vos estos valores con tu criterio de entrenador, NUNCA se los preguntes al corredor -- mismo criterio que ya usa el generador automático del plan (6 a 10 repeticiones de 2 a 4 minutos de esfuerzo, con 1 a 2 minutos de recuperación, es un fartlek típico). Si el corredor te pidió un cambio de distancia/tiempo total, ajustá la cantidad de repeticiones o los minutos de esfuerzo para llegar a eso, no le pidas que te arme la sesión él."},
      esfuerzo_min:{type:"number", description:"Requerido si incluís repeticiones. Duración de CADA repetición fuerte, SIEMPRE en minutos (nunca en metros, sin importar cómo entrena el corredor -- la app la convierte sola a metros si corresponde)."},
      recuperacion_min:{type:"number", description:"Duración de la recuperación entre cada repetición, SIEMPRE en minutos. Usá el mismo criterio que esfuerzo_min."},
      descripcion:{type:"string", description:"Instrucción breve para el corredor, en el idioma de la conversación. Si incluiste repeticiones/esfuerzo_min/recuperacion_min, NO repitas acá esos números ni su unidad (la app los agrega sola, ya convertidos correctamente) -- esta descripción es solo contexto general: terreno, por qué se hizo el cambio, qué buscar en el tramo. Si la sesión NO tiene repeticiones, esta sí es la descripción completa: dá igual números concretos y accionables si corresponde (ritmo, duración), nunca un rango vago tipo 'a sensación', usando la misma unidad que ya usás para distancia_km/duracion_min (fijate en el contexto si el corredor entrena por distancia o por tiempo)."}
    }, required:["dia","tipo","tipo_categoria","descripcion"]}
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
      nota:{type:"string", description:"El dato a recordar, resumido en una frase breve, en el idioma de la conversación."},
      zona_cuerpo:{type:"string", enum:["rodilla","tobillo","pantorrilla","isquios","cadera","espalda","pie","cuadriceps","otro"], description:"Completá este campo SOLO si la nota describe una lesión, dolor o molestia física nueva del corredor (ej. \"le duele la rodilla hace unos días\") -- elegí la zona del cuerpo más cercana de la lista, o \"otro\" si no encaja. NO lo completes para preferencias, horarios u otro tipo de dato. Al completarlo, la molestia queda registrada igual que si la hubiera cargado a mano en Perfil > Molestias: el plan pasa a un criterio más conservador automáticamente. Se marca como resuelta solo desde Perfil > Molestias (contale al corredor que la va a ver ahí) -- vos no tenés forma de marcarla resuelta por chat."}
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
//
// coachUndoTurnSnapshotTaken (variable de módulo, NO se persiste -- solo necesita durar lo que
// dura un intercambio, nunca sobrevivir un cierre de la app) evita que un mismo pedido que
// dispare MÁS DE UNA herramienta en la misma respuesta (ej. "pasá el martes al miércoles y
// cancelá el jueves" -- mover_sesion + cancelar_sesion, o el propio loop de sendChat() dándole
// al modelo varias vueltas) termine pisando el snapshot una y otra vez, cada vez con un estado
// más "intermedio" (después del primer cambio, antes del segundo) en vez del estado de ANTES
// de todo el turno. Sin esto, "deshacer" después de un pedido así solo revertía el ÚLTIMO
// cambio aplicado, dejando los anteriores del mismo pedido sin revertir -- el corredor pedía
// deshacer "eso que acabas de hacer" (todo el pedido) y solo se deshacía una parte. Se resetea
// una vez por CADA mensaje nuevo del corredor (al principio de sendChat()), no por cada vuelta
// del loop de herramientas -- un mismo pedido puede necesitar varias vueltas de ida y vuelta
// con el modelo, y todas esas vueltas siguen siendo UN solo turno a los ojos de "deshacer".
let coachUndoTurnSnapshotTaken = false;
function captureUndoSnapshot(){
  if(coachUndoTurnSnapshotTaken) return;
  coachUndoTurnSnapshotTaken = true;
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
// El modelo (Claude Haiku) puede devolver, por error de redondeo de su parte o directamente
// una alucinación, una distancia absurda (negativa, cero, o algo como "200km" para una
// sesión puntual) o una zona fuera de 1-5 -- el input_schema de modificar_sesion lo pide así
// (zona: minimum:1, maximum:5), pero eso es solo una guía para el modelo: la API de tool use
// no lo hace cumplir de verdad, así que nada impedía que ese valor se guardara tal cual y
// terminara mostrado en el plan del corredor como si fuera una sesión real y coherente.
// MAX_SESSION_KM es generoso a propósito (ninguna sesión de ENTRENAMIENTO puntual, a
// diferencia de una carrera en sí, tiene sentido por encima de esto) para no bloquear
// pedidos legítimos de fondistas/ultramaratonistas.
const MAX_SESSION_KM = 100;
function resolvePlanDistKm(input){
  // Si vino una estructura de repeticiones, ESA manda siempre para el número de arriba --
  // nunca un distancia_km/duracion_min suelto que el modelo haya mandado aparte. Reportado
  // por un usuario con un caso real: el coach mandó "7km" junto con repeticiones:6,
  // esfuerzo_min/recuperacion_min que sumaban 2.4km entre las dos -- dos datos del mismo
  // pedido, completamente inconsistentes entre sí, porque nunca se cruzaban. Mismo criterio
  // que hillActualKm/intervalActualKm/fartlekActualKm ya aplican para las sesiones que arma
  // el algoritmo: la distancia real SIEMPRE sale de sumar las repeticiones, nunca de un
  // número independiente, así sea el propio modelo el que lo haya tipeado.
  const interval = resolveCustomInterval(input);
  if(interval){
    const pace = estimateBasePaceMinPerKm(state.profile);
    // Cuestas y fartlek cuentan la recuperación como distancia real -- bajar trotando o
    // trotar suave entre tramos sigue siendo terreno recorrido, mismo criterio que
    // hillActualKm/fartlekActualKm ya usan para las sesiones que arma el algoritmo. Series
    // (intervals) no: ahí la recuperación es una pausa por tiempo, no un tramo que se corre
    // (ver intervalActualKm). Reportado por un usuario: un fartlek "6x400m + 6x250m de
    // recuperación" solo mostraba 2.4km (el esfuerzo nomás) en vez de los 3.9km reales que
    // esas repeticiones suman entre las dos partes -- esta rama tenía el criterio de series
    // copiado por error, en vez del de fartlek/cuestas.
    const category = effectiveTipoCategoria(input);
    const cycleMin = category==='intervals' ? interval.workMin : interval.workMin + interval.restMin;
    const km = Math.max(0.1, Math.round((interval.reps * cycleMin / pace) * 10) / 10);
    return Math.min(MAX_SESSION_KM, km);
  }
  const distKm = Number(input.distancia_km);
  if(Number.isFinite(distKm) && distKm>0) return Math.min(MAX_SESSION_KM, Math.round(distKm*10)/10);
  const durMin = Number(input.duracion_min);
  if(Number.isFinite(durMin) && durMin>0){
    const km = Math.max(0.5, Math.round((durMin / estimateBasePaceMinPerKm(state.profile))*10)/10);
    return Math.min(MAX_SESSION_KM, km);
  }
  return null;
}
function resolveZone(zona){
  const z = Number(zona);
  return Number.isFinite(z) ? Math.min(5, Math.max(1, Math.round(z))) : null;
}
// "fartlek" es palabra prestada del sueco y se escribe IGUAL en los 6 idiomas de la app (a
// diferencia de "series"/"cuestas", que sí se traducen) -- alcanza con buscarla en tipo/
// descripcion para reconocer un fartlek aunque tipo_categoria diga otra cosa (ver el
// comentario grande en applyPlanChange, junto al primer uso de esto).
function effectiveTipoCategoria(input){
  const looksLikeFartlek = /fartlek/i.test(input.tipo||'') || /fartlek/i.test(input.descripcion||'');
  return looksLikeFartlek ? 'fartlek' : input.tipo_categoria;
}
// Estructura de repeticiones para una sesión CUSTOM (armada por el coach vía chat, ej.
// modificar_sesion) -- reportado por un usuario: el coach describía sus repeticiones a mano
// en el texto libre y, aunque ya se le pidió explícitamente que use la unidad correcta según
// el modo del corredor, seguía escribiendo minutos para alguien que entrena por distancia (un
// ejemplo en la propia instrucción lo sesgaba). En vez de seguir confiando en que el modelo
// elija bien la unidad cada vez, ahora el modelo manda SIEMPRE esfuerzo_min/recuperacion_min
// en minutos (una unidad fija, sin ambigüedad) y la app arma la oración con la unidad
// correcta ella misma -- mismo criterio que ya usa fartlekActualKm/repMetersFromMin para las
// sesiones que arma el algoritmo automático, así que esto no puede volver a pasar.
function resolveCustomInterval(input){
  const reps = Math.round(Number(input.repeticiones));
  const workMin = Number(input.esfuerzo_min);
  if(!(reps>0) || !(workMin>0)) return null;
  const restMinRaw = Number(input.recuperacion_min);
  const restMin = restMinRaw>0 ? restMinRaw : 1;
  return { reps, workMin, restMin };
}
// Tipos que se describen con repeticiones -- si el modelo arma uno de estos sin
// repeticiones/esfuerzo_min, applyPlanChange rechaza el cambio en vez de dejarlo pasar con
// texto libre sin estructura (ver el comentario grande más abajo, en el chequeo).
const REP_BASED_TYPES = ['intervals','hills','fartlek'];
function applyPlanChange(input){
  // El input_schema de la herramienta declara dia como enum:DAY_KEYS, pero eso es solo una
  // guía para el modelo -- la API de tool use no lo hace cumplir de verdad (mismo motivo que
  // ya vale para zona/distancia_km, ver los comentarios de MAX_SESSION_KM/resolveZone más
  // abajo). La rama de la semana ACTUAL valida esto indirectamente (state.plan.find no
  // encuentra nada si el día no es real, y devuelve "Día no encontrado." antes de tocar
  // nada), pero la rama 'siguiente' escribía state.nextWeekOverrides[input.dia] y armaba
  // t('day_'+input.dia) con el valor CRUDO, sin ese mismo chequeo -- si el modelo mandaba
  // cualquier otra cosa ahí (alucinación, o texto de la charla que terminó colándose en ese
  // campo), t() devuelve la clave tal cual cuando no encuentra traducción (ver esa función),
  // y ese texto sin escapar terminaba en un mensaje de chat de rol 'system', que renderChat()
  // inserta con innerHTML sin escapar -- una inyección de HTML real, no solo teórica.
  if(!DAY_KEYS.includes(input.dia)) return 'Día no encontrado.';
  // El snapshot de undo se toma DESPUÉS de validar (día encontrado, no bloqueado) -- si
  // se toma antes, un pedido inválido (día ya pasado, por ejemplo) igual pisa el snapshot
  // del cambio real anterior con el estado actual sin cambios, y "deshacer" ya no puede
  // recuperar ese cambio previo aunque el mensaje diga que sí lo deshizo.
  //
  // Reportado dos veces por un usuario: series/cuestas/fartlek custom seguían apareciendo en
  // minutos para alguien que entrena por distancia, a pesar de la instrucción explícita de
  // mandar repeticiones/esfuerzo_min -- el modelo simplemente no las mandaba algunas veces
  // (y de paso eso fue lo que disparó el bug del NaN, ver el comentario de más abajo en la
  // rama 'siguiente'). En vez de seguir confiando en que el modelo cumpla la instrucción,
  // ahora directamente RECHAZAMOS el cambio si es un tipo con repeticiones y faltan esos
  // campos -- el resultado de la herramienta (este mismo string) vuelve al modelo como
  // tool_result en la misma respuesta, así que puede corregir y reintentar sin que el
  // corredor tenga que pedirlo nunca más a mano.
  //
  // Esto solo mira tipo_categoria -- y un usuario encontró la vuelta: rechazado un pedido de
  // fartlek sin estructura, el modelo volvió a llamar a la herramienta con tipo:"Fartlek"
  // (el nombre libre que ve el corredor) pero tipo_categoria en otra cosa (easy/tempo), que
  // esquiva este chequeo sin querer -- el resultado fue el fartlek de siempre, vago, sin
  // reps. effectiveTipoCategoria() cierra ese hueco reconociendo "fartlek" en tipo/
  // descripcion sin importar qué haya puesto en tipo_categoria (ver esa función).
  const effectiveCategoria = effectiveTipoCategoria(input);
  const customIntervalCheck = resolveCustomInterval(input);
  if(REP_BASED_TYPES.includes(effectiveCategoria) && !customIntervalCheck){
    return `Para ${effectiveCategoria} hace falta repeticiones y esfuerzo_min (y recuperacion_min) -- volvé a llamar a modificar_sesion incluyendo esos tres campos, en minutos, sin escribir la cantidad/duración en descripcion. Usá tipo_categoria:"fartlek" para esta sesión.`;
  }
  // Reportado por un usuario: aun mandando repeticiones/esfuerzo_min bien, el modelo IGUAL
  // repetía los números en descripcion -- esta vez en minutos, duplicando (y contradiciendo
  // en la unidad) la línea que la app agrega sola en metros. La instrucción del campo
  // descripcion ya pide no hacer esto; como seguía pasando, ahora se rechaza directamente si
  // descripcion tiene un número seguido de una unidad de tiempo/distancia, igual que ya se
  // rechaza cuando falta la estructura.
  if(customIntervalCheck && /\d+([.,]\d+)?\s*(min|minuto|seg|segundo|km|kilómetro|kilometro|\bm\b|metro)/i.test(input.descripcion||'')){
    return `La descripcion todavía tiene números/unidades de la sesión (minutos, metros, etc.) -- sacalos, la app ya los agrega sola en la unidad correcta. Dejá en descripcion solo contexto (terreno, motivo del cambio), sin repetir cantidad, distancia ni duración.`;
  }
  // Los textos de series/cuestas/fartlek (desc_intervals_detail, desc_hills_detail,
  // desc_fartlek_detail, desc_custom_reps_detail) siempre citan la zona objetivo -- si el
  // modelo manda repeticiones/esfuerzo_min sin zona, resolveZone(undefined) da null y esos
  // textos terminaban mostrando literalmente "zona null" al corredor (t() hace un replace
  // directo, sin ningún chequeo de null). Encontrado con pruebas adversariales. Rechazamos
  // acá, mismo patrón que el chequeo de arriba (repeticiones sin esfuerzo_min).
  if(customIntervalCheck && resolveZone(input.zona)===null){
    return `Para ${effectiveCategoria} hace falta también la zona objetivo (zona, 1 a 5) -- volvé a llamar a modificar_sesion incluyéndola.`;
  }
  // distancia_km/duracion_min mandados EXPLÍCITAMENTE pero con un valor sin sentido (0,
  // negativo, no numérico) -- a diferencia de OMITIRLOS del todo (que a propósito deja la
  // sesión con la distancia de ANTES, ver la descripción de esta herramienta), un valor
  // explícito pero inválido es casi seguro un error del modelo, no una decisión a propósito.
  // Sin este chequeo, resolvePlanDistKm() devolvía null igual que si el campo nunca se
  // hubiera mandado -- la sesión se quedaba con la distancia VIEJA, pero el mensaje de
  // confirmación la mostraba como si fuera la nueva, sin que nadie se enterara de que el
  // número pedido en realidad nunca se aplicó. Encontrado con pruebas adversariales.
  if(!customIntervalCheck){
    if(input.distancia_km !== undefined && !(Number(input.distancia_km) > 0)){
      return `distancia_km:${input.distancia_km} no es un valor válido -- tiene que ser un número mayor a 0. Si no querés cambiar la distancia, omití este campo directamente en vez de mandar 0.`;
    }
    if(input.duracion_min !== undefined && !(Number(input.duracion_min) > 0)){
      return `duracion_min:${input.duracion_min} no es un valor válido -- tiene que ser un número mayor a 0. Si no querés cambiar la duración, omití este campo directamente en vez de mandar 0.`;
    }
  }
  if(input.semana === 'siguiente'){
    captureUndoSnapshot();
    // la semana que sigue no es un array persistido como state.plan, así que el cambio puntual
    // se guarda como "override" y se aplica encima de lo que genere getNextWeekPlan() cada vez
    // (que sigue reaccionando a cómo termine esta semana) hasta que se promueva a semana actual
    if(!state.nextWeekOverrides) state.nextWeekOverrides = {};
    // typeKey en el override (además de type/desc, que son el texto que ve el corredor) es lo
    // que le permite a runBenefitKey() reconocer esta sesión como lo que realmente es (series,
    // tempo, etc.) en vez de arrastrar el typeKey del día base -- ver applyPlanChange y el
    // comentario en getNextWeekPlan.
    const override = { type: input.tipo, desc: input.descripcion, typeKey: input.tipo_categoria };
    const effectiveDistKm = resolvePlanDistKm(input);
    if(effectiveDistKm!==null) override.dist = effectiveDistKm;
    const zone = resolveZone(input.zona);
    if(zone!==null) override.zone = zone;
    if(input.terreno) override.terrain = input.terreno;
    // A diferencia de la rama de la semana actual (que borra d.interval directo con `delete`
    // cuando no hay estructura nueva), acá SIEMPRE hay que dejar la clave `interval` puesta
    // -- aunque sea en null -- porque getNextWeekPlan() arma este día de cero cada vez
    // (Object.assign({}, d, ov, ...)) a partir de un día recién generado por el algoritmo
    // para ESA semana. Si ese día base resultaba ser, por ejemplo, una sesión de cuestas
    // (con repMeters, no workMin/restMin) y el override no traía su propia clave `interval`,
    // Object.assign conservaba el interval VIEJO de cuestas -- que planLabel intentaba leer
    // como si fuera de fartlek (workMin/restMin), y como esos campos no existían ahí, salía
    // "NaNm" en la sesión. Reportado por un usuario con exactamente ese síntoma.
    const customInterval = resolveCustomInterval(input);
    override.interval = customInterval || null;
    state.nextWeekOverrides[input.dia] = override;
    renderPlan(); persist();
    state.chat.push({role:'system', text:sysMsgWithIcon(ICONS.edit, t('coach_plan_updated')+': '+t('day_'+input.dia)), ts:Date.now()});
    const amountTxt = typeof input.duracion_min==='number' ? `${input.duracion_min}min (~${fmtDist(effectiveDistKm,1)}${distUnit()})` : (effectiveDistKm!==null ? fmtDist(effectiveDistKm,1)+distUnit() : '');
    return `OK, actualicé ${input.dia} de la semana que viene: ${input.tipo}${amountTxt?', '+amountTxt:''}${zone?', zona '+zone:''}.`;
  }
  const d = state.plan.find(x=>x.day===input.dia);
  if(!d) return "Día no encontrado.";
  // El día ya pasó (o ya se corrió/salteó) -- no tiene sentido asignarle ahora un
  // entrenamiento distinto de forma retroactiva. Se lo explicamos al modelo para
  // que se lo cuente al corredor en vez de aplicar el cambio silenciosamente.
  if(isDayLocked(input.dia)) return `No puedo modificar ${input.dia}: ya pasó (o ya se corrió/salteó) esta semana. Puedo ajustar desde hoy en adelante, o la semana que viene.`;
  captureUndoSnapshot();
  d.custom = true;
  d.cancelled = false; // si venía de cancelar_sesion, esta sesión nueva reemplaza esa cancelación
  d.type = input.tipo; d.desc = input.descripcion;
  // Sin esto, un día que antes era descanso (u otro tipo) quedaba con el typeKey viejo --
  // las estadísticas de variedad de sesiones de calidad y el tag de beneficio del entrenamiento
  // en el historial (que leen d.typeKey, no d.type) seguían viendo el tipo anterior.
  d.typeKey = input.tipo_categoria;
  const effectiveDistKm = resolvePlanDistKm(input);
  if(effectiveDistKm!==null) d.dist = effectiveDistKm;
  const zone = resolveZone(input.zona);
  if(zone!==null) d.zone = zone;
  const customInterval = resolveCustomInterval(input);
  // Si esta edición no trae repeticiones, no dejamos colgado un d.interval de una edición
  // ANTERIOR de este mismo día -- si no, una sesión reescrita sin estructura ("cambiala por
  // un rodaje suave") podía arrastrar reps de la sesión de series que reemplazó.
  if(customInterval) d.interval = customInterval; else delete d.interval;
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
  const amountTxt = typeof input.duracion_min==='number' ? `${input.duracion_min}min (~${fmtDist(d.dist,1)}${distUnit()})` : `${fmtDist(d.dist,1)}${distUnit()}`;
  return `OK, actualizado ${d.day}: ${d.type}, ${amountTxt}${d.zone?', zona '+d.zone:''}.`;
}
function applyMoveSession(input){
  // Mueve/intercambia la sesión de un día a otro DENTRO de la semana actual, conservando
  // tipo, distancia, terreno, zona y estructura de series exactamente como estaban --
  // pensada para pedidos de "mové/pasá/cambiá de día" una sesión ya planificada, sin que
  // el modelo tenga que reescribir la descripción de memoria (eso es lo que hacía antes
  // modificar_sesion para estos casos, y por eso el día de destino terminaba con una
  // descripción distinta a la original y, a veces, sin terreno).
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
  // El snapshot de undo se toma recién acá, después de todas las validaciones -- ver el
  // comentario equivalente en applyPlanChange.
  captureUndoSnapshot();
  swapPlanDaySessions(origDay, destDay);
  // Sin esto, si los dos días eran sesiones lisas del algoritmo (el caso más común -- ninguno
  // ya era custom ni cancelled antes del swap), quedaban SIN ninguna marca de protección
  // después de moverlos. preserveLivedDays() -- lo único que evita que una regeneración del
  // plan (guardar el perfil, cambiar de objetivo, cargar una carrera en Próximos Eventos, o
  // incluso otra herramienta del coach en la MISMA respuesta) le pise el contenido a un día --
  // solo respeta un día con d.custom o d.cancelled en true; sin ninguno de los dos, el
  // movimiento que el corredor acaba de confirmar desaparecía en silencio en la próxima
  // regeneración, sin ningún aviso ni error. modificar_sesion y cancelar_sesion ya se
  // protegen solos (ponen custom/cancelled) -- mover_sesion era la única de las tres que no.
  // Un día que terminó cancelado (llevaba la marca cancelled consigo en el swap) no se toca:
  // esos días van a propósito con custom:false (ver el merge de nextWeekOverrides), si no
  // planLabel() intentaría leer d.type/d.desc (undefined en un día cancelado) en vez de
  // mostrarlo como el descanso normal que es. Y un día que YA era custom antes del swap
  // (con su propio type/desc ya resueltos, viajaron con él) tampoco se toca -- resolverlo
  // de nuevo con planLabel() reenvolvería la entrada en calor/vuelta a la calma sobre un
  // desc que ya las tenía adentro, duplicándolas cada vez que se lo vuelva a mover.
  // Para un día recién movido que SIGUE siendo del algoritmo (el caso más común: ninguno de
  // los dos ya era custom), mismo bug que ya se arregló en applyVolumeAdjust -- marcar
  // custom:true sin resolver antes tipo/descripción deja planLabel() leyendo d.type/d.desc
  // undefined, y si el día tenía una estructura de repeticiones del algoritmo (reps/repMeters
  // de series o cuestas, no workMin/restMin) encima la mostraría como si fuera fartlek,
  // saliendo "NaNm". planLabelBody(d) ACÁ (SIN la envoltura de entrada en calor/vuelta a la
  // calma que agrega planLabel() -- ver el comentario grande junto a esa función: si se
  // guardara ya envuelta, el próximo render la duplicaría), con typeKey/interval ya
  // intercambiados, deja los números reales incrustados como texto en desc antes de marcarlo
  // protegido.
  [origDay, destDay].forEach(d=>{
    if(d.cancelled || d.custom) return;
    const lbl = planLabelBody(d);
    d.type = lbl.type; d.desc = lbl.desc;
    delete d.interval;
    d.custom = true;
  });
  renderPlan(); renderHome(); renderRunTodayCard(); persist();
  state.chat.push({role:'system', text:sysMsgWithIcon(ICONS.edit, t('coach_plan_updated')+': '+t('day_'+input.dia_origen)+' → '+t('day_'+input.dia_destino)), ts:Date.now()});
  return `OK, moví la sesión de ${input.dia_origen} a ${input.dia_destino}.`;
}
function applyCancelSession(input){
  // Mismo motivo que el chequeo equivalente en applyPlanChange: la rama 'siguiente' usaba
  // input.dia crudo (sin validar contra DAY_KEYS) tanto para la clave de nextWeekOverrides
  // como para t('day_'+input.dia) en el mensaje de chat -- un valor inesperado del modelo
  // terminaba sin escapar en un mensaje de rol 'system'.
  if(!DAY_KEYS.includes(input.dia)) return 'Día no encontrado.';
  // Antes, cuando el corredor cancelaba una sesión por chat, el modelo terminaba
  // llamando a modificar_sesion igual (es la única herramienta de "un día puntual"
  // que conocía) y como esa herramienta exige tipo/descripción, improvisaba algo
  // como "Rodaje suave en zona 1" -- resultado: el día quedaba con un entrenamiento
  // inventado en vez de quedar vacío. Esta herramienta deja el día realmente vacío,
  // igual que cualquier otro día sin sesión asignada (typeKey:'rest', sin custom).
  // Sí queda marcado con d.cancelled (ver preserveLivedDays) para que una regeneración
  // posterior no lo "resucite" con una sesión nueva solo porque ese día sigue siendo,
  // en el perfil, un día de entreno normal -- el corredor lo canceló a propósito.
  if(input.semana === 'siguiente'){
    captureUndoSnapshot();
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
  captureUndoSnapshot();
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
// Techo/piso al ajuste que se puede pedir de UNA sola vez por chat -- sin esto, un pedido
// real mal medido ("dale, subime bastante") o una alucinación del modelo (porcentaje:900 en
// vez de 90, por ejemplo transcribiendo mal un pedido en minutos) se aplicaba tal cual,
// pudiendo más que duplicar o casi anular de un saque el volumen de la semana. Un salto así
// no tiene nada que ver con cómo progresa el plan generado automáticamente (ver
// weekMultiplier, que sube gradualmente semana a semana con un techo propio) -- ±60% ya es
// generoso para un pedido puntual real ("quiero sumar más", "bajale bastante esta semana").
const MAX_VOLUME_ADJUST_PCT = 60;
function applyVolumeAdjust(input){
  const rawPct = Number(input.porcentaje);
  if(!Number.isFinite(rawPct)) return 'Falta el porcentaje.';
  const pct = Math.min(MAX_VOLUME_ADJUST_PCT, Math.max(-MAX_VOLUME_ADJUST_PCT, rawPct));
  captureUndoSnapshot();
  const factor = 1 + (pct/100);
  if(input.semana === 'siguiente'){
    const nw = getNextWeekPlan();
    if(!state.nextWeekOverrides) state.nextWeekOverrides = {};
    nw.plan.forEach(d=>{
      if(d.dist>0){
        // planLabelBody (no planLabel) para el caso no-custom -- ver el comentario grande
        // junto a planLabel(): guardar acá el texto YA envuelto con entrada en calor/vuelta a
        // la calma duplicaría esa envoltura la próxima vez que algo (Plan, Inicio, etc.)
        // llame a planLabel() sobre este mismo día, que para entonces ya quedó custom:true.
        const lbl = d.custom ? {type:d.type, desc:d.desc} : planLabelBody(d);
        // Mismo motivo que en applyPlanChange (ver su comentario sobre esta misma rama):
        // getNextWeekPlan() arma este día de cero cada vez con Object.assign({}, d, ov, ...),
        // así que si el override no trae su propia clave `interval`, queda colgado el
        // interval VIEJO del algoritmo (reps/repMeters, de series o cuestas) -- que planLabel
        // intenta leer después como si fuera de fartlek (workMin/restMin) y sale "NaNm". Si el
        // día ya era custom, conservamos SU interval (ya viene en el formato correcto o en
        // null); si todavía era del algoritmo, el texto de lbl.desc ya tiene los números
        // reales incrustados (reps, metros, minutos), así que no hace falta ningún interval.
        const interval = d.custom ? (d.interval || null) : null;
        state.nextWeekOverrides[d.day] = { type: lbl.type, desc: lbl.desc, dist: Math.max(1, Math.round(d.dist*factor)), zone: d.zone, terrain: d.terrain, interval };
      }
    });
    renderPlan(); persist();
    state.chat.push({role:'system', text:sysMsgWithIcon(ICONS.edit, t('coach_plan_updated')), ts:Date.now()});
    return `OK, ajusté el volumen de la semana que viene ${pct>0?'+':''}${pct}%.`;
  }
  // Los días que ya pasaron (o que ya se corrieron/saltearon) quedan afuera del ajuste --
  // no tiene sentido subir o bajar retroactivamente el volumen de un día de esta semana
  // que ya terminó. touchedCount cuenta cuántos días de verdad se tocaron -- si es 0 (por
  // ejemplo, un domingo con toda la semana ya hecha/salteada), el mensaje de abajo avisa
  // que no había nada para ajustar en vez de confirmar un cambio que nunca pasó. Encontrado
  // con pruebas adversariales.
  let touchedCount = 0;
  state.plan.forEach(d=>{
    if(d.dist>0 && !isDayLocked(d.day)){
      touchedCount++;
      if(!d.custom){
        // Mismo bug que ya se arregló en applyPlanChange (ver sus comentarios): marcar
        // custom:true sin resolver antes tipo/descripción dejaba planLabel() leyendo
        // d.type/d.desc undefined, y si el día era de series/cuestas (interval en formato
        // reps/repMeters del algoritmo) encima intentaba mostrarlo como fartlek
        // (workMin/restMin), saliendo "NaNm". planLabelBody(d) ACÁ (SIN la envoltura de
        // entrada en calor/vuelta a la calma -- ver el comentario junto a planLabel(), si se
        // guardara ya envuelta se duplicaría en el próximo render), antes de tocar nada, ya
        // deja los números reales (reps, metros, minutos) incrustados como texto en desc.
        const lbl = planLabelBody(d);
        d.type = lbl.type; d.desc = lbl.desc;
        delete d.interval;
        d.custom = true;
      }
      d.dist = Math.max(1, Math.round(d.dist*factor));
    }
  });
  if(!touchedCount){
    return 'No quedaba ningún día ajustable esta semana (los que tenían sesión ya pasaron, ya se corrieron o ya se saltearon) -- no se aplicó ningún cambio.';
  }
  renderPlan(); renderHome(); persist();
  state.chat.push({role:'system', text:sysMsgWithIcon(ICONS.edit, t('coach_plan_updated')), ts:Date.now()});
  return `OK, ajusté el volumen de esta semana ${pct>0?'+':''}${pct}%.`;
}
function applyProfileChange(input){
  // Detectamos si hay algún cambio real ANTES de tocar state.profile y de tomar el
  // snapshot de undo -- si no, un input sin ningún campo reconocido (el "no hubo cambios
  // para aplicar" de abajo) igual pisaba el snapshot del cambio real anterior con el
  // estado actual sin cambios, y "deshacer" ya no podía recuperarlo. Ver el comentario
  // equivalente en applyPlanChange.
  const validDays = Array.isArray(input.dias_entreno) ? DAY_KEYS.filter(d=>input.dias_entreno.includes(d)) : [];
  const hasAnyChange = !!(input.objetivo || input.fecha_carrera || input.terreno || typeof input.fc_maxima==='number' || typeof input.km_actuales==='number' || validDays.length);
  if(!hasAnyChange) return 'No hubo cambios para aplicar.';
  // La fecha de carrera cargada desde Perfil > Metas pasa por calBoundsFor/calDateAllowed
  // (no puede quedar en el pasado, ver el comentario junto a calBoundsFor) -- pero esta vía
  // (modificar_perfil, la herramienta del coach de chat) escribía fecha_carrera directo en
  // state.profile.raceDate sin ninguna validación. El modelo puede alucinar un formato raro,
  // o el corredor puede mencionar de pasada una fecha que ya pasó -- sin este chequeo,
  // taperMultiplier/weeksLeft (el contexto que lee el propio coach) terminaban trabajando con
  // una fecha objetivo inválida o vieja, sin que nadie se diera cuenta.
  if(input.fecha_carrera){
    const validFormat = /^\d{4}-\d{2}-\d{2}$/.test(input.fecha_carrera) && !isNaN(new Date(input.fecha_carrera+'T00:00:00').getTime());
    if(!validFormat || !calDateAllowed(input.fecha_carrera, calBoundsFor('perfil-racedate'))){
      return `La fecha de carrera "${input.fecha_carrera}" no es válida -- tiene que ser una fecha real en formato YYYY-MM-DD y no puede ser una fecha ya pasada. Confirmá la fecha correcta con el corredor y volvé a llamar a modificar_perfil.`;
    }
  }
  captureUndoSnapshot();
  const changes = [];
  // A diferencia de fecha_carrera (arriba, valida ANTES de tocar nada y rechaza la llamada
  // entera si está mal) fc_maxima/km_actuales rechazan solo ESE campo puntual -- si vinieran
  // junto con otro cambio válido en el mismo pedido (ej. "cambiá mi objetivo a 10k y mi FC
  // máxima a 900"), descartar la llamada completa tiraría también el objetivo, que sí era
  // válido. rejectedNotes junta los rechazos puntuales para avisarle al modelo al final, sin
  // interrumpir el resto.
  const rejectedNotes = [];
  let recalc = false;
  if(input.objetivo){ state.profile.goal = input.objetivo; changes.push('objetivo'); recalc = true; }
  if(input.fecha_carrera){ state.profile.raceDate = input.fecha_carrera; changes.push('fecha de carrera'); recalc = true; }
  if(input.terreno){ state.profile.terrain = input.terreno; changes.push('terreno'); }
  // Mismo motivo que MAX_SESSION_KM/resolveZone en modificar_sesion: el input_schema de la
  // herramienta es solo una guía, la API de tool use no hace cumplir ningún rango de verdad.
  // Sin este chequeo, una FC máxima alucinada o mal transcripta (ej. "900" en vez de "190")
  // se guardaba tal cual y computeZones() armaba zonas de entrenamiento sin ningún sentido --
  // 100-220bpm es el mismo techo que ya usa checkHrMaxFromRuns()/el aviso automático de FC
  // máxima observada (ver esos comentarios) para descartar un pico de sensor imposible.
  if(typeof input.fc_maxima==='number'){
    if(input.fc_maxima < 100 || input.fc_maxima > 220){
      rejectedNotes.push(`la FC máxima "${input.fc_maxima}" no parece un valor real (tiene que estar entre 100 y 220bpm) -- no se aplicó`);
    } else {
      state.profile.hrMax = input.fc_maxima; state.profile.hrKnown = true; state.profile.hrZones = computeZones(input.fc_maxima); state.profile.hrZonesCustom = false; changes.push('FC máxima');
    }
  }
  // Mismo criterio: un kilometraje semanal alucinado (ej. "300" transcripto de "30") infla
  // calcWeeklyKm/el plan generado a un volumen imposible de sostener. El techo es generoso a
  // propósito (no hay techo real para un ultramaratonista de volumen muy alto) -- solo corta
  // el caso de una cifra claramente imposible como referencia de "cuánto corre por semana".
  if(typeof input.km_actuales==='number'){
    if(input.km_actuales < 0 || input.km_actuales > 300){
      rejectedNotes.push(`el kilometraje semanal "${input.km_actuales}" no parece un valor real -- no se aplicó`);
    } else {
      state.profile.currentWeeklyKm = input.km_actuales; state.profile.runnerType = 'active'; changes.push('km actuales'); recalc = true;
    }
  }
  if(validDays.length){
    // Cronograma de base nuevo y permanente (no un cambio puntual de una sesión):
    // por esto usamos recalc para forzar una regeneración completa del plan, igual
    // que con objetivo/fecha de carrera. preserveLivedDays sigue protegiendo los
    // días ya vividos y los personalizados/cancelados a propósito (d.custom/d.cancelled).
    state.profile.trainingDays = validDays;
    changes.push('días de entreno');
    recalc = true;
  }
  if(!changes.length){
    return rejectedNotes.length ? `No se aplicó ningún cambio: ${rejectedNotes.join('; ')} -- confirmá el valor correcto con el corredor y volvé a llamar a modificar_perfil.` : 'No hubo cambios para aplicar.';
  }
  if(recalc){
    state.profile.weeklyKm = calcWeeklyKm(state.profile);
    state.plan = preserveLivedDays(state.plan, generatePlan(state.profile, state.weekNumber||1));
    state.nextWeekOverrides = {}; // cambió la base del plan -> los cambios puntuales de la semana que viene ya no aplican
  }
  renderAll(); renderZones(); persist();
  state.chat.push({role:'system', text:sysMsgWithIcon(ICONS.edit, t('coach_plan_updated')), ts:Date.now()});
  return `Perfil actualizado: ${changes.join(', ')}.${rejectedNotes.length ? ' OJO -- '+rejectedNotes.join('; ')+'.' : ''}`;
}
function applyCoachNote(input){
  // Guardamos el dato aparte del historial del chat (que a futuro se puede recortar
  // para no mandar una conversación gigante en cada request) para que una lesión o
  // preferencia mencionada hace meses no se pierda nunca.
  if(!input || !input.nota) return 'Falta la nota a guardar.';
  if(!state.profile.coachNotes) state.profile.coachNotes = [];
  state.profile.coachNotes.push(String(input.nota).slice(0,200));
  if(state.profile.coachNotes.length > 12) state.profile.coachNotes = state.profile.coachNotes.slice(-12);
  // Antes, una lesión mencionada por chat quedaba SOLO en coachNotes -- una nota que el coach
  // podía mencionar en la charla, pero invisible para trainingCaution/generatePlan (que sí
  // reaccionan a una molestia cargada a mano en Perfil > Molestias, ver activePainEntries).
  // Guardándola acá como una entrada más de state.painLog (misma forma que savePainLog())
  // reusa esa misma lógica ya resuelta -- vence sola a los 21 días o el corredor la marca
  // resuelta desde Perfil, en vez de agregar un flag nuevo que se queda pegado para siempre
  // (el mismo tipo de bug que isBeginnerProfile/returningFromBreak tenían antes de esta sesión).
  let plan_updated = false;
  if(input.zona_cuerpo){
    // Encontrado en una auditoría: savePainLog() (el formulario de Perfil > Molestias) manda
    // el chat SIN esperarlo ("Me duele: rodilla.") y de forma independiente le muestra al
    // corredor su propio cartel de "¿bajo la intensidad?" que, si acepta, llama a
    // lowerRemainingIntensity(-15) directo. Casi siempre el coach responde a ese mismo mensaje
    // llamando a ESTA herramienta con la misma zona -- sin este chequeo, las dos vías se
    // sumaban: -15% del formulario más -15% de acá, quedando un recorte real de ~28% sin que
    // el corredor entienda por qué, además de una entrada duplicada en el registro de
    // molestias para el mismo reporte. Si ya hay una entrada activa de esta MISMA zona
    // guardada hace menos de 2 minutos, asumimos que es este mismo reporte llegando por las
    // dos vías a la vez y no lo repetimos -- una molestia nueva de verdad en la misma zona,
    // minutos u horas después, sigue aplicando el recorte normal.
    const justLogged = (state.painLog || []).some(p => p.bodyPart === input.zona_cuerpo && p.active && (Date.now() - p.id) < 120000);
    if(!justLogged){
      captureUndoSnapshot();
      if(!state.painLog) state.painLog = [];
      state.painLog.push({id:Date.now(), date:localDateISO(), bodyPart:input.zona_cuerpo, note:String(input.nota).slice(0,200), active:true, checkinSent:false, fromChat:true});
      // El aumento de cautela (trainingCaution) recién se nota en la PRÓXIMA regeneración del
      // plan (semana que viene, o cualquier otro guardado que dispare generatePlan) -- para el
      // resto de ESTA semana, el mismo recorte directo que ya usa savePainLog() desde Perfil
      // (lowerRemainingIntensity, -15% en lo que queda) es lo que de verdad baja la carga ya
      // mismo. Antes acá se regeneraba el plan con generatePlan() en su lugar, pero eso da un
      // efecto mucho más débil para HOY (la cautela recién en 0→1 apenas mueve el volumen de
      // esta semana) y quedaba inconsistente con lo que pasa cuando la misma molestia se carga
      // desde el formulario de Perfil -- ahora las dos vías dan la misma protección inmediata.
      lowerRemainingIntensity(-15);
      plan_updated = true;
    }
  }
  persist();
  return plan_updated ? 'Nota guardada, y bajé un 15% lo que queda de la semana por la molestia.' : 'Nota guardada.';
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
  // Mismo chequeo (y mismo motivo) que se agregó en showView('coach') -- se repite acá porque
  // sendChat() también se dispara desde los chips rápidos (sendChatChip) y desde
  // goCoachWithPrompt() sin pasar necesariamente por una entrada fresca a la vista, y porque
  // una conversación puede seguir abierta un buen rato: si la medianoche del domingo al lunes
  // cae DURANTE la charla (con la app ya abierta en el chat), el chequeo de showView() de
  // cuando se entró ya no alcanza -- este es el que de verdad importa, porque es el que corre
  // justo antes de construir el contexto que ve el modelo.
  checkWeekRollover();
  const input = document.getElementById('chatInput');
  const text = input.value.trim(); if(!text) return;
  const sendBtn = document.getElementById('chat-send-btn');
  if(sendBtn?.dataset.busy==='1') return; // ya hay un mensaje en camino
  // Nuevo turno de verdad (pasó el chequeo de arriba, este mensaje va a mandarse) -- reseteamos
  // acá, no al principio de la función, para no pisar el flag de un sendChat() todavía en
  // vuelo si por lo que sea esta llamada se cuela antes de que termine (ver coachUndoTurnSnapshotTaken).
  coachUndoTurnSnapshotTaken = false;
  if(sendBtn){
    sendBtn.dataset.originalHtml = sendBtn.innerHTML;
    sendBtn.dataset.busy = '1';
    sendBtn.innerHTML = `<span class="icon-sq" style="width:16px; height:16px;">${ICONS.stop}</span>`;
  }
  input.value='';
  state.chat.push({role:'user', text, ts:Date.now()});
  renderChat();
  // Guardamos el mensaje del corredor YA, antes de esperar la respuesta -- si la app se
  // cierra (no solo se minimiza) mientras el fetch de más abajo todavía está en vuelo, ese
  // pedido se corta junto con la app y la respuesta del coach se pierde sin remedio, pero
  // antes la PREGUNTA se perdía también: antes de este fix, el único persist() de esta
  // función corría recién al final del todo (éxito, cancelado o error de red), así que
  // cerrar la app a mitad de una espera hacía que ni siquiera quedara registro de que el
  // corredor había escrito algo. Mismo criterio que ya usa el resto de la app (progreso de
  // carrera, molestias) -- guardar apenas hay algo real que no se pueda recuperar solo, en
  // vez de esperar a que termine toda la operación.
  persist();
  document.getElementById('chatLog').insertAdjacentHTML('beforeend', `<div class="msg coach typing msg-enter" id="typing"><span></span><span></span><span></span></div>`);
  scrollChatToBottom();
  mascotThinking = true;
  document.getElementById('coach-fab-thinking')?.classList.add('show');

  // Mandamos como máximo los últimos CHAT_HISTORY_LIMIT mensajes: una charla de meses
  // mandaría el historial entero en cada request, cada vez más lento y más caro sin
  // necesidad. Los datos importantes de largo plazo (lesiones, preferencias) no dependen
  // de este historial: quedan guardados aparte con guardar_nota_coach.
  const CHAT_HISTORY_LIMIT = 40;
  let messages = state.chat.filter(m=>m.role==='user'||m.role==='coach').slice(0,-1).slice(-CHAT_HISTORY_LIMIT).map(m=>({role: m.role==='user'?'user':'assistant', content:m.text}));
  messages.push({role:'user', content:text});

  const system = `Sos "Zonda", el entrenador virtual dentro de la app Zancada (el nombre viene del viento cálido y seco típico del oeste argentino -- podés mencionar el origen del nombre si el corredor pregunta, pero no hace falta explicarlo de entrada). Hablás con calidez y honestidad, como un entrenador real de running (no un chatbot genérico). Respondé siempre en ${LANG_NAMES[lang]}. Datos del corredor: ${buildContext()}. Ayudás a definir ejercicios, responder dudas de entrenamiento en calle y trail, y personalizar el plan según los gustos del corredor.

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
- modificar_sesion: para cambiar UN día puntual por OTRA sesión DISTINTA de la que tenía (tipo, distancia, zona, terreno) -- no para mover la misma sesión de día, para eso está mover_sesion. Sirve para esta semana o la que sigue (parámetro semana). Si el corredor entrena por tiempo (fijate en el contexto) o te da la sesión directamente en minutos, usá duracion_min en vez de distancia_km. Si la sesión nueva tiene repeticiones (series, cuestas, fartlek), usá SIEMPRE repeticiones/esfuerzo_min/recuperacion_min (en minutos) en vez de escribir la cantidad/unidad vos mismo en descripcion -- la app se encarga de mostrárselo al corredor en la unidad que corresponda.
- cancelar_sesion: cuando el corredor cancela, saca o no puede hacer una sesión y NO la reemplaza por otra — deja ese día vacío, igual que un día sin entrenamiento. Nunca uses modificar_sesion para esto ni inventes una sesión suave o de zona 1 "de reemplazo": si el pedido es cancelar, el día tiene que quedar sin ningún ejercicio.
- ajustar_volumen_semana: para pedidos generales de correr más o menos (ej. "quiero correr más km", "bajale un poco"), sin que especifiquen un día — de esta semana o de la que sigue (parámetro semana).
- modificar_perfil: para cambios permanentes de datos personales que afectan los PRÓXIMOS planes (km semanales base, objetivo, terreno, FC máxima, o el cronograma fijo de días de entreno con dias_entreno). IMPORTANTE: si lo que cambia es QUÉ DÍAS entrena de forma habitual y permanente (ej. "de ahora en adelante entreno martes y jueves"), usá modificar_perfil con dias_entreno -- no mover_sesion/modificar_sesion/cancelar_sesion, que solo afectan una semana puntual y dejarían al corredor con el cronograma viejo la semana siguiente.
- guardar_nota_coach: para guardar un dato permanente del corredor (una lesión o molestia, una preferencia, una restricción de horario, etc.) apenas lo mencione, aunque no implique cambiar el plan ahora mismo. El historial de la charla no es infinito, así que esto es lo único que te garantiza acordarte de algo importante más adelante. Si lo que cuenta es una lesión o dolor físico nuevo, completá también zona_cuerpo -- eso SÍ hace que el plan se vuelva más conservador de inmediato, no solo que vos lo recuerdes.
- deshacer_cambio: si el corredor dice que te confundiste, que no era eso, o pide deshacer/revertir el último cambio que hiciste, usá esta herramienta en vez de intentar adivinar manualmente cómo estaba antes -- restaura el plan y el perfil a como estaban justo antes de tu último cambio. Solo deshace UN cambio (el más reciente); si pide deshacer más de uno, avisale que solo podés volver un paso atrás.
Si el pedido es ambiguo entre "esta semana" y "de ahora en adelante", aplicá el cambio a esta semana con ajustar_volumen_semana para que se note ya, y preguntá si también querés que sea la nueva base con modificar_perfil.

Tu alcance es la app Zancada, el entrenamiento de running/trail, el ejercicio físico y la salud ligada a correr (lesiones, nutrición deportiva, descanso, sueño, etc.). Si el corredor te pregunta algo totalmente ajeno a eso (política, código, tareas de otra app, cultura general, etc.), no lo respondas -- decí con buena onda que solo podés ayudar con su entrenamiento y la app, y ofrecé volver a eso. Esto no te impide charlar con calidez si te saludan o te cuentan cómo están, ni usar ejemplos de la vida cotidiana para explicar algo de entrenamiento -- el límite es responder de lleno un tema sin relación real con correr o la app.

Formato del texto: el chat solo interpreta **negrita** (usala con moderación, para resaltar un dato clave) y guiones "- " al inicio de línea para listas cortas. No uses encabezados (#), links, tablas ni bloques de código: no se muestran bien en el chat.

Sé breve (4-6 líneas salvo que pidan más detalle). Si mencionan dolor agudo, que empeora al correr, o que persiste más de unos días, recomendá frenar y consultar a un profesional de la salud antes de seguir entrenando — no intentes diagnosticar vos la causa.`;

  let finalText = '';
  let networkFailed = false;
  let cancelled = false;
  let anyToolApplied = false;
  // Salvaguarda contra el modelo afirmando en TEXTO que ya aplicó un cambio (plan o perfil)
  // sin haber llamado ninguna herramienta -- el prompt de arriba ya se lo pide explícitamente
  // ("nunca digas que ya lo cambiaste sin haber llamado a la herramienta"), pero una
  // instrucción de prompt no es una garantía real, solo un pedido. Reportado por un usuario
  // real: pidió "actualizalo en mi plan", el coach contestó con una lista de sesiones "ya
  // cargadas" (texto solo, cero tool_use en esa respuesta), y el plan de verdad se quedó
  // exactamente igual -- el corredor se enteró recién al mirar el plan y ver que no coincidía
  // con lo que el chat decía. CLAIM_PATTERN es deliberadamente amplio (mejor una vuelta extra
  // de más en un caso ambiguo que dejar pasar una confirmación falsa) -- ver el chequeo más
  // abajo, junto al break del loop.
  const CLAIM_PATTERN = /\b(ya\s+(est[aá]|qued[oó]|lo\s+(cambi[eé]|actualic[eé]|apliqu[eé]|hice)|se\s+aplic[oó])|listo,|actualizad[oa]\s|cargad[oa]\s|already\s+(updated|changed|applied|done)|all\s+set|it'?s\s+(done|updated)|c'est\s+(fait|mis\s+à\s+jour)|gi[àa]\s+(aggiornat|fatt)|(bereits|schon)\s+(aktualisiert|erledigt)|j[aá]\s+atualizad)/i;
  let correctionAttempted = false;
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
      if(toolUses.length===0){
        // Nunca se llamó ninguna herramienta en TODA la charla y el texto suena a que sí se
        // aplicó algo: le damos una única vuelta más para que se autocorrija (llame la
        // herramienta de verdad, o aclare que en realidad no hay ningún cambio aplicado) en
        // vez de mostrarle al corredor una confirmación que puede ser falsa.
        // correctionAttempted evita un segundo intento -- si insiste, mostramos lo que dijo.
        if(!anyToolApplied && !correctionAttempted && CLAIM_PATTERN.test(finalText)){
          correctionAttempted = true;
          messages.push({role:'assistant', content: blocks});
          messages.push({role:'user', content: 'Tu respuesta anterior sonaba a que ya aplicaste un cambio en el plan o el perfil, pero no llamaste ninguna herramienta. Si corresponde un cambio real, llamá la herramienta correspondiente ahora mismo. Si en realidad no hay ningún cambio que aplicar (por ejemplo, solo estabas describiendo una idea para más adelante), corregí tu mensaje y aclarale a el/la corredor/a que todavía no se aplicó nada en la app.'});
          finalText = ''; // descartamos el texto potencialmente falso -- nos quedamos con la respuesta corregida
          continue;
        }
        break;
      }
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
  mascotThinking = false;
  document.getElementById('coach-fab-thinking')?.classList.remove('show');
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
// typeof MutationObserver !== 'undefined': mismo criterio que la guarda del observer de
// overlays más arriba en el archivo -- el harness de tests (test/support/load-app.js) corre
// app.js en una sandbox de Node con un DOM mínimo simulado (sin MutationObserver real, y
// con getElementById/querySelector que SIEMPRE devuelven un elemento falso, nunca null) --
// initMascotEyes() arranca dos cadenas de setTimeout recursivas pensadas para no terminar
// nunca en una página real, pero que sin esta guarda quedaban colgadas para siempre en
// cada uno de los ~150 loadApp() de la suite de tests, así que "node --test" nunca
// terminaba de correr.
if(typeof MutationObserver !== 'undefined'){ initMascotEyes(); initMascotHoldEasterEgg(); }
