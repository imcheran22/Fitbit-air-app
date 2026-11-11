import type { MemoryCategory, MemoryDTO } from '../api/coach';

// Server limit on a memory's text (spec 6).
export const MEMORY_MAX_LENGTH = 140;

// Also the display order.
export const MEMORY_CATEGORIES: MemoryCategory[] = ['TRAINING_GOAL', 'SCHEDULE', 'PREFERENCE'];

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  TRAINING_GOAL: 'Training goal',
  SCHEDULE: 'Schedule',
  PREFERENCE: 'Preference',
};

export function memoryCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category as MemoryCategory] ?? 'Other';
}

export const PENDING_MEMORY_TEXT = "Not confirmed yet — I'll keep this unless you correct me";

export const MEMORY_ERROR_TEXT = {
  empty: 'Write something for me to remember.',
  tooLong: `Keep it to ${MEMORY_MAX_LENGTH} characters or fewer.`,
  rejected: "I can't remember that. I only keep training goals, your schedule and your preferences.",
  generic: 'That could not be saved. Please try again.',
};

// Client-side check run before a save; null means the text is acceptable.
export function validateMemoryText(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return MEMORY_ERROR_TEXT.empty;
  if (trimmed.length > MEMORY_MAX_LENGTH) return MEMORY_ERROR_TEXT.tooLong;
  return null;
}

// Entries grouped in display order; anything outside the known categories still
// appears (under "Other") so the user can always see and delete it.
export function groupMemories(entries: MemoryDTO[]): { key: string; label: string; entries: MemoryDTO[] }[] {
  const groups = MEMORY_CATEGORIES.map((category) => ({
    key: category as string,
    label: memoryCategoryLabel(category),
    entries: entries.filter((e) => e.category === category),
  }));
  const other = entries.filter((e) => !MEMORY_CATEGORIES.includes(e.category));
  if (other.length > 0) groups.push({ key: 'OTHER', label: 'Other', entries: other });
  return groups.filter((g) => g.entries.length > 0);
}
