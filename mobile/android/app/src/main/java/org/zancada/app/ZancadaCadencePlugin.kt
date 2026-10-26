// ZancadaCadencePlugin.kt
//
// Plugin LOCAL de Capacitor (mismo esquema que ZancadaCalendarPlugin.kt). Estima la cadencia (pasos
// por minuto) mientras se corre usando solo el acelerómetro del teléfono -- sin reloj, sin permisos.
// Corre del lado nativo (no en el WebView) para que siga midiendo con la pantalla apagada y la app en
// segundo plano, igual que el GPS: el servicio de seguimiento mantiene vivo el proceso.
//
// Detección: se le saca la gravedad a cada muestra, se suaviza el módulo de la aceleración lineal y se
// cuenta un paso por cada pico local que supere un umbral adaptable (la mitad del pico típico reciente,
// con un piso) y que llegue al menos 250 ms después del anterior (tope de 240 pasos por minuto, lo que
// descarta los rebotes secundarios de cada pisada). La cadencia sale de los pasos de los últimos 10 s.

package org.zancada.app

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlin.math.PI
import kotlin.math.sin
import kotlin.math.sqrt

class CadenceDetector {
    private val gravity = FloatArray(3)
    private var gravityReady = false
    private var smooth = 0f
    private var prev1 = 0f   // muestra anterior
    private var prev2 = 0f   // la de antes
    private var prev1Ms = 0L
    private var lastPeakMs = 0L
    private var peakEma = 0f
    private val steps = ArrayDeque<Long>()

    fun reset() {
        gravityReady = false; smooth = 0f; prev1 = 0f; prev2 = 0f; prev1Ms = 0L; lastPeakMs = 0L; peakEma = 0f
        steps.clear()
    }

    // Devuelve true si esta muestra confirmó un paso.
    fun onSample(x: Float, y: Float, z: Float, tMs: Long): Boolean {
        if (!gravityReady) {
            gravity[0] = x; gravity[1] = y; gravity[2] = z; gravityReady = true
        } else {
            gravity[0] = 0.92f * gravity[0] + 0.08f * x
            gravity[1] = 0.92f * gravity[1] + 0.08f * y
            gravity[2] = 0.92f * gravity[2] + 0.08f * z
        }
        val lx = x - gravity[0]; val ly = y - gravity[1]; val lz = z - gravity[2]
        val mag = sqrt(lx * lx + ly * ly + lz * lz)
        val cur = 0.6f * smooth + 0.4f * mag
        smooth = cur
        var step = false
        // prev1 es un máximo local si superó a la anterior y a la actual
        if (prev1 > prev2 && prev1 >= cur) {
            val thr = maxOf(1.5f, 0.5f * peakEma)
            // el pico de referencia es el máximo reciente (con un decaimiento lento), así los rebotes chicos de la pisada no lo arrastran hacia abajo
            val localMax = prev1
            // separación mínima entre pasos: 250 ms, y además un 55% del paso típico reciente (mediana de los
            // últimos intervalos), para no contar los rebotes secundarios de cada pisada a cadencias más bajas
            var minGap = 250L
            if (steps.size >= 4) {
                val gaps = ArrayList<Long>()
                var prev = -1L
                for (st in steps) { if (prev >= 0) gaps.add(st - prev); prev = st }
                val tail = gaps.takeLast(5).sorted()
                val median = tail[tail.size / 2]
                minGap = maxOf(250L, (median * 0.55).toLong())
            }
            if (prev1 > thr && prev1Ms - lastPeakMs >= minGap) {
                lastPeakMs = prev1Ms
                steps.addLast(prev1Ms)
                step = true
            }
        }
        if (prev1 > prev2 && prev1 >= cur) peakEma = maxOf(peakEma * 0.985f, prev1)
        prev2 = prev1; prev1 = cur; prev1Ms = tMs
        while (steps.isNotEmpty() && tMs - steps.first() > 10000) steps.removeFirst()
        return step
    }

