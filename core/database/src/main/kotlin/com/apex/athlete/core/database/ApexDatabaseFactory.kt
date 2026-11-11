package com.apex.athlete.core.database

import android.content.Context
import androidx.room.Room
import com.apex.athlete.core.database.security.DatabasePassphraseStore
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory

object ApexDatabaseFactory {

    const val DATABASE_NAME = "apex.db"

    /**
     * Opens (or creates) the on-device database, encrypted with SQLCipher (AES-256).
     * The passphrase is generated on first run and kept wrapped by a hardware-backed
     * Android Keystore key; see [DatabasePassphraseStore].
     *
     * SQLCipher also ships its own recent SQLite build, which the DAOs rely on for window
     * functions regardless of the Android version on the phone.
     */
    fun create(context: Context): ApexDatabase {
        val appContext = context.applicationContext
        System.loadLibrary("sqlcipher")
        val passphrase = DatabasePassphraseStore(appContext).getOrCreate()
        return Room.databaseBuilder(appContext, ApexDatabase::class.java, DATABASE_NAME)
            .openHelperFactory(SupportOpenHelperFactory(passphrase))
            .build()
    }

    /**
     * Deletes the database file and the passphrase that protected it. Backs the
     * "delete all my data" control; the wrapped passphrase is useless without the file and
     * vice versa, so both go.
     */
    fun destroy(context: Context) {
        val appContext = context.applicationContext
        appContext.deleteDatabase(DATABASE_NAME)
        DatabasePassphraseStore(appContext).clear()
    }
}
