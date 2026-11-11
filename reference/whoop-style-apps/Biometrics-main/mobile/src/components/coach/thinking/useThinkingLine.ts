import { useEffect, useState } from 'react';
import { CHARACTERS } from '../../characters/registry';
import type { CharacterId } from '../../characters/types';

export const LINE_MS = 2400;

// The coach's personality line for the thinking text (spec §5), moving to the
// next of its three every 2.4 s. Paused holds the current line.
export function useThinkingLine(id: CharacterId, paused: boolean): { line: string; index: number } {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (paused) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % 3), LINE_MS);
    return () => clearInterval(timer);
  }, [paused]);
  return { line: CHARACTERS[id].thinkingLines[index]!, index };
}
