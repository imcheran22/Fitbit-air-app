import { consoleEmailSender, resendEmailSender, defaultEmailSender } from '../../src/email/sender';
import { verificationEmail } from '../../src/email/templates';

describe('consoleEmailSender', () => {
  it('logs the recipient, subject and body (links are clickable in dev logs)', async () => {
    const lines: string[] = [];
    await consoleEmailSender((l) => lines.push(l)).send(verificationEmail('a@example.com', 'http://x/verify?token=t'));
    const out = lines.join('\n');
    expect(out).toContain('a@example.com');
    expect(out).toContain('http://x/verify?token=t');
  });
});

describe('resendEmailSender', () => {
  it('POSTs to the Resend API with the key and from address', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    await resendEmailSender({ apiKey: 'rk', from: 'Biometrics <no-reply@x.dev>', fetchImpl }).send({
      to: 'a@example.com', subject: 's', text: 't',
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer rk');
    expect(JSON.parse(init.body)).toEqual({ from: 'Biometrics <no-reply@x.dev>', to: ['a@example.com'], subject: 's', text: 't' });
  });

  it('throws on a non-2xx response, without echoing the API key', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 422, text: async () => 'bad from' });
    const err = await resendEmailSender({ apiKey: 'secret-key', from: 'f@x.dev', fetchImpl })
      .send({ to: 'a@example.com', subject: 's', text: 't' })
      .catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('422');
    expect((err as Error).message).not.toContain('secret-key');
  });
});

describe('defaultEmailSender', () => {
  it('uses Resend when RESEND_API_KEY and EMAIL_FROM are set, console otherwise', () => {
    expect(defaultEmailSender({ RESEND_API_KEY: 'k', EMAIL_FROM: 'f@x.dev' }).constructor.name).toBe('ResendEmailSender');
    expect(defaultEmailSender({}).constructor.name).toBe('ConsoleEmailSender');
  });

  it('refuses to fall back to console in production', () => {
    expect(() => defaultEmailSender({ NODE_ENV: 'production' })).toThrow('RESEND_API_KEY');
  });
});
