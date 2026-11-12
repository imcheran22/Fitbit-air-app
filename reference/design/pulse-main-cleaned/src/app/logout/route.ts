import { getAuth } from "@/server/auth";

/**
 * Sign out: ends the session and clears its cookie. The Google grant stays, so sync keeps running. A cross-site POST
 * carries no session (the cookie is SameSite=Lax), so it signs out nobody. The redirect is relative: behind a tunnel
 * request.url is the container's own address (http://0.0.0.0:3000), not the host the browser used.
 */
export async function POST(request: Request) {
  const out = await getAuth()
    .api.signOut({ headers: request.headers, asResponse: true })
    .catch(() => null);
  const res = new Response(null, { status: 303, headers: { Location: "/login" } });
  for (const c of out?.headers.getSetCookie() ?? []) res.headers.append("set-cookie", c);
  return res;
}
