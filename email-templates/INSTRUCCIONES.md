# Plantillas de email de Supabase Auth

Supabase manda los emails de autenticación (reset de contraseña, confirmación de
cuenta, etc.) con su propio sistema -- **no lee nada de este repo**. Los archivos
acá son solo la fuente versionada; para que un cambio tenga efecto hay que
pegarlo a mano en el Dashboard.

## Cómo actualizar la plantilla de "Reset Password"

1. Entrá a [supabase.com/dashboard](https://supabase.com/dashboard) → tu proyecto
   de Zancada.
2. Andá a **Authentication → Emails** (en versiones más viejas del dashboard es
   **Authentication → Email Templates**).
3. Abrí la plantilla **Reset Password**.
4. Si hay un toggle de "Source" / código HTML (`< >`), activalo -- necesitás
   pegar HTML crudo, no usar el editor visual.
5. Borrá todo el contenido actual y pegá el contenido completo de
   [`reset-password.html`](reset-password.html).
6. Guardá.
7. Mandate un mail de prueba (desde la app: Perfil → Cerrar sesión → "¿Olvidaste
   tu contraseña?") para confirmar que se ve bien en tu celular.

No hace falta tocar el asunto del mail salvo que también lo quieras cambiar (por
defecto suele ser algo como "Reset Your Password").

## Cómo actualizar la plantilla de "Confirm signup"

Mismos pasos que arriba, pero en la plantilla **Confirm signup** (o **Confirm
Signup** según la versión del dashboard) -- pegá el contenido completo de
[`confirm-signup.html`](confirm-signup.html). Para probarla, registrá una
cuenta nueva con un email que no hayas usado antes.

Esta plantilla en particular tiene una ventaja sobre la de reset: el idioma
que usa (`{{ .Data.lang }}`, ver la sección de abajo) se guarda en el mismo
momento en que se crea la cuenta (`handleSignUp()` manda `lang` junto con el
alta), así que para cuentas NUEVAS no depende de que la persona haya abierto
la app antes o tocado el selector de idioma -- ya llega bien desde el primer
mail.

## Otras plantillas

Las que quedan (invitación, cambio de email, magic link) probablemente
tengan el mismo aspecto genérico sin marca -- si en algún momento las usás,
se puede armar una versión igual de prolija siguiendo el mismo criterio de
diseño que `reset-password.html`/`confirm-signup.html` (mismos colores,
misma estructura).

## Cada usuario lo recibe en su idioma

Supabase solo permite UNA plantilla por tipo de email para todo el proyecto (no
una versión por idioma como en la app) -- pero su motor de plantillas es Go
`html/template` completo, así que `reset-password.html` elige el texto adentro
del mismo archivo según `{{ .Data.lang }}`, un campo que ahora la app guarda en
el `user_metadata` de Supabase Auth de cada usuario (ver `setLang()` y
`handleSignUp()` en `app.js`) cada vez que:
- alguien se registra (queda guardado el idioma que tenía puesto en ese momento), o
- alguien cambia de idioma en Perfil.

Una cuenta vieja que nunca pasó por ninguno de esos dos casos todavía no tiene
ese campo -- para esas, el mail cae al español (el idioma por default de
Zancada), igual que como estaba antes de este cambio. En cuanto esa persona
entre a Perfil y toque el selector de idioma una sola vez, sus próximos mails
ya le van a llegar en su idioma.

**Importante:** esto depende de que Supabase efectivamente exponga
`.Data.lang` (el `raw_user_meta_data` del usuario) en la plantilla de
recuperación de contraseña -- no hay forma de confirmarlo sin probarlo en
vivo. Después de pegar la plantilla, probá cambiando tu idioma en Perfil a,
por ejemplo, inglés, y pidiendo un reset de contraseña -- si el mail te llega
en inglés, quedó funcionando. Si te sigue llegando en español a pesar de
tener el idioma cambiado, avisame y lo resolvemos por otro camino (Auth Hooks
+ SMTP propio).
