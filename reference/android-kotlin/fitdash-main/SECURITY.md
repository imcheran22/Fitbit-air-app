# Security policy

## Reporting a vulnerability

If you find a security problem in fitdash, please report it privately by opening a [GitHub security advisory](https://github.com/mayurrawte/fitdash/security/advisories/new).

For non-sensitive problems, you can [open an issue](https://github.com/mayurrawte/fitdash/issues) instead.

## Verify a release

fitdash has no server and the release APK requests no INTERNET permission, so fitdash itself cannot connect to the internet. You can check this on any release APK:

```
aapt dump permissions fitdash.apk
apksigner verify --print-certs fitdash.apk
```

- The permissions list should contain only Health Connect READ permissions, plus `WRITE_HYDRATION`, `WRITE_HEIGHT` and `WRITE_NUTRITION` (and `app.fitdash.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, which Android adds automatically). There should be no `INTERNET`.
- The signing certificate SHA-256 should be:

```
15:9A:A2:14:AC:84:59:08:E6:D4:30:90:2D:50:D4:FA:85:AA:9C:E1:92:21:E7:9C:E7:3A:83:CA:B5:9E:55:72
```

Plain hex: `159aa214ac845908e6d430902d50d4fa85aa9ce19221e79ce73a83cab59e5572`

You can also read [`app/src/main/AndroidManifest.xml`](app/src/main/AndroidManifest.xml) or build the app yourself with `./gradlew :app:assembleRelease`. Release APKs are built and signed by GitHub Actions from the public source ([`release.yml`](.github/workflows/release.yml)).

See the [privacy policy](https://mayurrawte.is-a.dev/fitdash/privacy.html) for what the app reads and shares.
