// api/_lib/chat-model.js
//
// Qué modelo atiende cada pedido del coach (Zonda).
//
// Por defecto TODO va al modelo chico y barato (Haiku). Si se define CHAT_ACTION_MODEL en Vercel (por ejemplo un modelo más capaz), los pedidos que CAMBIAN el plan o el perfil (mover, cancelar, poner minutos, bajar el volumen,
// días de entreno...) y las vueltas de herramientas que le siguen van a ese modelo, y las preguntas y la charla siguen en Haiku. Sin la variable no cambia nada ni cuesta nada de más.
//
// La decisión se toma en el servidor mirando el último mensaje de la persona: nada que mande el cliente puede elegir el modelo. Lo peor que puede hacer alguien es escribir un verbo de acción para usar el modelo más caro,
// y ya está acotado por los topes diarios por cuenta y global.

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

// Verbos / frases de pedido de cambio en los 6 idiomas de la app (la raíz alcanza: "mové", "movela", "move", "mover"...). Deliberadamente amplio: un falso positivo solo cuesta un poco más.
const ACTION_RE = new RegExp([
  // es
  '\\b(mov[eéi]|pas[aá]|cambi[aáe]|cancel[aáe]|sac[aá]|borr[aá]|elimin[aá]|pon[eé]|dej[aá]|baj[aáe]|sub[ií]|aument[aá]|reduc[ií]|agreg[aá]|sum[aá]|quit[aá]|arm[aá]|deshac[eé]|actualiz[aá]|modific[aá]|entren[oa]|no puedo|ya no puedo|de ahora en adelante)',
  // en
  '\\b(move|change|cancel|remove|delete|swap|set|make it|reduce|lower|increase|raise|add|drop|skip|undo|update|from now on|can\'t run|cannot run)\\b',
  // pt
  '\\b(mov[ae]|mude|cancele|tire|remova|troque|baixe|aumente|reduza|adicione|desfa[çc]a|atualize|n[aã]o posso|a partir de agora)',
  // fr
  '\\b(d[eé]place|change|annule|enl[eè]ve|supprime|baisse|augmente|r[eé]duis|ajoute|mets|remplace|je ne peux pas|[àa] partir de maintenant)',
  // it
  '\\b(sposta|cambia|cancella|togli|elimina|abbassa|aumenta|riduci|aggiungi|metti|non posso|da ora in poi)',
  // de
  '\\b(verschieb|[aä]nder|streich|l[oö]sch|senk|erh[oö]h|reduzier|f[uü]g|setz|r[uü]ckg[aä]ngig|ab jetzt|kann nicht)'
].join('|'), 'i');

function lastUserText(messages) {
  if (!Array.isArray(messages)) return { text: '', isToolTurn: false };
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user') return { text: '', isToolTurn: false };
  if (typeof last.content === 'string') return { text: last.content, isToolTurn: false };
  if (Array.isArray(last.content)) {
    const isToolTurn = last.content.some(b => b && b.type === 'tool_result');
    const text = last.content.filter(b => b && b.type === 'text' && typeof b.text === 'string').map(b => b.text).join(' ');
    return { text, isToolTurn };
  }
  return { text: '', isToolTurn: false };
}

// env: process.env. Devuelve el id del modelo a usar. Solo se acepta un id con forma "claude-..." (nada raro desde una variable mal pegada).
function pickModel(messages, hasTools, env) {
  const configured = env && typeof env.CHAT_ACTION_MODEL === 'string' ? env.CHAT_ACTION_MODEL.trim() : '';
  if (!configured || !/^claude-[a-z0-9.-]{3,60}$/i.test(configured) || !hasTools) return DEFAULT_MODEL;
  const { text, isToolTurn } = lastUserText(messages);
  if (isToolTurn) return configured;   // ya hubo una herramienta en este mensaje: se termina con el mismo modelo
  // se mira solo el pedido de la persona, no el "dato automático" que la app le pega al final
  const request = text.split('[Dato automático de la app')[0];
  return ACTION_RE.test(request) ? configured : DEFAULT_MODEL;
}

module.exports = { pickModel, DEFAULT_MODEL, ACTION_RE };
