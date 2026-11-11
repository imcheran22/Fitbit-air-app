// Coach-originated pushes (the legacy digest, insights, any future coach kind). Push tokens are
// app-level since the recap (spec 2026-10-04 §2), so turning the coach off no longer removes the
// device: every coach push checks the coach flag and a current consent itself, right here.

import { isCoachEnabled } from './config';
import { hasCurrentConsent } from './consent';
import { PushSender, sendGenericPush } from './push';

export type CoachPushKind = 'weekly_digest' | 'insight';

export async function sendCoachPush(sender: PushSender, userId: string, kind: CoachPushKind): Promise<number> {
  if (!isCoachEnabled() || !(await hasCurrentConsent(userId))) return 0;
  return sendGenericPush(sender, userId, kind);
}
