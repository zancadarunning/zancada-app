# Pruebas de Zonda con el modelo real

Conversaciones de ejemplo (`cases.json`) que se corren contra el modelo real de Anthropic con **el mismo contexto, las mismas instrucciones y las mismas herramientas que usa la app**. Sirven para saber, antes de subir un cambio al texto de instrucciones o a las herramientas, si Zonda sigue haciendo lo correcto.

## Cómo correrlas

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run eval:coach
ANTHROPIC_API_KEY=sk-ant-... npm run eval:coach -- --case minutos-por-tiempo
ANTHROPIC_API_KEY=sk-ant-... EVAL_MODEL=claude-sonnet-5-5 npm run eval:coach
npm run eval:coach:dry        # sin API: solo arma cada caso
```

- La clave la pone quien lo corre, en su terminal. No se guarda en el repositorio.
- Cada caso gasta pocas llamadas (el mensaje y las vueltas de herramientas). Con 14 casos, unos pocos centavos con el modelo chico.
- Los resultados (qué herramientas llamó, con qué datos y qué contestó) quedan en `evals/coach/results/` (no se versiona).
- `npm test` corre el modo de ensayo (sin API) para que los casos no se rompan con el tiempo.

## Cómo es un caso

```json
{
  "id": "minutos-por-tiempo",
  "descripcion": "qué se prueba",
  "setup": { "hoy": "mon", "trainBy": "time", "units": "metric", "perfil": {}, "plan": { "thu": { "typeKey": "easy", "dist": 5, "durMin": 25, "timeBased": true } }, "evento": { "dia": "sat", "name": "...", "distanceKm": 10 } },
  "mensaje": "Poné el jueves de 40 minutos",
  "esperado": {
    "herramientas": [{ "name": "modificar_sesion", "args": { "dia": "thu", "duracion_min": 40 } }],
    "prohibidas": ["cancelar_sesion"],
    "sinHerramientas": false,
    "textoCoincide": ["regex"],
    "textoNoCoincide": ["regex"]
  }
}
```

El día de la semana ("hoy") se congela: el contexto y las herramientas ven el mismo día aunque las corras otro día.

## Qué mirar de los resultados

Una prueba que falla no siempre es un error de Zonda: a veces el caso es demasiado estricto. Antes de tocar el prompt, mirá el JSON de resultados y decidí si la respuesta era razonable.
Con modelos que no son deterministas conviene correr dos o tres veces: si un caso falla solo a veces, es una zona frágil del texto de instrucciones.

## Elegir un modelo más capaz para los cambios

Si los resultados muestran que el modelo chico falla en los pedidos que cambian el plan, se puede definir `CHAT_ACTION_MODEL` en Vercel (ver `api/_lib/chat-model.js`): esos pedidos van a ese modelo y la charla sigue en el chico. Sin la variable no cambia nada ni cuesta más.
