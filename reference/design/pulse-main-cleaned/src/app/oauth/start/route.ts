import type { NextRequest } from "next/server";
import { requestUser } from "@/server/auth";
import { getConfig } from "@/server/config";
import { getDb } from "@/server/db";
import { appOrigin, authUrl, createState, hasGrant, missingScopes, redirectUri } from "@/server/sources/google/oauth";

/**
 * Connect Google: redirects to consent. Needs a Pulse session (the account signs in with its own password; Google
 * only feeds the data); the state is bound to that user. `?switch=1` always shows the account chooser and consent,
 * to connect a different account. 404 on a demo instance (`google` is null unless DATA_SOURCE=google).
 */
export async function GET(request: NextRequest) {
  const { google } = getConfig();
  if (!google) return new Response("Not found", { status: 404 });
  const origin = appOrigin(request, google.appUrl);
  const user = await requestUser(request);
  if (!user) return Response.redirect(`${origin}/login`, 302);
  const db = getDb();
  const [grant, missing] = await Promise.all([hasGrant(db, user.userId), missingScopes(db, user.userId)]);
  const url = authUrl({
    clientId: google.clientId,
    redirectUri: redirectUri(origin),
    state: createState(user.userId),
    // A grant missing a scope Pulse now asks for (the 2026-10 write scopes) goes through consent again: only
    // that returns a refresh token for the new scope set, and the scope list stored with it. So does a switch,
    // since a new account has no grant yet.
    prompt: !request.nextUrl.searchParams.has("switch") && grant && !missing.length ? "select_account" : "consent",
  });
  return Response.redirect(url, 302);
}
