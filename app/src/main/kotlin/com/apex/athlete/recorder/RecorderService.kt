package com.apex.athlete.recorder

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.apex.athlete.ApexAthleteApplication
import com.apex.athlete.MainActivity
import com.apex.athlete.R
import com.apex.athlete.ble.BlePermissions
import com.apex.athlete.ble.BleStrapConnection
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Foreground service (type `health`) that keeps a recording alive with the screen off. It owns no data: the
 * session lives in [RecorderController] (persisted), the heart rate comes from the shared strap connection.
 * Refuses to record in Demo mode. Read-only: nothing is written to Google, Health Connect or the strap here.
 *
 * Platform rule (Android 14+, verify on device): a `health` foreground service needs at least one of the
 * sensor/activity permissions or a Health Connect permission to be granted when it starts. The BLE connect
 * permission is NOT in that list as far as the docs go. If the start is refused, the service stops itself and
 * the screen shows the session as time only; see docs/OPEN_POINTS.md.
 */
class RecorderService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var loop: Job? = null
    private lateinit var controller: RecorderController

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        controller = RecorderController.shared(this)
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        if (!enterForeground()) {
            stopSelf()
            return START_NOT_STICKY
        }
        when (action) {
            ACTION_PAUSE -> controller.pause()
            ACTION_RESUME -> controller.resume()
            ACTION_STOP -> controller.stop()
            else -> Unit // START is handled in the loop; a null intent is a sticky restart after process death
        }
        if (loop?.isActive != true) loop = scope.launch {
            if (action == ACTION_START && !beginRecording()) return@launch
            tickLoop()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    /** Starts a session unless Demo mode is on (then nothing is recorded and the service ends). */
    private suspend fun beginRecording(): Boolean {
        val demo = runCatching { container().settings.currentSettings().demoMode }.getOrDefault(true)
        if (demo) {
            controller.clear()
            stopForegroundAndSelf()
            return false
        }
        controller.start()
        return true
    }

    private fun container() = (application as ApexAthleteApplication).container

    private suspend fun tickLoop() {
        val strap = BleStrapConnection.shared(this)
        val session0 = controller.session.value
        if (session0?.usedStrap == true && BlePermissions.missing(Build.VERSION.SDK_INT) {
                checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED
            }.isEmpty()
        ) strap.connect()
        while (true) {
            val s = controller.session.value
            if (s == null || s.phase == RecorderPhase.STOPPED) {
                stopForegroundAndSelf()
                return
            }
            if (s.phase == RecorderPhase.RUNNING) strap.heartRate.value?.let(controller::heartRate)
            notificationManager().notify(NOTIFICATION_ID, buildNotification(controller.session.value ?: s, strap.heartRate.value))
            delay(1_000)
        }
    }

    private fun stopForegroundAndSelf() {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun enterForeground(): Boolean = try {
        val session = controller.session.value
        ServiceCompat.startForeground(
            this, NOTIFICATION_ID, buildNotification(session, null),
            if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH else ServiceInfo.FOREGROUND_SERVICE_TYPE_MANIFEST,
        )
        true
    } catch (e: Exception) { // SecurityException (type prerequisites) or start-not-allowed
        false
    }

    private fun notificationManager() = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    private fun createChannel() {
        val ch = NotificationChannel(CHANNEL_ID, getString(R.string.recorder_channel_name), NotificationManager.IMPORTANCE_LOW)
        ch.description = getString(R.string.recorder_channel_description)
        notificationManager().createNotificationChannel(ch)
    }

    private fun buildNotification(session: RecorderSession?, bpm: Int?): Notification {
        val now = controller.now()
        val elapsed = RecorderFormat.clock(session?.elapsedMillis(now) ?: 0L)
        val paused = session?.phase == RecorderPhase.PAUSED
        val text = buildString {
            append(elapsed)
            if (paused) append(" · ").append(getString(R.string.recorder_paused))
            else if (bpm != null) append(" · ").append(getString(R.string.recorder_notification_bpm, bpm))
        }
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val b = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .setContentTitle(getString(R.string.recorder_notification_title))
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(open)
        if (session != null && session.phase != RecorderPhase.STOPPED) {
            b.addAction(0, getString(if (paused) R.string.recorder_resume else R.string.recorder_pause), actionIntent(if (paused) ACTION_RESUME else ACTION_PAUSE))
            b.addAction(0, getString(R.string.recorder_stop), actionIntent(ACTION_STOP))
        }
        return b.build()
    }

    private fun actionIntent(action: String): PendingIntent =
        PendingIntent.getService(this, action.hashCode(), intentFor(this, action), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    companion object {
        const val ACTION_START = "com.apex.athlete.recorder.START"
        const val ACTION_PAUSE = "com.apex.athlete.recorder.PAUSE"
        const val ACTION_RESUME = "com.apex.athlete.recorder.RESUME"
        const val ACTION_STOP = "com.apex.athlete.recorder.STOP"

        /** Re-attaches the service to a persisted session; unknown actions behave like a sticky restart. */
        const val ACTION_ENSURE = "com.apex.athlete.recorder.ENSURE"
        private const val CHANNEL_ID = "recorder"
        private const val NOTIFICATION_ID = 4101

        fun intentFor(context: Context, action: String): Intent =
            Intent(context, RecorderService::class.java).setAction(action)

        /** Sends [action] from the foreground UI. Uses startForegroundService so the 5 s rule applies to the service. */
        fun send(context: Context, action: String) {
            context.startForegroundService(intentFor(context, action))
        }
    }
}
