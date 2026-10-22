-- ============================================================================
-- known_devices: dispositivos desde los que ya se entró a cada cuenta (para el aviso por mail de "inicio de sesión desde un dispositivo nuevo").
--
-- Cada instalación de la app (o navegador) genera al azar un identificador la primera vez que se abre y se lo manda a api/login-alert.js al entrar.
-- Acá se guarda SOLO un hash de ese identificador (no el identificador), un nombre corto del tipo de dispositivo ("Android · app"), el país aproximado
-- y las fechas. NO se guarda la dirección IP. La primera vez que una cuenta entra (alta) no se avisa; desde el segundo dispositivo, sí.
-- Se conservan como mucho 20 por cuenta (el más viejo se descarta).
--
-- Acceso: solo el backend (service role). RLS queda activada SIN políticas y se revoca todo a anon/authenticated -> la app no la lee ni la escribe.
-- Al borrar la cuenta se borra en cascada; "Borrar mis datos" la vacía (api/delete-account.js).
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y ejecutarlo una sola vez. Es seguro volver a correrlo.
-- Mientras no exista la tabla, api/login-alert.js no hace nada (la app sigue andando igual, simplemente no avisa).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.known_devices (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_hash text NOT NULL,                -- sha256 del identificador de la instalación (hexadecimal)
  label text,                               -- "Android · app", "Windows · navegador"...
  country text,                             -- código de país aproximado (ES, AR...), sin IP
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_hash)
);

CREATE INDEX IF NOT EXISTS known_devices_last_seen_idx ON public.known_devices (user_id, last_seen);

ALTER TABLE public.known_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.known_devices FROM PUBLIC, anon, authenticated;
