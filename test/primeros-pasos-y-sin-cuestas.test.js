// test/primeros-pasos-y-sin-cuestas.test.js
//
// Tanda del 2026-11-11:
//  - el plan respeta la nota "no puedo hacer cuestas" (antes solo la leía Zonda en el chat)
//  - tarjeta "Primeros pasos" en Inicio y adelanto de la primera semana al final del inicio
//  - tarjetas del Historial: mapa de la zona + recorrido dibujado en el teléfono para las marcas
//    que no dejan mandar la ruta a terceros; botón de compartir chico arriba; columnas iguales
//  - Perfil: "Notas de Zonda" es un desplegable; Relojes: flechas alineadas

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./support/load-app');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

function profile(overrides) {
  return Object.assign({
    name: 'Ana', weight: 60, height: 165, birth: '1990-05-01', gender: 'f',
    weeklyKm: 35, currentWeeklyKm: 30, goal: '21k', runnerType: 'active',
    trainingDays: ['mon', 'tue', 'thu', 'sat', 'sun'], units: 'metric', trainBy: 'distance', terrain: 'asfalto',
  }, overrides || {});
}
const types = plan => Array.from(plan, d => d.typeKey);

test('noteAvoidsHills: reconoce la nota en los 6 idiomas y no se confunde con notas que no hablan de cuestas o que las piden', () => {
  const app = loadApp();
  const yes = [
    'No puedo hacer cuestas donde vivo', 'sin subidas por favor', 'Vivo en zona llana, no hay pendientes', 'evitar cuestas',
    "I can't do hills where I live", 'no hills here', 'Avoid uphill sessions',
    'Não posso fazer ladeiras', 'sem subidas', 'Je ne peux pas faire de côtes', 'pas de montée', 'Non posso fare salite', 'senza salite',
    'Keine Hügel in meiner Gegend', 'ohne Steigung',
  ];
  const no = ['Me duele la rodilla izquierda', 'Prefiero correr de mañana', 'Me encantan las cuestas', 'I love hills', 'No puedo correr los lunes', ''];
  for (const n of yes) assert.equal(app.noteAvoidsHills(n), true, n);
  for (const n of no) assert.equal(app.noteAvoidsHills(n), false, n);
  assert.equal(app.avoidsHills(null), false);
  assert.equal(app.avoidsHills({ coachNotes: ['No puedo hacer cuestas donde vivo'] }), true);
  assert.equal(app.avoidsHills({ avoidHills: true }), true);
  assert.equal(app.avoidsHills({ coachNotes: ['Prefiero la mañana'] }), false);
});

test('con la nota de "sin cuestas" el plan no programa cuestas en ninguna semana y conserva la misma cantidad de sesiones', () => {
  for (const goal of ['5k', '10k', '21k', '42k']) {
    const app = loadApp();
    const p = profile({ goal });
    app.state.profile = p;
    const sin = [];
    for (let w = 1; w <= 16; w++) sin.push(types(app.generatePlan(p, w)));
    assert.ok(sin.some(wk => wk.includes('hills')), goal + ': sin la nota, alguna semana tiene cuestas (si no, este test no prueba nada)');
    p.coachNotes = ['No puedo hacer cuestas donde vivo'];
    for (let w = 1; w <= 16; w++) {
      const con = types(app.generatePlan(p, w));
      assert.ok(!con.includes('hills'), goal + ' semana ' + w + ': ' + con.join(','));
      assert.equal(con.filter(x => x !== 'rest').length, sin[w - 1].filter(x => x !== 'rest').length, goal + ' semana ' + w + ': misma cantidad de sesiones');
    }
    // al borrar la nota, las cuestas vuelven
    p.coachNotes = [];
    const again = [];
    for (let w = 1; w <= 16; w++) again.push(types(app.generatePlan(p, w)));
    assert.deepEqual(again, sin, goal + ': sin la nota el plan es el de siempre');
  }
});

