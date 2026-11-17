-- ============================================================================
-- Cobro por suscripción: columna del último aviso de RevenueCat aplicado a cada cuenta (api/revenuecat-webhook.js).
-- Sirve para que un aviso viejo, que llega tarde, no pise a uno más nuevo.
-- Es seguro volver a correrlo. No toca datos: solo agrega una columna.
-- ============================================================================
ALTER TABLE public.entitlements ADD COLUMN IF NOT EXISTS last_event_ms bigint;
