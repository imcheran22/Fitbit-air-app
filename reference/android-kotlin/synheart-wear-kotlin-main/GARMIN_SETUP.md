# Garmin Health SDK Integration Guide (Kotlin/Android)

This guide explains how to integrate the Garmin Health SDK with Synheart Wear for real-time health data streaming from Garmin wearables on Android.

## Prerequisites

### 1. Obtain a Garmin Health SDK License

The Garmin Health SDK is **not open source** and requires a commercial license from Garmin.

1. Contact Garmin Health to discuss licensing: https://developer.garmin.com/health-api/overview/
2. You will receive:
   - SDK license key(s) tied to your app's package name
   - Access to the private GitHub repositories containing the SDK

### 2. GitHub Access Token

The Android SDK is distributed via private GitHub repositories. You need a Personal Access Token with the following permissions:

- `read:packages`
- `repo`

Create one at: https://github.com/settings/tokens

---

## Android Setup

### Option 1: Local AAR (Recommended)

1. **Download the SDK**

   Download the AAR from your Garmin Health SDK distribution channel
   (provisioned by Garmin Health Support for licensees).

   Choose either:
   - `companion-sdk` - For standalone apps (no Garmin Connect Mobile required)
   - `standard-sdk` - For apps used alongside Garmin Connect Mobile

2. **Copy to Project**

   ```bash
   # Create the libs directory
   mkdir -p libs

   # Copy and rename the AAR
   cp garmin-health-companion-sdk-X.X.X.aar libs/garmin-health-sdk.aar
   ```

3. **Update build.gradle.kts**

   Add the local AAR dependency to `build.gradle.kts`:

   ```kotlin
   dependencies {
       // Uncomment these lines:
       implementation(files("libs/garmin-health-sdk.aar"))
       implementation("com.google.guava:guava:32.1.3-android")
   }
   ```

### Option 2: Maven/GitHub Packages

1. **Set GitHub Credentials**

   Add to your app's `local.properties`:

   ```properties
   gpr.user=YOUR_GITHUB_USERNAME
   gpr.key=YOUR_GITHUB_TOKEN
   ```

   Or set environment variables:

   ```bash
   export GITHUB_USER=your_username
   export GITHUB_TOKEN=your_token
   ```

2. **Update build.gradle.kts**

   ```kotlin
   // Add the maven repository block in your repositories:
   repositories {
       maven {
           url = uri("<garmin-health-sdk-package-registry-url>")  // supplied by Garmin Health Support
           credentials {
               username = project.findProperty("gpr.user")?.toString()
                   ?: System.getenv("GITHUB_USER") ?: ""
               password = project.findProperty("gpr.key")?.toString()
                   ?: System.getenv("GITHUB_TOKEN") ?: ""
           }
       }
   }

   dependencies {
       // Uncomment one of these:
       implementation("com.garmin.health:companion-sdk:4.4.0")
       // OR
       // implementation("com.garmin.health:standard-sdk:4.4.0")

       // Plus Guava (required by SDK):
       implementation("com.google.guava:guava:32.1.3-android")
   }
   ```

---

## Building with Garmin RTS Support

The real-time streaming (RTS) code lives in a private companion repo and is linked at build time via `make`:

```bash
# Auto-detect companion access and build accordingly
make build

# Or explicitly:
make build-with-garmin     # requires companion repo access
make build-without-garmin  # stub-only (scanning/pairing throw SynheartWearException)
make check-garmin          # verify you have access
make clean-garmin          # remove .garmin/ and symlinks
```

Without the companion, `GarminHealth` methods like `pairDevice()` and `startStreaming()` throw `SynheartWearException`. Cloud-based Garmin data via `GarminProvider` (OAuth + webhooks) works regardless.

---

## Kotlin Usage

Once the native SDK is configured and built with companion support, use `GarminHealth`:

```kotlin
import ai.synheart.wear.adapters.GarminHealth
import ai.synheart.wear.models.*

// Create and initialize GarminHealth
val garmin = GarminHealth(licenseKey = "YOUR_LICENSE_KEY")
garmin.initialize()

// Scan for devices
garmin.startScanning(timeoutSeconds = 30)
garmin.scannedDevicesFlow.collect { devices ->
    for (device in devices) {
        println("Found: ${device.name} (${device.identifier})")
    }
}

// Pair a device
val paired = garmin.pairDevice(scannedDevice)

// Monitor connection state
garmin.connectionStateFlow.collect { event ->
    println("Connection: ${event.state}")
}

// Start real-time streaming
garmin.startStreaming(device = paired)
garmin.realTimeFlow.collect { metrics ->
    println("Heart Rate: ${metrics.getMetric(MetricType.HR)}")
}

// Read historical metrics
val metrics = garmin.readMetrics(
    startTime = startDate,
    endTime = endDate
)

// Wire into SynheartWear: pass the config to the constructor, then
// register the licensed Garmin adapter via setGarminHealth().
val synheart = SynheartWear(
    context = context,
    config = SynheartWearConfig(enabledAdapters = setOf(DeviceAdapter.GARMIN)),
)
synheart.setGarminHealth(garmin)

// Clean up
garmin.dispose()
```

> **Note:** All `GarminHealth` methods are `suspend` functions and must be called from a coroutine scope. Streams are exposed as Kotlin `Flow` types.

---

## SDK Variant Comparison

| Feature | Companion SDK | Standard SDK |
|---------|--------------|--------------|
| Garmin Connect Mobile Required | No | Yes |
| Direct Bluetooth Connection | Yes | No |
| Works Offline | Yes | Yes |
| Real-time Data | Yes | Yes |
| Activity Sync | Via SDK | Via GCM |
| Platform | iOS, Android | Android only |

**Choose Companion SDK** if:
- Your users may not have Garmin Connect Mobile installed
- You need direct Bluetooth communication

**Choose Standard SDK** if:
- Your users will have Garmin Connect Mobile
- You want to leverage GCM's existing device connection

---

## Troubleshooting

### "SDK not available" Error

This means the SDK binary is not linked. Verify:

1. `garmin-health-sdk.aar` exists in `libs/` (Option 1) or the Maven dependency is uncommented (Option 2)
2. The dependency is uncommented in `build.gradle.kts`
3. You've run a clean build (`./gradlew clean build`)

### "License invalid" Error

- Ensure your license key matches your app's package name
- Contact Garmin support if the issue persists

### Bluetooth Permission Errors

Add to your `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

For Android 12+ (API 31+), `BLUETOOTH_CONNECT` and `BLUETOOTH_SCAN` require runtime permission requests.

### Build Errors

**"Unresolved reference: GarminHealth"**:
- The AAR is not found or the dependency is commented out
- Check that the file exists in `libs/` and `build.gradle.kts` dependency is uncommented

**"Garmin Health SDK native binary not linked"**:
- The stub is active instead of the real implementation
- Run `make build-with-garmin` to link the companion code

---

## Support

- **Garmin SDK Issues**: Contact Garmin Health SDK Support
- **SDK Issues**: https://github.com/synheart-ai/synheart-wear-kotlin/issues
- **SDK Documentation**: Available in the SDK release packages
