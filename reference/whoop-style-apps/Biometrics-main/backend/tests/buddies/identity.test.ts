import {
  assertHandleHoldSecret, checkDisplayName, checkHandle, containsReserved, displayNamePrefill, handleHash, handleHashSecret, normaliseHandleInput, sanitiseDisplayName,
} from '../../src/buddies/identity';

describe('handles', () => {
  it('strips one leading @, trims and lowercases before validating', () => {
    expect(normaliseHandleInput('  @Sam_01 ')).toBe('sam_01');
    expect(normaliseHandleInput('@@sam')).toBe('@sam');
    expect(checkHandle('@Sam_01')).toEqual({ ok: true, handle: 'sam_01' });
    expect(checkHandle('@@sam')).toEqual({ ok: false, problem: 'characters' });
  });

  it('needs 3-20 of [a-z0-9_]', () => {
    expect(checkHandle('ab')).toEqual({ ok: false, problem: 'length' });
    expect(checkHandle('a'.repeat(21))).toEqual({ ok: false, problem: 'length' });
    expect(checkHandle('a'.repeat(20))).toEqual({ ok: true, handle: 'a'.repeat(20) });
    for (const bad of ['sam-1', 'sam.1', 'säm', 'sam 1', 'sam\u200b1']) expect(checkHandle(bad)).toEqual({ ok: false, problem: 'characters' });
    for (const bad of [undefined, null, 42, {}]) expect(checkHandle(bad).ok).toBe(false);
  });

  it('rejects any handle containing a reserved word, ignoring case and underscores', () => {
    for (const bad of ['Team_Lead', 'biometrics_fan', 'the_admin', 'sup_port', 'staffer', 'mod_er_ator', 'OFFICIAL1']) {
      expect([bad, checkHandle(bad)]).toEqual([bad, { ok: false, problem: 'reserved' }]);
    }
    expect(checkHandle('teal_sam')).toEqual({ ok: true, handle: 'teal_sam' });
  });

  it('rejects look-alike letters (fullwidth, Turkish, Cyrillic) as characters', () => {
    for (const bad of ['\uff53\uff41\uff4d', 'sam\u0131', 'SAM\u0130', '\u0441\u0430m']) {
      expect([bad, checkHandle(bad)]).toEqual([bad, { ok: false, problem: 'characters' }]);
    }
  });
});

