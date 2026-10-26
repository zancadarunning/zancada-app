-- ============================================================================
-- push_subscriptions_limit: tope de dispositivos con notificaciones por cuenta + sin acceso del cliente a funciones nuevas.
--
-- 1) Tope: el cliente puede insertar filas en push_subscriptions (RLS por auth.uid()); sin tope, una cuenta podía registrar miles de destinos falsos y
--    el cron de recordatorios los recorría todos (costo y lentitud, no fuga de datos). Con 10 dispositivos por cuenta sobra.
--    Volver a registrar un dispositivo que ya existe (upsert) no cuenta como uno nuevo.
-- 2) ALTER DEFAULT PRIVILEGES: en Supabase toda función nueva en el esquema public queda ejecutable por anon/authenticated por defecto. Esto lo quita para
--    las funciones que se creen de ahora en adelante (las existentes ya están revocadas una por una). Si algún día hace falta una función llamable desde
--    el cliente, se le da GRANT EXECUTE a mano y a propósito.
--
-- Es seguro volver a correrlo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.limit_push_subscriptions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.push_subscriptions WHERE user_id = NEW.user_id AND device_id = NEW.device_id) THEN
    RETURN NEW;   -- ya registrado: es una actualización disfrazada de insert (upsert)
  END IF;
  IF (SELECT count(*) FROM public.push_subscriptions WHERE user_id = NEW.user_id) >= 10 THEN
    RAISE EXCEPTION 'demasiados dispositivos con notificaciones en esta cuenta';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.limit_push_subscriptions() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS push_subscriptions_limit ON public.push_subscriptions;
CREATE TRIGGER push_subscriptions_limit
  BEFORE INSERT ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.limit_push_subscriptions();

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
