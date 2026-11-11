import type { EvalFixture, NegativeFixture } from '../types';
import { cardFixtures } from './card';
import { claimFixtures, claimNegativeFixtures } from './claims';
import { generalFixtures } from './general';
import { hedgedFixtures } from './hedged';
import { memoryFixtures } from './memory';
import { numberFixtures } from './numbers';
import { qualityFixtures, qualityNegativeFixtures } from './quality';
import { safetyFixtures } from './safety';
import { voiceFixtures } from './voice';

/** Every fixture here must pass. */
export const FIXTURES: EvalFixture[] = [
  ...numberFixtures,
  ...hedgedFixtures,
  ...generalFixtures,
  ...cardFixtures,
  ...voiceFixtures,
  ...claimFixtures,
  ...qualityFixtures,
  ...memoryFixtures,
  ...safetyFixtures,
];

/** Every fixture here must FAIL on the check it names (proof the eval catches that class of error). */
export const NEGATIVE_FIXTURES: NegativeFixture[] = [...claimNegativeFixtures, ...qualityNegativeFixtures];
