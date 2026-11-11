import { cleanLegacyText, LEGACY_DISCLAIMER, LEGACY_REPLY_NOTES } from '../../src/coach/answer/history';

const [REMEMBERED, REMOVED] = LEGACY_REPLY_NOTES;

describe('cleanLegacyText', () => {
  it('removes the disclaimer older builds appended to every reply', () => {
    expect(cleanLegacyText(`Your recovery is 72 today.\n\n${LEGACY_DISCLAIMER}`)).toBe('Your recovery is 72 today.');
  });

  it('removes the memory notes too, wherever they sit', () => {
    expect(cleanLegacyText(`Great, noted.\n\n${REMEMBERED}\n\n${LEGACY_DISCLAIMER}`)).toBe('Great, noted.');
    expect(cleanLegacyText(`Okay.\n\n${REMOVED}\n\n${REMEMBERED}\n\n${LEGACY_DISCLAIMER}`)).toBe('Okay.');
  });

  it('keeps paragraph breaks inside the reply, and leaves clean text alone', () => {
    expect(cleanLegacyText(`First part.\n\nSecond part.\n\n${LEGACY_DISCLAIMER}`)).toBe('First part.\n\nSecond part.');
    expect(cleanLegacyText('Recovery is 26 today.')).toBe('Recovery is 26 today.');
  });

  it('only removes the disclaimer at the end', () => {
    const quoted = `You asked what "${LEGACY_DISCLAIMER}" means. It is a reminder.`;
    expect(cleanLegacyText(quoted)).toBe(quoted);
  });

  it('keeps the exact wording older builds stored', () => {
    expect(LEGACY_DISCLAIMER).toBe('This is a comparison against your own recent readings, not a medical assessment.');
    expect(LEGACY_REPLY_NOTES).toEqual(["I'll remember that — let me know if that's not right.", "Okay — I've removed that from what I remember."]);
  });
});
