import { isValidWebhookAuthorization } from '../../src/health/webhookVerify';

beforeAll(() => {
  process.env.GOOGLE_HEALTH_WEBHOOK_SECRET = 'Bearer test-webhook-secret-8f3a9c2e1b';
});

describe('isValidWebhookAuthorization', () => {
  it('accepts the exact configured secret', () => {
    expect(isValidWebhookAuthorization('Bearer test-webhook-secret-8f3a9c2e1b')).toBe(true);
  });

  it('rejects a mismatched value', () => {
    expect(isValidWebhookAuthorization('Bearer wrong-secret')).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(isValidWebhookAuthorization(undefined)).toBe(false);
  });
});
