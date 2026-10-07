# Revisión de seguridad de los cambios recientes (differential-review)

**Fecha:** 2026-10-07 · **Rango:** `1f9872b~1..HEAD` (7 commits, 16 archivos, +374 −262) · **Tamaño:** SMALL → análisis profundo.
**Método:** skill `differential-review` (Trail of Bits): riesgo por archivo, lectura de cada diff, regresiones, cobertura de tests, radio de impacto.

## Resultado
No hay vulnerabilidades explotables de alta gravedad en estos cambios. Hubo 1 hallazgo de privacidad (arreglado) y 1 fallo operativo (arreglado).

| # | Gravedad | Hallazgo | Estado |
|---|---|---|---|
| 1 | Media (privacidad) | La última posición exacta guardada para el mapa de Correr (iPhone PWA, `zancada_last_pos` en `localStorage`) no se borraba al cerrar sesión, borrar datos ni borrar la cuenta. Otra cuenta en el mismo iPhone habría visto dónde corría la anterior, y "Eliminar mis datos" no la eliminaba. | Arreglado: `clearLastKnownPosition()` en `logout`, `resetApp` y `deleteAccount`. |
| 2 | Baja (disponibilidad) | COROS corta a 50 FIT por día. El cron (cada 15 min) seguía pidiendo el FIT, gastaba los 3 intentos de la carrera pendiente (`corosBackfillTries`) sin traer nada y registraba un evento `diag coros-fit` por corrida (268 en un día). Una carrera podía quedar sin mapa para siempre. | Arreglado: el límite diario no consume intentos, no se reporta y frena el backfill del ciclo. Verificado con un stub. Las carreras que ya agotaron sus 3 intentos no se recuperan solas. |
| 3 | Info | La edad mínima de 16 se aplica solo en el cliente (el calendario de nacimiento no deja elegir una fecha posterior). Se puede saltear tocando el DOM. Es un control de cortesía, no uno de seguridad. | Aceptado. |
| 4 | Info (ya existente) | `api/suunto-webhook.js` manda a Sentry `startTime` y `dist` de cada entreno recibido (sin identificar al usuario). La Política dice que a Sentry solo van datos técnicos. | Sacar los eventos `diag suunto-webhook` cuando llegue el primer webhook real de un reloj. |

## Lo que se revisó y salió limpio
- Retiro de la sonda temporal de COROS (`describeShape`, `probeCorosDetailShapes`, `listCorosMcpTools`): reduce superficie y no deja imports rotos (verificado con grep).
- Agendado del test de nivel: los textos que llegan al HTML pasan por `escapeHtml`; los parámetros del `onclick` son números y strings internos, no entrada del usuario.
- `privacy.html` / `terms.html`: el contenido es propio (no viene de usuarios) y se arma con `innerHTML` solo desde un JSON embebido con `</` escapado.
- Movimiento de los modales y logo de Suunto: sin efecto de seguridad.
- Dependencias (`supply-chain-risk-auditor`): 0 avisos en las 5 directas; 1 transitiva (`uuid` 9.0.1 vía `firebase-admin`, GHSA-w5hq-g745-h8pq) sin uso vulnerable.
