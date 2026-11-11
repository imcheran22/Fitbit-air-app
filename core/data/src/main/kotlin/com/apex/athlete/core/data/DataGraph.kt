package com.apex.athlete.core.data

import android.content.Context
import com.apex.athlete.core.data.repository.AthleteRepository
import com.apex.athlete.core.data.settings.SettingsStore
import com.apex.athlete.core.data.store.ApexStores
import com.apex.athlete.core.data.sync.TriSourceSyncOrchestrator

/**
 * The long-lived objects of the data layer, built once by the application (`:app`'s container) and
 * shared by screens and WorkManager workers. Workers are created by WorkManager's default factory,
 * so they reach these objects through the [Context] with [dataGraph] instead of constructor
 * injection.
 */
interface DataGraph {
    val settings: SettingsStore
    val stores: ApexStores
    val repository: AthleteRepository

    /** Pulls the live sources (Google Health API, Health Connect) into the real store. */
    val syncOrchestrator: TriSourceSyncOrchestrator
}

/** Implemented by the `Application` class. */
interface DataGraphProvider {
    val dataGraph: DataGraph
}

/** The application's [DataGraph]. Throws if the application does not provide one (a wiring bug). */
fun Context.dataGraph(): DataGraph =
    (applicationContext as? DataGraphProvider)?.dataGraph
        ?: error("The Application class must implement DataGraphProvider")
