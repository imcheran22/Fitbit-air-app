import { GoogleAuth } from 'google-auth-library';

export async function getServiceAccountToken(): Promise<string> {
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token) {
    throw new Error('Failed to obtain service account access token');
  }
  return typeof token === 'string' ? token : (token as { token: string }).token;
}
