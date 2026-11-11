import nock from 'nock';
import { buildAuthorizeUrl, exchangeCodeForTokens, refreshHealthTokens, revokeHealthToken } from '../../src/health/oauth';

beforeAll(() => {
  process.env.GOOGLE_HEALTH_CLIENT_ID = 'client-123.apps.googleusercontent.com';
  process.env.GOOGLE_HEALTH_CLIENT_SECRET = 'secret-456';
  process.env.GOOGLE_HEALTH_REDIRECT_URI = 'https://app.example.com/health/callback';
});

afterEach(() => nock.cleanAll());

describe('buildAuthorizeUrl', () => {
  it('includes client id, redirect uri, the three googlehealth scopes, and state', () => {
    const url = buildAuthorizeUrl('state-abc');
    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url).toContain('client_id=client-123.apps.googleusercontent.com');
    expect(url).toContain(encodeURIComponent('https://app.example.com/health/callback'));
    expect(url).toContain('state=state-abc');
    expect(url).toContain(encodeURIComponent('googlehealth.activity_and_fitness.readonly'));
    expect(url).toContain(encodeURIComponent('googlehealth.health_metrics_and_measurements.readonly'));
    expect(url).toContain(encodeURIComponent('googlehealth.sleep.readonly'));
  });
});

describe('exchangeCodeForTokens', () => {
  it('exchanges an auth code for tokens via Google\'s token endpoint', async () => {
    nock('https://oauth2.googleapis.com')
      .post('/token')
      .reply(200, { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3599 });

    const tokens = await exchangeCodeForTokens('auth-code-1');
    expect(tokens).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 3599 });
  });

  it('includes response body in error when token endpoint returns non-200 status', async () => {
    const errorBody = JSON.stringify({ error: 'invalid_grant', error_description: 'The authorization code is invalid or expired.' });
    nock('https://oauth2.googleapis.com')
      .post('/token')
      .reply(400, errorBody);

    await expect(exchangeCodeForTokens('bad-code')).rejects.toThrow(
      /Google token endpoint returned 400.*invalid_grant.*authorization code is invalid/
    );
  });

  // The refresh paths tell a revoked grant (4xx) from an outage by this status.
  it("carries the token endpoint's HTTP status on the error", async () => {
    nock('https://oauth2.googleapis.com').post('/token').reply(503, 'unavailable');

    await expect(refreshHealthTokens('some-refresh')).rejects.toMatchObject({ status: 503 });
  });

  it("carries Google's OAuth error code on the error", async () => {
    nock('https://oauth2.googleapis.com').post('/token').reply(400, JSON.stringify({ error: 'invalid_grant' }));

    await expect(refreshHealthTokens('revoked-refresh')).rejects.toMatchObject({ status: 400, oauthError: 'invalid_grant' });
  });
});

describe('refreshHealthTokens', () => {
  it('exchanges a refresh token for new tokens', async () => {
    nock('https://oauth2.googleapis.com')
      .post('/token')
      .reply(200, { access_token: 'access-2', expires_in: 3599 });

    const tokens = await refreshHealthTokens('refresh-1');
    expect(tokens.accessToken).toBe('access-2');
  });
});

describe('revokeHealthToken', () => {
  it('POSTs the token, form-encoded, to Google\'s revoke endpoint', async () => {
    let contentType: string | undefined;
    const scope = nock('https://oauth2.googleapis.com')
      .post('/revoke', (body) => body.token === 'refresh/with+odd chars')
      .reply(200, function () {
        contentType = this.req.headers['content-type'] as string | undefined;
        return {};
      });

    await expect(revokeHealthToken('refresh/with+odd chars')).resolves.toBeUndefined();

    expect(scope.isDone()).toBe(true);
    expect(contentType).toBe('application/x-www-form-urlencoded');
  });

  it('throws on a non-2xx answer, naming the status but never the token', async () => {
    nock('https://oauth2.googleapis.com').post('/revoke').reply(400, { error: 'invalid_token' });

    const err = await revokeHealthToken('secret-refresh-token').catch((e: Error) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('400');
    expect((err as Error).message).not.toContain('secret-refresh-token');
  });
});
