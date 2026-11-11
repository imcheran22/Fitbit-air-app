// Outbound email for auth flows (verification, password reset, "someone tried
// to sign up with your address"). Resend in production; in development the
// console sender prints the message so the link can be opened from the log.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

class ConsoleEmailSender implements EmailSender {
  constructor(private readonly log: (line: string) => void) {}

  async send(message: EmailMessage): Promise<void> {
    this.log(`[email] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`);
  }
}

class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text }),
    });
    if (!res.ok) {
      // The body is Resend's error description; it never contains our key.
      throw new Error(`Resend rejected the email with ${res.status}: ${await res.text()}`);
    }
  }
}

export function consoleEmailSender(log: (line: string) => void = console.log): EmailSender {
  return new ConsoleEmailSender(log);
}

export function resendEmailSender(opts: { apiKey: string; from: string; fetchImpl?: typeof fetch }): EmailSender {
  return new ResendEmailSender(opts.apiKey, opts.from, opts.fetchImpl ?? fetch);
}

export function defaultEmailSender(env: NodeJS.ProcessEnv = process.env): EmailSender {
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    return resendEmailSender({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM });
  }
  // A production server that silently logs password-reset links would be a
  // security bug, not a fallback.
  if (env.NODE_ENV === 'production') {
    throw new Error('RESEND_API_KEY and EMAIL_FROM must be set in production');
  }
  return consoleEmailSender();
}