test('applyAvoidHills cambia las cuestas pendientes de la semana en curso y no toca las hechas ni las editadas a mano', () => {
  const app = loadApp();
  const p = profile();
  app.state.profile = p; app.state.onboarded = true;
  let week = 0, plan = null;
  for (let w = 1; w <= 16 && !plan; w++) { const pl = app.generatePlan(p, w); if (types(pl).includes('hills')) { plan = pl; week = w; } }
  assert.ok(plan, 'hay una semana con cuestas');
  app.state.weekNumber = week; app.state.plan = plan;
  const idx = types(plan).indexOf('hills');
  assert.equal(app.applyAvoidHills(), false, 'sin nota no hace nada');
  p.coachNotes = ['No puedo hacer cuestas donde vivo'];
  // hecha: no se toca
  plan[idx].status = 'done';
  assert.equal(app.applyAvoidHills(), false);
  assert.equal(app.state.plan[idx].typeKey, 'hills');
  // editada a mano: no se toca
  delete plan[idx].status; plan[idx].custom = true;
  assert.equal(app.applyAvoidHills(), false);
  // pendiente: se cambia por otra sesión real, el mismo día
  delete plan[idx].custom;
  const day = plan[idx].day;
  assert.equal(app.applyAvoidHills(), true);
  const d = app.state.plan[idx];
  assert.notEqual(d.typeKey, 'hills'); assert.notEqual(d.typeKey, 'rest');
  assert.equal(d.day, day); assert.ok(d.dist > 0);
  assert.equal(app.applyAvoidHills(), false, 'la segunda vez ya no hay nada que cambiar');
});

test('la nota se aplica al entrar a la app y apenas Zonda la guarda', () => {
  assert.equal(SRC.split('try{ if(applyAvoidHills()) persist(); }catch(e){').length - 1, 2, 'en los dos puntos de entrada');
  assert.ok(SRC.includes('if(noteAvoidsHills(noteText) && applyAvoidHills()){ renderHome(); renderPlan(); }'));
  assert.ok(SRC.includes("rotation = rotation.filter(x => x !== 'hills'); if(!rotation.length) rotation = ['fartlek'];"));
});

test('firstSteps: tres pasos para cuentas nuevas; desaparece al completarlos, al cerrarla o pasados 21 días', () => {
  const app = loadApp();
  const today = app.todayLocalISO();
  app.state.profile = profile({ createdAt: today, levelTest: { required: true, done: false } });
  app.state.onboarded = true; app.state.runs = [];
  let s = app.firstSteps();
  assert.deepEqual(Array.from(s, x => x.key), ['test', 'watch', 'run']);
  assert.deepEqual(Array.from(s, x => x.done), [false, false, false]);
  app.state.runs = [{ id: 1 }];
  s = app.firstSteps();
  assert.equal(s[2].done, true);
  app.state.firstStepsDismissed = true;
  assert.equal(app.firstSteps(), null, 'cerrada');
  app.state.firstStepsDismissed = false;
  const old = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  app.state.profile.createdAt = old;
  assert.equal(app.firstSteps(), null, 'cuenta de hace 30 días');
  delete app.state.profile.createdAt;
  assert.equal(app.firstSteps(), null, 'cuentas viejas sin fecha de alta: no aparece');
  app.state.onboarded = false; app.state.profile.createdAt = today;
  assert.equal(app.firstSteps(), null);
  // sin manejadores en línea y con los textos escapados
  assert.ok(SRC.includes(`data-on-click="dismissFirstSteps()"`));
  assert.ok(!/renderFirstSteps[\s\S]{0,1500}onclick=/.test(SRC));
  assert.ok(HTML.includes('id="home-firststeps-card"'));
});

