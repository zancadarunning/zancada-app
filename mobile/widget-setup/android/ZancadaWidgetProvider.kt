// ZancadaWidgetProvider.kt
//
// El widget de Android en sí: lee el SharedPreferences que deja WidgetBridgePlugin.kt
// y arma la vista (RemoteViews) a partir del layout zancada_widget.xml.
//
// DÓNDE VA: android/app/src/main/java/org/zancada/app/ZancadaWidgetProvider.kt
// (mismo paquete que MainActivity -- ver nota sobre el appId en WidgetBridgePlugin.kt)

package org.zancada.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.text.Spannable
import android.text.SpannableString
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.text.style.StyleSpan
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.util.Calendar

// Mismos 5 colores que ZONE_COLORS en app.js -- si esa constante cambia algún
// día, actualizar acá también a mano (el widget no puede leer app.js).
private val ZONE_COLORS = mapOf(
    "1" to "#5B9BFF",
    "2" to "#4ADE80",
    "3" to "#FACC15",
    "4" to "#FB923C",
    "5" to "#FF6B5D"
)

class ZancadaWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) {
            appWidgetManager.updateAppWidget(id, buildRemoteViews(context))
        }
    }

    companion object {
        // "8.2 km" / "45 min" -> "8.2" grande+negrita+clara, "km"/"min" chico+gris,
        // las dos partes en la MISMA TextView (RemoteViews no tiene otra forma de
        // mezclar dos tamaños en una línea salvo con spans). planAmountText() en
        // app.js siempre arma el string como "NÚMERO UNIDAD" con un solo espacio
        // -- ver la función en app.js si esto alguna vez deja de calzar.
        private fun buildAmountSpannable(amount: String): SpannableString {
            val spannable = SpannableString(amount)
            val splitAt = amount.indexOf(' ')
            if (splitAt > 0) {
                spannable.setSpan(RelativeSizeSpan(2.4f), 0, splitAt, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
                spannable.setSpan(StyleSpan(Typeface.BOLD), 0, splitAt, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
                spannable.setSpan(ForegroundColorSpan(Color.parseColor("#EDEFEF")), 0, splitAt, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
                spannable.setSpan(ForegroundColorSpan(Color.parseColor("#8B9296")), splitAt, amount.length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
            return spannable
        }

        // La llama WidgetBridgePlugin.kt cada vez que la app guarda un dato nuevo --
        // sin esto, cambiar el SharedPreferences no redibuja el widget solo.
        fun updateAllWidgets(context: Context) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(ComponentName(context, ZancadaWidgetProvider::class.java))
            for (id in ids) {
                mgr.updateAppWidget(id, buildRemoteViews(context))
            }
        }

        private fun buildRemoteViews(context: Context): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.zancada_widget)
            val prefs = context.getSharedPreferences(WidgetBridgePlugin.PREFS_NAME, Context.MODE_PRIVATE)
            val raw = prefs.getString(WidgetBridgePlugin.DATA_KEY, null)

            var isStale = true
            var type = ""
            var amount = ""
            var zone = ""
            if (raw != null) {
                try {
                    val json = JSONObject(raw)
                    type = json.optString("type", "")
                    amount = json.optString("amount", "")
                    zone = json.optString("zone", "")
                    val dateISO = json.optString("dateISO", "")
                    if (dateISO.isNotEmpty()) {
                        val parts = dateISO.split("-")
                        if (parts.size == 3) {
                            val cal = Calendar.getInstance()
                            cal.set(parts[0].toInt(), parts[1].toInt() - 1, parts[2].toInt(), 0, 0, 0)
                            val ageMs = System.currentTimeMillis() - cal.timeInMillis
                            // Más de 3 días sin actualizar -- mejor mostrar el estado
                            // vacío que una sesión posiblemente vieja/incorrecta.
                            isStale = ageMs > 3L * 24 * 3600 * 1000
                        }
                    }
                } catch (e: Exception) {
                    isStale = true
                }
            }

            if (!isStale && type.isNotEmpty()) {
                views.setViewVisibility(R.id.widget_session_group, View.VISIBLE)
                views.setViewVisibility(R.id.widget_empty_group, View.GONE)
                views.setTextViewText(R.id.widget_type, type)
                views.setTextViewText(R.id.widget_amount_big, buildAmountSpannable(amount))

                val zoneColor = ZONE_COLORS[zone]
                if (zoneColor != null) {
                    views.setViewVisibility(R.id.widget_zone_dot, View.VISIBLE)
                    views.setInt(R.id.widget_zone_dot, "setColorFilter", Color.parseColor(zoneColor))
                } else {
                    views.setViewVisibility(R.id.widget_zone_dot, View.GONE)
                }
            } else {
                views.setViewVisibility(R.id.widget_session_group, View.GONE)
                views.setViewVisibility(R.id.widget_empty_group, View.VISIBLE)
            }

            // Tocar el widget abre la app -- si más adelante querés que abra directo
            // en la pestaña Correr en vez de Inicio, hay que armar el Intent con un
            // extra y leerlo en MainActivity/app.js.
            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            val pendingIntent = PendingIntent.getActivity(
                context, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)

            return views
        }
    }
}
