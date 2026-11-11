// The cells of a month grid (spec §3.7): Monday first, leading blanks, no trailing padding.
// `month` is YYYY-MM; the Date is built from components, so there is no timezone shift.
export function monthCells(month: string): Array<{ date: string | null }> {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y!, m! - 1, 1);
  const days = new Date(y!, m!, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  return [
    ...Array.from({ length: lead }, () => ({ date: null })),
    ...Array.from({ length: days }, (_, i) => ({ date: `${month}-${String(i + 1).padStart(2, '0')}` })),
  ];
}
