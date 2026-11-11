# Health Connect to Webhook

An Android app that forwards health data from Google Fit, Samsung Health, Fitbit,
and other apps to your webhooks or local tools via Health Connect.

<table role="presentation" border="0" cellspacing="0" cellpadding="0">
  <tr>
    <td valign="middle"><a href="https://play.google.com/store/apps/details?id=com.hcwebhook.app"><img src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png" alt="Get it on Google Play" height="90"></a></td>
    <td valign="middle">&nbsp;&nbsp;</td>
    <td valign="middle"><a href="https://apps.apple.com/app/health-webhook/id6763619597"><img src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83" alt="Download on the App Store" height="60"></a></td>
  </tr>
</table>

**Get it from the [Google Play Store](https://play.google.com/store/apps/details?id=com.hcwebhook.app) or the [App Store](https://apps.apple.com/app/health-webhook/id6763619597).**

![HC Webhook](image.png)

## How it works

1. Your health apps sync to **Health Connect**, which aggregates them into one API.
2. **HC Webhook** reads that data on an interval, on a schedule, or on demand.
3. It `POST`s the data to your webhook URLs (JSON or Protobuf/gRPC) and can serve
   realtime JSON over your local network.
4. Your services, agents, or automation tools receive it.

## Screenshots

| Home | Data Types | Webhook URLs | Logs |
| :--: | :--: | :--: | :--: |
| <img src="screenshots/1.png" width="200" alt="Home"> | <img src="screenshots/2.png" width="200" alt="Data Types"> | <img src="screenshots/3.png" width="200" alt="Webhook URLs"> | <img src="screenshots/4.png" width="200" alt="Logs"> |

## Features

Interval or scheduled sync · 31 health data types · multiple webhooks · JSON or
Protobuf/gRPC delivery · local HTTP server · webhook logs · settings
backup/restore · 10 languages. Full list, supported apps, and data types:
**[docs/features.md](docs/features.md)**.

## Install

### Stable (recommended)

Store builds — tested releases, long-term support:

<table role="presentation" border="0" cellspacing="0" cellpadding="0">
  <tr>
    <td valign="middle"><a href="https://play.google.com/store/apps/details?id=com.hcwebhook.app"><img src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png" alt="Get it on Google Play" height="90"></a></td>
    <td valign="middle">&nbsp;&nbsp;</td>
    <td valign="middle"><a href="https://apps.apple.com/app/health-webhook/id6763619597"><img src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83" alt="Download on the App Store" height="60"></a></td>
  </tr>
</table>

### Beta (rolling release)

Android APKs straight from GitHub Releases via
[Obtainium](https://github.com/ImranR98/Obtainium) — newest features first, more
churn. Add app URL: `https://github.com/mcnaveen/health-connect-webhook`.

## Requirements

- Android 8.0 (API 26) or higher
- Google Health Connect installed and set up
- Internet connection for webhook delivery

## Documentation

| Doc | Covers |
| --- | --- |
| [docs/features.md](docs/features.md) | Full feature list, supported apps, languages, data types |
| [docs/usage.md](docs/usage.md) | Setup, sync modes, local server, feedback, limitations |
| [docs/api-reference.md](docs/api-reference.md) | Payload schema, webhook / gRPC delivery, local HTTP server |
| [docs/webhook.md](docs/webhook.md) | Full field tables, units, examples |
| [docs/local-http.md](docs/local-http.md) | Local HTTP `GET` API |
| [docs/building.md](docs/building.md) | Build, project structure, architecture, contributing |

## Privacy

Health data stays on your device until sent to your configured webhooks. Nothing
goes to third parties. You control which data types sync and where. Revoke
permissions any time in Android settings.

## License

[AGPL-3.0-only](https://www.gnu.org/licenses/agpl-3.0.html) — see [LICENSE](LICENSE).
Commercial redistribution on the App Store or Google Play requires a separate
commercial license; see [LICENSE.ADDENDUM](LICENSE.ADDENDUM).

## Support

- [Open an issue](https://github.com/mcnaveen/health-connect-webhook/issues)
- In-app: **About** → **Provide Feedback**
- Feature board: [hc-webhook.feedbackjar.com](https://hc-webhook.feedbackjar.com/)

## Acknowledgments

Built with [Health Connect](https://developer.android.com/guide/health-and-fitness/health-connect),
[Jetpack Compose](https://developer.android.com/jetpack/compose), and
[WorkManager](https://developer.android.com/topic/libraries/architecture/workmanager).
