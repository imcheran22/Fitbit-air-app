import { apiFetch, ApiError, setBaseUrl, updateTimezone } from '../../src/api/client';
import { authClient } from '../../src/auth/authClient';

const fetchMock = jest.fn();
(global as any).fetch = fetchMock;
const getCookie = authClient.getCookie as jest.Mock;
const signOut = authClient.signOut as jest.Mock;

beforeEach(() => {
  setBaseUrl('https://api.example.com');
  fetchMock.mockReset();
  getCookie.mockReset().mockResolvedValue('biometrics.session_token=abc');
  signOut.mockClear();
});

describe('apiFetch', () => {
  it('sends the stored session cookie and never sends browser credentials', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: 'ok' }) });
    await expect(apiFetch('/me/biometrics')).resolves.toEqual({ data: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/me/biometrics',
      expect.objectContaining({ credentials: 'omit', headers: expect.objectContaining({ Cookie: 'biometrics.session_token=abc' }) }),
    );
  });

  it('resolves to undefined for a 204', async () => {
    const json = jest.fn();
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, json });
    await expect(apiFetch('/x', { method: 'DELETE' })).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });

  it('signs out on a 401 and throws an ApiError', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Invalid or expired token' }) });
    const err = await apiFetch('/me/scores').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('does not sign out a newer session when a request made with an older cookie comes back 401', async () => {
    getCookie.mockResolvedValueOnce('biometrics.session_token=old').mockResolvedValueOnce('biometrics.session_token=new');
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    await apiFetch('/me/scores').catch(() => undefined);
    expect(signOut).not.toHaveBeenCalled();
  });

  it.each([500, 503])('never signs out on a %s', async (status) => {
    fetchMock.mockResolvedValueOnce({ ok: false, status, json: async () => ({}) });
    await apiFetch('/me/scores').catch(() => undefined);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('carries the server error code on ApiError', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: 'coach_disabled' }) });
    const err = await apiFetch('/coach').catch((e) => e);
    expect(err.code).toBe('coach_disabled');
  });
});

describe('updateTimezone', () => {
  it('PUTs the zone', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ timezone: 'Europe/Paris' }) });
    await updateTimezone('Europe/Paris');
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
  });
});
