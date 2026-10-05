-- ============================================================================
-- suunto_connections.guides_week: lunes (YYYY-MM-DD) de la última semana cuyas guías SuuntoPlus
-- ya se dejaron al día en la cuenta de Suunto del usuario. Lo usa api/suunto-guides-cron.js
-- (cron cada hora) para subir las guías de la semana nueva "a primera hora del lunes" sin
-- repetir el trabajo ni gastar llamadas a Suunto cuando no hace falta.
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y ejecutarlo.
-- Es seguro volver a correrlo.
-- ============================================================================

ALTER TABLE public.suunto_connections ADD COLUMN IF NOT EXISTS guides_week text;
