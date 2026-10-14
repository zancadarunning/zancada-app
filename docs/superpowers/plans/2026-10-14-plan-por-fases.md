# Plan por fases: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `generatePlan` arme el plan hacia atrás desde la fecha de la carrera objetivo, con fases, pico de volumen, tirada larga y sesiones al ritmo de carrera, sin cambiar nada para quien no tiene carrera objetivo ni para principiantes.

**Architecture:** Un cronograma por fases (`state.phaseSchedule`, anclado a un lunes) alimenta funciones puras nuevas en `app.js` (`phaseSplit`, `phaseForWeek`, `phasedWeeklyKm`). `generatePlan` las usa solo cuando `phaseForWeek(...).active` es verdadero; si no, el camino actual queda intacto. Un snapshot "dorado" del comportamiento actual protege contra regresiones.

**Tech Stack:** JavaScript sin framework (`app.js`, ~16 000 líneas, un solo archivo), tests con `node:test` y `loadApp()` (`test/support/load-app.js`), textos en `locales/{es,en,pt,fr,it,de}.js`.

**Spec:** `docs/superpowers/specs/2026-10-14-plan-por-fases-design.md` (con los ajustes de §"Cambios al diseño" de este plan, que prevalecen).

## Global Constraints
- Objetivos que activan fases: `profile.goal` en `5k`, `10k`, `15k`, `21k`, `42k`, con `profile.raceDate` válida, y `!isBeginnerProfile(p)`. Todo lo demás: salida **idéntica** a la versión 4.
- Reducción final: las últimas 3 semanas (la de la carrera y las 2 anteriores) usan `taperMultiplier` sin cambios (0,85 / 0,7 / 0,55).
- Reparto de semanas útiles `R`: `R<4` sin fases; `4≤R<8` desarrollo 40% / específica 40% / pico 20%; `8≤R≤24` base 25% / desarrollo 35% / específica 25% / pico 15% (mínimo 1 semana por fase); `R>24` las primeras `R-24` semanas son base extendida.
- Pico semanal objetivo por distancia: 5k 35 · 10k 45 · 15k 50 · 21k 55 · 42k 70 km. Tope de tirada larga: 12 · 16 · 20 · 24 · 32 km.
- Proporción de la tirada larga sobre el volumen semanal: base 0,28 · desarrollo 0,30 · específica 0,32 · pico 0,33; semana de descarga ×0,8.
- Crecimiento y tope por `caution.level` (los de `weekMultiplier`): `growth` 1,04 / 1,05 / 1,06 (niveles 2 / 1 / 0) y `cap` 1,5 / 1,65 / 1,8. Descarga: cada 4ª semana de la rampa, ×0,75, nunca en pico ni en reducción final.
- No se toca la semana en curso de nadie: el cronograma se ancla al lunes siguiente.
- Strava: nada nuevo se calcula con datos de Strava; el pico sale de `p.weeklyKm` / `weeklyGoalKm`.
- Todos los textos nuevos en los 6 idiomas.
- Archivos editados con Node (`readFileSync`/`writeFileSync`) conservando saltos de línea; correr `npm test` completo antes de cada commit.
- Después de publicar: sincronizar `app.js` y `locales/` a `mobile/www`, y recompilar/instalar en el celular.

## Review Focus
1. Fecha de carrera pasada, inválida o ausente → salida idéntica a v4 (nunca error ni plan vacío).
2. Cambio de `raceDate` o de `goal` a mitad de camino → nuevo cronograma anclado al lunes siguiente, sin saltos de volumen entre semanas ya generadas.
3. Base baja con objetivo exigente (ej. 10 km/semana a un 42k) → pico limitado por `growth`/`cap`, nota visible, nunca un salto imposible.
4. `weeklyGoalKm` cargado por el usuario → se respeta como base (acotada ±30% como hoy).
5. Pocos días de entrenamiento (2 por semana) y carrera un día que no es domingo → la tirada larga no devora el volumen y el taper cae en las semanas correctas.

## Cambios al diseño
- **Cronograma anclado** (reemplaza "R desde la semana a generar" de §4 del spec): `state.phaseSchedule = {anchor, raceDate, goal}`. `R` se mide una sola vez desde `anchor` hasta la semana de la carrera, así los límites de fase no se corren cada semana. `anchor` = lunes siguiente al momento en que se crea el cronograma.
- **Semana de la carrera cuenta como una de las 3 de reducción final.** `R = semanasEntre(anchor, lunesDeLaCarrera) - 2`.
- **Modo por tiempo:** recibe volumen por fases, rotación por fase y ritmo de carrera; la proporción y el tope de la tirada larga se aplican solo en modo distancia (v1).
- **Después de la carrera:** ver Task 10, **pendiente de aprobación del dueño**.

