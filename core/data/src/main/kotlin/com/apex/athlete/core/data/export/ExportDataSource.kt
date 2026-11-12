package com.apex.athlete.core.data.export

/**
 * Read access to one store for the exporter, as batches of already-converted rows. The Room
 * implementation is [RoomExportDataSource]; tests use in-memory fakes.
 */
interface ExportDataSource {
    /** True for the Demo store. The exporter refuses it. */
    val isDemo: Boolean

    suspend fun daily(emit: suspend (List<DailyRow>) -> Unit)
    suspend fun heartRateMinutes(emit: suspend (List<HeartRateMinuteRow>) -> Unit)
    suspend fun samples(emit: suspend (List<SampleRow>) -> Unit)
    suspend fun sleepSessions(emit: suspend (List<SleepRow>) -> Unit)
    suspend fun workouts(emit: suspend (List<WorkoutRow>) -> Unit)
}
