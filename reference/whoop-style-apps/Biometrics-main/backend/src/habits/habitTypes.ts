import { randomBytes } from 'crypto';
import { prisma } from '../db/client';
import { BUILT_IN_HABIT_TYPES, HabitTypeConfig } from './config';

/** Built-ins first, then this user's custom types in creation order. */
export async function listHabitTypes(userId: string): Promise<HabitTypeConfig[]> {
  const custom = await prisma.habitType.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  return [
    ...BUILT_IN_HABIT_TYPES,
    ...custom.map((c) => ({
      type: c.type,
      label: c.label,
      unit: c.unit,
      exposureThreshold: c.exposureThreshold,
      builtIn: false,
      createdAt: c.createdAt,
    })),
  ];
}

/**
 * A stable id for a new custom type, generated once and stored. It carries a
 * readable slug for debugging but is never re-derived from the label, so a
 * future label edit cannot orphan the logs that reference it. The random
 * suffix keeps it from colliding with a built-in id or another custom type.
 */
export function newCustomTypeId(label: string): string {
  const slug = label
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 16);
  return `CUSTOM_${slug || 'HABIT'}_${randomBytes(3).toString('hex').toUpperCase()}`;
}
