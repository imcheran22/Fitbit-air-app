// Streamed text -> complete sentences (spec 2026-09-30, section 2.5). The
// pipeline validates each sentence as it completes, so nothing shown is ever
// retracted. A sentence ends at . ! or ? (plus any closing quotes/brackets)
// followed by whitespace, or at a line break. Decimals ("41.3"), "a.m."/"p.m.",
// "e.g."/"i.e."/"vs."/"approx."/"Dr."/"Mr."/"Mrs."/"hr(s)."/"min(s)."/"U.S."
// (also right after "(" or "[") and a line-start list marker ("1.") never end
// a sentence. Everything from the first ``` fence on (the card and memory
// blocks) is never yielded; it is returned by tail(). When the fence arrives,
// text before it is flushed even without a full stop.

const CLOSERS = /[.!?"'”’)\]]/;
// Not ms or etc: both often end a sentence ("62 ms.").
const ABBREVIATION_RE = /(^|[\s(\[])(a\.m|p\.m|e\.g|i\.e|vs|approx|dr|mr|mrs|hrs?|mins?|u\.s)\.$/i;
const LIST_MARKER_RE = /^\d{1,2}\.$/;

export function sentenceSplitter(): { push(chunk: string): string[]; end(): string[]; tail(): string } {
  let buf = '';
  let tailText = '';
  let fenced = false;

  function drain(final: boolean): string[] {
    const out: string[] = [];
    const emit = (s: string) => {
      const t = s.trim();
      if (t.length > 0) out.push(t);
    };
    let start = 0;
    for (let i = 0; i < buf.length; i++) {
      const ch = buf[i]!;
      if (ch === '\n') {
        emit(buf.slice(start, i));
        start = i + 1;
        continue;
      }
      if (ch !== '.' && ch !== '!' && ch !== '?') continue;
      let j = i + 1;
      while (j < buf.length && CLOSERS.test(buf[j]!)) j++;
      if (j >= buf.length) break; // cannot tell yet whether the sentence ends here
      if (!/\s/.test(buf[j]!)) {
        i = j - 1;
        continue;
      }
      const candidate = buf.slice(start, j).trim();
      if (!ABBREVIATION_RE.test(candidate) && !LIST_MARKER_RE.test(candidate)) {
        emit(candidate);
        start = j;
      }
      i = j - 1;
    }
    buf = buf.slice(start);
    if (final) {
      emit(buf);
      buf = '';
    }
    return out;
  }

  return {
    push(chunk: string): string[] {
      if (fenced) {
        tailText += chunk;
        return [];
      }
      buf += chunk;
      const fence = buf.indexOf('```');
      if (fence !== -1) {
        tailText = buf.slice(fence);
        buf = buf.slice(0, fence);
        fenced = true;
        return drain(true);
      }
      // One or two trailing backticks may be the start of a fence: hold them back.
      const hold = /`{1,2}$/.exec(buf)?.[0] ?? '';
      buf = buf.slice(0, buf.length - hold.length);
      const out = drain(false);
      buf += hold;
      return out;
    },
    end(): string[] {
      return fenced ? [] : drain(true);
    },
    tail(): string {
      return tailText;
    },
  };
}
