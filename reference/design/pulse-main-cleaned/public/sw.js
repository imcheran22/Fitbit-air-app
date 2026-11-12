// Pulse service worker. Deliberately small: the build's static files and the offline page, the last copy of each
// page this device opened (shown only when the network is down, cleared on sign-out), and Web Push.
// One static cache per build: the page registers /sw.js?v=<build id>, so each deploy installs a new worker whose
// activate step deletes the previous build's cache. Without this, every deploy's hashed files piled up forever.
const CACHE = `pulse-static-${new URL(self.location).searchParams.get("v") || "0"}`
const PAGES = "pulse-pages-v1"
const OFFLINE = "/offline.html"
// ponytail: keeps the most recently stored pages by insertion order, not by last visit; enough for a few days of screens.
const MAX_PAGES = 30

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/icons/icon-192.png"])))
})

// A new worker waits until the page says so (the "New version" toast), so a reload never swaps code mid-use.
self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting()
})

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE && k !== PAGES) await caches.delete(k)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener("fetch", (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (url.origin !== location.origin) return
  // Pages: always the network. Offline, the copy this device last loaded (the page says it is offline), else the
  // offline page. Landing on /login (signing out, an ended session) drops every copy: the next person to sign in on
  // this device must never see them. The sign-out POST is a navigation too, so it is checked before the GET filter.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (new URL(res.url).pathname === "/login") e.waitUntil(caches.delete(PAGES))
          else if (req.method === "GET" && res.ok && !res.redirected) e.waitUntil(keepPage(req, res.clone()))
          return res
        })
        .catch(async () => (req.method === "GET" && (await caches.match(req, { cacheName: PAGES }))) || caches.match(OFFLINE)),
    )
    return
  }
  if (req.method !== "GET") return
  // Hashed build files never change: serve from cache, fill it on first use (fonts live here too).
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
  }
})

async function keepPage(req, res) {
  const c = await caches.open(PAGES)
  await c.put(req, res)
  const keys = await c.keys()
  for (const k of keys.slice(0, -MAX_PAGES)) await c.delete(k)
}

// The app icon's badge counts the notifications still in the tray; opening the app clears it (AppLifecycle).
async function badge() {
  if (!self.navigator.setAppBadge) return
  const n = (await self.registration.getNotifications()).length
  await (n ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge()).catch(() => {})
}

self.addEventListener("push", (e) => {
  let d = {}
  try {
    d = e.data ? e.data.json() : {}
  } catch {}
  e.waitUntil(
    self.registration
      .showNotification(d.title || "Pulse", {
        body: d.body || "",
        tag: d.tag,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url: d.url || "/" },
      })
      .then(badge),
  )
})

self.addEventListener("notificationclose", (e) => e.waitUntil(badge()))

self.addEventListener("notificationclick", (e) => {
  e.notification.close()
  e.waitUntil(badge())
  const url = new URL(e.notification.data?.url || "/", location.origin).href
  e.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      const open = all.find((c) => new URL(c.url).origin === location.origin)
      if (open) {
        await open.focus()
        if ("navigate" in open) await open.navigate(url)
      } else await self.clients.openWindow(url)
    })(),
  )
})
