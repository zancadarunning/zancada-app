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

## Otras plantillas

Las demás plantillas de Supabase (confirmar cuenta, invitación, cambio de email,
magic link) probablemente tengan el mismo aspecto genérico sin marca -- si
querés, se puede armar una versión igual de prolija para cada una siguiendo el
mismo criterio de diseño que `reset-password.html` (mismos colores, misma
estructura).

## Limitación: un solo idioma

Supabase permite una sola plantilla por tipo de email para todo el proyecto (no
hay una versión por idioma como en la app). Esta plantilla quedó en español
(voseo argentino), que es el idioma principal de Zancada -- un usuario que usa la
app en inglés/portugués/etc. va a recibir igual este mail en español. Para
mandar el email en el idioma de cada usuario hace falta un paso más grande
(Auth Hooks + SMTP propio, en vez de las plantillas nativas del Dashboard) --
avisame si en algún momento lo querés armar.
