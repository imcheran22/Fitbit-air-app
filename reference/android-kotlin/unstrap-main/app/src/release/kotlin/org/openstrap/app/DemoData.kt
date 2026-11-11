package org.openstrap.app

import org.openstrap.app.data.db.HealthDao

/** Sample data exists only in debug builds. */
object DemoData {
    @Suppress("UNUSED_PARAMETER")
    suspend fun fill(dao: HealthDao) = Unit
}
