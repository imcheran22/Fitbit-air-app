package com.apex.athlete.core.data.export

import android.content.Context
import androidx.work.WorkManager
import androidx.work.await

/** The `cancelAllWork` collaborator of [DataDeletion]: stops every queued and running job and forgets finished ones. */
suspend fun cancelAllWorkManagerWork(context: Context) {
    val wm = WorkManager.getInstance(context.applicationContext)
    wm.cancelAllWork().await()
    wm.pruneWork().await()
}
