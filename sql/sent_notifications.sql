-- ============================================================================
-- sent_notifications: registro de qué avisos automáticos ya se le mandaron a cada usuario.
--
-- Hoy lo usa el resumen semanal del domingo (api/send-reminders.js): cada corrida del cron (cada 30 minutos) reclama acá "este
-- usuario ya tiene su resumen de esta semana" ANTES de mandarlo. Con eso:
--   - si una corrida falló o se quedó sin tiempo, la siguiente le manda el resumen a los que faltaron (sin duplicar);
--   - dos corridas que se pisan no le mandan el aviso dos veces (la clave primaria lo impide).
-- Sirve igual para cualquier otro aviso que no se pueda perder ni duplicar (kind distinto).
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y ejecutarlo una sola vez. Es seguro volver a correrlo.
-- Mientras no exista la tabla, el cron sigue funcionando como antes (cada usuario recibe el resumen solo en su turno exacto).
--
-- Acceso: solo el backend (service role). RLS queda activada SIN políticas -> ningún usuario de la app puede leerla ni escribirla.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sent_notifications (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,                       -- 'weekly_summary', ...
  period text NOT NULL,                     -- a qué período corresponde: para el resumen semanal, el lunes de la semana (YYYY-MM-DD)
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, period)
);

-- consultas del cron: "de estos usuarios, ¿a quiénes ya se les mandó esta semana?" y limpieza de filas viejas
CREATE INDEX IF NOT EXISTS sent_notifications_kind_period_idx ON public.sent_notifications (kind, period, user_id);
CREATE INDEX IF NOT EXISTS sent_notifications_period_idx ON public.sent_notifications (period);
CREATE INDEX IF NOT EXISTS sent_notifications_sent_at_idx ON public.sent_notifications (sent_at);

ALTER TABLE public.sent_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sent_notifications FROM anon, authenticated;
