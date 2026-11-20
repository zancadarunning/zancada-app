// evals/coach/run-conv.js
//
// Conversaciones de VARIOS mensajes con Zonda (evals/coach/conversaciones.json), contra el modelo real de Anthropic, para buscar errores que una prueba de un solo
// mensaje no ve: respuestas vacías, "Listo, ya apliqué" sin haber cambiado nada, molestias que no llegan a la lista de Molestias, o cambios que se pierden de un mensaje al siguiente.
//
//   ANTHROPIC_API_KEY=... node evals/coach/run-conv.js                       (modelo por defecto de la app, 1 pasada)
//   ANTHROPIC_API_KEY=... EVAL_MODEL=claude-haiku-5-5 node evals/coach/run-conv.js --runs 3
//   node evals/coach/run-conv.js --dry                                      (sin API: solo arma cada conversación)
//   --only <id>   una conversación       --runs N   repite cada conversación N veces (los errores a veces son intermitentes)
//
// Imita a la app: en cada mensaje rearma el contexto con el estado actual, ejecuta las herramientas sobre una copia de la app y, entre mensajes, deja en el historial solo el texto
// (como el chat real). Si la respuesta final del modelo viene VACÍA, guarda en el historial el mismo mensaje de emergencia que mostraría la app. De cada llamada a la API anota
// el motivo de corte (stop_reason), los tipos de bloque y los tokens: ahí se ve POR QUÉ una respuesta viene vacía. Los resultados quedan en evals/coach/results/ (no se versiona).

const fs = require('fs');
const path = require('path');
const { prepareCase, executeTool, evaluate, serverRules } = require('./lib');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const runs = args.includes('--runs') ? Math.max(1, parseInt(args[args.indexOf('--runs') + 1], 10) || 1) : 1;
const model = process.env.EVAL_MODEL || 'claude-haiku-5-5';
const FALLBACK_APPLIED = 'Listo, ya apliqué los cambios que charlamos.';
const FALLBACK_ERROR = 'No me pude conectar ahora mismo. Probá de nuevo en un momento.';

function loadConversations() { return ['conversaciones.json', 'conversaciones-app.json'].flatMap(n => JSON.parse(fs.readFileSync(path.join(__dirname, n), 'utf8'))); }

// La misma expresión que usa la app para detectar "dice que cambió algo" (CLAIM_PATTERN en app.js), leída del archivo para no quedar desfasada.
function claimPattern() {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app.js'), 'utf8');
  const m = src.match(/const CLAIM_PATTERN = (\/.*\/i);/);
  return m ? new Function('return ' + m[1])() : null;
}
const CLAIM = claimPattern();
// La misma detección de "el corredor cuenta una molestia" que usa la app (PAIN_REPORT en app.js).
function painPattern() {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app.js'), 'utf8');
  const m = src.match(/const PAIN_REPORT = (new RegExp\(.*\));/);
  return m ? new Function('return ' + m[1])() : null;
}
const PAIN = painPattern();
const NUDGE = 'El corredor te acaba de contar una molestia o un dolor y todavía no llamaste guardar_nota_coach. Llamala ahora mismo con la nota y, si se puede identificar la zona, zona_cuerpo (rodilla, tobillo, pantorrilla, isquios, cadera, espalda, pie, cuadriceps u otro). Si en realidad ya quedó guardada en esta charla, decilo con claridad.';

async function callModel(system, tools, messages) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 2048, system, tools, messages })
    });
    const data = await res.json();
    if (res.ok) return data;
    if ((res.status === 429 || res.status === 529 || res.status >= 500) && attempt < 2) { await new Promise(r => setTimeout(r, 3000 * (attempt + 1))); continue; }
    throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
  }
}

function fingerprint(app) {
  try { return app.coachStateFingerprint(); } catch (e) { return JSON.stringify([app.state.plan, app.state.profile, app.state.painLog]); }
}

// Comprobaciones del estado de la app después de un mensaje (lo que de verdad cambió, no lo que el modelo dijo).
function checkState(app, estado) {
  const fails = [];
  const st = app.state;
  (estado.painLog || []).forEach(z => { if (!(st.painLog || []).some(p => p.bodyPart === z && p.active)) fails.push(`no quedó una molestia activa en "${z}" dentro de Molestias (painLog): ${JSON.stringify((st.painLog || []).map(p => p.bodyPart))}`); });
  if (estado.coachNotesMin && ((st.profile.coachNotes || []).length < estado.coachNotesMin)) fails.push(`se esperaban al menos ${estado.coachNotesMin} nota(s) del coach y hay ${(st.profile.coachNotes || []).length}`);
  if (estado.diasEntreno && JSON.stringify([...(st.profile.trainingDays || [])].sort()) !== JSON.stringify([...estado.diasEntreno].sort())) fails.push(`días de entreno esperados ${JSON.stringify(estado.diasEntreno)} y hay ${JSON.stringify(st.profile.trainingDays)}`);
  return fails;
}

