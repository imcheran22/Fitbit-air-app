package app.fitdash.health

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.SystemClock
import androidx.core.content.ContextCompat
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import java.time.Duration
import java.time.Instant
import kotlin.coroutines.resume

// The step counter is cumulative since boot; `bootAt` tells two boots apart.
data class StepSample(val count: Long, val at: Instant, val bootAt: Instant)

data class StepDelta(val start: Instant, val end: Instant, val count: Long)

private val MAX_GAP = Duration.ofHours(24)
// Wall-clock corrections move the computed boot time by a little; a real reboot moves it by minutes at least.
private val BOOT_TOLERANCE = Duration.ofMinutes(2)
private const val SENSOR_TIMEOUT_MILLIS = 3000L

// Steps since the last sample, or null for the first sample (it is only a baseline) and for no new steps.
// After a reboot the counter restarted at zero, so its value is all steps since boot.
fun stepDelta(last: StepSample?, now: StepSample): StepDelta? {
    if (last == null) return null
    val rebooted = now.count < last.count || Duration.between(last.bootAt, now.bootAt).abs() > BOOT_TOLERANCE
    val count = if (rebooted) now.count else now.count - last.count
    val start = maxOf(if (rebooted) now.bootAt else last.at, now.at.minus(MAX_GAP))
    return if (count > 0 && start < now.at) StepDelta(start, now.at, count) else null
}

object PhoneSteps {
    private val lock = Mutex()

    private fun sensor(context: Context): Sensor? =
        context.getSystemService(SensorManager::class.java)?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)

    fun hasSensor(context: Context) = sensor(context) != null

    fun reset(context: Context) = context.getSharedPreferences("phone_steps", Context.MODE_PRIVATE).edit().clear().apply()

    // Writes the steps counted since the last sample to Health Connect; true when it wrote some.
    // The baseline only moves once the write went through, so a refused write is retried with the same steps.
    suspend fun sample(context: Context, source: HealthSource): Boolean = lock.withLock {
        if (Build.VERSION.SDK_INT >= 29 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED
        ) return false
        if (source.availability() != Availability.AVAILABLE) return false
        val manager = context.getSystemService(SensorManager::class.java) ?: return false
        val sensor = sensor(context) ?: return false
        val count = withTimeoutOrNull(SENSOR_TIMEOUT_MILLIS) {
            suspendCancellableCoroutine<Long> { cont ->
                val listener = object : SensorEventListener {
                    override fun onSensorChanged(event: SensorEvent) {
                        manager.unregisterListener(this)
                        if (cont.isActive) cont.resume(event.values[0].toLong())
                    }
                    override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) {}
                }
                manager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL)
                cont.invokeOnCancellation { manager.unregisterListener(listener) }
            }
        } ?: return false
        val now = Instant.now()
        val sample = StepSample(count, now, now.minusMillis(SystemClock.elapsedRealtime()))
        val prefs = context.getSharedPreferences("phone_steps", Context.MODE_PRIVATE)
        val last = prefs.getLong("at", 0L).takeIf { it > 0 }?.let {
            StepSample(prefs.getLong("count", 0L), Instant.ofEpochMilli(it), Instant.ofEpochMilli(prefs.getLong("bootAt", 0L)))
        }
        val delta = stepDelta(last, sample)
        if (delta != null && !source.addSteps(delta.start, delta.end, delta.count)) return false
        prefs.edit().putLong("count", count).putLong("at", now.toEpochMilli()).putLong("bootAt", sample.bootAt.toEpochMilli()).apply()
        delta != null
    }
}
