-- Copia de los datos de UNA persona (derechos de acceso y portabilidad). SOLO LECTURA: no cambia ni borra nada.
-- Cómo usarlo: ver docs/pedidos-de-datos.md. Reemplazá el correo de abajo y ejecutalo en el editor SQL de Supabase.
-- A propósito NO incluye credenciales (tokens de relojes, suscripciones de notificaciones) ni identificadores internos de seguridad.
with u as (
  select id, email, created_at, last_sign_in_at, raw_app_meta_data->>'provider' as metodo_de_ingreso
  from auth.users
  where lower(email) = lower('CAMBIAR@CORREO.COM')
)
select jsonb_pretty(jsonb_build_object(
  'generado_el', now(),
  'cuenta', (select jsonb_build_object('correo', email, 'alta', created_at, 'ultimo_ingreso', last_sign_in_at, 'metodo_de_ingreso', metodo_de_ingreso) from u),
  'estado_de_la_app', (select a.data from public.app_state a join u on a.user_id = u.id),
  'recorridos_gps', (select coalesce(jsonb_agg(jsonb_build_object('carrera', r.run_id, 'puntos', r.points, 'series', r.series, 'actualizado', r.updated_at)), '[]'::jsonb) from public.run_tracks r join u on r.user_id = u.id),
  'suscripcion', (select coalesce(jsonb_agg(jsonb_build_object('plan', e.plan, 'estado', e.status, 'origen', e.source, 'producto', e.product_id, 'vence', e.expires_at, 'actualizado', e.updated_at)), '[]'::jsonb) from public.entitlements e join u on e.user_id = u.id),
  'dispositivos_conocidos', (select coalesce(jsonb_agg(jsonb_build_object('tipo', k.label, 'pais', k.country, 'primera_vez', k.first_seen, 'ultima_vez', k.last_seen)), '[]'::jsonb) from public.known_devices k join u on k.user_id = u.id),
  'notificaciones_activadas', (select coalesce(jsonb_agg(jsonb_build_object('plataforma', p.platform, 'desde', p.created_at)), '[]'::jsonb) from public.push_subscriptions p join u on p.user_id = u.id),
  'avisos_enviados', (select coalesce(jsonb_agg(jsonb_build_object('tipo', s.kind, 'periodo', s.period, 'enviado', s.sent_at)), '[]'::jsonb) from public.sent_notifications s join u on s.user_id = u.id),
  'uso_del_chat', (select coalesce(jsonb_agg(jsonb_build_object('dia', c.usage_date, 'mensajes', c.count)), '[]'::jsonb) from public.chat_usage c join u on c.user_id = u.id),
  'limites_de_sincronizacion', (select coalesce(jsonb_agg(jsonb_build_object('servicio', y.provider, 'ultima_vez_ms', y.last_ms)), '[]'::jsonb) from public.sync_cooldowns y join u on y.user_id = u.id),
  'conexiones', (
    select coalesce(jsonb_agg(x.fila), '[]'::jsonb) from (
      select jsonb_build_object('marca', 'strava', 'identificador_en_la_marca', t.athlete_id, 'desde', t.created_at) as fila from public.strava_connections t join u on t.user_id = u.id
      union all select jsonb_build_object('marca', 'garmin', 'identificador_en_la_marca', t.garmin_user_id, 'desde', t.created_at) from public.garmin_connections t join u on t.user_id = u.id
      union all select jsonb_build_object('marca', 'huawei', 'identificador_en_la_marca', t.huawei_user_id, 'desde', t.created_at) from public.huawei_connections t join u on t.user_id = u.id
      union all select jsonb_build_object('marca', 'polar', 'identificador_en_la_marca', t.polar_user_id, 'desde', t.created_at) from public.polar_connections t join u on t.user_id = u.id
      union all select jsonb_build_object('marca', 'wahoo', 'identificador_en_la_marca', t.wahoo_user_id, 'desde', t.created_at) from public.wahoo_connections t join u on t.user_id = u.id
      union all select jsonb_build_object('marca', 'suunto', 'identificador_en_la_marca', t.suunto_username, 'desde', t.created_at) from public.suunto_connections t join u on t.user_id = u.id
      union all select jsonb_build_object('marca', 'coros', 'desde', t.created_at) from public.coros_connections t join u on t.user_id = u.id
    ) x
  )
)) as copia_de_datos;
