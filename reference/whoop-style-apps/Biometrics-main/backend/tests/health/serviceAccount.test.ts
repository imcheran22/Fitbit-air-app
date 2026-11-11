import { GoogleAuth } from 'google-auth-library';
import { getServiceAccountToken } from '../../src/health/serviceAccount';

jest.mock('google-auth-library');

describe('getServiceAccountToken', () => {
  it('returns an access token scoped to cloud-platform', async () => {
    const getAccessToken = jest.fn().mockResolvedValue('sa-access-token-123');
    const getClient = jest.fn().mockResolvedValue({ getAccessToken });
    (GoogleAuth as unknown as jest.Mock).mockImplementation(() => ({ getClient }));

    const token = await getServiceAccountToken();

    expect(token).toBe('sa-access-token-123');
    expect(GoogleAuth).toHaveBeenCalledWith({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  });

  it('throws a clear error if the client returns no token', async () => {
    const getAccessToken = jest.fn().mockResolvedValue(null);
    const getClient = jest.fn().mockResolvedValue({ getAccessToken });
    (GoogleAuth as unknown as jest.Mock).mockImplementation(() => ({ getClient }));

    await expect(getServiceAccountToken()).rejects.toThrow('Failed to obtain service account access token');
  });
});