test('adelanto de la primera semana en el inicio: se calcula sin tocar el estado', () => {
  assert.match(SRC, /function obBuildProfile\(\)\{/);
  assert.ok(SRC.includes('const { profile, healthNotes } = obBuildProfile();'), 'finishOnboard usa el mismo armado de perfil que el adelanto');
  const a = SRC.indexOf('function obPlanPreview(){'), b = SRC.indexOf('function renderObPlanPreview(){');
  assert.ok(a > 0 && b > a);
  const body = SRC.slice(a, b);
  assert.match(body, /finally\s*\{/, 'el estado se restaura aunque generatePlan falle');
  assert.ok(!/persist\(|saveState\(|supa\./.test(body), 'no guarda nada');
  assert.ok(HTML.includes('id="ob-plan-preview"'));
  assert.ok(HTML.indexOf('id="ob-plan-preview"') > HTML.indexOf('data-page="7"'));
});

test('mapa de la tarjeta para Strava/Garmin/Wahoo/Polar: a Mapbox va solo el centro y el zoom, nunca el recorrido', () => {
  const app = loadApp();
  const pts = [];
  for (let k = 0; k < 200; k++) { const a = k / 200 * Math.PI * 2; pts.push({ lat: -34.5745 + Math.sin(a) * 0.006, lon: -58.4105 + Math.cos(a) * 0.011 }); }
  const v = app.restrictedMapView(pts, 326, 108);
  assert.ok(v);
  assert.ok(!v.url.includes('path-') && !v.url.includes('geojson') && !v.url.includes('pin-'), v.url);
  const m = v.url.match(/\/static\/(-?[\d.]+),(-?[\d.]+),([\d.]+),0\/326x108/);
  assert.ok(m, v.url);
  assert.ok((m[1].split('.')[1] || '').length <= 4 && (m[2].split('.')[1] || '').length <= 4, 'centro redondeado a 4 decimales');
  assert.ok(Math.abs(Number(m[1]) - -58.4105) < 0.001 && Math.abs(Number(m[2]) - -34.5745) < 0.001);
  // el trazo entra entero en la imagen
  const nums = v.path.match(/-?[\d.]+/g).map(Number);
  for (let i = 0; i < nums.length; i += 2) { assert.ok(nums[i] >= 0 && nums[i] <= 326, 'x ' + nums[i]); assert.ok(nums[i + 1] >= 0 && nums[i + 1] <= 108, 'y ' + nums[i + 1]); }
  assert.equal(app.restrictedMapView([], 326, 108), null);
  assert.equal(app.restrictedMapView([{ lat: 1, lon: 1 }], 326, 108), null);

  for (const source of ['strava', 'garmin', 'wahoo', 'polar']) {
    const html = app.histMapInnerHtml({ id: 1, source, points: pts }, 326, 108);
    assert.ok(html.includes('class="hist-map-route"'), source);
    assert.ok(!html.includes('path-'), source + ': la URL no lleva el recorrido');
    assert.ok(!/ on(load|error|click)=/.test(html), 'sin manejadores en línea');
  }
  const own = app.histMapInnerHtml({ id: 2, points: pts }, 326, 108);
  assert.ok(!own.includes('hist-map-route'), 'las carreras propias siguen con la imagen de siempre');
});

test('tarjeta del Historial: compartir chico arriba a la derecha (zona de toque ampliada), sin fila vacía abajo y columnas iguales', () => {
  assert.ok(SRC.includes('<span class="hist-top-right">'));
  assert.ok(SRC.includes("${shoe ? `<p class=\"muted hist-shoe\">${t('hist_shoe')}: ${escapeHtml(shoe.name)}</p>` : ''}"));
  assert.ok(!SRC.includes(": '<span></span>'}\n          <button class=\"hist-share-btn\""), 'ya no hay fila de abajo con el botón');
  assert.match(HTML, /\.hist-share-btn\{position:relative; width:32px; height:32px;/);
  assert.match(HTML, /\.hist-share-btn::before\{content:''; position:absolute; inset:-7px;\}/);
  assert.ok(HTML.includes('.hist-card .stat-row-divided .stat-cell, .hist-card .stat-row-divided .stat-cell:first-child, .hist-card .stat-row-divided .stat-cell:last-child{padding:0 4px;}'));
});

test('Perfil: "Notas de Zonda" es un desplegable con la cantidad a la vista y no queda pegado a Notificaciones; Relojes: flechas contra el borde', () => {
  assert.match(HTML, /<details class="card fold" id="coach-notes-card">\s*<summary>/);
  assert.ok(HTML.includes('id="coach-notes-count"'));
  assert.ok(HTML.indexOf('id="coach-notes-list"') > HTML.indexOf('id="coach-notes-card"'));
  assert.ok(SRC.includes("const c = document.getElementById('coach-notes-count'); if(c) c.textContent = notes.length ? String(notes.length) : '';"));
  assert.ok(HTML.includes('.settings-group + .card, .settings-group + details{margin-top:20px;}'));
  assert.ok(HTML.includes('.conn-row-head .brand-logo-chip{margin-right:auto;}'));
});

test('carga más liviana: el ícono de iPhone es un archivo (no 31 KB incrustados en cada carga) e index.html/app.js se revalidan siempre pero no se vuelven a bajar si no cambiaron', () => {
  assert.ok(HTML.includes('<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">'));
  assert.ok(!/rel="apple-touch-icon"[^>]*data:image/.test(HTML));
  const png = fs.readFileSync(path.join(__dirname, '..', 'apple-touch-icon.png'));
  assert.equal(png.slice(1, 4).toString(), 'PNG');
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  for (const source of ['/', '/index.html', '/app.js']) {
    const h = vercel.headers.find(x => x.source === source);
    const cc = h.headers.find(x => x.key === 'Cache-Control').value;
    assert.ok(/no-cache/.test(cc) && /must-revalidate/.test(cc), source + ': se valida siempre contra el servidor (nunca queda una versión vieja)');
    assert.ok(!/no-store|max-age=[1-9]/.test(cc), source + ': ' + cc);
  }
});

test('imagen para compartir: una carrera de menos de una hora muestra "34:10", no "00:34:10"', () => {
  assert.equal(SRC.split("[fmtTime(r.durationSec).replace(/^00:/, ''), t('run_time').toUpperCase()],").length - 1, 2);
});

test('los textos nuevos existen en los 6 idiomas', () => {
  const keys = ['ob_preview_title', 'fs_title', 'fs_progress', 'fs_test', 'fs_test_sub', 'fs_watch', 'fs_watch_sub', 'fs_run', 'fs_run_sub'];
  for (const lang of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'locales', lang + '.js'), 'utf8');
    for (const k of keys) assert.ok(new RegExp('\\b' + k + ':"[^"]').test(src), lang + ' ' + k);
  }
});

// ---- pulido del 2026-11-12 ----
test('Historial: la marca y el tiempo ya no van encima del mapa; la marca ocupa su línea debajo de la fecha', () => {
  assert.ok(!SRC.includes('hist-map-badge') && !HTML.includes('hist-map-badge'));
  assert.ok(SRC.includes('<span class="hist-when"><span class="hist-day">${dateStr}</span>'));
  assert.ok(SRC.includes('<span class="hist-time">${fmtTime(r.durationSec)}</span><button class="hist-share-btn"'));
  assert.ok(HTML.includes('.hist-date{grid-area:2 / 1 / 3 / 3; margin-top:6px;}'));
  assert.ok(HTML.includes('.hist-map-img.loaded + .hist-map-route path{stroke:#0B5D2E;}'), 'sin mapa cargado el trazo usa el color del tema (se lee en oscuro)');
});

test('Primeros pasos: el botón de cerrar tiene tamaño (ícono envuelto) y al completar los tres pasos la tarjeta se despide ese día', () => {
  assert.equal(SRC.split(`'"><span class="icon-sq" style="width:16px; height:16px;">' + ICONS.cross + '</span></button></div>'`).length - 1, 2);
  const app = loadApp();
  app.state.profile = profile({ createdAt: app.todayLocalISO(), levelTest: { required: true, done: true, result: { distanceKm: 2.4 } } });
  app.state.onboarded = true; app.state.runs = [{ id: 1 }];
  require('vm').runInContext('deviceConnections.garmin = true', app);   // `let` de nivel superior: no cuelga del sandbox
  const s = app.firstSteps();
  assert.ok(s && Array.from(s).every(x => x.done), 'el día que se completa se sigue mostrando (cierre)');
  assert.equal(app.state.firstStepsDoneAt, app.todayLocalISO());
  app.state.firstStepsDoneAt = '2020-01-01';
  assert.equal(app.firstSteps(), null, 'al día siguiente ya no vuelve');
  app.state.firstStepsDoneAt = null; app.state.firstStepsDismissed = true;
  assert.equal(app.firstSteps(), null);
  for (const lang of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'locales', lang + '.js'), 'utf8');
    for (const k of ['fs_done_title', 'fs_done_sub']) assert.ok(src.includes(k + ':"'), lang + ' ' + k);
  }
});

test('Perfil: Notas de Zonda va pegada a Zonda (antes de "Ayudanos a mejorar"); Suunto sin placa blanca en claro; alta: última pantalla centrada', () => {
  const z = HTML.indexOf('id="perfil-zonda-fold"'), n = HTML.indexOf('id="coach-notes-card"'), f = HTML.indexOf('id="feedback-message"');
  assert.ok(z > 0 && z < n && n < f);
  assert.ok(HTML.includes(':root[data-theme="light"] .brand-logo-plate{background:transparent; padding:0;}'));
  assert.ok(HTML.includes(':root:not([data-theme="dark"]) .brand-logo-plate{background:transparent; padding:0;}'));
  assert.ok(HTML.includes('#onboard .ob-done{display:flex; flex-direction:column; align-items:center; justify-content:center; padding-top:0;}'));
});

test('pulido 2: el cronómetro de la carrera no se parte, la tabla de segmentos entra en el teléfono y el botón del test dice lo que toca', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.ok(css.includes('.track-topstat{text-align:center; min-width:108px;}'));
  assert.ok(css.includes('.track-topstat .n{font-size:27px; font-weight:800; white-space:nowrap;}'));
  assert.ok(js.includes("const fmtSegTime = sec => { const s = fmtTime(sec); return s.startsWith('00:') ? s.slice(3) : s; };"));
  assert.ok(js.includes("<th>${t('rd_seg_dist')}</th><th>${t('run_pace_word')}</th>"));
  assert.ok(css.includes('id="perfil-ltest-btn"') && js.includes("(lt && lt.done) ? 'ltest_perfil_btn_redo' : 'ltest_perfil_btn_do'"));
  assert.ok(css.includes('id="login-password" name="password" autocomplete="current-password" data-i18n-ph="login_password_enter_ph"'), 'el login no pide "mínimo 8 caracteres"');
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const s = fs.readFileSync(path.join(__dirname, '..', 'locales', l + '.js'), 'utf8');
    for (const k of ['ltest_perfil_btn_do', 'ltest_perfil_btn_redo', 'login_password_enter_ph']) assert.ok(s.includes(k + ':"'), l + ' ' + k);
  }
});

