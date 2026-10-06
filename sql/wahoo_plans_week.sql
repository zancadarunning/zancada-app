-- ============================================================================
-- wahoo_connections.plans_week: lunes (YYYY-MM-DD) de la última semana cuyos entrenamientos
-- estructurados ya se dejaron al día en la cuenta de Wahoo del usuario. Lo usa
-- api/wahoo-plans-cron.js (cron cada hora) para subir la semana nueva "a las 2 am del lunes" sin
-- repetir el trabajo ni gastar llamadas a Wahoo cuando no hace falta.
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y ejecutarlo.
-- Es seguro volver a correrlo.
-- ============================================================================

ALTER TABLE public.wahoo_connections ADD COLUMN IF NOT EXISTS plans_week text;
