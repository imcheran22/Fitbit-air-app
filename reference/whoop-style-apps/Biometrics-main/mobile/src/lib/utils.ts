import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { TYPE_TOKENS } from '../theme';

// tailwind-merge only knows Tailwind's stock scales. Unregistered, the type
// tokens in tailwind.config.js read as text *colours*, so
// cn('text-caption', 'text-muted-foreground') would silently drop the size.
// Keep these lists in step with the fontSize/fontFamily/borderRadius keys there.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...TYPE_TOKENS] }],
      'font-family': [{ font: ['sans', 'pixel'] }],
      rounded: [{ rounded: ['tile', 'card'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 'rgb(r, g, b)' -> 'rgba(r, g, b, a)', for tinting a surface with a token
// colour (COLORS values are always rgb()).
export function withAlpha(color: string, alpha: number): string {
  const match = color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!match) return color;
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
}

// 'rgb(r, g, b)' moved `amount` (0 to 1) of the way to white: the lit top edge
// of a gradient fill in a token colour.
export function mixWithWhite(color: string, amount: number): string {
  const match = color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!match) return color;
  const mix = (v: string) => Math.round(Number(v) + (255 - Number(v)) * amount);
  return `rgb(${mix(match[1]!)}, ${mix(match[2]!)}, ${mix(match[3]!)})`;
}
