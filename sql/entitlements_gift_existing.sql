-- ============================================================================
-- Regalar el plan Pro a las cuentas que YA EXISTEN al lanzar el cobro (decisión del dueño, 2026-11-10: se asume sin vencimiento).
-- Correr UNA sola vez, justo antes de prender el cobro (PAYWALL_ENABLED en app.js y PAYWALL_ENFORCE en Vercel). Las cuentas que se creen después NO entran.
--
-- 1) Primero el control: cuántas cuentas se van a regalar.
--      SELECT count(*) FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.entitlements e WHERE e.user_id = u.id);
-- 2) Después el regalo. No pisa a quien ya tenga una fila (por ejemplo, una compra real).
-- ============================================================================
INSERT INTO public.entitlements (user_id, plan, status, source, product_id, expires_at, last_event_ms)
SELECT u.id, 'pro', 'active', 'manual', 'regalo_cuentas_existentes', NULL, NULL
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.entitlements e WHERE e.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;
