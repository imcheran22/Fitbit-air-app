import type { Recap } from '@prisma/client';
import type { RecapStats } from './types';

export interface RecapSummaryDTO {
  id: string;
  kind: 'WEEK' | 'MONTH';
  periodStart: string;
  periodEnd: string;
  line: string;
  personaId: string | null;
  builtAt: string;
  openedAt: string | null;
}

export interface RecapDTO extends RecapSummaryDTO {
  stats: RecapStats;
  sleepGoalMinutes: number;
  lineSource: 'ai' | 'template';
  story: string | null;
  rebuiltAt: string | null;
}

const civil = (d: Date) => d.toISOString().slice(0, 10);

export function toRecapSummaryDTO(r: Recap): RecapSummaryDTO {
  return {
    id: r.id,
    kind: r.kind,
    periodStart: civil(r.periodStart),
    periodEnd: civil(r.periodEnd),
    line: r.line ?? '',
    personaId: r.personaId,
    builtAt: r.builtAt.toISOString(),
    openedAt: r.openedAt ? r.openedAt.toISOString() : null,
  };
}

export function toRecapDTO(r: Recap): RecapDTO {
  return {
    ...toRecapSummaryDTO(r),
    stats: (r.stats ?? { nightsWithData: 0 }) as unknown as RecapStats,
    sleepGoalMinutes: r.sleepGoalMinutes,
    lineSource: r.lineSource === 'AI' ? 'ai' : 'template',
    story: r.story,
    rebuiltAt: r.rebuiltAt ? r.rebuiltAt.toISOString() : null,
  };
}
