// ZancadaRunNotificationPlugin.kt
//
// Plugin LOCAL de Capacitor (mismo esquema que ZancadaCalendarPlugin.kt). Mientras se graba una
// carrera, el plugin de GPS en segundo plano (@capacitor-community/background-geolocation) ya
// mantiene una notificación persistente (foreground service, id 28351) con un texto fijo. Este
// plugin REEMPLAZA ese contenido -- publicando otra notificación con el MISMO id -- por un bloque
// con la distancia, el tiempo y el ritmo promedio en vivo (se ve también en la pantalla
// bloqueada), más un botón Pausar/Reanudar, al estilo de la actividad en vivo de Nike Run Club.
//
// El tiempo es un Chronometer del sistema (corre solo, aunque la app esté en segundo plano);
// distancia y ritmo se actualizan cada vez que app.js llama a update().

package org.zancada.app

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.SystemClock
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "ZancadaRunNotification")
class ZancadaRunNotificationPlugin : Plugin() {

    companion object {
        // Mismos valores que usa el foreground service del plugin de GPS (no son públicos):
        // mismo id => esta notificación reemplaza a la suya; mismo canal => misma configuración.
        const val NOTIF_ID = 28351
        const val CHANNEL_ID = "com.equimaps.capacitor_background_geolocation"
        const val ACTION_TOGGLE = "org.zancada.app.RUN_TOGGLE"
    }

    private var receiver: BroadcastReceiver? = null

    override fun load() {
        super.load()
        val r = object : BroadcastReceiver() {
            override fun onReceive(c: Context, i: Intent) {
                notifyListeners("toggle", JSObject())
            }
        }
        receiver = r
        ContextCompat.registerReceiver(context, r, IntentFilter(ACTION_TOGGLE), ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    override fun handleOnDestroy() {
        receiver?.let { try { context.unregisterReceiver(it) } catch (e: Exception) { } }
        receiver = null
        super.handleOnDestroy()
    }

    @PluginMethod
    fun update(call: PluginCall) {
        try {
            val elapsedSec = call.getInt("elapsedSec", 0) ?: 0
            val running = call.getBoolean("running", true) ?: true
            val views = RemoteViews(context.packageName, R.layout.zc_notif_run)
            views.setTextViewText(R.id.zr_dist, call.getString("dist", "0,00"))
            views.setTextViewText(R.id.zr_dist_l, call.getString("distLabel", ""))
            views.setTextViewText(R.id.zr_time_l, call.getString("timeLabel", ""))
            views.setTextViewText(R.id.zr_pace, call.getString("pace", "-"))
            views.setTextViewText(R.id.zr_pace_l, call.getString("paceLabel", ""))
            views.setChronometer(R.id.zr_time, SystemClock.elapsedRealtime() - elapsedSec * 1000L, null, running)

            // versión compacta (panel colapsado): cada dato con su unidad al lado
            val small = RemoteViews(context.packageName, R.layout.zc_notif_run_small)
            small.setTextViewText(R.id.zs_dist, call.getString("dist", "0,00"))
            small.setTextViewText(R.id.zs_dist_l, call.getString("distShort", ""))
            small.setTextViewText(R.id.zs_pace, call.getString("pace", "-"))
            small.setTextViewText(R.id.zs_pace_l, call.getString("paceShort", ""))
            small.setChronometer(R.id.zs_time, SystemClock.elapsedRealtime() - elapsedSec * 1000L, null, running)

            val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
            val contentPi = PendingIntent.getActivity(context, 0, launch, flags)
            val togglePi = PendingIntent.getBroadcast(
                context, 1, Intent(ACTION_TOGGLE).setPackage(context.packageName), flags
            )

            val notif = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_run)
                .setColor(0xFFD6FF3F.toInt())
                .setContentTitle(call.getString("title", ""))
                .setStyle(NotificationCompat.DecoratedCustomViewStyle())
                .setCustomContentView(small)
                .setCustomBigContentView(views)
                .setContentIntent(contentPi)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setCategory(NotificationCompat.CATEGORY_WORKOUT)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .addAction(0, call.getString("toggleText", ""), togglePi)
                .build()

            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(NOTIF_ID, notif)
            call.resolve()
        } catch (e: Exception) {
            call.reject(e.message ?: "run notification failed")
        }
    }

    // Cierra la notificación (por si el foreground service ya no está para llevársela).
    @PluginMethod
    fun clear(call: PluginCall) {
        try {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.cancel(NOTIF_ID)
        } catch (e: Exception) { }
        call.resolve()
    }
}
