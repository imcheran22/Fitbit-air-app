package org.openstrap.app.widget

import android.annotation.SuppressLint
import android.content.Context
import android.os.HandlerThread
import androidx.glance.session.SessionWorker
import androidx.work.ListenableWorker
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.android.asCoroutineDispatcher

/**
 * Glance runs every widget session (compose, translate to RemoteViews, hand them to the launcher) on the main
 * thread, about 90 ms a widget on the Fold, so a sync's refresh stuttered the app. This gives its [SessionWorker]
 * one thread of its own instead: one thread, as on main, so sessions never run side by side. Any other worker is
 * left to WorkManager's default factory.
 *
 * [SessionWorker] and its dispatcher argument are Glance internals (restricted to its library group); a Glance
 * update that changes them fails the build here, not at run time.
 */
object WidgetWork : WorkerFactory() {
    private val dispatcher: CoroutineDispatcher by lazy {
        val thread = HandlerThread("widgets").apply { start() }
        android.os.Handler(thread.looper).asCoroutineDispatcher("widgets")
    }

    @SuppressLint("RestrictedApi")
    override fun createWorker(appContext: Context, workerClassName: String, workerParameters: WorkerParameters): ListenableWorker? =
        if (workerClassName == SessionWorker::class.java.name) SessionWorker(appContext, workerParameters, coroutineContext = dispatcher) else null
}
