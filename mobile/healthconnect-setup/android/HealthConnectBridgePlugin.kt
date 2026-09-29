// HealthConnectBridgePlugin.kt
//
// Plugin LOCAL de Capacitor (vive directo en este proyecto de Android Studio, no es
// un paquete de npm instalado aparte). Le da a app.js acceso a Health Connect: cualquier
// entrenamiento que haya llegado ahí (Huawei Health, Samsung Health, Garmin Connect,
// y en general cualquier app de reloj que soporte Health Connect) aparece solo en
// Zancada sin necesitar una conexión propia por marca como Strava/Polar/Wahoo.
//
// A diferencia de esas tres, acá NO hay backend/OAuth de por medio: todo pasa en el
// propio teléfono. app.js le pide los ejercicios a este plugin, los convierte a
// runs (mismo formato que activityToRun() del lado de Strava/Polar, pero
// client-side) y los mergea en state.runs como cualquier otro cambio local, antes de
// persist().
//
// DÓNDE VA: android/app/src/main/java/org/zancada/app/HealthConnectBridgePlugin.kt
// (mismo paquete que MainActivity -- si cambiaste el appId en capacitor.config.json,
// usá ese paquete en vez de org.zancada.app acá y en el manifest.)
//
// Dependencia nueva en android/app/build.gradle (bloque dependencies):
//   implementation "androidx.health.connect:connect-client:1.0.0-alpha11"
// (NO uses una versión más nueva sin más: 1.1.0 estable exige compileSdk 36+/AGP
// 8.9+, y 1.2.0-alpha06 exige compileSdk 37+/AGP 9.1+ -- este proyecto usa compileSdk
// 34/AGP 8.2.1 (ver mobile/android/variables.gradle), así que 1.0.0-alpha11 es la
// única versión de la serie que compila hoy sin subir todo ese toolchain. Confirmado
// con un build real: 1.1.0 falla en este proyecto tal cual está.)
//
// Ya compilado y probado en un dispositivo Android 9 real (incluye el fix de
// handlePermissionResult() más abajo, que evita un crash de la app entera). Además
// de este archivo, Health Connect NECESITA una PermissionsRationaleActivity
// declarada en el manifest -- ver PermissionsRationaleActivity.kt y
// AndroidManifest-snippet.xml en esta misma carpeta. Sin eso, la pantalla de
// permisos de Health Connect falla en silencio (vuelve con "ningún permiso
// otorgado" sin mostrar ningún diálogo).

package org.zancada.app

import android.content.Context
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.aggregate.AggregationResult
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.lifecycle.lifecycleScope
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.temporal.ChronoUnit

// Deportes de Health Connect que contamos como "carrera" -- mismo criterio de
// substring que ya usa isRunningSport() del lado de Polar (api/_lib/polar-activity-helpers.js),
// para no perder sesiones etiquetadas como trail running, treadmill running, etc.
private val RUNNING_EXERCISE_TYPES = setOf(
    ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,
    ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL
)

@CapacitorPlugin(name = "HealthConnectBridge")
class HealthConnectBridgePlugin : Plugin() {

