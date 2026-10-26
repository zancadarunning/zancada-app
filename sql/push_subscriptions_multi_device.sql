-- ============================================================================
-- push_subscriptions_multi_device: una fila por (cuenta, dispositivo) en vez de una por cuenta.
--
-- Por qué: hasta ahora la clave era solo user_id. Si una cuenta tenía el celular Android y el iPhone, el último en activar las notificaciones
-- pisaba al otro, y apagarlas o cerrar sesión en uno borraba las de los dos. Resultado real: la cuenta quedaba sin avisos (resumen semanal,
-- recordatorios) en el dispositivo que se esperaba.
--
-- Qué hace: agrega device_id (las filas que ya existen quedan como 'legacy' y siguen funcionando) y cambia la clave primaria a
-- (user_id, device_id). Es seguro volver a correrlo. No toca políticas ni datos.
--
-- ORDEN: correr este SQL ANTES de publicar el código nuevo (la app y el cron ya usan device_id). Entre que se corre y se publica, activar las
-- notificaciones desde la versión vieja puede fallar unos minutos; los avisos ya registrados siguen llegando.
-- ============================================================================

ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS device_id text NOT NULL DEFAULT 'legacy';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.push_subscriptions'::regclass
      AND conname = 'push_subscriptions_pkey'
      AND pg_get_constraintdef(oid) = 'PRIMARY KEY (user_id)'
  ) THEN
    ALTER TABLE public.push_subscriptions DROP CONSTRAINT push_subscriptions_pkey;
    ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (user_id, device_id);
  END IF;
END $$;