## File Structure
- Modify `app.js`: bloque nuevo `/* ===== PLAN POR FASES ===== */` junto a `taperMultiplier` (~línea 4342) con constantes y funciones puras; ajustes puntuales en `weekMultiplier`, `distributeSessionTypes`, `generatePlan`, `buildTimePlanDays`, `planLabelBody`, `renderPlan`, el contexto de Zonda (~línea 15200) y `checkPlanAlgoVersion`.
- Create `test/plan-phases.test.js`, `test/support/plan-golden-v4.json`, `scripts/plan-examples.js`.
- Modify `locales/{es,en,pt,fr,it,de}.js` (claves nuevas listadas en Task 8).

---

### Task 1: Snapshot dorado del comportamiento actual
**Files:** Create `test/support/plan-golden-v4.json`, `test/plan-phases.test.js` (primer test); no se modifica `app.js`.

**Interfaces:**
- Produces: `goldenCases()` en `test/plan-phases.test.js` que devuelve `[{name, profile, weekNumber, weekStart}]` y el archivo JSON con la salida de `generatePlan` para cada caso. Los tests posteriores comparan contra él.

- [ ] **Step 1:** Definir `goldenCases()` con 12 casos: perfil activo con goal `10k` sin `raceDate`; goal `21k` con `raceDate` pasada; principiante con `raceDate` a 10 semanas; modo `trainBy:'time'`; perfil con `weeklyGoalKm:40`; 2 días de entrenamiento; cada uno en semanas 1, 5 y 9. Usar `baseProfile()` de `test/plan-engine.test.js` (copiarla al archivo nuevo).
- [ ] **Step 2:** Escribir un script temporal en el scratchpad que corre cada caso con el `app.js` **actual** y guarda `JSON.stringify(plan)` por caso en `test/support/plan-golden-v4.json` (`{[name]: plan}`).
- [ ] **Step 3:** Test `plan v4: sin cambios para casos fuera de alcance`: para cada caso `assert.deepEqual(generatePlan(...), golden[name])`.
- [ ] **Step 4:** Run `node --test test/plan-phases.test.js` → PASS.
- [ ] **Step 5:** Commit `test: golden snapshot of v4 plan output`.

### Task 2: Reparto de fases (`phaseSplit`)
**Files:** Modify `app.js` (bloque nuevo); Test `test/plan-phases.test.js`.

**Interfaces:**
- Produces: `phaseSplit(R: number): string[] | null` — arreglo de longitud `R` con el nombre de la fase de cada semana útil (`'base'|'build'|'specific'|'peak'`), o `null` si `R<4`.

