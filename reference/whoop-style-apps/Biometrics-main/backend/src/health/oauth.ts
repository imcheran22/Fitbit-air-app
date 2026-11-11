import fetch from 'node-fetch';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
].join(' ');

export interface HealthTokenResponse {
  accessToken: string;
  // Google returns a refresh_token on the initial authorization_code exchange
  // but not on an ordinary refresh_token grant, so this is genuinely absent
  // most of the time. Declared as `string | undefined` explicitly because
  // exactOptionalPropertyTypes distinguishes "absent" from "present but
  // undefined", and requestToken assigns the raw (possibly undefined) value.
  refreshToken?: string | undefined;
  expiresIn: number;
}

function config() {
  const clientId = process.env.GOOGLE_HEALTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_HEALTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_HEALTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google Health OAuth env vars are not fully configured');
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = config();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

interface GoogleTokenApiResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function requestToken(body: URLSearchParams): Promise<HealthTokenResponse> {
  const { clientId, clientSecret } = config();
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    // The status and Google's OAuth error code let callers tell a revoked grant
    // (invalid_grant) from Google being unavailable or the app misconfigured.
    let oauthError: string | undefined;
    try {
      oauthError = (JSON.parse(errorBody) as { error?: string }).error;
    } catch {
      oauthError = undefined;
    }
    throw Object.assign(new Error(`Google token endpoint returned ${res.status}: ${errorBody}`), {
      status: res.status,
      oauthError,
    });
  }

  const json = (await res.json()) as GoogleTokenApiResponse;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
  };
}

export async function exchangeCodeForTokens(code: string): Promise<HealthTokenResponse> {
  const { redirectUri } = config();
  return requestToken(
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  );
}

export async function refreshHealthTokens(refreshToken: string): Promise<HealthTokenResponse> {
  return requestToken(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }));
}

/**
 * Revokes a grant at Google (account deletion). Revoking the refresh token also
 * invalidates the access tokens minted from it. The error carries only the HTTP
 * status: the token is in the request body and must never reach a log.
 */
export async function revokeHealthToken(refreshToken: string): Promise<void> {
  const res = await fetch(REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: refreshToken }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Google token revocation returned ${res.status}`);
  }
}
