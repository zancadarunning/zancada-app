-- Cuentas sin actividad hace más de 3 años (el plazo de la política de privacidad). SOLO LECTURA: lista candidatas, NO borra nada.
-- "Actividad" = el último ingreso o el último guardado de la app (una sincronización de reloj también cuenta). Antes de borrar una cuenta hay que avisarle
-- al correo registrado: el procedimiento está en docs/pedidos-de-datos.md.
select u.email,
       u.created_at as alta,
       greatest(coalesce(u.last_sign_in_at, u.created_at), coalesce(a.updated_at, u.created_at)) as ultima_actividad
from auth.users u
left join public.app_state a on a.user_id = u.id
where greatest(coalesce(u.last_sign_in_at, u.created_at), coalesce(a.updated_at, u.created_at)) < now() - interval '3 years'
order by ultima_actividad;
