package org.openstrap.app.data

import org.openstrap.app.data.db.HealthDao

/** Release builds ship no sample data. */
object SampleData {
    const val AVAILABLE = false
    suspend fun load(dao: HealthDao) = Unit
}
