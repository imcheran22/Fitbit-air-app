// A pure, incremental parser for text/event-stream (the WHATWG "server-sent
// events" format). Network chunks can split an event, a line, or a CR LF pair
// anywhere, so it keeps the unfinished line between pushes and only returns an
// event once the blank line that ends it has arrived. No I/O, no timers: the
// caller feeds decoded text and gets whole events back.

export interface SseMessage {
  // The `event:` field, or 'message' when the event had none.
  event: string;
  // Every `data:` line of the event, joined with '\n'.
  data: string;
}

export interface SseParser {
  push(chunk: string): SseMessage[];
  // The stream closed. An event without its closing blank line is incomplete
  // and is dropped, as the format requires.
  end(): SseMessage[];
}

export function createSseParser(): SseParser {
  let line = '';
  // The previous chunk ended in CR: a LF at the start of this one belongs to it.
  let skipLeadingLf = false;
  let eventName = '';
  let data: string[] = [];

  function dispatch(out: SseMessage[]) {
    if (data.length > 0) out.push({ event: eventName || 'message', data: data.join('\n') });
    eventName = '';
    data = [];
  }

  function processLine(text: string, out: SseMessage[]) {
    if (text === '') {
      dispatch(out);
      return;
    }
    if (text.startsWith(':')) return;
    const colon = text.indexOf(':');
    const field = colon === -1 ? text : text.slice(0, colon);
    let value = colon === -1 ? '' : text.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') eventName = value;
    else if (field === 'data') data.push(value);
    // id and retry mean nothing to a one-shot POST stream; anything else is ignored.
  }

  return {
    push(chunk: string): SseMessage[] {
      const out: SseMessage[] = [];
      for (let i = 0; i < chunk.length; i += 1) {
        const ch = chunk[i]!;
        if (skipLeadingLf) {
          skipLeadingLf = false;
          if (ch === '\n') continue;
        }
        if (ch === '\r' || ch === '\n') {
          processLine(line, out);
          line = '';
          if (ch === '\r') {
            if (i + 1 < chunk.length) {
              if (chunk[i + 1] === '\n') i += 1;
            } else {
              skipLeadingLf = true;
            }
          }
        } else {
          line += ch;
        }
      }
      return out;
    },
    end(): SseMessage[] {
      line = '';
      eventName = '';
      data = [];
      return [];
    },
  };
}
