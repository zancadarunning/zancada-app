# Revisión de seguridad de la IA (Zonda)

Qué puede salir mal con el coach de IA, qué está cubierto y qué falta. Público: sin claves.

## 1. Cómo funciona

El navegador o la app arma el contexto (perfil, plan de la semana, resumen de carreras, notas) y lo manda a `/api/chat`, que lo reenvía a Claude (modelo Haiku) con la clave del servidor. El modelo puede pedir **herramientas** (cambiar una sesión, mover o cancelar, ajustar el volumen, cambiar el perfil, guardar una nota, deshacer); las herramientas se ejecutan **en el dispositivo**, sobre los datos de esa misma persona.

## 2. Riesgos y controles

| Riesgo | Control | Estado |
|---|---|---|
| Usar el endpoint como un proxy gratis de la IA | Exige sesión con correo confirmado; 60 mensajes por usuario por día y 2.000 en total; tamaño máximo por pedido; solo las 7 herramientas del coach; sin imágenes ni documentos ni herramientas facturables aparte (`api/_lib/chat-guard.js`); aviso a Sentry cuando se agota el tope global | Cubierto. Queda el texto de sistema libre (el costo sigue acotado) |
| Gasto descontrolado | Tope de gasto mensual en la cuenta de Anthropic | Cubierto |
| Inyección de instrucciones (alguien esconde órdenes en un texto que la IA lee) | Las únicas fuentes de texto ajeno que llegan a la IA son lo que escribe la propia persona: **no** se mandan los nombres de las carreras importadas ni nada de otros usuarios. Las herramientas solo tocan los datos de la propia persona | Cubierto: un ataque solo podría afectar a quien lo escribe |
| La IA inventa o devuelve valores raros en una herramienta | Se validan día, tipo de sesión, terreno, objetivo y zona del cuerpo contra listas cerradas; se acotan distancia, zona, frecuencia cardíaca máxima y kilómetros semanales; las fechas se validan. Un valor inválido se rechaza con un mensaje que el modelo puede corregir | Cubierto (`test/coach-tools-enums.test.js`, `test/coach-tools.test.js`) |
| El texto de la IA rompe la pantalla (HTML inyectado) | La respuesta del coach se escapa antes de mostrarse; las descripciones de sesiones editadas por la IA se escapan al dibujarse | Cubierto |
| Cambios dañinos en el plan | Cada cambio de la IA se puede **deshacer** (herramienta `deshacer_cambio`); no se modifican semanas ya vividas; no se toca el día de la carrera objetivo | Cubierto |
| Consejos médicos peligrosos | El texto de sistema le indica no dar consejo médico y derivar al médico en molestias y embarazo | Revisar redacción con un profesional antes del lanzamiento mundial |
| Datos personales enviados a un tercero (Anthropic) | Se envía solo lo necesario para entrenar; sin rutas GPS ni carreras de Strava; la política de privacidad lo declara | Pendiente: verificar el contrato de tratamiento de datos y la retención de Anthropic (ver `docs/privacidad-inventario-de-datos.md`) |

## 3. Lo que falta o conviene mejorar

1. **Mover el texto de sistema al servidor** (hoy lo manda el cliente): cierra del todo el uso como proxy y permite hacer cumplir reglas de uso por plan cuando haya suscripciones. Implica llevar la generación del contexto (que usa el motor del plan) al servidor.
2. **Minimizar datos**: mandar la edad en vez de la fecha de nacimiento, y solo las notas relevantes. Hoy ya se manda la edad aproximada.
3. **Pruebas de abuso periódicas**: una lista de frases de ataque comunes ("ignorá tus instrucciones", pedidos fuera de tema, pedidos de datos de otros usuarios) que se ejecutan contra el coach antes de cada cambio grande del texto de sistema.
4. **Evaluar la calidad y seguridad de las respuestas** sobre temas sensibles (lesiones, embarazo, trastornos alimentarios, menores de edad) con alguien del área de la salud.
5. **Registro de uso por usuario** (cantidad de mensajes, rechazos del filtro) para detectar abuso temprano.
