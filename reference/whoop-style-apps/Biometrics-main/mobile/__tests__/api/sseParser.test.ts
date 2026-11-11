import { createSseParser, type SseMessage } from '../../src/api/sseParser';

function parseAll(chunks: string[]): SseMessage[] {
  const parser = createSseParser();
  const out: SseMessage[] = [];
  for (const chunk of chunks) out.push(...parser.push(chunk));
  out.push(...parser.end());
  return out;
}

const STREAM =
  'event: status\ndata: {"label":"Looking at your sleep…"}\n\n' +
  'event: text\ndata: {"sentence":"Mostly clear skies."}\n\n' +
  'event: done\ndata: {"messageId":"m1"}\n\n';

const EXPECTED: SseMessage[] = [
  { event: 'status', data: '{"label":"Looking at your sleep…"}' },
  { event: 'text', data: '{"sentence":"Mostly clear skies."}' },
  { event: 'done', data: '{"messageId":"m1"}' },
];

describe('createSseParser', () => {
  it('parses several events from one chunk, in order', () => {
    expect(parseAll([STREAM])).toEqual(EXPECTED);
  });

  it('gives the same events however the bytes are split, down to one character per chunk', () => {
    expect(parseAll(Array.from(STREAM))).toEqual(EXPECTED);
    expect(parseAll([STREAM.slice(0, 17), STREAM.slice(17, 60), STREAM.slice(60)])).toEqual(EXPECTED);
  });

  it('emits nothing until the blank line that ends an event arrives', () => {
    const parser = createSseParser();
    expect(parser.push('event: text\ndata: {"sentence":"Half')).toEqual([]);
    expect(parser.push(' a sentence."}\n')).toEqual([]);
    expect(parser.push('\n')).toEqual([{ event: 'text', data: '{"sentence":"Half a sentence."}' }]);
  });

  it('accepts CRLF and bare CR line endings, including a CR and LF split across chunks', () => {
    expect(parseAll(['event: text\r\ndata: {"a":1}\r\n\r\n'])).toEqual([{ event: 'text', data: '{"a":1}' }]);
    expect(parseAll(['event: text\rdata: {"a":1}\r\r'])).toEqual([{ event: 'text', data: '{"a":1}' }]);
    expect(parseAll(['event: text\r', '\ndata: {"a":1}\r', '\n\r', '\n'])).toEqual([{ event: 'text', data: '{"a":1}' }]);
  });

  it('ignores comment lines (keep-alives) and unknown fields', () => {
    expect(parseAll([': ping\n\n', 'id: 4\nretry: 100\nevent: status\ndata: {}\n\n'])).toEqual([{ event: 'status', data: '{}' }]);
  });

  it('joins multi-line data with newlines and strips only one leading space', () => {
    expect(parseAll(['data: one\ndata:two\ndata:  three\n\n'])).toEqual([{ event: 'message', data: 'one\ntwo\n three' }]);
  });

  it('does not dispatch an event with no data, and resets the event name after each dispatch', () => {
    expect(parseAll(['event: status\n\n', 'data: x\n\n'])).toEqual([{ event: 'message', data: 'x' }]);
  });

  it('drops an event the stream ended in the middle of', () => {
    expect(parseAll(['event: text\ndata: {"sentence":"Cut off"}\n'])).toEqual([]);
  });
});
