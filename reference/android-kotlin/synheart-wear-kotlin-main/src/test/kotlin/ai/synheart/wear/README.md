# Tests

Two test patterns coexist; pick the right one for what you're verifying.

## 1. MockK + `apiOverride` — fast unit tests

Most existing tests (`WhoopProviderTest`, `FitbitProviderTest`, `OuraProviderTest`, etc.) use [MockK](https://mockk.io) to stub the `WearServiceAPI` Retrofit interface and inject it through the provider's internal `apiOverride` constructor. Fast, deterministic, no networking.

Use this pattern for:
- Provider state transitions (`isConnected()` before/after `connectWithCode`)
- OAuth flow shape (which API method is called, with what arguments)
- Local persistence (what gets written to `SharedPreferences`)
- Error mapping that originates from the `Response<T>` wrapper directly

```kotlin
val mockApi = mockk<WearServiceAPI>()
val provider = WhoopProvider(context, cloudConfig, mockApi)

coEvery { mockApi.handleOAuthCallback(any(), any()) } returns
    Response.success(OAuthCallbackResponse(status = "success", userId = "u-123"))
provider.connectWithCode(code = "c", state = "s", redirectUri = "r")
assertTrue(provider.isConnected())
```

## 2. `MockWebServer` — full-stack integration tests

`WhoopProviderMockServerTest` is the reference. Uses [okhttp3 MockWebServer](https://github.com/square/okhttp/tree/master/mockwebserver) to run an in-process HTTP server that real Retrofit calls go to. This exercises the **complete** path: network → HTTP transport → JSON decode → SDK error mapping.

Use this pattern for:
- Real HTTP-status → `SynheartWearException` mapping (4xx, 5xx, redirects)
- Response-body decode against the actual GSON converter
- Header / auth handling that the interface hides
- Network failures (timeouts, malformed responses, dropped connections)

```kotlin
val server = MockWebServer().apply { start() }
val api = Retrofit.Builder()
    .baseUrl(server.url("/"))
    .addConverterFactory(GsonConverterFactory.create(GsonBuilder().setLenient().create()))
    .build()
    .create(WearServiceAPI::class.java)
val provider = WhoopProvider(context, cloudConfig, api)

server.enqueue(MockResponse().setResponseCode(401))
assertFailsWith<SynheartWearException> { provider.fetchSleep() }
```

Always `server.shutdown()` in `@After`.

## Which to pick

| Question you're answering | Pattern |
|---|---|
| Does provider X call API Y when state is Z? | MockK |
| Does HTTP 401 → expected `SynheartWearException`? | MockWebServer |
| Does provider parse this real JSON shape correctly? | MockWebServer |
| Does the OAuth flow store the right user_id locally? | MockK |
| Does provider survive a connection drop mid-stream? | MockWebServer |

When in doubt: start with MockK for speed. Reach for MockWebServer when you specifically need to verify wire-level behavior.
