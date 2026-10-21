# Verificación en dos pasos (opcional) para las cuentas de la app

Estado a 2026-10-21. Público: sin claves.

## Cómo funciona

- En **Perfil → Verificación en dos pasos** (solo cuentas con correo y contraseña; Google y Apple tienen la suya) la persona escanea un QR con su app de autenticación (Google Authenticator, Authy, 1Password…), escribe el primer código de 6 dígitos y queda activada.
- Desde ese momento, al ingresar (correo, sesión guardada o cualquier camino) la app pide el código **antes de leer ningún dato**. Cancelar cierra la sesión.
- Está construido sobre el TOTP de Supabase (activado en el proyecto: Authentication → Multi-Factor; el SMS no, porque necesita plan Pro).

## Dónde se hace cumplir (no solo en la pantalla)

1. **Base de datos:** `sql/mfa_rls.sql` agrega una política restrictiva en las 7 tablas que la app consulta directo (`app_state`, `push_subscriptions` y las conexiones de relojes): si la cuenta tiene un factor verificado, una sesión de "contraseña sola" (aal1) no lee ni escribe nada.
2. **API del servidor:** `api/_lib/verify-user.js` rechaza con 401 ("MFA required") a una cuenta con factor verificado cuya sesión no completó el segundo paso. Lo usan todos los endpoints con sesión.
3. **Pantalla:** `ensureMfa()` en `loadUserAndEnter` pide el código.

Las cuentas **sin** verificación en dos pasos no cambian en nada.

## Si alguien pierde el celular (recuperación)

La app no tiene códigos de respaldo (Supabase no los ofrece). El texto de activación le avisa a la persona que guarde la clave y que, si la pierde, tiene que escribir a `info@zancada.org` **desde el correo de su cuenta**. Cuando pase:

1. Comprobar que el pedido viene del correo de la cuenta y, si hay duda, pedir un dato que solo la persona sepa (por ejemplo la fecha de su última carrera). No quitar el segundo paso solo porque alguien lo pida.
2. En el SQL Editor de Supabase: `delete from auth.mfa_factors where user_id = '<id de la cuenta>';` (el id está en Authentication → Users).
3. Avisarle que ya puede ingresar y volver a activarlo.

## Opción recomendada, solo con plan Pro

Authentication → Multi-Factor → "Limit duration of AAL1 sessions": termina la sesión si no se completa el segundo paso en 15 minutos.
