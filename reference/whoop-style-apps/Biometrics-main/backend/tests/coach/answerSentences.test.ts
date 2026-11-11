import { sentenceSplitter } from '../../src/coach/answer/sentences';

/** Feeds `chunks` one by one and returns what each push yielded, then end(). */
function run(chunks: string[]) {
  const s = sentenceSplitter();
  const pushes = chunks.map((c) => s.push(c));
  return { pushes, end: s.end(), tail: s.tail() };
}

describe('sentenceSplitter', () => {
  it('yields a sentence only once it is complete, in order', () => {
    const { pushes, end } = run(['You slept 6h', ' 48m. Recovery', ' is 26! Want', ' tips?']);
    expect(pushes).toEqual([[], ['You slept 6h 48m.'], ['Recovery is 26!'], []]);
    expect(end).toEqual(['Want tips?']);
  });

  it('does not split decimals, times with a.m./p.m., e.g. or a line-start list marker', () => {
    const { pushes, end } = run(['HRV is 41.3 ms today. Be in bed by 10 p.m. tonight, e.g. with a book. ', '1. Dim the lights.\n2. Put the phone away.']);
    expect(pushes.flat()).toEqual(['HRV is 41.3 ms today.', 'Be in bed by 10 p.m. tonight, e.g. with a book.', '1. Dim the lights.']);
    expect(end).toEqual(['2. Put the phone away.']);
  });

  it('treats a line break as a sentence end and keeps closing quotes with their sentence', () => {
    const { pushes, end } = run(['A short list\nThen "rest." And ', 'go.']);
    expect(pushes.flat()).toEqual(['A short list', 'Then "rest."']);
    expect(end).toEqual(['And go.']);
  });

  it('stops at the first ``` fence, even split across chunks, and returns the rest as the tail', () => {
    const { pushes, end, tail } = run(['Done. Your recovery is 26\n`', '``card\n{"headline":', '"x"}\n```\n```memory\n{}\n```', ' More text.']);
    expect(pushes.flat()).toEqual(['Done.', 'Your recovery is 26']);
    expect(end).toEqual([]);
    expect(tail).toBe('```card\n{"headline":"x"}\n```\n```memory\n{}\n``` More text.');
  });

  it('holds back a lone backtick pair until it knows whether a fence starts', () => {
    const s = sentenceSplitter();
    expect(s.push('Use the `')).toEqual([]);
    expect(s.push('`')).toEqual([]);
    expect(s.push('` start')).toEqual(['Use the']);
    expect(s.tail()).toBe('``` start');
  });

  it('skips empty sentences and whitespace', () => {
    expect(run(['  \n\n', 'Hi.  ', '\n']).pushes.flat()).toEqual(['Hi.']);
  });

  it('has an empty tail when there is no fence', () => {
    expect(run(['Just talk.']).tail).toBe('');
  });

  it('keeps a decimal split across chunks in one sentence', () => {
    const s = sentenceSplitter();
    expect(s.push('You slept 7.')).toEqual([]);
    expect(s.push('5 hours. Next.')).toEqual(['You slept 7.5 hours.']);
    expect(s.end()).toEqual(['Next.']);
  });

  it('holds a terminator at the end of a chunk until the next chunk confirms it with whitespace', () => {
    const s = sentenceSplitter();
    expect(s.push('Recovery is 26!')).toEqual([]);
    expect(s.push(' Rest today.')).toEqual(['Recovery is 26!']);
    expect(s.end()).toEqual(['Rest today.']);
  });

  it('does not split after vs., Dr., hrs./min. or U.S.', () => {
    expect(run(['Your HRV is 41 vs. 58 usual. Ok']).pushes.flat()).toEqual(['Your HRV is 41 vs. 58 usual.']);
    expect(run(['Ask Dr. Lee about it. Ok']).pushes.flat()).toEqual(['Ask Dr. Lee about it.']);
    expect(run(['Sleep 7 hrs. 30 min. tonight. Ok']).pushes.flat()).toEqual(['Sleep 7 hrs. 30 min. tonight.']);
    expect(run(['In the U.S. adults sleep 7 hours. Ok']).pushes.flat()).toEqual(['In the U.S. adults sleep 7 hours.']);
  });

  it('does not split after an abbreviation that follows an opening bracket', () => {
    const { pushes, end } = run(['Try a habit (e.g. 7.5 hours of sleep). Ok, [i.e. tonight]. Go']);
    expect(pushes.flat()).toEqual(['Try a habit (e.g. 7.5 hours of sleep).', 'Ok, [i.e. tonight].']);
    expect(end).toEqual(['Go']);
  });
});
