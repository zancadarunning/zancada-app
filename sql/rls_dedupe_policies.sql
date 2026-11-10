-- ============================================================================
-- rls_dedupe_policies: ya APLICADO en producción el 2026-11-10 (migración "rls_dedupe_policies_and_initplan").
--
-- Por qué: el chequeo de rendimiento de Supabase marcaba (1) políticas duplicadas (app_state, push_subscriptions y strava_connections tenían un juego viejo para el rol "public" y uno nuevo para "authenticated"
-- que hacían lo mismo) y (2) auth.uid() evaluado una vez por fila en vez de una por consulta (auth_rls_initplan, 29 avisos).
--
-- Qué hace: borra las políticas viejas duplicadas y reescribe las que quedan con (select auth.uid()). El acceso NO cambia: cada persona ve y toca solo sus filas, y sin sesión la base no deja leer.
-- Verificado después de aplicarlo (dentro de transacciones que se deshacen): un usuario real ve 1 fila de app_state; uno inexistente ve 0; un UPDATE/DELETE sobre filas de otro afecta 0 filas; el aviso de rendimiento quedó vacío.
-- Es seguro volver a correrlo.
--
-- Para VOLVER ATRÁS (deja el juego viejo para "public" otra vez; no hace falta salvo un problema):
--   create policy select_own on public.app_state for select to public using (auth.uid() = user_id);
--   create policy insert_own on public.app_state for insert to public with check (auth.uid() = user_id);
--   create policy update_own on public.app_state for update to public using (auth.uid() = user_id);
--   create policy delete_own on public.app_state for delete to public using (auth.uid() = user_id);
--   (y lo mismo, con los nombres select_own_push / insert_own_push / update_own_push / delete_own_push, para push_subscriptions, y select_own_strava / delete_own_strava para strava_connections)
-- ============================================================================

drop policy if exists select_own on public.app_state;
drop policy if exists insert_own on public.app_state;
drop policy if exists update_own on public.app_state;
drop policy if exists delete_own on public.app_state;
drop policy if exists select_own_push on public.push_subscriptions;
drop policy if exists insert_own_push on public.push_subscriptions;
drop policy if exists update_own_push on public.push_subscriptions;
drop policy if exists delete_own_push on public.push_subscriptions;
drop policy if exists select_own_strava on public.strava_connections;
drop policy if exists delete_own_strava on public.strava_connections;

alter policy app_state_select_own on public.app_state using ((select auth.uid()) = user_id);
alter policy app_state_insert_own on public.app_state with check ((select auth.uid()) = user_id);
alter policy app_state_update_own on public.app_state using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy app_state_delete_own on public.app_state using ((select auth.uid()) = user_id);

alter policy push_subscriptions_select_own on public.push_subscriptions using ((select auth.uid()) = user_id);
alter policy push_subscriptions_insert_own on public.push_subscriptions with check ((select auth.uid()) = user_id);
alter policy push_subscriptions_update_own on public.push_subscriptions using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy push_subscriptions_delete_own on public.push_subscriptions using ((select auth.uid()) = user_id);

alter policy strava_connections_select_own on public.strava_connections using ((select auth.uid()) = user_id);
alter policy strava_connections_delete_own on public.strava_connections using ((select auth.uid()) = user_id);
alter policy polar_connections_select_own on public.polar_connections using ((select auth.uid()) = user_id);
alter policy polar_connections_delete_own on public.polar_connections using ((select auth.uid()) = user_id);
alter policy wahoo_connections_select_own on public.wahoo_connections using ((select auth.uid()) = user_id);
alter policy wahoo_connections_delete_own on public.wahoo_connections using ((select auth.uid()) = user_id);
alter policy coros_connections_select_own on public.coros_connections using ((select auth.uid()) = user_id);
alter policy coros_connections_delete_own on public.coros_connections using ((select auth.uid()) = user_id);
alter policy suunto_connections_select_own on public.suunto_connections using ((select auth.uid()) = user_id);
alter policy suunto_connections_delete_own on public.suunto_connections using ((select auth.uid()) = user_id);
alter policy garmin_connections_select_own on public.garmin_connections using ((select auth.uid()) = user_id);
