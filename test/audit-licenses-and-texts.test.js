// Auditoría 2026-11-03, grupo 2: licencias de Garmin/Strava (nada de sus datos a la IA, atribución de Garmin), textos veraces y notas de Zonda.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').split(String.fromCharCode(13)).join('');
const loc = l => fs.readFileSync(path.join(__dirname, '..', 'locales', l + '.js'), 'utf8');

test('las carreras de Strava/Garmin convertidas en manuales siguen fuera de la IA y Garmin sigue con su atribución', async () => {
  const app = loadApp({ onUpsert() { return Promise.resolve({ data: null, error: null }); } });
  app.setCurrentUserId('u1');
  app.state.onboarded = true;
  app.state.runs = [
    { id: 1, source: 'strava', stravaId: 5, distanceKm: 5 },
    { id: 2, source: 'garmin', garminId: 'g', device: 'Forerunner 255', distanceKm: 6 },
    { id: 3, distanceKm: 7 }
  ];
  assert.deepEqual(app.aiVisibleRuns().map(r => r.id), [3]);
  // lo que hace confirmKeepDataBeforeDisconnect (sin el diálogo): se conserva la marca
  const keep = (src, idField) => app.state.runs.filter(r => r.source === src).forEach(r => { if (src === 'strava' || src === 'garmin') { r.origin = src; r.aiExcluded = true; } delete r.source; delete r[idField]; });
  assert.ok(/if\(sourceKey === 'strava' \|\| sourceKey === 'garmin'\)\{ r\.origin = sourceKey; r\.aiExcluded = true; \}/.test(SRC), 'confirmKeepDataBeforeDisconnect deja la marca');
  keep('strava', 'stravaId'); keep('garmin', 'garminId');
  assert.deepEqual(app.aiVisibleRuns().map(r => r.id), [3], 'siguen fuera de la IA aunque ya no tengan source');
  assert.match(app.garminAttribution(app.state.runs[1]), /^Garmin/, 'la atribución de Garmin sobrevive a la conversión');
  assert.equal(app.garminAttribution(app.state.runs[2]), '', 'una carrera propia no lleva atribución');
});

test('"bajar la carga": con carreras de Strava/Garmin no se manda a la IA un porcentaje calculado con ellas', () => {
  const body = SRC.slice(SRC.indexOf('function askZondaLowerLoad'), SRC.indexOf('// ---- Plan de carrera: tiempo objetivo'));
  assert.ok(body.includes("t('load_prompt_generic')") && body.includes("r.source === 'strava' || r.source === 'garmin' || r.aiExcluded"));
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) assert.ok(loc(l).includes('load_prompt_generic:'), l);
});

test('los mensajes automáticos con tiempos de una carrera (calibración de carrera y test de nivel) no se reenvían a la IA', () => {
  assert.ok(/ltest_coach_msg[^\n]*noAi: true\}\)/.test(SRC), 'test de nivel');
  assert.ok(/rp_calib_msg[^\n]*noAi: true\}\)/.test(SRC), 'calibración de carrera');
});

test('la imagen "sticker" (la de por defecto) y la de marca personal llevan la atribución de Garmin', () => {
  const sticker = SRC.slice(SRC.indexOf('function buildShareImageBlob'), SRC.indexOf('function buildShareImageBlob') + 9000);
  assert.ok(sticker.includes('drawShareAttribution(ctx, W, H, garminAttribution(r))'));
  const pr = SRC.slice(SRC.indexOf('function buildPRShareImageBlob'), SRC.indexOf('function buildPRShareImageBlob') + 6000);
  assert.ok(pr.includes('drawShareAttribution(ctx, W, H, garminAttribution(src))'));
});

test('el texto del inicio ya no dice "no se comparte con nadie": es veraz sobre lo que se hace con peso, altura y edad (6 idiomas)', () => {
  const bad = { es: /no se comparte con nadie/, en: /never shared with anyone/, pt: /nunca é compartilhado/, fr: /jamais partagé/, it: /mai condivisi/, de: /wird nie geteilt/ };
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const s = loc(l);
    const m = s.match(/ob_step2_hint:"((?:[^"\\]|\\.)*)"/);
    assert.ok(m, l);
    assert.ok(!bad[l].test(m[1]), l + ': sigue la promesa falsa');
    assert.match(m[1], /Zonda/, l + ': dice que Zonda lo usa');
  }
});

test('notas de Zonda: se listan (escapadas) y se pueden borrar desde Perfil', () => {
  const app = loadApp({ onUpsert() { return Promise.resolve({ data: null, error: null }); } });
  const reg = new Map();
  const realGet = app.document.getElementById;
  app.document.getElementById = id => { if (!reg.has(id)) reg.set(id, realGet(id)); return reg.get(id); };
  app.setCurrentUserId('u1');
  app.state.onboarded = true;
  app.state.profile = { name: 'A', coachNotes: ['rodilla <b>izq</b>', 'prefiero correr de mañana'] };
  app.renderCoachNotes();
  const html = app.document.getElementById('coach-notes-list').innerHTML;
  assert.ok(html.includes('&lt;b&gt;izq&lt;/b&gt;') && !html.includes('<b>izq</b>'), 'el texto de la nota se escapa');
  assert.equal((html.match(/deleteCoachNote\(/g) || []).length, 2);
  app.deleteCoachNote(0);
  assert.deepEqual(app.state.profile.coachNotes, ['prefiero correr de mañana']);
  app.deleteCoachNote(7); app.deleteCoachNote('x');
  assert.equal(app.state.profile.coachNotes.length, 1, 'índices inválidos no hacen nada');
  assert.ok(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').includes('id="coach-notes-list"'));
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) for (const k of ['coach_notes_title', 'coach_notes_lead', 'coach_notes_empty', 'coach_notes_delete']) assert.ok(loc(l).includes(k + ':'), l + ' ' + k);
});

test('al volver de conectar un reloj en el inicio, los pasos con datos de salud que no se guardan en el borrador se vuelven a preguntar', () => {
  assert.ok(SRC.includes("if(step > 16) step = d.gender === 'f' ? 13 : 16;"));
  assert.ok(SRC.includes("else if(step > 13 && d.gender === 'f') step = 13;"));
});
