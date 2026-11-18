#!/usr/bin/env node
// evals/coach/run.js
//
// Corre las conversaciones de evals/coach/cases.json contra el modelo REAL de Anthropic, con el mismo contexto, instrucciones y herramientas que usa la app, y dice cuáles pasan.
//
//   ANTHROPIC_API_KEY=sk-ant-... node evals/coach/run.js                 # todos los casos
//   ANTHROPIC_API_KEY=... node evals/coach/run.js --case minutos-por-tiempo
//   ANTHROPIC_API_KEY=... EVAL_MODEL=claude-sonnet-5-5 node evals/coach/run.js
//   node evals/coach/run.js --dry                                         # sin API: solo arma cada caso (lo mismo que corre `npm test`)
//
// La clave la pone quien lo corre, en su propia terminal: nunca se guarda en el repositorio. Cada caso gasta unas pocas llamadas (un mensaje y las vueltas de herramientas).
// Los resultados quedan en evals/coach/results/ (no se versiona).

const fs = require('fs');
const path = require('path');
const { loadCases, prepareCase, executeTool, evaluate } = require('./lib');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const only = args.includes('--case') ? args[args.indexOf('--case') + 1] : null;
const model = process.env.EVAL_MODEL || 'claude-haiku-4-5-20251001';

async function callModel(system, tools, messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 2048, system, tools, messages })
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
  return data;
}

async function runCase(c) {
  const p = prepareCase(c);
  try {
    if (dry) return { id: c.id, dry: true, contextChars: p.ctx.length, systemChars: p.system.length, fails: [] };
    const calls = [];
    let text = '';
    const messages = p.messages.slice();
    for (let turn = 0; turn < 4; turn++) {
      const data = await callModel(p.system, p.tools, messages);
      const blocks = data.content || [];
      const t = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      if (t) text += (text ? '\n' : '') + t;
      const uses = blocks.filter(b => b.type === 'tool_use');
      if (!uses.length) break;
      const results = uses.map(u => {
        const output = executeTool(p.app, u.name, u.input);
        calls.push({ name: u.name, input: u.input, output: String(output).slice(0, 300) });
        return { type: 'tool_result', tool_use_id: u.id, content: String(output) };
      });
      messages.push({ role: 'assistant', content: blocks });
      messages.push({ role: 'user', content: results });
    }
    return { id: c.id, calls, text, fails: evaluate(c, { calls, text }) };
  } finally { p.restoreDate(); }
}

(async () => {
  if (!dry && !process.env.ANTHROPIC_API_KEY) { console.error('Falta ANTHROPIC_API_KEY (o usá --dry para ensayar sin API).'); process.exit(2); }
  const cases = loadCases().filter(c => !only || c.id === only);
  if (!cases.length) { console.error('No hay casos' + (only ? ' con id ' + only : '') + '.'); process.exit(2); }
  console.log(dry ? 'Ensayo sin API' : 'Modelo: ' + model, '·', cases.length, 'casos\n');
  const results = [];
  for (const c of cases) {
    let r;
    try { r = await runCase(c); } catch (e) { r = { id: c.id, error: e.message, fails: ['error: ' + e.message] }; }
    results.push(r);
    console.log((r.fails.length ? '✖' : '✔') + ' ' + c.id + (r.dry ? '  (contexto ' + r.contextChars + ' caracteres)' : ''));
    r.fails.forEach(f => console.log('    - ' + f));
  }
  const failed = results.filter(r => r.fails.length).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' pasan');
  if (!dry) {
    const dir = path.join(__dirname, 'results');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, new Date().toISOString().replace(/[:.]/g, '-') + '-' + model + '.json');
    fs.writeFileSync(file, JSON.stringify({ model, results }, null, 2));
    console.log('Resultados guardados en ' + path.relative(process.cwd(), file));
  }
  process.exit(failed ? 1 : 0);
})();
