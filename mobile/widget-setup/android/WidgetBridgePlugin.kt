// WidgetBridgePlugin.kt
//
// Plugin LOCAL de Capacitor (vive directo en este proyecto de Android Studio, no es
// un paquete de npm instalado aparte). Le permite a app.js guardar un resumen
// chiquito de la sesión de HOY en un SharedPreferences que el widget
// (ZancadaWidgetProvider.kt) puede leer directo -- en Android, a diferencia de iOS,
// el widget corre DENTRO del mismo proceso/paquete de la app, así que no hace falta
// nada parecido a un "App Group": cualquier SharedPreferences de la app ya es
// visible para el widget.
//
// DÓNDE VA: android/app/src/main/java/org/zancada/app/WidgetBridgePlugin.kt
// (mismo paquete que MainActivity -- si cambiaste el appId en capacitor.config.json,
// usá ese paquete en vez de org.zancada.app acá y en los demás archivos.)

package org.zancada.app

import android.content.Context
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject

@CapacitorPlugin(name = "WidgetBridge")
class WidgetBridgePlugin : Plugin() {
    companion object {
        const val PREFS_NAME = "zancada_widget_prefs"
        const val DATA_KEY = "zancada_widget_data"
    }

    @PluginMethod
    fun save(call: PluginCall) {
        val payload = JSONObject()
        payload.put("type", call.getString("type", ""))
        payload.put("amount", call.getString("amount", ""))
        payload.put("zone", call.getString("zone", ""))
        payload.put("dateISO", call.getString("dateISO", ""))

        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(DATA_KEY, payload.toString())
            .apply()

        // A diferencia de iOS, actualizar el SharedPreferences no le avisa solo al
        // widget -- hay que pedirle explícitamente a Android que lo redibuje.
        ZancadaWidgetProvider.updateAllWidgets(context)

        call.resolve()
    }
}
