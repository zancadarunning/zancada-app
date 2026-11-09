# Sacar Strava al lanzar (interruptor)

Decisión del dueño (2026-11-09): Strava no permite guardar sus datos más de 7 días ni usarlos en análisis o IA, y no da excepciones. Al lanzar, Strava se saca y las carreras que llegaron por su API quedan como **carga manual**
(sin ir nunca a Zonda), igual que cuando se desconecta un reloj y se elige conservarlas.

## Antes de lanzar
- Avisar en la app y a los testers con tiempo (los que solo usan Strava pueden conectar su reloj directo: Garmin, Suunto, Wahoo, COROS o Polar).

## El día del lanzamiento (en este orden)
1. **Vercel**: poner `STRAVA_SUNSET=1` y redeployar. Efecto: conectar/sincronizar Strava responde 410, el webhook, el cron y el resync dejan de traer carreras.
2. **app.js**: cambiar `let STRAVA_SUNSET = false;` por `true`, mergear y desplegar. Efecto al abrir la app: oculta Strava en Perfil, convierte sus carreras a manuales (origin strava + aiExcluded) y desconecta la cuenta de Strava (revoca el permiso).
3. **Supabase**: correr `sql/strava_sunset.sql` (convierte las carreras de las cuentas que no vuelvan a abrir la app). Primero el SELECT de control.
4. **Después de unas semanas** (las cuentas que no abrieron la app siguen con la conexión): revocar y borrar las filas que queden en `strava_connections` (el permiso del lado de Strava y los tokens), dentro de los 30 días que pide su política (7.4).

## Qué NO hace
- No borra las carreras (se conservan como manuales). Es una decisión del dueño; conservar datos de Strava sigue yendo contra su política, por eso se saca la integración.
- No toca la exportación de datos propia de cada persona: una persona puede subir sus propios archivos de Strava como carga manual.
