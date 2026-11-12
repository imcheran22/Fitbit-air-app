package com.apex.athlete

import android.app.Application
import com.apex.athlete.core.data.DataGraph
import com.apex.athlete.core.data.DataGraphProvider
import com.apex.athlete.di.AppContainer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Application class. No analytics, crash-reporting or telemetry SDK is initialised here, by design
 * (master prompt invariant 8).
 *
 * The container is built lazily and thread-safely: WorkManager workers and the UI both reach it,
 * and the first access pays for the Keystore-backed stores. Construction is started on a
 * background thread so the first frame does not wait for it unless the UI needs it immediately.
 */
class ApexAthleteApplication : Application(), DataGraphProvider {

    val container: AppContainer by lazy { AppContainer(this) }

    override val dataGraph: DataGraph get() = container

    override fun onCreate() {
        super.onCreate()
        CoroutineScope(SupervisorJob() + Dispatchers.Default).launch {
            container.startBackgroundWiring()
        }
    }
}
