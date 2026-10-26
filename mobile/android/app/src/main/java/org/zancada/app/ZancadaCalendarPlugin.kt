// ZancadaCalendarPlugin.kt
//
// Plugin LOCAL de Capacitor (mismo esquema que HealthConnectBridgePlugin.kt). Escribe los
// entrenamientos del plan DIRECTO en el calendario del teléfono, como hacen Huawei Health y
// otras apps de running: un toque, sin archivos ni enlaces.
//
// Todo vive en un calendario propio y LOCAL llamado "Zancada" (cuenta de tipo LOCAL, no
// atada a ninguna cuenta de Google): así sync() puede reemplazar su contenido completo en
// cada cambio de plan sin tener que recordar IDs de eventos, y clear() borra TODO lo que la
// app agregó (el calendario entero) sin tocar un solo evento del usuario.
//
// Los eventos de día completo se guardan en UTC (DTSTART a medianoche UTC + EVENT_TIMEZONE
// "UTC", la convención de Android para ALL_DAY) para que no se corran de día según el huso.

package org.zancada.app

import android.Manifest
import android.content.ContentUris
import android.content.ContentValues
import android.net.Uri
import android.provider.CalendarContract
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.getcapacitor.PermissionState
import java.util.Calendar
import java.util.TimeZone

@CapacitorPlugin(
    name = "ZancadaCalendar",
    permissions = [
        Permission(
            alias = "calendar",
            strings = [Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR]
        )
    ]
)
class ZancadaCalendarPlugin : Plugin() {

    private val accountName = "Zancada"
    private val accountType = CalendarContract.ACCOUNT_TYPE_LOCAL

    // Cambios hechos como "sync adapter": el proveedor los aplica tal cual (borrado real,
    // sin marcar nada como sucio ni esperar a una sincronización que en una cuenta LOCAL
    // nunca va a llegar).
    private fun asSyncAdapter(uri: Uri): Uri = uri.buildUpon()
        .appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
        .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_NAME, accountName)
        .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_TYPE, accountType)
        .build()

    private fun hasAccess(): Boolean = getPermissionState("calendar") == PermissionState.GRANTED

    private fun findCalendarId(): Long? {
        val cursor = context.contentResolver.query(
            CalendarContract.Calendars.CONTENT_URI,
            arrayOf(CalendarContract.Calendars._ID),
            "${CalendarContract.Calendars.ACCOUNT_NAME}=? AND ${CalendarContract.Calendars.ACCOUNT_TYPE}=?",
            arrayOf(accountName, accountType),
            null
        ) ?: return null
        cursor.use { return if (it.moveToFirst()) it.getLong(0) else null }
    }

    private fun createCalendar(): Long? {
        val values = ContentValues().apply {
            put(CalendarContract.Calendars.ACCOUNT_NAME, accountName)
            put(CalendarContract.Calendars.ACCOUNT_TYPE, accountType)
            put(CalendarContract.Calendars.NAME, "zancada")
            put(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME, "Zancada")
            // Oliva oscuro, no el lima de marca: el lima puro casi no se lee como color de
            // evento sobre el fondo blanco de la mayoría de las apps de calendario.
            put(CalendarContract.Calendars.CALENDAR_COLOR, 0xFF6B8A00.toInt())
            put(CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL, CalendarContract.Calendars.CAL_ACCESS_OWNER)
            put(CalendarContract.Calendars.OWNER_ACCOUNT, accountName)
            put(CalendarContract.Calendars.VISIBLE, 1)
            put(CalendarContract.Calendars.SYNC_EVENTS, 1)
            put(CalendarContract.Calendars.CALENDAR_TIME_ZONE, TimeZone.getDefault().id)
        }
        val uri = context.contentResolver.insert(asSyncAdapter(CalendarContract.Calendars.CONTENT_URI), values)
            ?: return null
        return ContentUris.parseId(uri)
    }

    private fun utcMidnightMillis(isoDate: String): Long? {
        val p = isoDate.split("-")
        if (p.size != 3) return null
        val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        cal.clear()
        cal.set(p[0].toInt(), p[1].toInt() - 1, p[2].toInt(), 0, 0, 0)
        return cal.timeInMillis
    }

    private fun statusObject(extra: (JSObject.() -> Unit)? = null): JSObject {
        val ret = JSObject()
        ret.put("granted", hasAccess())
        ret.put("exists", hasAccess() && findCalendarId() != null)
        extra?.invoke(ret)
        return ret
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        call.resolve(statusObject())
    }

    @PluginMethod
    fun requestAccess(call: PluginCall) {
        if (hasAccess()) {
            call.resolve(statusObject())
        } else {
            requestPermissionForAlias("calendar", call, "accessCallback")
        }
    }

    @PermissionCallback
    fun accessCallback(call: PluginCall) {
        call.resolve(statusObject())
    }

    // events: [{ date: "YYYY-MM-DD", title, description }] -- reemplaza TODO el contenido del
    // calendario "Zancada" por esta lista (lista vacía = lo deja vacío).
    @PluginMethod
    fun sync(call: PluginCall) {
        if (!hasAccess()) { call.reject("calendar_permission_denied"); return }
        val events = call.getArray("events")
        try {
            val calendarId = findCalendarId() ?: createCalendar()
            if (calendarId == null) { call.reject("calendar_create_failed"); return }

            context.contentResolver.delete(
                asSyncAdapter(CalendarContract.Events.CONTENT_URI),
                "${CalendarContract.Events.CALENDAR_ID}=?",
                arrayOf(calendarId.toString())
            )

            var added = 0
            for (i in 0 until (events?.length() ?: 0)) {
                val ev = events!!.getJSONObject(i)
                val start = utcMidnightMillis(ev.optString("date")) ?: continue
                val values = ContentValues().apply {
                    put(CalendarContract.Events.CALENDAR_ID, calendarId)
                    put(CalendarContract.Events.TITLE, ev.optString("title"))
                    put(CalendarContract.Events.DESCRIPTION, ev.optString("description"))
                    put(CalendarContract.Events.DTSTART, start)
                    put(CalendarContract.Events.DTEND, start + 24L * 60 * 60 * 1000)
                    put(CalendarContract.Events.ALL_DAY, 1)
                    put(CalendarContract.Events.EVENT_TIMEZONE, "UTC")
                    // Un entrenamiento de día completo no debería marcar al usuario "ocupado".
                    put(CalendarContract.Events.AVAILABILITY, CalendarContract.Events.AVAILABILITY_FREE)
                }
                if (context.contentResolver.insert(asSyncAdapter(CalendarContract.Events.CONTENT_URI), values) != null) added++
            }
            call.resolve(statusObject { put("added", added) })
        } catch (e: Exception) {
            call.reject("calendar_sync_failed: ${e.message}")
        }
    }

    // Borra el calendario "Zancada" entero (y con él todos sus eventos).
    @PluginMethod
    fun clear(call: PluginCall) {
        if (!hasAccess()) { call.resolve(statusObject()); return }
        try {
            val id = findCalendarId()
            if (id != null) {
                context.contentResolver.delete(
                    asSyncAdapter(ContentUris.withAppendedId(CalendarContract.Calendars.CONTENT_URI, id)),
                    null, null
                )
            }
            call.resolve(statusObject())
        } catch (e: Exception) {
            call.reject("calendar_clear_failed: ${e.message}")
        }
    }
}
