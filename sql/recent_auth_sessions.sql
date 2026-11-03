-- ============================================================================
-- recent_auth_sessions: lista los inicios de sesion recientes (id, cuenta, momento y navegador/app; SIN direccion IP) para que el cron de recordatorios avise por mail
-- de un ingreso desde un tipo de dispositivo que la cuenta nunca uso (api/_lib/server-login-check.js).
--
-- Por que existe: el aviso de "dispositivo nuevo" que ya hay (api/login-alert.js) lo dispara la app al abrirse con la sesion iniciada. Quien entra con una contrasena robada
-- directo contra la API de autenticacion (sin abrir la app) nunca lo dispara. Esta funcion le deja al servidor ver esos ingresos.
--
-- Es de SOLO LECTURA y no toca ningun trigger de auth: no puede afectar los inicios de sesion. Solo la puede ejecutar el backend (service_role).
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y ejecutarlo una sola vez. Es seguro volver a correrlo.
-- Mientras no exista, el cron sigue como antes y simplemente no manda este aviso.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recent_auth_sessions(p_since timestamptz, p_until timestamptz)
RETURNS TABLE (session_id uuid, user_id uuid, created_at timestamptz, user_agent text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT s.id, s.user_id, s.created_at, left(coalesce(s.user_agent, ''), 400)
  FROM auth.sessions s
  WHERE s.created_at > p_since AND s.created_at <= p_until
  ORDER BY s.created_at ASC
  LIMIT 300;
$$;

REVOKE ALL ON FUNCTION public.recent_auth_sessions(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recent_auth_sessions(timestamptz, timestamptz) TO service_role;
