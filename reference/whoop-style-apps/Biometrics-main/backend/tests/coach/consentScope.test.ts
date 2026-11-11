import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/db/client';
import {
  COACH_CONSENT_VERSION,
  COACH_HOSTED_CONSENT,
  COACH_HOSTED_CONSENT_VERSION,
  consentTextFor,
  COACH_CONSENT,
  grantConsent,
  hasCurrentConsent,
  lockConsent,
  revokeConsent,
  setEngineIfConsented,
} from '../../src/coach/consent';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from './helpers';

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

const engineOf = async (userId: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coachEngine: true } })).coachEngine;

describe('hosted consent text', () => {
  it('is versioned separately from the local consent, and the versions can never collide', () => {
    expect(COACH_HOSTED_CONSENT.version).toBe(COACH_HOSTED_CONSENT_VERSION);
    expect(COACH_HOSTED_CONSENT_VERSION).toBe('hosted-1');
    expect(COACH_HOSTED_CONSENT_VERSION).not.toBe(COACH_CONSENT_VERSION);
  });

  it('carries the spec wording and names what is and is not sent', () => {
    expect(COACH_HOSTED_CONSENT.summary).toBe(
      'Your question and a summary of your recent health numbers are sent to Anthropic to write the answer. ' +
        "Anthropic doesn't use it to train models. You can switch back any time.",
    );
    expect(COACH_HOSTED_CONSENT.dataItems.length).toBeGreaterThanOrEqual(3);
    const items = COACH_HOSTED_CONSENT.dataItems.join(' ');
    expect(items).toMatch(/we never add your name, email, account id/i);
    expect(items).toMatch(/anything you type yourself[^.]*is sent as part of the conversation/i);
    expect(items).not.toMatch(/never sent: your name/i);
  });

  it('consentTextFor picks the text by scope', () => {
    expect(consentTextFor('local')).toBe(COACH_CONSENT);
    expect(consentTextFor('hosted')).toBe(COACH_HOSTED_CONSENT);
  });
});

