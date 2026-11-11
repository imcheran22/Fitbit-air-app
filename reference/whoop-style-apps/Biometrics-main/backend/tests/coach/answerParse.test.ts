import { parseModelOutput } from '../../src/coach/answer/parse';

const CARD = { headline: 'Recovery is low', tiles: [{ fact: 'recovery.today', label: 'Recovery' }], source: 'Today' };

describe('parseModelOutput', () => {
  it('a plain reply has no card and no memory', () => {
    expect(parseModelOutput('  You slept well. Keep it up!  ')).toEqual({ reply: 'You slept well. Keep it up!' });
  });

  it('splits the reply from a ```card block', () => {
    const raw = `Recovery is 26 today.\n\n\`\`\`card\n${JSON.stringify(CARD)}\n\`\`\``;
    expect(parseModelOutput(raw)).toEqual({ reply: 'Recovery is 26 today.', card: CARD });
  });

  it('reads a card and a memory block, in either order', () => {
    const memory = { category: 'SCHEDULE', value: 'Runs at 6am' };
    const raw = `Nice.\n\`\`\`memory\n${JSON.stringify(memory)}\n\`\`\`\n\`\`\`card\n${JSON.stringify(CARD)}\n\`\`\``;
    expect(parseModelOutput(raw)).toEqual({ reply: 'Nice.', card: CARD, memory: [memory] });
  });

  it('accepts a memory array', () => {
    const items = [
      { category: 'SCHEDULE', value: 'Runs at 6am' },
      { category: 'PREFERENCE', value: 'Short answers' },
    ];
    expect(parseModelOutput(`Ok.\n\`\`\`memory\n${JSON.stringify(items)}\n\`\`\``).memory).toEqual(items);
  });

  it('recognises an untagged or ```json block by its shape', () => {
    expect(parseModelOutput(`Hi.\n\`\`\`json\n${JSON.stringify(CARD)}\n\`\`\``).card).toEqual(CARD);
    expect(parseModelOutput(`Hi.\n\`\`\`\n{"category":"SCHEDULE","value":"Runs daily"}\n\`\`\``).memory).toEqual([
      { category: 'SCHEDULE', value: 'Runs daily' },
    ]);
  });

  it('parses an unterminated final block when its JSON is complete (output budget ran out after it)', () => {
    expect(parseModelOutput(`Hi.\n\`\`\`card\n${JSON.stringify(CARD)}\n`).card).toEqual(CARD);
  });

  it('ignores invalid or truncated JSON, and a card that is not an object', () => {
    expect(parseModelOutput('Hi.\n```card\n{"headline": "Rec')).toEqual({ reply: 'Hi.' });
    expect(parseModelOutput('Hi.\n```card\n[1, 2]\n```')).toEqual({ reply: 'Hi.' });
    expect(parseModelOutput('Hi.\n```card\nnot json\n```')).toEqual({ reply: 'Hi.' });
  });

  it('keeps only the first card', () => {
    const second = { ...CARD, headline: 'Second' };
    const raw = `Hi.\n\`\`\`card\n${JSON.stringify(CARD)}\n\`\`\`\n\`\`\`card\n${JSON.stringify(second)}\n\`\`\``;
    expect(parseModelOutput(raw).card).toEqual(CARD);
  });

  it('never puts text from after the first fence into the reply', () => {
    const raw = `Hi.\n\`\`\`card\n${JSON.stringify(CARD)}\n\`\`\`\nTrailing words.`;
    expect(parseModelOutput(raw).reply).toBe('Hi.');
  });
});
