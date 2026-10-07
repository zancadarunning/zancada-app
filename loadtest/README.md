# Pruebas de carga

Objetivo: que un cambio que empeora el servidor **falle acá** y no con usuarios reales en producción.

| Qué | Cómo | Qué mide |
|---|---|---|
| Consultas e índices | `npm test` (`test/perf/query-index-guard.test.js`) | Toda búsqueda del servidor por una columna tiene índice; nadie pide la tabla `app_state` entera. |
| Escala de crons | `npm test` (`test/perf/reminders-and-cron-scale.test.js`) | `send-reminders` con 20.000 usuarios (consultas dirigidas, tiempo) y rotación de los crons de sincronización. |
| Velocidad de la app | `npm test` (`test/perf/client-budgets.test.js`) | Presupuesto de tiempo de las funciones del plan con miles de carreras. |
| Carga HTTP | `npm run loadtest` | 50 pedidos en paralelo al endpoint del calendario (los archivos reales de `api/` con una base simulada). Falla si hay errores o p95 > 250 ms. |
| Carga HTTP sin índice | `node loadtest/run.js --no-index` | Simula una búsqueda que lee 20.000 filas: **tiene que fallar** (prueba que el test detecta el problema). |

## Reglas

- `loadtest/run.js` solo le pega a su propio servidor local. No acepta URLs: no se puede apuntar a `zancada.org` por error.
- **Nunca** cargar producción: gasta cuota de Supabase/Vercel, dispara los límites de las APIs de Strava, Suunto, COROS y Anthropic
  y puede mandar notificaciones reales. Para probar un deploy real, usar una URL de *preview* de Vercel con una base de pruebas.
- No incluir `/api/chat` en pruebas de carga: cada pedido llama a Anthropic y cuesta plata.