- [ ] **Step 1:** Tests con estos valores exactos: `phaseSplit(3) === null`; `R=4` → `[build×1, specific×2, peak×1]`; `R=5` → `[build×2, specific×2, peak×1]`; `R=7` → `[build×3, specific×3, peak×1]`; `R=8` → `[base×2, build×3, specific×2, peak×1]`; `R=16` → `[base×4, build×6, specific×4, peak×2]`; `R=24` → `[base×6, build×8, specific×6, peak×4]`; `R=30` → `[base×12, build×8, specific×6, peak×4]` (las 6 primeras de base extendida más las 6 de base del bloque de 24). Todas con `length===R`.
- [ ] **Step 2:** Run → FAIL (`phaseSplit is not defined`).
- [ ] **Step 3:** Implementar en `app.js` redondeando cada fracción con `Math.round`, mínimo 1 por fase presente, y compensando la diferencia contra `build`. Para `R>24`, anteponer `R-24` semanas de `base`.
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat: phaseSplit`.

### Task 3: Cronograma y `phaseForWeek`
**Files:** Modify `app.js`; Test `test/plan-phases.test.js`.

**Interfaces:**
- Consumes: `phaseSplit` (Task 2), `isBeginnerProfile(p)`, `getMondayISO`, `addDaysToIsoLocal`.
- Produces:
  - `PHASE_GOALS = ['5k','10k','15k','21k','42k']`.
  - `makePhaseSchedule(p, today: Date): {anchor:string, raceDate:string, goal:string} | null` — `null` si el perfil no califica; `anchor` = lunes siguiente a `today`.
  - `phaseForWeek(p, weekStartDate: string, schedule): {active:false} | {active:true, phase:'base'|'build'|'specific'|'peak'|'taper', weekIdx:number, R:number, weeksToRace:number, weekInPhase:number, phaseWeeks:number}`.
  - `refreshPhaseSchedule(): void` — crea o reemplaza `state.phaseSchedule` si falta o si `raceDate`/`goal` ya no coinciden; llama a `persist()` solo si cambió algo.

- [ ] **Step 1:** Tests: sin `schedule` → `{active:false}`; `weekStartDate < anchor` → inactivo; `R<4` → inactivo; principiante → `makePhaseSchedule` devuelve `null`; goal `'general'` o sin `raceDate` → `null`; con `anchor='2026-11-02'`, `raceDate='2027-03-14'` (domingo; el lunes de la semana de la carrera es `2027-03-08`, 18 semanas después del ancla, así que `R=16`): semana `2026-11-02` → `phase:'base', weekInPhase:1, phaseWeeks:4`; semana `2026-12-28` (idx 8) → `build`; semanas `2027-02-22`, `2027-03-01` y `2027-03-08` (la de la carrera) → `taper`; carrera un miércoles: el taper cae igual en las 3 últimas semanas (`taperMultiplier<1`). Fecha de carrera ya pasada respecto de la semana → inactivo.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementar. Las semanas `taper` son exactamente aquellas donde `taperMultiplier(p, weekStartDate) < 1`; `R` = semanas entre `anchor` y el lunes de la semana de la carrera, menos 2. `refreshPhaseSchedule` usa `state.profile` y `new Date()`.
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat: phase schedule and phaseForWeek`.

### Task 4: Volumen por fases (`phasedWeeklyKm`)
**Files:** Modify `app.js` (extraer `growthParams`); Test `test/plan-phases.test.js`.

**Interfaces:**
- Consumes: `phaseForWeek`, `trainingCaution(p)`.
- Produces:
  - `growthParams(caution): {growth:number, cap:number}` — extraído de `weekMultiplier`, que pasa a usarlo (sin cambiar su resultado).
  - `phasedWeeklyKm(p, caution, info, baseKm): {km:number, peakKm:number, limited:boolean}` — `info` es el resultado activo de `phaseForWeek`; `baseKm` es `effectiveWeeklyKm`.

