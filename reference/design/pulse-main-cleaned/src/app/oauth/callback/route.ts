import { NextResponse, type NextRequest } from "next/server";
import { requestUser } from "@/server/auth";
import { getConfig } from "@/server/config";
import { getDb } from "@/server/db";
import { connectedGoogleEmail, forgetSyncedData, setGoogleAccount } from "@/server/avatar";
import { appOrigin, consumeState, exchangeCode, GoogleError, redirectUri } from "@/server/sources/google/oauth";
import { requestSync } from "@/server/worker";

/**
 * Google's redirect back after Connect Google. Without a Pulse session it goes to /login. A missing, unknown,
 * reused, expired or another user's `state` touches nothing and lands on Settings with `?oauth=expired`. Otherwise
 * lands on Settings with `?oauth=connected` or `?oauth=<code>`.
 */
export async function GET(request: NextRequest) {
  const { google } = getConfig();
  if (!google) return new Response("Not found", { status: 404 });

  const params = request.nextUrl.searchParams;
  const origin = appOrigin(request, google.appUrl);
  const user = await requestUser(request);
  if (!user) return NextResponse.redirect(`${origin}/login`, 302);
  const back = (result: string) => NextResponse.redirect(`${origin}/settings?oauth=${encodeURIComponent(result)}`, 302);
  // Bound to the user who started the connect: closes linking someone else's Google account to this session.
  if (!consumeState(params.get("state"), user.userId)) return back("expired");

  const db = getDb();
  const { userId } = user;
  const code = params.get("code");
  if (!code) return back("access_denied");
  try {
    const previous = await connectedGoogleEmail(db, userId);
    const account = await exchangeCode(db, userId, { google, redirectUri: redirectUri(origin), code });
    // Another Google account than the last one: what the old one synced is cleared, so two accounts never mix.
    if (previous !== null && previous !== account.email) await forgetSyncedData(db, userId);
    await setGoogleAccount(db, userId, account);
    // Start the import now, not at the next timer tick. Fire-and-forget, so the redirect doesn't wait on the sync.
    requestSync({ userId, force: true });
    return back("connected");
  } catch (err) {
    // GoogleError messages hold a status and code only; anything else is logged by name alone.
    console.error(`[oauth] callback failed: ${err instanceof GoogleError ? err.message : (err as Error)?.name}`);
    return back(err instanceof GoogleError ? err.code : "error");
  }
}
