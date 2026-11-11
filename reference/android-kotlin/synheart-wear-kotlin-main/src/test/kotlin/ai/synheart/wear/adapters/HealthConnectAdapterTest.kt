package ai.synheart.wear.adapters

import ai.synheart.wear.models.PermissionType
import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import io.mockk.*
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Unit tests for HealthConnectAdapter
 *
 * Note: These are simplified unit tests. Full integration tests with Health Connect
 * classes require instrumented tests (androidTest) or Robolectric.
 *
 * Tests cover:
 * - Adapter initialization
 * - Availability checking
 * - Permission mapping
 * - Basic adapter contract
 */
class HealthConnectAdapterTest {

    private lateinit var context: Context
    private lateinit var adapter: HealthConnectAdapter

    @Before
    fun setup() {
        MockKAnnotations.init(this)
        context = mockk(relaxed = true)
        adapter = HealthConnectAdapter(context)
    }

    @After
    fun tearDown() {
        unmockkAll()
    }

    @Test
    fun `test adapter ID is correct`() {
        // Then
        assertEquals("health_connect", adapter.id)
    }

    @Test
    fun `test getHealthConnectPermissions returns correct permissions for HEART_RATE`() {
        // When
        val permissions = adapter.getHealthConnectPermissions(
            setOf(PermissionType.HEART_RATE)
        )
        
        // Then
        assertTrue(permissions.isNotEmpty())
        assertTrue(permissions.any { it.contains("HEART_RATE") })
    }

    @Test
    fun `test getHealthConnectPermissions returns multiple permissions`() {
        // When
        val permissions = adapter.getHealthConnectPermissions(
            setOf(
                PermissionType.HEART_RATE,
                PermissionType.HRV,
                PermissionType.STEPS
            )
        )
        
        // Then
        assertTrue(permissions.size >= 3)
        assertTrue(permissions.any { it.contains("HEART_RATE") })
        assertTrue(permissions.any { it.contains("HEART_RATE_VARIABILITY") })
        assertTrue(permissions.any { it.contains("STEPS") })
    }

    @Test
    fun `test getHealthConnectPermissions for all permission types`() {
        // When
        val allPermissions = adapter.getHealthConnectPermissions(
            setOf(
                PermissionType.HEART_RATE,
                PermissionType.HRV,
                PermissionType.STEPS,
                PermissionType.CALORIES,
                PermissionType.DISTANCE,
                PermissionType.EXERCISE,
                PermissionType.SLEEP,
                PermissionType.STRESS
            )
        )
        
        // Then
        assertTrue(allPermissions.size >= 8)
    }

    // Note: Tests for getAvailabilityStatus(), getSdkStatus(), and isAvailable() 
    // require instrumented tests since HealthConnectClient.getSdkStatus() is a static
    // method on a final class that can't be easily mocked in unit tests.
    // These methods should be tested in androidTest with a real device/emulator.
}

/**
 * Note on Integration Tests:
 * 
 * Full Health Connect integration tests require either:
 * 1. Instrumented tests (androidTest directory) that run on a device/emulator
 * 2. Robolectric for running Android code in unit tests
 * 
 * These unit tests cover the testable logic without requiring the Android runtime.
 * 
 * For complete testing, create instrumented tests that:
 * - Initialize Health Connect client
 * - Request permissions
 * - Read actual health data
 * - Test aggregation queries
 * - Test error handling with real HC exceptions
 */