    // Pasos por minuto según los pasos de los últimos 10 s, o null si todavía no hay suficientes.
    fun spm(nowMs: Long): Int? {
        while (steps.isNotEmpty() && nowMs - steps.first() > 10000) steps.removeFirst()
        if (steps.size < 6) return null
        val span = steps.last() - steps.first()
        if (span <= 0) return null
        return Math.round((steps.size - 1) * 60000.0 / span).toInt()
    }
}

@CapacitorPlugin(name = "ZancadaCadence")
class ZancadaCadencePlugin : Plugin(), SensorEventListener {

    private val detector = CadenceDetector()
    // Base de tiempo del último evento del sensor (e.timestamp / 1e6) y cuándo llegó, en reloj de pared. spm() tiene que preguntarse en LA MISMA base de tiempo
    // que usaron los pasos: con System.currentTimeMillis() (epoch, ~1,7e12) contra timestamps del sensor (desde el arranque, ~1e8) se descartaban todos los pasos
    // y la cadencia en vivo salía siempre null.
    private var lastSensorMs = 0L
    private var lastSampleWallMs = 0L
    private var sm: SensorManager? = null
    private var running = false
    private val handler = Handler(Looper.getMainLooper())
    private val ticker = object : Runnable {
        override fun run() {
            if (!running) return
            val stale = lastSampleWallMs == 0L || android.os.SystemClock.elapsedRealtime() - lastSampleWallMs > 5000
            val spm = if (stale) null else detector.spm(lastSensorMs)
            val res = JSObject()
            res.put("spm", spm ?: JSObject.NULL)
            notifyListeners("cadence", res)
            handler.postDelayed(this, 3000)
        }
    }

    private fun accel(): Sensor? {
        val m = sm ?: (context.getSystemService(Context.SENSOR_SERVICE) as SensorManager).also { sm = it }
        return m.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val res = JSObject()
        res.put("available", accel() != null)
        call.resolve(res)
    }

    @PluginMethod
    fun start(call: PluginCall) {
        val s = accel()
        if (s == null) { call.reject("sin acelerómetro"); return }
        if (!running) {
            detector.reset()
            lastSensorMs = 0L
            lastSampleWallMs = 0L
            sm?.registerListener(this, s, SensorManager.SENSOR_DELAY_GAME)
            running = true
            handler.postDelayed(ticker, 3000)
        }
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        stopInternal()
        call.resolve()
    }

    private fun stopInternal() {
        running = false
        handler.removeCallbacks(ticker)
        sm?.unregisterListener(this)
    }

    override fun handleOnDestroy() {
        stopInternal()
        super.handleOnDestroy()
    }

    override fun onSensorChanged(e: SensorEvent) {
        lastSensorMs = e.timestamp / 1_000_000L
        lastSampleWallMs = android.os.SystemClock.elapsedRealtime()
        detector.onSample(e.values[0], e.values[1], e.values[2], lastSensorMs)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    // Prueba del algoritmo con datos sintéticos: una "carrera" de seconds s a 50 Hz con un paso por ciclo
    // de la frecuencia stepsPerMin, y ruido. Devuelve la cadencia que detectó.
    @PluginMethod
    fun selfTest(call: PluginCall) {
        val spm = call.getInt("spm", 170) ?: 170
        val seconds = call.getInt("seconds", 30) ?: 30
        val d = CadenceDetector()
        val hz = 50
        val f = spm / 60.0
        val rnd = java.util.Random(7)
        var t = 0L
        for (i in 0 until seconds * hz) {
            t = (i * 1000L) / hz
            val tt = i / hz.toDouble()
            // pico de impacto por pisada (suma de armónicos) + gravedad + ruido
            val impact = 9.0 * Math.pow(Math.max(0.0, sin(2 * PI * f * tt)), 3.0) + 2.0 * sin(2 * PI * f * 2 * tt)
            val z = (9.81 + impact + rnd.nextGaussian() * 0.4).toFloat()
            d.onSample((rnd.nextGaussian() * 0.4).toFloat(), (rnd.nextGaussian() * 0.4).toFloat(), z, t)
        }
        val res = JSObject()
        res.put("detected", d.spm(t) ?: JSObject.NULL)
        res.put("expected", spm)
        call.resolve(res)
    }
}
