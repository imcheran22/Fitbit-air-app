import type { EmailMessage } from './sender';

export function verificationEmail(to: string, url: string): EmailMessage {
  return {
    to,
    subject: 'Confirm your Biometrics email',
    text: `Open this link on your phone to confirm your email address:\n\n${url}\n\nIf you did not create a Biometrics account, ignore this email.`,
  };
}

export function resetPasswordEmail(to: string, url: string): EmailMessage {
  return {
    to,
    subject: 'Reset your Biometrics password',
    text: `Open this link on your phone to choose a new password:\n\n${url}\n\nIt expires in one hour. If you did not ask for this, ignore this email.`,
  };
}

// Sent instead of a verification email when someone signs up with an address
// that already has an account. The sign-up response itself is identical either
// way, so the form cannot be used to discover which addresses are registered.
export function existingAccountEmail(to: string): EmailMessage {
  return {
    to,
    subject: 'Someone tried to create a Biometrics account with your email',
    text:
      'Someone tried to create a new Biometrics account with this email address, which already has an account.\n\n' +
      'If it was you, sign in instead (use "Forgot password?" if you signed up with Apple or Google and want a password).\n' +
      'If it was not you, you can ignore this email.',
  };
}
