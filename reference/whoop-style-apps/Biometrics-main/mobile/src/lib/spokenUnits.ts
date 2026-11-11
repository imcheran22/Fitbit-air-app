const plural = (n: string, unit: string) => `${n} ${unit}${n === '1' ? '' : 's'}`;

// A server display ("1h 5m", "52.3 ms", "61 bpm", "8%") in words a screen
// reader says correctly: "1 hour 5 minutes", "52.3 milliseconds",
// "61 beats per minute", "8 percent". Anything else is returned unchanged.
export function spokenUnits(text: string): string {
  return text
    .replace(/\b(\d+)h\b/g, (_, n: string) => plural(n, 'hour'))
    .replace(/\b(\d+)m\b/g, (_, n: string) => plural(n, 'minute'))
    .replace(/\bbpm\b/g, 'beats per minute')
    .replace(/\bms\b/g, 'milliseconds')
    .replace(/\s*%/g, ' percent');
}
