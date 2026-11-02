-- ============================================================================
-- chat_usage: límite diario de mensajes al coach (IA) por usuario.
--
-- Por qué hace falta: api/chat.js ya verifica que quien llama esté logueado
-- (ver api/_lib/verify-user.js), así que un desconocido sin cuenta no puede
-- pegarle a la API de Gemini gratis. Pero una vez logueado, no había ningún
-- tope -- una cuenta (comprometida, o simplemente un script en loop) podía
-- mandar miles de mensajes por minuto y la cuota/costo de Gemini lo
-- pagábamos nosotros sin límite. Esta tabla + función llevan la cuenta de
-- cuántos mensajes mandó cada usuario HOY, para poder cortar en seco antes
-- de llamar a Gemini si se pasó del límite diario.
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y
-- ejecutarlo. Es seguro volver a correrlo (CREATE TABLE IF NOT EXISTS /
-- CREATE OR REPLACE) si hace falta ajustar algo después.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_usage (
  user_id uuid NOT NULL,
  usage_date date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

-- Sin esto, cualquiera con la clave pública (anon/authenticated -- la misma
-- que ya viaja en app.js, visible para cualquiera) podría leer o escribir
-- esta tabla directo por la REST API de Supabase, sin pasar por chat.js.
-- Sin RLS habilitado y sin ninguna política, alguien podría por ejemplo
-- resetear su propio contador para saltarse el límite diario por completo,
-- o ver cuántos mensajes mandó otro usuario. Habilitar RLS sin definir
-- ninguna política dentro deja la tabla en "nadie con la clave pública
-- puede tocarla" -- nuestro backend (api/chat.js) sigue funcionando igual
-- porque usa la clave de SERVICIO (SUPABASE_SERVICE_KEY), que siempre se
-- salta el RLS.
ALTER TABLE public.chat_usage ENABLE ROW LEVEL SECURITY;
-- Defensa en profundidad (auditoría 2026-11-02): Supabase le da por defecto todos los permisos de tabla a "authenticated"; sin políticas el RLS ya no deja pasar nada,
-- pero si alguien desactivara el RLS por error una persona podría borrarse el contador y saltarse el tope diario del chat. Esta tabla solo la toca el backend.
REVOKE ALL ON public.chat_usage FROM anon, authenticated;

-- increment_chat_usage: suma 1 al contador de HOY para p_user_id (creando la
-- fila si no existía) en una sola operación atómica -- así dos requests que
-- lleguen al mismo tiempo no pueden leer el mismo valor viejo y "perder" un
-- incremento (la clave primaria + ON CONFLICT hace que Postgres serialice
-- las dos escrituras). Devuelve true si el usuario todavía está DENTRO del
-- límite (incluyendo este mensaje), false si ya lo superó -- el mensaje se
-- cuenta igual aunque devuelva false, para no darle vueltas de gratis a
-- alguien reintentando cuando ya se pasó.
CREATE OR REPLACE FUNCTION public.increment_chat_usage(p_user_id uuid, p_limit integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.chat_usage (user_id, usage_date, count)
  VALUES (p_user_id, current_date, 1)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET count = public.chat_usage.count + 1
  RETURNING count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

-- Por las dudas: por default Supabase deja que cualquiera con la clave
-- pública llame funciones del schema public por la RPC de la REST API
-- (/rest/v1/rpc/increment_chat_usage), sin pasar por chat.js. Como la
-- función es SECURITY DEFINER, si alguien la llamara directo con su propia
-- clave pública y un p_user_id ajeno, podría inflar el contador de OTRO
-- usuario (no el propio -- el conteo en sí no se puede bajar, solo subir).
-- Sacándole el permiso de ejecutarla a esos dos roles, ya no queda ninguna
-- forma de llamarla salvo con la clave de servicio (que es la única que
-- usa api/chat.js).
REVOKE EXECUTE ON FUNCTION public.increment_chat_usage(uuid, integer) FROM PUBLIC, anon, authenticated;
