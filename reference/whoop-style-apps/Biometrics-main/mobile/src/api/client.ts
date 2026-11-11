import { authClient } from '../auth/authClient';

let baseUrl = '';
export function setBaseUrl(url: string): void {
  baseUrl = url;
}

// Carries the HTTP status so callers can tell "nothing there" (404) apart from
// a real failure, plus the server's own `error` code when it sent one: a status
// alone cannot separate two different 404s (coach disabled vs. a conversation
// that has since been retained away). The message format is unchanged.
// `body` is the parsed JSON error body (undefined when there was none), for
// codes that carry more than their name (429's retryAfterSeconds).
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly body: unknown;

  constructor(status: number, message: string, code?: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

// Best effort: the body may be empty, HTML from a proxy, or already consumed.
// A failure to read it just means no body, never a different error.
async function errorBodyOf(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

async function apiErrorFor(res: Response, path: string): Promise<ApiError> {
  const body = await errorBodyOf(res);
  const error = body && typeof body === 'object' ? (body as { error?: unknown }).error : undefined;
  return new ApiError(res.status, `Request to ${path} failed with ${res.status}`, typeof error === 'string' ? error : undefined, body);
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await apiResponse(path, options);
  // 204 No Content (e.g. DELETE) has no body to parse.
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// The authenticated request under apiFetch, returning the Response itself so
// a caller can read the body as a stream. `fetchImpl` lets the coach stream
// use expo/fetch, whose body is a real ReadableStream on iOS and Android.
export async function apiResponse(path: string, options: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const cookie = await authClient.getCookie();
  const res = await fetchImpl(`${baseUrl}${path}`, {
    ...options,
    // The session travels as an explicit Cookie header from SecureStore; the
    // platform cookie jar must not add or override anything.
    credentials: 'omit',
    headers: { ...options.headers, Cookie: cookie },
  });
  if (res.status === 401) {
    // Sessions slide on the server and there is no refresh step: a 401 means
    // the session is gone (revoked, expired, account deleted). Sign out -- which
    // clears the stored cookie and flips useSession() to null -- unless the
    // user has already signed in again since this request started.
    if ((await authClient.getCookie()) === cookie) {
      await authClient.signOut().catch(() => undefined);
    }
    throw await apiErrorFor(res, path);
  }
  if (!res.ok) throw await apiErrorFor(res, path);
  return res;
}

// Permanently deletes the signed-in account and everything stored for it. The
// server answers 204 on success, 400 if the confirmation word is wrong and 401
// if the session is not valid. Once it succeeds the session is dead, so the
// caller must clear it locally (clearSession) rather than sign out through the
// server.
export function deleteAccount(): Promise<void> {
  return apiFetch<void>('/me', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: 'DELETE' }),
  });
}

// Tells the backend which IANA zone to use for civil-date bucketing (sleep
// rollups, habit days). A 400 from the server means the zone name was invalid.
export function updateTimezone(timezone: string): Promise<{ timezone: string }> {
  return apiFetch<{ timezone: string }>('/me/timezone', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timezone }),
  });
}
