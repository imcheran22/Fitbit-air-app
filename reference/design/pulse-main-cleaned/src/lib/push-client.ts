// Browser side of Web Push: ask permission, subscribe through the service worker, tell the server (/push).

/** Push needs a service worker and PushManager; on iOS only an installed (Home Screen) app has them. */
export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window

const key = (b64: string) => {
  const raw = atob(b64.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64.length / 4) * 4, "="))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

const registration = () => navigator.serviceWorker.getRegistration().then((r) => r ?? navigator.serviceWorker.ready)

/** This browser's current subscription, or null. */
export async function currentSubscription() {
  if (!pushSupported()) return null
  return (await registration()).pushManager.getSubscription()
}

/** "granted" and subscribed; "denied" when the user blocked notifications in the browser; "error" for the rest. */
export async function enablePush(publicKey: string): Promise<"ok" | "denied" | "error"> {
  try {
    if ((await Notification.requestPermission()) !== "granted") return "denied"
    const reg = await registration()
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(publicKey) }))
    const res = await fetch("/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) })
    if (!res.ok) {
      await sub.unsubscribe()
      return "error"
    }
    return "ok"
  } catch {
    return "error"
  }
}

/** Unsubscribes this browser and tells the server. Best effort: a failed call leaves a dead endpoint the server prunes on its next 404 or 410. */
export async function disablePush() {
  const sub = await currentSubscription().catch(() => null)
  if (!sub) return
  await fetch("/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {})
  await sub.unsubscribe().catch(() => {})
}
