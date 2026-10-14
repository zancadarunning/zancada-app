# Plan por fases: diseño

Fecha: 2026-10-14 · Estado: **aprobado** (ajustes de implementación en `docs/superpowers/plans/2026-10-14-plan-por-fases.md`, sección "Cambios al diseño", que prevalece: cronograma anclado a un lunes, la semana de la carrera cuenta como una de las 3 de reducción final, y la proporción de tirada larga solo en modo distancia) · Etapa 1 de 2 (la etapa 2 es "plan que aprende", fuera de este documento).

## 1. Objetivo
Que el plan de entrenamiento se acerque más al de un entrenador real cuando hay una carrera objetivo: que se arme **hacia atrás desde la fecha de la carrera**, con fases, un pico de volumen y una tirada larga propios de cada distancia, y con sesiones de calidad **específicas del ritmo de carrera**.

Criterio de éxito: para perfiles de ejemplo (ver §8) el plan resultante tiene una progresión coherente de principio a fin, llega al pico antes de la reducción final, no rompe ninguna regla de seguridad actual, y el dueño del producto lo juzga mejor que el plan de hoy.

## 2. Estado actual (lo que cambia)
Todo en `app.js`; el plan lo arma `generatePlan(p, weekNumber, weekStartDate)`.
- Volumen: `weekMultiplier(n, caution)` crece 4 a 6% por semana con tope de 1,5 a 1,8 veces la base, y baja un 25% cada cuarta semana (`isCutbackWeek`). Igual para todos los objetivos y sin pico definido.
- Reducción final: `taperMultiplier` (últimas 3 semanas: 0,85 / 0,7 / 0,55) y `recoveryMultiplier` después de la carrera. **No se tocan.**
- Sesión fuerte: `distributeSessionTypes` + `hardSessionRotation(goal, caution)` rotan por número de semana (objetivos cortos y largos tienen listas distintas), sin relación con las semanas que faltan.
- Contenido: `buildIntervalStructure`, `buildFartlekStructure`, `buildHillStructure` eligen repeticiones según los km de calidad de la semana, no según el ritmo objetivo.
- Ritmos: salen del test de Cooper (`levelTest.paces`) y de `estimateBasePaceMinPerKm`; la carrera se predice con `predictRaceTime`.

## 3. Alcance
**Entra (v1):**
- Perfiles con `profile.raceDate` válida y `profile.goal` en `5k`, `10k`, `15k`, `21k`, `42k`, que **no** sean `isBeginnerProfile`.
- Dos modos de entrenamiento: por distancia y por tiempo (mismas fases, en minutos).

**No entra (v1):**
- Principiantes: siguen con su fórmula actual (`estimateBeginnerWeeklyKm`) y sus reglas de zona 1 o zona 2. Se revisa en una versión posterior.
- Objetivos generales o sin fecha: el plan sigue exactamente igual que hoy.
- Nuevos tipos de sesión, fuerza o movilidad, varias carreras, y todo lo de IA (Zonda).
- Aprender de lo que realmente se corre (etapa 2).

## 4. Fases
Sea `T` = semanas que faltan para la carrera, contadas desde el lunes de la semana a generar. Las últimas 3 semanas son la reducción final actual (`taperMultiplier`). Sea `R = T - 3` las semanas útiles.

| `R` | Reparto |
|---|---|
| `R < 4` | No hay tiempo para fases: se usa el cálculo actual (solo reducción final). |
| `4 ≤ R < 8` | Sin base: desarrollo 40%, específica 40%, pico 20%. |
| `8 ≤ R ≤ 24` | Base 25%, desarrollo 35%, específica 25%, pico 15% (redondeo a semanas enteras, mínimo 1 por fase). |
| `R > 24` | Las primeras `R - 24` semanas son **base extendida** (volumen estable con crecimiento suave, dentro de los topes actuales); las últimas 24 siguen el reparto anterior. |

Función nueva, pura y sin efectos: `phaseForWeek(profile, weekStartDate)` devuelve `{ phase, weeksToRace, weekInPhase, phaseWeeks, active }`. `active=false` cuando se aplica el cálculo actual.

## 5. Volumen
- **Pico semanal objetivo** `peakKm = min(objetivoPorDistancia, base × tope, base × growth^(semanasDeSubida))`.
  - `base` = `calcWeeklyKm(profile)`; `tope` y `growth` son los que ya usa `weekMultiplier` según `caution.level`.
  - `objetivoPorDistancia` (valores iniciales, a afinar con los ejemplos de §8): 5k: 35 km · 10k: 45 km · 15k: 50 km · 21k: 55 km · 42k: 70 km.
