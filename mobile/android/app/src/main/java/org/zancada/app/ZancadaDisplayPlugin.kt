// ZancadaDisplayPlugin.kt
//
// Plugin LOCAL de Capacitor (mismo esquema que ZancadaCalendarPlugin.kt). Maneja el "Tamaño del
// texto" de la app (Perfil > Preferencias). MainActivity fuerza el textZoom del WebView a 100%
// (ver el comentario ahí: el tamaño de letra del sistema rompía los diseños ajustados a mano), así
// que quien necesita letra grande no tenía forma de tenerla. Ahora hay cuatro modos:
//   auto   -> sigue el tamaño de letra del sistema Android, con tope de 130%
//   normal -> 100%, large -> 115%, xlarge -> 130%
// El modo se guarda en SharedPreferences para aplicarlo ya al abrir la app (sin parpadeo).

package org.zancada.app

import android.app.Activity
import android.content.Context
import android.graphics.Color
import androidx.core.view.WindowCompat
import android.webkit.WebView
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "ZancadaDisplay")
class ZancadaDisplayPlugin : Plugin() {

    companion object {
        private const val PREFS = "zancada_display"
        private const val KEY_MODE = "text_size_mode"
        private const val KEY_BARS_LIGHT = "bars_light"
        private val BAR_LIGHT = Color.parseColor("#F2F4EC")
        private val BAR_DARK = Color.parseColor("#0A0A0A")

        // Sin tema guardado todavía (primer arranque) se sigue al sistema, igual que la web.
        fun readBarsLight(ctx: Context): Boolean {
            val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            if (prefs.contains(KEY_BARS_LIGHT)) return prefs.getBoolean(KEY_BARS_LIGHT, false)
            val night = ctx.resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK
            return night != android.content.res.Configuration.UI_MODE_NIGHT_YES
        }

        // Barras del sistema (estado y navegación) según el tema de la app: en claro, fondo crema con íconos oscuros.
        fun applyBars(activity: Activity, light: Boolean) {
            activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_BARS_LIGHT, light).apply()
            val w = activity.window
            val c = if (light) BAR_LIGHT else BAR_DARK
            w.statusBarColor = c
            w.navigationBarColor = c
            w.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(c))
            val ctl = WindowCompat.getInsetsController(w, w.decorView)
            ctl.isAppearanceLightStatusBars = light
            ctl.isAppearanceLightNavigationBars = light
            // El plugin SystemBars de Capacitor reparte los márgenes de las barras al WebView al recibir los insets;
            // al tocar color/apariencia hay que volver a pedirlos o el WebView queda ocupando también la zona de la barra de navegación.
            w.decorView.requestApplyInsets()
            w.decorView.post { w.decorView.requestApplyInsets() }
        }

        fun readMode(ctx: Context): String =
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_MODE, "auto") ?: "auto"

        fun saveMode(ctx: Context, mode: String) {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_MODE, mode).apply()
        }

        // Porcentaje de textZoom que corresponde a un modo.
        fun zoomFor(ctx: Context, mode: String): Int = when (mode) {
            "normal" -> 100
            "large" -> 115
            "xlarge" -> 130
            else -> Math.round(ctx.resources.configuration.fontScale * 100f).coerceIn(100, 130)
        }

        fun apply(ctx: Context, webView: WebView?) {
            webView?.settings?.textZoom = zoomFor(ctx, readMode(ctx))
        }
    }

    @PluginMethod
    fun setSystemBars(call: PluginCall) {
        val light = call.getBoolean("light", false) ?: false
        activity.runOnUiThread {
            applyBars(activity, light)
            bridge.webView.requestApplyInsets()
            call.resolve()
        }
    }

    @PluginMethod
    fun getTextSize(call: PluginCall) {
        val res = JSObject()
        res.put("mode", readMode(context))
        res.put("systemScale", context.resources.configuration.fontScale.toDouble())
        res.put("zoom", zoomFor(context, readMode(context)))
        call.resolve(res)
    }

    @PluginMethod
    fun setTextSize(call: PluginCall) {
        val mode = call.getString("mode", "auto") ?: "auto"
        if (mode != "auto" && mode != "normal" && mode != "large" && mode != "xlarge") {
            call.reject("modo inválido")
            return
        }
        saveMode(context, mode)
        activity.runOnUiThread {
            apply(context, bridge.webView)
            call.resolve()
        }
    }
}