    private val permissions = setOf(
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class)
    )

    private fun client(): HealthConnectClient? {
        val status = HealthConnectClient.sdkStatus(context)
        if (status != HealthConnectClient.SDK_AVAILABLE) return null
        return HealthConnectClient.getOrCreate(context)
    }

    // Le dice a app.js si Health Connect está instalado en este teléfono -- si no lo
    // está (SDK_UNAVAILABLE) o necesita una actualización (SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED),
    // la app no debería ni mostrar el botón de conectar.
    @PluginMethod
    fun checkAvailability(call: PluginCall) {
        val status = HealthConnectClient.sdkStatus(context)
        val result = JSObject()
        result.put("available", status == HealthConnectClient.SDK_AVAILABLE)
        call.resolve(result)
    }

    // "override" porque Plugin ya declara requestPermissions() para el sistema de permisos
    // en tiempo de ejecución de Android -- acá lo reusamos con otro propósito (el flujo de
    // permisos propio de Health Connect, vía ActivityResultContract, no vía
    // ActivityCompat.requestPermissions), así que no interfiere con ese mecanismo de Capacitor.
    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        val hc = client()
        if (hc == null) { call.reject("Health Connect no está disponible en este dispositivo"); return }
        saveCall(call)
        val intent = PermissionController.createRequestPermissionResultContract().createIntent(context, permissions)
        startActivityForResult(call, intent, "handlePermissionResult")
    }

    // Capacitor SIEMPRE invoca un método @ActivityCallback con 2 argumentos (el PluginCall
    // guardado y el ActivityResult de la actividad que se lanzó con startActivityForResult) --
    // ver Plugin.triggerActivityCallback() en @capacitor/android. Esta firma tenía solo el
    // primero: java.lang.IllegalArgumentException: Wrong number of arguments; expected 1, got 2,
    // que Capacitor no atrapa (usa reflection sin try/catch para esa invocación puntual) y
    // tira la app entera abajo -- confirmado en un dispositivo real, la app se cerraba de
    // golpe apenas se tocaba "Conectar con Health Connect" y se respondía el permiso nativo.
    // No hace falta usar `result` para nada acá (igual que en el resto de este método, lo único
    // que importa es volver a preguntarle a Health Connect qué permisos quedaron otorgados).
    @ActivityCallback
    private fun handlePermissionResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        activity.lifecycleScope.launch {
            val hc = client()
            val granted = hc?.permissionController?.getGrantedPermissions() ?: emptySet()
            val result = JSObject()
            result.put("granted", granted.containsAll(permissions))
            call.resolve(result)
        }
    }

    // Trae las sesiones de running de los últimos 30 días (mismo rango que usamos
    // para el primer sync de Strava/Polar) y, para cada una, agrega distancia y
    // frecuencia cardíaca promedio/máxima en esa ventana de tiempo puntual -- Health
    // Connect no trae esos totales sueltos en el propio ExerciseSessionRecord, hay
    // que pedirlos aparte con una AggregateRequest acotada al horario exacto de la
    // sesión.
    @PluginMethod
    fun readExercises(call: PluginCall) {
        val hc = client()
        if (hc == null) { call.reject("Health Connect no está disponible en este dispositivo"); return }
        activity.lifecycleScope.launch {
            try {
                val since = Instant.now().minus(30, ChronoUnit.DAYS)
                val sessions = hc.readRecords(
                    ReadRecordsRequest(
                        recordType = ExerciseSessionRecord::class,
                        timeRangeFilter = TimeRangeFilter.after(since)
                    )
                ).records.filter { it.exerciseType in RUNNING_EXERCISE_TYPES }

                val out = JSArray()
                for (session in sessions) {
                    val range = TimeRangeFilter.between(session.startTime, session.endTime)
                    val agg: AggregationResult = hc.aggregate(
                        AggregateRequest(
                            metrics = setOf(
                                DistanceRecord.DISTANCE_TOTAL,
                                HeartRateRecord.BPM_AVG,
                                HeartRateRecord.BPM_MAX
                            ),
                            timeRangeFilter = range
                        )
                    )
                    val item = JSObject()
                    item.put("id", session.metadata.id)
                    item.put("startTime", session.startTime.toString())
                    item.put("endTime", session.endTime.toString())
                    item.put("durationSec", java.time.Duration.between(session.startTime, session.endTime).seconds)
                    item.put("distanceMeters", agg[DistanceRecord.DISTANCE_TOTAL]?.inMeters ?: 0.0)
                    item.put("avgHr", agg[HeartRateRecord.BPM_AVG])
                    item.put("maxHr", agg[HeartRateRecord.BPM_MAX])
                    out.put(item)
                }
                val result = JSObject()
                result.put("exercises", out)
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Error leyendo Health Connect: ${e.message}", e)
            }
        }
    }

    // "Desconectar" del lado de Health Connect es revocar el permiso que le dimos a
    // Zancada -- a diferencia de Strava/Polar no hay un token guardado en un
    // servidor que borrar, todo el permiso vive en el propio sistema operativo.
    @PluginMethod
    fun disconnect(call: PluginCall) {
        val hc = client()
        if (hc == null) { call.resolve(); return }
        activity.lifecycleScope.launch {
            try { hc.permissionController.revokeAllPermissions() } catch (e: Exception) { /* no-op */ }
            call.resolve()
        }
    }
}