- Si el cálculo da un pico menor al ideal de la distancia, el plan apunta al pico que sí es seguro y la app **lo dice** en el resumen del plan (no se fuerza el salto).
- **Curva:** rampa de `base` a `peakKm` durante base, desarrollo y específica. Pico: las dos semanas más altas. Cada 4ª semana de la rampa se descarga a 0,75 de la semana anterior (como hoy), pero **nunca** en las semanas de pico, y la semana siguiente a una descarga puede volver a su valor previo sin contar como salto.
- **Límite de salto:** entre semanas consecutivas no se supera `growth` (1,04 a 1,06), salvo el retorno tras descarga.
- Se mantienen `skipPeriodicCutback`, `eventRaceWeekMultiplier`, `recoveryMultiplier`, `returningFromBreak`, `computeReturnFromBreakAdjustment` y `pregnancyStillRecent`: se aplican **encima** del volumen por fases, igual que hoy lo hacen sobre `weekMultiplier`.

## 6. Contenido de las semanas
**Tirada larga:** `longKm = min(topeLarga, volumen × proporción)`.
- `topeLarga`: 5k: 12 km · 10k: 16 km · 15k: 20 km · 21k: 24 km · 42k: 32 km.
- `proporción` por fase: base 0,28 · desarrollo 0,30 · específica 0,32 · pico 0,33. En semanas de descarga baja un 20%.

**Sesión(es) de calidad por fase** (usando solo tipos que la app ya tiene):

| Fase | Sesión fuerte (rotación) | Notas |
|---|---|---|
| Base | `hills` (cortas), `fartlek`, `progression` | Sin series largas ni ritmo medio sostenido. |
| Desarrollo | `tempo`, `intervals`, `fartlek` | Ritmo medio y series al ritmo de 5k/10k. |
| Específica | `tempo` con bloques al **ritmo objetivo** (≥10k), `intervals` a ritmo objetivo (5k/10k), tirada larga con bloques a ritmo objetivo (≥21k) | El ritmo objetivo viene de `predictRaceTime` o, sin él, del test de nivel. |
| Pico | Igual que específica con menos repeticiones y misma intensidad | Afilado: calidad intacta, volumen fijo en lo alto. |

- Se respeta `maxHardDays` y `pickSpacedDays` de `distributeSessionTypes` (cuántos días fuertes tolera la frecuencia y la cautela del perfil); lo que cambia es **qué** se elige para cada fase.
- Los textos de las sesiones llevan el ritmo objetivo cuando hay uno. Cadenas nuevas en `locales/{es,en,pt,fr,it,de}.js` y su test de cobertura de idiomas.

## 7. Compatibilidad y despliegue
- `PLAN_ALGO_VERSION` pasa de 4 a 5.
- **No se cambia la semana en curso de nadie:** se guarda `state.planPhasesFrom` (lunes siguiente al despliegue o a la primera vez que se abre la app con la versión nueva). Solo las semanas que empiezan en esa fecha o después usan fases.
- Cambios de perfil que hoy regeneran el plan (días, objetivo, fecha de carrera) siguen funcionando: `phaseForWeek` se recalcula con los datos nuevos.
- `weeklyKm` mostrado en el resumen coincide con la suma real de la semana (invariante actual, con su test).
- La IA (`/api/chat`) no cambia. El contexto de Zonda ya trae la semana actual y la próxima; se le añade una línea con la fase y las semanas que faltan.

## 8. Verificación
1. Tests unitarios (`test/plan-phases.test.js`):
   - `phaseForWeek`: reparto correcto para `R` = 3, 4, 7, 8, 16, 24, 30 y fecha pasada o inválida.
   - Ningún salto semanal mayor a `growth` (salvo retorno de descarga), ninguna semana de pico es descarga, el pico nunca supera `base × tope`.
   - Tirada larga siempre ≤ `topeLarga` y ≤ 35% del volumen semanal.
   - Reducción final y recuperación idénticas a las actuales.
   - Sin `raceDate` o con objetivo general: salida **idéntica** a la versión 4 (comparación exacta).
   - Perfil principiante: salida idéntica a la versión 4.
   - Modo por tiempo: mismas fases, sesiones en minutos.
2. Planes de ejemplo impresos de punta a punta, para revisar a mano antes de publicar:
   - activo a 10k en 10 semanas;
   - activo a 21k en 16 semanas;
   - activo a 42k en 20 semanas y en 30 semanas;
   - activo a 5k en 6 semanas (caso comprimido).
   Cada uno con su comparación contra el plan de hoy.
3. Prueba en el celular con un perfil real antes de subir a la web.

## 9. Riesgos y decisiones abiertas
- Los valores de pico semanal y de tirada larga son un punto de partida razonable, no una verdad: se afinan al revisar los planes de ejemplo.
- Un plan más exigente aumenta el riesgo de lesión si los topes de seguridad están mal calibrados: por eso los topes actuales por edad y contextura se mantienen como límite duro.
- Principiantes quedan fuera de v1: es una decisión de alcance, no una limitación técnica.
- No se usan datos de Strava para nada nuevo (ver política de Strava): el pico se calcula desde `currentWeeklyKm` declarado y el test de nivel.
- Fuera de este documento queda la **etapa 2** (ajustar con lo que realmente se corre), que se diseña después de ver funcionar la etapa 1.
