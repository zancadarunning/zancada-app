-- ============================================================================
-- Quitar la verificación en dos pasos de la base (2FA).
--
-- Zancada dejó de ofrecer la verificación en dos pasos (más adelante se agregará el ingreso con datos biométricos). Antes la base tenía una política
-- "mfa_required" en 7 tablas y la función public.mfa_ok() que la decide. Si esas políticas siguen y alguien conserva un segundo factor activado, esa
-- cuenta no podría leer sus datos con la app nueva (que ya no pide el código). Este archivo las quita.
--
-- ORDEN: primero este SQL, después mergear/desplegar el código. Es seguro volver a correrlo. No cambia ningún dato.
-- Los factores que alguien haya activado quedan inofensivos en auth.mfa_factors (nada los exige ya); para borrarlos del todo:
--   delete from auth.mfa_factors;
-- ============================================================================

drop policy if exists mfa_required on public.app_state;
drop policy if exists mfa_required on public.push_subscriptions;
drop policy if exists mfa_required on public.strava_connections;
drop policy if exists mfa_required on public.polar_connections;
drop policy if exists mfa_required on public.wahoo_connections;
drop policy if exists mfa_required on public.coros_connections;
drop policy if exists mfa_required on public.suunto_connections;

drop function if exists public.mfa_ok();
