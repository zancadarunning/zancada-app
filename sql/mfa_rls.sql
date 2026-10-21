-- ============================================================================
-- Verificación en dos pasos (opcional) del lado de la base.
--
-- La app ofrece a cada persona activar un código de 6 dígitos (TOTP) en Perfil. Pedirlo en la pantalla no alcanza: alguien que robó la contraseña
-- podría hablar directo con la API de Supabase usando una sesión "de contraseña sola" (nivel aal1). Estas políticas la frenan en la base:
-- si la cuenta tiene un factor VERIFICADO, solo se puede leer o escribir con una sesión que completó el segundo paso (aal2). Las cuentas SIN
-- verificación en dos pasos no cambian en nada (mfa_ok() devuelve true).
--
-- Probado en producción dentro de una transacción que se deshizo (2026-10-21):
--   sin factor, aal1      -> ve su fila (1)        con factor, aal1 -> 0 filas        con factor, aal2 -> 1 fila
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y ejecutarlo. Es seguro volver a correrlo.
-- Para quitarlo: drop policy mfa_required on public.<tabla> (en cada tabla de la lista) y drop function public.mfa_ok().
-- ============================================================================

create or replace function public.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified');
$$;

revoke all on function public.mfa_ok() from public, anon;
grant execute on function public.mfa_ok() to authenticated;

-- Las tablas que la app consulta directo con la sesión de la persona (ver .from('...') en app.js). Una por una, sin SQL dinámico.
drop policy if exists mfa_required on public.app_state;
create policy mfa_required on public.app_state as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

drop policy if exists mfa_required on public.push_subscriptions;
create policy mfa_required on public.push_subscriptions as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

drop policy if exists mfa_required on public.strava_connections;
create policy mfa_required on public.strava_connections as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

drop policy if exists mfa_required on public.polar_connections;
create policy mfa_required on public.polar_connections as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

drop policy if exists mfa_required on public.wahoo_connections;
create policy mfa_required on public.wahoo_connections as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

drop policy if exists mfa_required on public.coros_connections;
create policy mfa_required on public.coros_connections as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

drop policy if exists mfa_required on public.suunto_connections;
create policy mfa_required on public.suunto_connections as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