test('pulido 3: pausa en 2×2, números de la carrera centrados, descanso con la próxima sesión, calorías sin repetir la unidad y volver en el registro', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.ok(html.includes('.track-paused-stats{display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px;}'));
  assert.ok(html.includes('.track-active-group .track-hero{order:-1;}'));
  assert.ok(js.includes("function fmtRunClock(sec){ const s = fmtTime(sec); return s.startsWith('00:') ? s.slice(3) : s; }"));
  assert.ok(js.includes("getElementById('track-timer').textContent = fmtRunClock(tracker.elapsedSec)"));
  assert.ok(html.includes('id="home-next-upcoming"') && js.includes("t('home_upcoming', {day: dayName})"));
  assert.ok(js.includes("const restToday = !todayRun && !raceToday && !(today.dist > 0);"));
  assert.ok(js.includes("tiles.push([t('rd_calories_label'), cal+' kcal']);"));
  const signup = html.slice(html.indexOf('id="signup"'), html.indexOf('id="signup"') + 400);
  assert.ok(signup.includes('data-on-click="goBackToLogin()"') && signup.includes('data-i18n-aria="aria_back"'));
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const s = fs.readFileSync(path.join(__dirname, '..', 'locales', l + '.js'), 'utf8');
    for (const k of ['home_upcoming', 'rd_calories_label']) assert.ok(s.includes(k + ':"'), l + ' ' + k);
  }
});
