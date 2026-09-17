-- ============================================================================
-- revoke_merge_runs_execute: le saca a "anon"/"authenticated" el permiso de
-- llamar directo (por /rest/v1/rpc/...) a las funciones SECURITY DEFINER que
-- escriben en app_state -- avisado por el Security Advisor de Supabase
-- ("Public/Signed-In Users Can Execute SECURITY DEFINER Function").
--
-- Por qué es un problema real: estas funciones reciben p_user_id como
-- parámetro suelto (no lo sacan de auth.uid()), y por default Postgres le da
-- permiso de EXECUTE a PUBLIC sobre cualquier función nueva. Como son
-- SECURITY DEFINER (corren con permisos elevados, saltándose RLS), cualquiera
-- con la clave pública de Supabase (la misma que ya viaja en app.js, visible
-- para cualquiera) podría llamarlas directo con el p_user_id de OTRO usuario
-- y pisarle las carreras guardadas o el estado de sincronización -- sin pasar
-- nunca por el backend (api/*.js), que es el único que debería poder usarlas
-- (con SUPABASE_SERVICE_KEY, que ignora estos permisos).
--
-- merge_coros_runs/merge_polar_runs/merge_strava_runs/merge_wahoo_runs
-- aparecieron en el aviso de Supabase. set_strava_sync_status tiene
-- exactamente el mismo patrón (p_user_id suelto, sin revoke) aunque el
-- aviso no la haya listado -- se agrega acá por las dudas, mismo criterio
-- que ya se usó en chat_usage.sql para increment_chat_usage.
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y
-- ejecutarlo. Seguro de volver a correr.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.merge_coros_runs(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_strava_runs(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_polar_runs(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_wahoo_runs(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_strava_sync_status(uuid, jsonb) FROM PUBLIC, anon, authenticated;