async function runConversation(sc, runIdx) {
  const p = prepareCase({ setup: sc.setup, mensaje: '' });
  const app = p.app;
  const history = [];
  const turns = [];
  try {
    for (const turn of sc.turnos) {
      const ctx = app.buildContext();
      const system = serverRules() + String.fromCharCode(10, 10) + app.buildCoachSystem(ctx);
      const weekday = new Date().toLocaleDateString('es-AR', { weekday: 'long' });
      const label = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
      const userContent = turn.mensaje + `\n\n[Dato automático de la app, no lo escribió el corredor: ahora es ${label}, 10:00 hs. HOY es ${weekday}.]`;
      const messages = history.concat([{ role: 'user', content: userContent }]);
      const calls = [], meta = [];
      let text = '';
      const before = fingerprint(app);
      const acciones = [];
      let painNoteCalled = false, painNudged = false;
      for (let round = 0; round < 4; round++) {
        const data = await callModel(system, p.tools, messages);
        const blocks = data.content || [];
        const t = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
        meta.push({ stop_reason: data.stop_reason, tipos: blocks.map(b => b.type), usage: data.usage ? { in: data.usage.input_tokens, out: data.usage.output_tokens } : null, textoVacio: !t });
        if (t) text += (text ? '\n' : '') + t;
        const uses = blocks.filter(b => b.type === 'tool_use');
        if (uses.some(u => u.name === 'guardar_nota_coach')) painNoteCalled = true;
        if (!uses.length) {
          if (PAIN && !painNoteCalled && !painNudged && PAIN.test(turn.mensaje)) { painNudged = true; messages.push({ role: 'assistant', content: blocks }); messages.push({ role: 'user', content: NUDGE }); text = ''; continue; }
          break;
        }
        const results = uses.map(u => {
          const output = executeTool(app, u.name, u.input);
          calls.push({ name: u.name, input: u.input, output: String(output).slice(0, 200) });
          acciones.push(u.name + ': ' + String(output).replace(/[\r\n]+/g, ' ').slice(0, 220));
          return { type: 'tool_result', tool_use_id: u.id, content: String(output) };
        });
        messages.push({ role: 'assistant', content: blocks });
        messages.push({ role: 'user', content: results });
      }
      const applied = fingerprint(app) !== before;
      const esperado = Object.assign({}, turn.esperado);
      const estado = esperado.estado; delete esperado.estado;
      const fails = evaluate({ esperado }, { calls, text });
      if (estado) fails.push(...checkState(app, estado));
      if (CLAIM && !applied && (esperado.herramientas || []).length && CLAIM.test(text)) fails.push('dice que aplicó un cambio pero el plan, el perfil y las molestias no cambiaron: "' + text.slice(0, 120) + '"');
      const emptyCalls = meta.filter(m => m.textoVacio && !(m.tipos || []).includes('tool_use')).length;
      turns.push({ mensaje: turn.mensaje, text, calls, meta, applied, emptyCalls, fails });
      // lo que queda en el historial del chat real: solo el texto (y, si la respuesta vino vacía, el mensaje de emergencia de la app)
      history.push({ role: 'user', content: turn.mensaje });
      const fallbackApplied = applied ? (calls.map(c => c.output).join(' ').slice(0, 600) || FALLBACK_APPLIED) : FALLBACK_ERROR;
      const registro = applied && acciones.length ? `\n[Registro de la app (no lo escribió el corredor): en esa respuesta YA se aplicaron estos cambios: ${acciones.slice(0, 6).join(' | ').slice(0, 600)}. No los repitas.]` : '';
      history.push({ role: 'assistant', content: (text || fallbackApplied) + registro });
    }
  } finally { p.restoreDate(); }
  return { id: sc.id, run: runIdx, turns, fails: turns.flatMap((t, i) => t.fails.map(f => `turno ${i + 1} ("${t.mensaje.slice(0, 40)}"): ${f}`)) };
}

(async () => {
  if (!dry && !process.env.ANTHROPIC_API_KEY) { console.error('Falta ANTHROPIC_API_KEY (o usá --dry para ensayar sin API).'); process.exit(2); }
  const scs = loadConversations().filter(c => !only || c.id === only);
  if (!scs.length) { console.error('No hay conversaciones' + (only ? ' con id ' + only : '') + '.'); process.exit(2); }
  if (dry) {
    for (const sc of scs) { const p = prepareCase({ setup: sc.setup, mensaje: '' }); p.restoreDate(); console.log('✔ ' + sc.id + '  (' + sc.turnos.length + ' mensajes, contexto ' + p.ctx.length + ' caracteres)'); }
    console.log('\n' + scs.length + '/' + scs.length + ' conversaciones armadas'); return;
  }
  console.log('Modelo:', model, '·', scs.length, 'conversaciones ×', runs, 'pasada(s)\n');
  const all = [];
  let emptyTotal = 0, callsTotal = 0;
  for (let r = 1; r <= runs; r++) {
    for (const sc of scs) {
      let res;
      try { res = await runConversation(sc, r); } catch (e) { res = { id: sc.id, run: r, turns: [], fails: ['error: ' + e.message] }; }
      all.push(res);
      res.turns.forEach(t => { emptyTotal += t.emptyCalls; callsTotal += t.meta.length; });
      console.log((res.fails.length ? '✖' : '✔') + ' ' + sc.id + (runs > 1 ? ' (pasada ' + r + ')' : ''));
      res.fails.forEach(f => console.log('    - ' + f));
    }
  }
  const failed = all.filter(r => r.fails.length).length;
  console.log('\n' + (all.length - failed) + '/' + all.length + ' conversaciones sin fallas · llamadas con respuesta vacía: ' + emptyTotal + ' de ' + callsTotal);
  const dir = path.join(__dirname, 'results');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'conv-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + model + '.json');
  fs.writeFileSync(file, JSON.stringify({ model, runs, emptyTotal, callsTotal, results: all }, null, 2));
  console.log('Resultados guardados en ' + path.relative(process.cwd(), file));
})();
