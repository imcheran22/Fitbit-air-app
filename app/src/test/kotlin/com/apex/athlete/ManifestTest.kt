package com.apex.athlete

import android.app.Application
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.apex.athlete.core.data.healthconnect.HealthConnectPermissions
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Pins the manifest facts that fail silently or unsafely if they drift (master prompt Alert B.3,
 * invariants 8 and 10). The plain Application is used because the real one builds Keystore-backed stores.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [35], application = Application::class)
class ManifestTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val pm: PackageManager get() = context.packageManager

    private fun requestedPermissions(): Set<String> =
        pm.getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS).requestedPermissions.orEmpty().toSet()

    @Test
    fun rationaleIntentResolvesToMainActivity() {
        val intent = Intent("androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE").setPackage(context.packageName)
        val names = pm.queryIntentActivities(intent, 0).map { it.activityInfo.name }
        assertTrue(names.contains(MainActivity::class.java.name), "resolved: $names")
    }

    @Test
    fun viewPermissionUsageIntentResolvesToTheAlias() {
        val intent = Intent("android.intent.action.VIEW_PERMISSION_USAGE")
            .addCategory("android.intent.category.HEALTH_PERMISSIONS")
            .setPackage(context.packageName)
        val infos = pm.queryIntentActivities(intent, 0).map { it.activityInfo }
        assertTrue(infos.any { it.name.endsWith(".ViewPermissionUsageActivity") }, "resolved: ${infos.map { it.name }}")
    }

    @Test
    fun aliasIsExportedAndGuardedByThePermissionUsagePermission() {
        val alias = pm.getActivityInfo(ComponentName(context.packageName, "com.apex.athlete.ViewPermissionUsageActivity"), 0)
        assertTrue(alias.exported)
        assertEquals("android.permission.START_VIEW_PERMISSION_USAGE", alias.permission)
    }

    @Test
    fun noHealthWritePermissionIsDeclaredAndEveryReadIs() {
        val requested = requestedPermissions()
        val writes = requested.filter { it.startsWith("android.permission.health.WRITE_") }
        assertTrue(writes.isEmpty(), "write permissions: $writes")
        val missing = HealthConnectPermissions.manifestPermissions - requested
        assertTrue(missing.isEmpty(), "missing from manifest: $missing")
        val extraHealth = requested.filter { it.startsWith("android.permission.health.") }.toSet() - HealthConnectPermissions.manifestPermissions
        assertTrue(extraHealth.isEmpty(), "undeclared in HealthConnectPermissions: $extraHealth")
    }

    @Test
    fun allowBackupIsOff() {
        assertEquals(0, context.applicationInfo.flags and ApplicationInfo.FLAG_ALLOW_BACKUP)
    }

    @Test
    fun oauthRedirectActivityIsExportedAndMatchesThePlaceholderScheme() {
        val info = pm.getActivityInfo(ComponentName(context, OAuthRedirectActivity::class.java), 0)
        assertTrue(info.exported)
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("${BuildConfig.OAUTH_REDIRECT_SCHEME}:/oauth2redirect?code=x&state=y"))
            .addCategory(Intent.CATEGORY_BROWSABLE)
            .setPackage(context.packageName)
        val resolved = pm.queryIntentActivities(intent, 0).map { it.activityInfo.name }
        assertNotNull(resolved.firstOrNull { it == OAuthRedirectActivity::class.java.name }, "resolved: $resolved")
    }

    @Test
    fun foregroundServiceIsTypedDataSync() {
        val service = pm.getServiceInfo(ComponentName(context.packageName, "androidx.work.impl.foreground.SystemForegroundService"), 0)
        assertEquals(android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC, service.foregroundServiceType)
    }
}
