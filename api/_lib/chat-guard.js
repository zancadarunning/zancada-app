// api/_lib/chat-guard.js
//
// Validación de lo que el cliente manda a /api/chat antes de pagarlo en la API de Anthropic.
// El chat de la app arma system/tools/messages del lado del cliente y el servidor los reenviaba casi tal cual: cualquier cuenta
// podía usar el endpoint como un proxy de Claude (system propio, herramientas propias -incluidas las de servidor de Anthropic, que
// se facturan aparte-, bloques de imagen/documento, historiales enormes). Acá se acepta SOLO la forma que la app usa de verdad:
//   - system: un texto
//   - tools: las 7 herramientas del coach (por nombre), con descripción y esquema acotados
//   - messages: roles user/assistant con texto, tool_use y tool_result (nada de imágenes, documentos ni otros tipos de bloque)

const ALLOWED_TOOLS = new Set([
  'modificar_sesion', 'cancelar_sesion', 'mover_sesion', 'ajustar_volumen_semana',
  'modificar_perfil', 'guardar_nota_coach', 'deshacer_cambio'
]);

const LIMITS = {
  system: 60000,        // el prompt real del coach (perfil + plan + notas) ronda 10-20k caracteres
  toolDescription: 6000,
  toolSchema: 8000,
  messages: 60,         // la app manda como mucho 40 de historial + las vueltas de herramientas (4)
  text: 20000,
  toolInput: 6000,
  toolResult: 6000,
  total: 100000
};

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const reject = reason => ({ ok: false, reason });
const jsonLen = v => { try { return JSON.stringify(v).length; } catch (e) { return Infinity; } };

function sanitizeSystem(system) {
  if (system === undefined || system === null) return { ok: true, value: undefined };
  if (typeof system !== 'string') return reject('system no es texto');
  if (system.length > LIMITS.system) return reject('system demasiado largo');
  return { ok: true, value: system };
}

function sanitizeTools(tools) {
  if (tools === undefined || tools === null) return { ok: true, value: undefined };
  if (!Array.isArray(tools)) return reject('tools no es una lista');
  if (tools.length > ALLOWED_TOOLS.size) return reject('demasiadas herramientas');
  const seen = new Set();
  const out = [];
  for (const t of tools) {
    if (!isPlainObject(t) || typeof t.name !== 'string' || !ALLOWED_TOOLS.has(t.name) || seen.has(t.name)) return reject('herramienta no permitida');
    if (t.type !== undefined && t.type !== 'custom') return reject('tipo de herramienta no permitido');   // web_search, code_execution, etc. se facturan aparte
    if (typeof t.description !== 'string' || t.description.length > LIMITS.toolDescription) return reject('descripción de herramienta inválida');
    if (!isPlainObject(t.input_schema) || jsonLen(t.input_schema) > LIMITS.toolSchema) return reject('esquema de herramienta inválido');
    seen.add(t.name);
    out.push({ name: t.name, description: t.description, input_schema: t.input_schema });
  }
  return { ok: true, value: out.length ? out : undefined };
}

function sanitizeBlock(b) {
  if (!isPlainObject(b)) return null;
  if (b.type === 'text') {
    if (typeof b.text !== 'string' || b.text.length > LIMITS.text) return null;
    return { type: 'text', text: b.text };
  }
  if (b.type === 'tool_use') {
    if (typeof b.id !== 'string' || b.id.length > 100 || typeof b.name !== 'string' || !ALLOWED_TOOLS.has(b.name)) return null;
    const input = b.input === undefined ? {} : b.input;
    if (!isPlainObject(input) || jsonLen(input) > LIMITS.toolInput) return null;
    return { type: 'tool_use', id: b.id, name: b.name, input };
  }
  if (b.type === 'tool_result') {
    if (typeof b.tool_use_id !== 'string' || b.tool_use_id.length > 100) return null;
    let content = b.content;
    if (content === undefined || content === null) content = '';
    if (typeof content !== 'string') content = jsonLen(content) <= LIMITS.toolResult ? JSON.stringify(content) : null;
    if (content === null || content.length > LIMITS.toolResult) return null;
    const out = { type: 'tool_result', tool_use_id: b.tool_use_id, content };
    if (b.is_error === true) out.is_error = true;
    return out;
  }
  return null;   // image, document, search_result, etc.: no se aceptan
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) return reject('messages vacío');
  if (messages.length > LIMITS.messages) return reject('demasiados mensajes');
  const out = [];
  for (const m of messages) {
    if (!isPlainObject(m) || (m.role !== 'user' && m.role !== 'assistant')) return reject('rol inválido');
    if (typeof m.content === 'string') {
      if (m.content.length > LIMITS.text) return reject('mensaje demasiado largo');
      out.push({ role: m.role, content: m.content });
    } else if (Array.isArray(m.content) && m.content.length && m.content.length <= 20) {
      const blocks = [];
      for (const b of m.content) {
        const sb = sanitizeBlock(b);
        if (!sb) return reject('bloque de contenido no permitido');
        blocks.push(sb);
      }
      out.push({ role: m.role, content: blocks });
    } else {
      return reject('contenido inválido');
    }
  }
  return { ok: true, value: out };
}

// Devuelve { ok:true, value:{system, tools, messages} } o { ok:false, reason }.
function sanitizeChatRequest(body) {
  const b = isPlainObject(body) ? body : {};
  const s = sanitizeSystem(b.system); if (!s.ok) return s;
  const t = sanitizeTools(b.tools); if (!t.ok) return t;
  const m = sanitizeMessages(b.messages); if (!m.ok) return m;
  const value = { system: s.value, tools: t.value, messages: m.value };
  if (jsonLen(value) > LIMITS.total) return reject('pedido demasiado grande');
  return { ok: true, value };
}

module.exports = { sanitizeChatRequest, ALLOWED_TOOLS, LIMITS };
