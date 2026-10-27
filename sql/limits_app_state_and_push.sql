-- ============================================================================
-- limits_app_state_and_push: topes de tamano y de forma para lo que el CLIENTE escribe directo en la base.
--
-- Por que: app_state.data (jsonb) y push_subscriptions.subscription los escribe la propia persona con su sesion (RLS por usuario). Sin tope, una cuenta podia subir
-- decenas de MB de basura: llenar el plan gratis de Supabase (500 MB -> la base pasa a solo lectura y cae toda la app) y hacer que los crons (send-reminders cada
-- 30 min, sync-strava cada 15) bajen ese JSON entero y se pasen de tiempo, cortando los recordatorios de TODOS. Tambien: una carrera con distanceKm/durationSec que no
-- es un numero, o un plan que no es una lista, hacia fallar en cada ciclo las funciones merge_*_runs (que gastan cuota compartida de la marca) y los recordatorios.
--
-- Que hace:
--   1) app_state: rechaza data de mas de 30 MB (texto), plan/runs que no sean listas, un plan de mas de 512 KB y carreras con distanceKm/durationSec que no sean numero
--      (null o ausente SI se permite). Una carrera real nunca falla esto; sin el tope normal de cuentas (unos MB con 900 puntos GPS por carrera) nadie lo nota.
--   2) push_subscriptions: suscripcion de hasta 4 KB, device_id de hasta 64 caracteres, y el tope de 10 dispositivos por cuenta ahora es a prueba de inserts en
--      paralelo (lock por usuario; antes 50 inserts simultaneos se saltaban el tope).
--   3) chat_usage: sin cambios (los topes diarios nuevos de la API usan esta misma tabla con ids derivados, ver api/_lib/daily-cap.js).
--
-- ANTES de correrlo, mira el tamano real mas grande de una cuenta (tiene que dar bastante menos de 30):
--     select round(max(octet_length(data::text)) / 1048576.0, 1) as max_mb from public.app_state;
--
-- Es seguro volver a correrlo. Si un guardado legitimo alguna vez fuera rechazado, bajar o subir el numero de aca y volver a correr.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.limit_app_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_bad_runs boolean := false;
  v_data jsonb;
BEGIN
  v_data := NEW.data::jsonb;   -- ::jsonb por si la columna fuera json: funciona igual en los dos casos
  IF octet_length(v_data::text) > 30 * 1024 * 1024 THEN
    RAISE EXCEPTION 'app_state demasiado grande' USING ERRCODE = '54000';
  END IF;
  IF v_data ? 'plan' AND jsonb_typeof(v_data->'plan') NOT IN ('array', 'null') THEN
    RAISE EXCEPTION 'plan invalido' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_data->'plan') = 'array' AND octet_length((v_data->'plan')::text) > 512 * 1024 THEN
    RAISE EXCEPTION 'plan demasiado grande' USING ERRCODE = '54000';
  END IF;
  -- Topes POR CAMPO de lo que los endpoints publicos y los crons bajan entero en cada pedido (calendar-feed, send-reminders): con solo el tope de 30 MB, un campo de 29 MB
  -- ("profile", "lang", "tz"...) se descargaba de Supabase a Vercel en cada pedido o en cada ciclo del cron (egress) y alargaba los recordatorios de todos.
  IF length(coalesce(v_data->>'lang', '')) > 8
     OR length(coalesce(v_data->>'weekStart', '')) > 10
     OR length(coalesce(v_data->>'streakWeeks', '')) > 6
     OR length(coalesce(v_data->>'calendarToken', '')) > 80
     OR length(coalesce(v_data#>>'{profile,tz}', '')) > 64
     OR length(coalesce(v_data#>>'{profile,reminderHour}', '')) > 4
     OR length(coalesce(v_data#>>'{profile,units}', '')) > 16
     OR length(coalesce(v_data#>>'{profile,trainBy}', '')) > 16
     OR octet_length(coalesce((v_data->'profile')::text, '')) > 64 * 1024
     OR octet_length(coalesce((v_data->'calendarNextWeek')::text, '')) > 512 * 1024
     OR octet_length(coalesce((v_data->'watchPlan')::text, '')) > 512 * 1024
     OR octet_length(coalesce((v_data->'suuntoPlan')::text, '')) > 512 * 1024 THEN
    RAISE EXCEPTION 'campo de app_state demasiado grande' USING ERRCODE = '54000';
  END IF;
  IF v_data ? 'runs' AND jsonb_typeof(v_data->'runs') NOT IN ('array', 'null') THEN
    RAISE EXCEPTION 'runs invalido' USING ERRCODE = '22023';
  END IF;
  -- distanceKm / durationSec: numero (o null / ausente). Si el chequeo mismo fallara por algo raro, NO se bloquea el guardado.
  BEGIN
    v_bad_runs := jsonb_path_exists(
      v_data,
      '$.runs[*] ? ((@.distanceKm.type() != "number" && @.distanceKm.type() != "null") || (@.durationSec.type() != "number" && @.durationSec.type() != "null"))',
      '{}'::jsonb,
      true
    );
  EXCEPTION WHEN OTHERS THEN
    v_bad_runs := false;
  END;
  IF v_bad_runs THEN
    RAISE EXCEPTION 'carreras con datos invalidos' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.limit_app_state() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS app_state_limit ON public.app_state;
CREATE TRIGGER app_state_limit
  BEFORE INSERT OR UPDATE ON public.app_state
  FOR EACH ROW EXECUTE FUNCTION public.limit_app_state();

-- ---------- push_subscriptions ----------
CREATE OR REPLACE FUNCTION public.limit_push_subscriptions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF octet_length(NEW.subscription::text) > 4096 OR length(NEW.device_id) > 64 OR length(coalesce(NEW.platform, '')) > 20 THEN
    RAISE EXCEPTION 'suscripcion invalida' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- un solo insert por usuario a la vez: sin este lock, inserts en paralelo veian todos "menos de 10" y se saltaban el tope
    PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id::text));
    IF EXISTS (SELECT 1 FROM public.push_subscriptions WHERE user_id = NEW.user_id AND device_id = NEW.device_id) THEN
      RETURN NEW;   -- ya registrado: es una actualizacion disfrazada de insert (upsert)
    END IF;
    IF (SELECT count(*) FROM public.push_subscriptions WHERE user_id = NEW.user_id) >= 10 THEN
      RAISE EXCEPTION 'demasiados dispositivos con notificaciones en esta cuenta';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.limit_push_subscriptions() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS push_subscriptions_limit ON public.push_subscriptions;
CREATE TRIGGER push_subscriptions_limit
  BEFORE INSERT OR UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.limit_push_subscriptions();
