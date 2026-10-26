-- ============================================================================
-- calendar_token_unique: el token del feed de calendario tiene que ser UNICO.
--
-- Por qué: el token lo genera y lo guarda el cliente dentro de app_state.data. Si dos cuentas tienen el mismo valor, api/calendar-feed.js sirve una de las dos:
-- quien conozca la URL de otra persona podía fijar el mismo token en su propia cuenta y escribirle eventos en el calendario. Con el índice único la segunda
-- cuenta ni siquiera puede guardar ese valor. (La entropía del token es buena: crypto.randomUUID; esto cierra el caso del valor elegido a propósito.)
--
-- Reemplaza el índice común de sql/indexes.sql por uno único. Es seguro volver a correrlo. Si ya hubiera dos cuentas con el mismo token, falla y las muestra:
--   select data->>'calendarToken' t, count(*) from public.app_state where data->>'calendarToken' is not null group by 1 having count(*) > 1;
-- ============================================================================

DROP INDEX IF EXISTS public.app_state_calendar_token_idx;
CREATE UNIQUE INDEX IF NOT EXISTS app_state_calendar_token_uniq
  ON public.app_state ((data->>'calendarToken'))
  WHERE data->>'calendarToken' IS NOT NULL;
