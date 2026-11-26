# Pedidos de datos de las personas

Cómo atender lo que promete la política de privacidad. Este archivo es público: **nunca** pegues acá datos de una persona.

## Plazos declarados
- **Acceso** (copia de sus datos): 10 días corridos.
- **Rectificación, actualización o supresión:** 5 días hábiles.

Esos son los plazos de la política y de la inscripción en la AAIP. Otras leyes pueden fijar plazos distintos: confirmarlo con un abogado antes de lanzar en cada país.

## Copia de sus datos (acceso y portabilidad)
1. El pedido tiene que llegar a info@zancada.org **desde el correo de la cuenta**. Si llega desde otro, pedile que escriba desde ese. No pidas el DNI.
2. Anotá la fecha en que llegó.
3. En Supabase → SQL Editor, pegá `sql/pedido_copia_de_datos.sql`, reemplazá `CAMBIAR@CORREO.COM` y ejecutalo.
4. Si `cuenta` sale vacía, no hay una cuenta con ese correo: respondé eso.
5. Guardá el resultado como archivo `.json` **fuera del repositorio**, mandalo solo al correo de la cuenta y borrá tu copia.

La copia no incluye credenciales (tokens de relojes ni de notificaciones): son llaves de acceso, no información sobre la persona, y mandarlas por correo sería un riesgo. Los datos que están solo en un proveedor (por ejemplo, registros técnicos de Vercel o Sentry) no salen de esta consulta.

## Borrado
La persona puede hacerlo sola desde Perfil → Borrar mis datos / Eliminar cuenta. Si lo pide por correo, indicale esa opción; si no puede usarla, hay que borrar la cuenta a mano siguiendo `api/delete-account.js` (revoca también los permisos con las marcas de relojes).

## Retirar el consentimiento de IA
Perfil → interruptor de Zonda. Si lo pide por correo, indicale esa opción.

## Cuentas inactivas (más de 3 años)
No hay borrado automático, a propósito: borrar cuentas sin que nadie mire es irreversible.
1. Una vez por año, ejecutá `sql/informe_cuentas_inactivas.sql` (la primera cuenta podría aparecer recién en 2029).
2. A cada correo de la lista, avisale que la cuenta se va a eliminar y dale 30 días para ingresar (el plazo es una propuesta: confirmarlo con el abogado).
3. Pasado el plazo, volvé a ejecutar el informe y eliminá solo las que sigan apareciendo y hayan recibido el aviso.