- [ ] **Step 1:** Tests: (a) `weekMultiplier` mantiene los valores de antes (snapshot de Task 1 sigue verde); (b) con `baseKm=30`, goal `10k`, `caution.level=0`, `R=16`: `peakKm===45` y `limited===false`; (c) `baseKm=10`, goal `42k`, `R=16`: `peakKm===min(70, 10×1.8, 10×1.06^(R-peakWeeks))` y `limited===true`; (d) para toda la serie de semanas, `km[i]/km[i-1] <= growth + 1e-9` salvo el rebote posterior a una descarga; ninguna semana `peak` ni `taper` es descarga; `km` del `peak` ≥ `km` de cualquier semana anterior; (e) `baseKm` mayor que el pico de la distancia → `peakKm===baseKm`, `limited===false`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementar: `peakKm = max(baseKm, min(PEAK_KM[goal], baseKm×cap, baseKm×growth^(R-peakWeeks)))`; rampa geométrica `baseKm×(peakKm/baseKm)^((i+1)/rampCount)` para `i<rampCount=R-peakWeeks`; descarga ×0,75 cuando `i%4===3` (rebote: la semana siguiente vuelve al valor sin descarga); pico y taper usan `peakKm` (el taper lo multiplica `generatePlan` con `taperMultiplier`). `limited = peakKm < PEAK_KM[goal] && baseKm < PEAK_KM[goal]`.
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat: phased weekly volume`.

### Task 5: Integración en `generatePlan` (volumen) y versión del plan
**Files:** Modify `app.js:5285-5320` (`generatePlan`), `app.js:4804-4820` (`checkPlanAlgoVersion`); Test `test/plan-phases.test.js`.

**Interfaces:**
- Consumes: `phaseForWeek(p, weekStartDate, state.phaseSchedule)`, `phasedWeeklyKm`.
- Produces: en `generatePlan`, variable `phaseInfo` (resultado de `phaseForWeek`, o `{active:false}`) que Tasks 6, 7 y 9 reutilizan; `PLAN_ALGO_VERSION = 5`.

- [ ] **Step 1:** Tests: (a) todos los casos de Task 1 siguen idénticos; (b) con un cronograma activo y `weekStart` en fase `build`, la suma de `dist` del plan ≈ `km` de `phasedWeeklyKm` × `taperMultiplier(...)` dentro de ±1,5 km (redondeo por sesión); (c) con `phaseSchedule=null` el plan es el de v4; (d) `checkPlanAlgoVersion` con `planAlgoVersion===4` solo anota la versión 5 y **no** regenera `state.plan` (mismo atajo que ya existe para v3→v4).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** En `generatePlan`, calcular `phaseInfo`; si `active`, reemplazar `weekMultiplier(...)` por `phasedWeeklyKm(...).km / Math.max(9, effectiveWeeklyKm)` (los demás factores `taperMult`, `postGoalRaceMult`, `recoveryMultiplier`, `eventRaceWeekMultiplier` siguen multiplicando como hoy). Mover el cálculo de `effectiveWeeklyKm` antes de `mult`. Subir `PLAN_ALGO_VERSION` y extender el atajo de `checkPlanAlgoVersion` a `4`.
- [ ] **Step 4:** Run `npm test` completo → PASS. **Step 5:** Commit `feat: generatePlan uses phased volume`.

### Task 6: Rotación de sesiones fuertes por fase
**Files:** Modify `app.js:4894-4925` (`hardSessionRotation`), `app.js:4990` (`distributeSessionTypes`), `generatePlan` (llamada); Test.

**Interfaces:**
- Produces: `hardSessionRotationForPhase(phase, goal, caution): string[]` y un 8.º parámetro opcional `phase` en `distributeSessionTypes(trainingDays, beginner, weekNumber, caution, isCutback, goal, varietyOk, phase)`.

- [ ] **Step 1:** Tests exactos: `base` → `['hills','fartlek','progression']`; `build` → `['tempo','intervals','fartlek']`; `specific`/`peak`/`taper` con `5k` → `['intervals','tempo']`, `10k` → `['tempo','intervals']`, `15k`/`21k`/`42k` → `['tempo','progression']`; con `caution.level>=2` se quitan `intervals` y `hills` y, si queda vacío, `['tempo']`. Sin `phase`, `distributeSessionTypes` se comporta igual que antes (snapshot de Task 1).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementar; `distributeSessionTypes` usa la función nueva solo si recibe `phase`. `generatePlan` pasa `phaseInfo.active ? phaseInfo.phase : undefined`.
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat: hard-session rotation by phase`.

### Task 7: Tirada larga por proporción y tope
**Files:** Modify `generatePlan` (rama no principiante, tras el reparto de `distMap`); Test.

**Interfaces:**
- Produces: `applyPhaseLongRun(distMap, usedTypes, targetTotal, phaseInfo, goal, isCutback): void` — modifica `distMap` en el lugar.

