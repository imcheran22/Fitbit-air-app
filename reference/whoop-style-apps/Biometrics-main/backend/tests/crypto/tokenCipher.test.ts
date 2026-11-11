import { encryptToken, decryptToken } from '../../src/crypto/tokenCipher';

describe('tokenCipher', () => {
  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  it('round-trips a plaintext token', () => {
    const ciphertext = encryptToken('my-secret-access-token');
    expect(ciphertext).not.toContain('my-secret-access-token');
    expect(decryptToken(ciphertext)).toBe('my-secret-access-token');
  });

  it('produces different ciphertext for the same plaintext (random IV)', () => {
    const a = encryptToken('same-value');
    const b = encryptToken('same-value');
    expect(a).not.toBe(b);
  });

  it('throws when the ciphertext has been tampered with', () => {
    const ciphertext = encryptToken('my-secret-access-token');
    const raw = Buffer.from(ciphertext, 'base64');
    raw[raw.length - 1] ^= 0xff; // flip the last byte of the actual ciphertext
    const tampered = raw.toString('base64');
    expect(() => decryptToken(tampered)).toThrow();
  });
});