describe('scoped consent', () => {
  it('a hosted grant does not count as the local consent, nor the other way round', async () => {
    const user = await createUser();
    // Written directly: grantConsent refuses a hosted grant without the local consent.
    await prisma.coachConsent.create({ data: { userId: user.id, version: COACH_HOSTED_CONSENT_VERSION, scope: 'HOSTED' } });
    expect(await hasCurrentConsent(user.id, 'hosted')).toBe(true);
    expect(await hasCurrentConsent(user.id)).toBe(false);

    const other = await createUser();
    await grantConsent(other.id);
    expect(await hasCurrentConsent(other.id)).toBe(true);
    expect(await hasCurrentConsent(other.id, 'hosted')).toBe(false);
  });

  it('a newer hosted row never hides the current local consent (the old latest-row-wins read did)', async () => {
    const user = await createUser();
    await prisma.coachConsent.create({
      data: { userId: user.id, version: COACH_CONSENT_VERSION, consentedAt: new Date(Date.now() - 60_000) },
    });
    await prisma.coachConsent.create({ data: { userId: user.id, version: COACH_HOSTED_CONSENT_VERSION, scope: 'HOSTED' } });
    expect(await hasCurrentConsent(user.id)).toBe(true);
    expect(await hasCurrentConsent(user.id, 'hosted')).toBe(true);
  });

  it('a hosted grant without the current local consent adds nothing and reports false', async () => {
    const user = await createUser();
    expect(await grantConsent(user.id, 'hosted')).toBe(false);
    expect(await prisma.coachConsent.count({ where: { userId: user.id } })).toBe(0);

    expect(await grantConsent(user.id)).toBe(true);
    await revokeConsent(user.id);
    expect(await grantConsent(user.id, 'hosted')).toBe(false);
    expect(await hasCurrentConsent(user.id, 'hosted')).toBe(false);
  });

  // Smoke test only: whether the two transactions actually interleave is up to the scheduler, so this
  // can pass without the lock. The deterministic proof is 'grants, revokes and engine changes wait…' below.
  it('smoke: a revoke-all racing a hosted grant never leaves a live hosted row behind', async () => {
    for (let i = 0; i < 5; i++) {
      const user = await createUser();
      await grantConsent(user.id);
      await Promise.all([grantConsent(user.id, 'hosted'), revokeConsent(user.id)]);
      expect(await prisma.coachConsent.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    }
  });

  /** Runs `body` while another transaction holds the lock `take` acquires; releases it afterwards. */
  async function whileLocked(take: (tx: Prisma.TransactionClient) => Promise<unknown>, body: () => Promise<void>) {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let markLocked!: () => void;
    const locked = new Promise<void>((r) => (markLocked = r));
    const holder = prisma.$transaction(
      async (tx) => {
        await take(tx);
        markLocked();
        await gate;
      },
      { timeout: 15_000 },
    );
    await locked;
    try {
      await body();
    } finally {
      release();
      await holder;
    }
  }

  const settledWithin = async (p: Promise<unknown>, ms: number) => {
    let settled = false;
    void p.then(
      () => (settled = true),
      () => (settled = true),
    );
    await new Promise((r) => setTimeout(r, ms));
    return settled;
  };

  it('grants, revokes and engine changes wait for the per-user consent lock', async () => {
    const user = await createUser();
    await grantConsent(user.id);
    const pending: Array<Promise<unknown>> = [];
    await whileLocked(
      (tx) => lockConsent(tx, user.id),
      async () => {
        pending.push(grantConsent(user.id, 'hosted'), revokeConsent(user.id, 'hosted'), setEngineIfConsented(user.id, 'local'));
        for (const p of pending) expect(await settledWithin(p, 150)).toBe(false);
      },
    );
    await Promise.all(pending);
  });

  it("a different user's consent lock does not hold this user up", async () => {
    const [user, other] = [await createUser(), await createUser()];
    await whileLocked(
      (tx) => lockConsent(tx, other.id),
      async () => {
        expect(await settledWithin(revokeConsent(user.id), 1_000)).toBe(true);
      },
    );
  });

  it("the consent lock is apart from the sync job's per-user advisory lock", async () => {
    const user = await createUser();
    await whileLocked(
      (tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`,
      async () => {
        expect(await settledWithin(grantConsent(user.id), 1_000)).toBe(true);
        expect(await settledWithin(revokeConsent(user.id), 1_000)).toBe(true);
      },
    );
  });

  it('setEngineIfConsented writes HOSTED only with both current consents, and LOCAL always', async () => {
    const user = await createUser();
    expect(await setEngineIfConsented(user.id, 'hosted')).toBe('consent_required');
    await grantConsent(user.id);
    expect(await setEngineIfConsented(user.id, 'hosted')).toBe('consent_required');
    await grantConsent(user.id, 'hosted');
    expect(await setEngineIfConsented(user.id, 'hosted')).toBe('ok');
    expect(await engineOf(user.id)).toBe('HOSTED');
    await revokeConsent(user.id);
    expect(await setEngineIfConsented(user.id, 'local')).toBe('ok');
    expect(await engineOf(user.id)).toBe('LOCAL');
    expect(await setEngineIfConsented('no-such-user', 'local')).toBe('user_not_found');
  });

  it('stores the scope and the scope version, and a repeat grant adds no row', async () => {
    const user = await createUser();
    await grantConsent(user.id);
    await grantConsent(user.id, 'hosted');
    await grantConsent(user.id, 'hosted');
    const rows = await prisma.coachConsent.findMany({ where: { userId: user.id, scope: 'HOSTED' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ scope: 'HOSTED', version: COACH_HOSTED_CONSENT_VERSION, revokedAt: null });
  });

  it('a hosted row with a stale version is not current, and re-granting adds a current HOSTED row', async () => {
    const user = await createUser();
    await grantConsent(user.id);
    await prisma.coachConsent.create({
      data: { userId: user.id, scope: 'HOSTED', version: 'hosted-0', consentedAt: new Date(Date.now() - 60_000) },
    });
    expect(await hasCurrentConsent(user.id, 'hosted')).toBe(false);

    await grantConsent(user.id, 'hosted');
    const latest = await prisma.coachConsent.findFirstOrThrow({ where: { userId: user.id }, orderBy: { consentedAt: 'desc' } });
    expect(latest).toMatchObject({ scope: 'HOSTED', version: COACH_HOSTED_CONSENT_VERSION });
  });

  it('revoking hosted keeps the local consent and moves the user back to the local engine', async () => {
    const user = await createUser();
    await grantConsent(user.id);
    await grantConsent(user.id, 'hosted');
    await prisma.user.update({ where: { id: user.id }, data: { coachEngine: 'HOSTED' } });

    await revokeConsent(user.id, 'hosted');

    expect(await hasCurrentConsent(user.id)).toBe(true);
    expect(await hasCurrentConsent(user.id, 'hosted')).toBe(false);
    expect(await engineOf(user.id)).toBe('LOCAL');
  });

  it('revoking everything (the default) revokes both scopes and resets the engine', async () => {
    const user = await createUser();
    await grantConsent(user.id);
    await grantConsent(user.id, 'hosted');
    await prisma.user.update({ where: { id: user.id }, data: { coachEngine: 'HOSTED' } });

    await revokeConsent(user.id);

    expect(await hasCurrentConsent(user.id)).toBe(false);
    expect(await hasCurrentConsent(user.id, 'hosted')).toBe(false);
    expect(await engineOf(user.id)).toBe('LOCAL');
    expect(await prisma.coachConsent.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
  });
});