- [ ] **Step 1:** Tests: con 4 días y semana `build` de `km=40`, `21k`: `long === min(24, round(40×0,30))`; semana de descarga → `round(40×0,30×0,8)`; con 2 días de entrenamiento la tirada larga nunca supera el 35% del total; el total semanal después del ajuste coincide con el de antes (±1 km por redondeo); sin sesión `long` en la semana no cambia nada; sin `phaseInfo.active` no cambia nada.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementar: nueva tirada = `min(topeLarga, targetTotal × proporción(fase) × (descarga?0,8:1))`; la diferencia se reparte entre las otras sesiones en proporción a `RATIO`, igual que el recorte `HIGH_IMPACT_SHARE_CAP` que ya existe. Solo modo distancia.
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat: long run share and cap by phase`.

### Task 8: Ritmo de carrera en las sesiones, en distancia y por tiempo
**Files:** Modify `generatePlan`, `buildTimePlanDays` (`app.js:5610`), `planLabelBody` (`app.js:5983`); `locales/*.js`; Test.

**Interfaces:**
- Consumes: `predictRaceTime(targetKm)`, `getGoalRaceKm()`, `fmtPace`.
- Produces: campo `d.racePaceSec` (segundos por km) en días `tempo` e `intervals` de fases `specific`, `peak`, `taper` cuando hay predicción; campo `d.racePaceBlockKm` en `long` de fases `specific`/`peak` para `21k` y `42k` (= `round(d.dist × 0,3)`); claves de texto `desc_racepace_suffix` ("Ritmo objetivo de tu carrera: {pace} /{unit}.") y `desc_racepace_long_suffix` ("Los últimos {km} {unit} al ritmo objetivo: {pace} /{unit}.").

- [ ] **Step 1:** Tests: en fase `specific` con predicción disponible, los días `tempo` e `intervals` tienen `racePaceSec` igual a `predictRaceTime(goalKm).predictedSec/goalKm`; sin predicción, no tienen el campo y el texto es el de siempre; `planLabelBody(d).desc` incluye `desc_racepace_suffix` renderizado; en `base`/`build` no aparece; en modo por tiempo los días `tempo`/`intervals` también lo llevan; las 6 locales tienen las dos claves nuevas (el test de cobertura de idiomas existente las verifica).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementar; el sufijo se agrega después de `paceHintFor(d)`.
- [ ] **Step 4:** Run `npm test` → PASS. **Step 5:** Commit `feat: race-pace targets in specific phases`.

### Task 9: Aviso en la pantalla del plan y contexto de Zonda
**Files:** Modify `renderPlan` (`app.js:7461`), contexto del coach (`app.js:~15215`); `locales/*.js`; Test.

**Interfaces:**
- Consumes: `phaseInfo` guardado en el estado como `state.phaseNow = {phase, weeksToRace, limited, peakKm}` (lo escribe `generatePlan` solo para la semana actual).
- Produces: claves `plan_phase_base`, `plan_phase_build`, `plan_phase_specific`, `plan_phase_peak`, `plan_phase_taper`, `plan_phase_line` ("Fase: {phase} · faltan {weeks} semanas para tu carrera") y `plan_peak_limited_note` ("Con el tiempo que queda, el pico seguro de tu plan es de {km} km por semana.").

- [ ] **Step 1:** Tests: el texto del contexto de Zonda incluye la fase y las semanas que faltan cuando hay fase activa y no incluye nada nuevo cuando no; `renderPlan` imprime `plan_phase_line` y, si `limited`, `plan_peak_limited_note`; las 6 locales tienen las claves.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementar. Sin fase activa no se muestra ninguna línea nueva.
- [ ] **Step 4:** Run `npm test` → PASS. **Step 5:** Commit `feat: phase banner and coach context`.

### Task 10: Ejemplos de planes y publicación
**Files:** Create `scripts/plan-examples.js`; sync a `mobile/www`.

- [ ] **Step 1:** Script que carga la app (`test/support/load-app`) e imprime, semana por semana, volumen, fase y sesiones para: activo a 10k en 10 semanas; activo a 21k en 16 semanas; activo a 42k en 20 y en 30 semanas; activo a 5k en 6 semanas; y cada uno comparado con el plan de v4.
- [ ] **Step 2:** Mostrar la salida al dueño del producto y **esperar su aprobación**. Ajustar `PEAK_KM`, `LONG_CAP_KM` o proporciones si lo pide, con su test.
- [ ] **Step 3:** `npm test` completo, `git push`, `cp app.js locales/* mobile/www/`, `npx cap sync android`, compilar e instalar en el celular, y verificar un perfil con carrera objetivo en pantalla.

### Task 11 (**pendiente de aprobación del dueño; no ejecutar sin su sí**): Después de la carrera
Comportamiento actual verificado: pasada la fecha, el plan **no se corta**. Tras una sola semana de recuperación (×0,6, solo si la carrera fue un domingo) vuelve el crecimiento de siempre, con tope de 1,5 a 1,8 veces la base, la meta sigue guardada como "ya pasó" y solo se le avisa a Zonda. Propuesta: fase `post` de 2 semanas (×0,6 y ×0,8 del pico, sin sesiones fuertes), luego `maintenance` a 0,85 del pico con la rotación de siempre, y un aviso en el plan que lleve a Perfil para elegir una nueva meta. Detalle y tests a definir cuando se apruebe.

---

## Self-Review
- **Spec coverage:** §3 alcance (Tasks 3, 5), §4 fases (2, 3), §5 volumen (4, 5), §6 contenido (6, 7, 8), §7 compatibilidad (5, 10), §8 verificación (1, 10), contexto de Zonda (9). Ajustes explícitos en "Cambios al diseño".
- **Consistencia de tipos:** `phaseInfo` (Task 5) lo consumen 6, 7, 8 y 9; `phasedWeeklyKm` devuelve `{km, peakKm, limited}` y 9 usa `limited`/`peakKm`.
- **Proporción:** 11 tareas para un diseño de 9 secciones; los cuerpos de funciones quedan para quien implementa.