describe('display names', () => {
  it('NFC-normalises, removes Cc and Cf characters and newlines, then trims', () => {
    expect(sanitiseDisplayName('  Sa\u0301m  ')).toBe('S\u00e1m');
    expect(sanitiseDisplayName('Sam\u202egnp.exe')).toBe('Samgnp.exe');
    expect(sanitiseDisplayName('S\u200ba\u200dm\ufeff')).toBe('Sam');
    expect(sanitiseDisplayName('Sam\nSmith\r\u2028')).toBe('SamSmith');
    expect(sanitiseDisplayName('\u0007Sam\u0000')).toBe('Sam');
  });

  it('removes line and paragraph separators inside the name, not only at the ends', () => {
    expect(sanitiseDisplayName('Sam\u2028Smith')).toBe('SamSmith');
    expect(sanitiseDisplayName('Sam\u2029Smith')).toBe('SamSmith');
  });

  it('needs 1-30 code points after sanitising and no reserved word (spaces and _ ignored)', () => {
    expect(checkDisplayName('Sam 🌙')).toEqual({ ok: true, displayName: 'Sam 🌙' });
    expect(checkDisplayName(' \u200b ')).toEqual({ ok: false, problem: 'empty' });
    expect(checkDisplayName('🌙'.repeat(30))).toEqual({ ok: true, displayName: '🌙'.repeat(30) });
    expect(checkDisplayName('a'.repeat(31))).toEqual({ ok: false, problem: 'length' });
    for (const bad of ['biometrics fan', 'the admin', 'Team Lead', 'Sup port', 'MODERATOR']) expect(checkDisplayName(bad)).toEqual({ ok: false, problem: 'reserved' });
    expect(checkDisplayName(7)).toEqual({ ok: false, problem: 'empty' });
    // A lone surrogate cannot be stored (Postgres refuses it): refused before sanitising.
    expect(checkDisplayName(`Sam${String.fromCharCode(0xd800)}`)).toEqual({ ok: false, problem: 'empty' });
    expect(checkDisplayName(`${String.fromCharCode(0xdc00)}Sam`)).toEqual({ ok: false, problem: 'empty' });
  });

  it('removes default-ignorable code points, so they cannot split a reserved word', () => {
    expect(sanitiseDisplayName('ad\u034fmin')).toBe('admin');
    expect(sanitiseDisplayName('ad\ufe0fmin')).toBe('admin');
    expect(sanitiseDisplayName('ad\u3164min')).toBe('admin');
    for (const bad of ['ad\u034fmin', 'ad\ufe0fmin', 'ad\u3164min']) {
      expect([bad, checkDisplayName(bad)]).toEqual([bad, { ok: false, problem: 'reserved' }]);
    }
  });

  it('treats a name with no visible character as empty', () => {
    for (const blank of ['\u3164', '\u2800', '\u2800 \u2800', ' \u034f ']) {
      expect([blank, checkDisplayName(blank)]).toEqual([blank, { ok: false, problem: 'empty' }]);
    }
    expect(checkDisplayName('\u2800Sam')).toEqual({ ok: true, displayName: '\u2800Sam' });
    expect(checkDisplayName('!')).toEqual({ ok: true, displayName: '!' });
  });

  it('containsReserved folds case, spaces and underscores', () => {
    expect(containsReserved('B i o_metrics')).toBe(true);
    expect(containsReserved('Sam')).toBe(false);
  });

  it('containsReserved folds compatibility forms and marks, without changing the stored value', () => {
    expect(containsReserved('\uff21\uff24\uff2d\uff29\uff2e')).toBe(true);
    expect(containsReserved('ADM\u0130N')).toBe(true);
    expect(containsReserved('a\u0301dmin')).toBe(true);
    expect(checkDisplayName('\uff21\uff24\uff2d\uff29\uff2e')).toEqual({ ok: false, problem: 'reserved' });
    expect(checkDisplayName('\uff33\uff41\uff4d')).toEqual({ ok: true, displayName: '\uff33\uff41\uff4d' });
  });

  it('prefills the first word of the name, but not a sign-in fallback', () => {
    expect(displayNamePrefill({ name: 'Sam Rivera', email: 'sam@example.com' })).toBe('Sam');
    expect(displayNamePrefill({ name: 'jordan.k', email: 'jordan.k@example.com' })).toBe('');
    expect(displayNamePrefill({ name: 'Biometrics user', email: '@example.com' })).toBe('');
    expect(displayNamePrefill({ name: '   ', email: 'x@example.com' })).toBe('');
    expect(displayNamePrefill({ name: 'Admin Person', email: 'x@example.com' })).toBe('');
    expect(displayNamePrefill({ name: 'Jordan.K', email: 'jordan.k@example.com' })).toBe('');
    expect(displayNamePrefill({ name: 'jordan', email: 'Jordan@example.com' })).toBe('');
  });
});

describe('handle hold hash', () => {
  it('is a keyed HMAC: deterministic, 64 hex, never the handle, different per handle and per secret', () => {
    const h = handleHash('sam', 's1');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(handleHash('sam', 's1')).toBe(h);
    expect(handleHash('sam2', 's1')).not.toBe(h);
    expect(handleHash('sam', 's2')).not.toBe(h);
    expect(h).not.toContain('sam');
  });

  it('reads HANDLE_HOLD_SECRET; falls back to BETTER_AUTH_SECRET only outside production', () => {
    expect(handleHashSecret({ HANDLE_HOLD_SECRET: 'a', BETTER_AUTH_SECRET: 'b' } as NodeJS.ProcessEnv)).toBe('a');
    expect(handleHashSecret({ BETTER_AUTH_SECRET: 'b' } as NodeJS.ProcessEnv)).toBe('b');
    expect(() => handleHashSecret({} as NodeJS.ProcessEnv)).toThrow('HANDLE_HOLD_SECRET');
    expect(() => handleHashSecret({ NODE_ENV: 'production', BETTER_AUTH_SECRET: 'b' } as NodeJS.ProcessEnv)).toThrow('HANDLE_HOLD_SECRET');
    expect(handleHashSecret({ NODE_ENV: 'production', HANDLE_HOLD_SECRET: 'a' } as NodeJS.ProcessEnv)).toBe('a');
  });

  it('the startup check refuses production without HANDLE_HOLD_SECRET', () => {
    expect(() => assertHandleHoldSecret({ NODE_ENV: 'production', BETTER_AUTH_SECRET: 'b' } as NodeJS.ProcessEnv)).toThrow('HANDLE_HOLD_SECRET');
    expect(() => assertHandleHoldSecret({ NODE_ENV: 'production', HANDLE_HOLD_SECRET: 'a' } as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => assertHandleHoldSecret({ BETTER_AUTH_SECRET: 'b' } as NodeJS.ProcessEnv)).not.toThrow();
  });
});
