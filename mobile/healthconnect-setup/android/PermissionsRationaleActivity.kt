// PermissionsRationaleActivity.kt
//
// Health Connect EXIGE que la app tenga una actividad que muestre su política de
// privacidad, registrada para el intent ACTION_SHOW_PERMISSIONS_RATIONALE (Android 13 y
// anteriores) y, vía un activity-alias, para VIEW_PERMISSION_USAGE con la categoría
// HEALTH_PERMISSIONS (Android 14+) -- ver AndroidManifest.xml, y la guía oficial:
// developer.android.com/health-and-fitness/health-connect/get-started, sección
// "Cómo mostrar el diálogo de la política de privacidad de tu app".
//
// SIN ESTO, la pantalla de permisos de Health Connect falla EN SILENCIO: HC.requestPermissions()
// abre la actividad de Health Connect, pero como no encuentra ninguna actividad de este tipo
// registrada del lado de Zancada, nunca llega a dibujar el diálogo real -- vuelve casi al
// instante con "ningún permiso otorgado", sin ningún error visible ni para el usuario ni en los
// logs de la app. Confirmado en un dispositivo real: probado con `adb logcat`, se ve que Health
// Connect arranca y cierra su actividad en menos de un segundo, sin mostrar nada. Esto es
// justamente lo que un usuario reportó ("me dice que no le di permisos") sin haber visto nunca
// ningún cartel para elegir sí/no.
//
// No hace falta ninguna UI propia acá -- alcanza con abrir la misma política de privacidad que
// ya usa el resto de la app (ver el link a /privacy.html en index.html/app.js) en el navegador
// del sistema, y cerrar esta actividad. Health Connect no la muestra en el flujo normal de
// pedir permiso (solo si el usuario toca el link "política de privacidad" DENTRO de la pantalla
// de Health Connect) -- pero tiene que EXISTIR y estar declarada para que esa pantalla se
// anime a aparecer.

package org.zancada.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

class PermissionsRationaleActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://zancada.org/privacy.html")))
        } catch (e: Exception) {
            // No hay nada más que hacer si ni siquiera esto se puede abrir (sin navegador,
            // por ejemplo) -- igual cerramos la actividad para no dejar al usuario trabado acá.
        }
        finish()
    }
}
