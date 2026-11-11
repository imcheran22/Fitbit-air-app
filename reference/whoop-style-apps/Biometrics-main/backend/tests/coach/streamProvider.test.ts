import {
  CoachStreamRequest,
  ProviderNotConfiguredError,
  ScriptedStreamProvider,
  UnconfiguredProvider,
} from '../../src/coach/model/provider';

const req = (over: Partial<CoachStreamRequest> = {}): CoachStreamRequest => ({
  system: 'SYS',
  messages: [{ role: 'user', content: 'hi' }],
  maxTokens: 600,
  ...over,
});

async function collect(it: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const c of it) out.push(c);
  return out;
}

describe('ScriptedStreamProvider', () => {
  it('streams each scripted step as chunks, in order, and records every request', async () => {
    const p = new ScriptedStreamProvider([['Hel', 'lo.'], 'Whole reply.']);
    expect(await collect(p.stream(req()))).toEqual(['Hel', 'lo.']);
    expect(await collect(p.stream(req({ system: 'SECOND' })))).toEqual(['Whole reply.']);
    expect(p.callCount).toBe(2);
    expect(p.requests[1]!.system).toBe('SECOND');
  });

  it('throws a scripted error, mid-stream when chunks come first', async () => {
    const p = new ScriptedStreamProvider([new Error('boom'), { chunks: ['One. '], error: new Error('dropped') }]);
    await expect(collect(p.stream(req()))).rejects.toThrow('boom');
    const got: string[] = [];
    await expect(
      (async () => {
        for await (const c of p.stream(req())) got.push(c);
      })(),
    ).rejects.toThrow('dropped');
    expect(got).toEqual(['One. ']);
  });

  it('runs a function step with the request', async () => {
    const p = new ScriptedStreamProvider([
      async function* (r) {
        yield `max=${r.maxTokens}`;
      },
    ]);
    expect(await collect(p.stream(req()))).toEqual(['max=600']);
  });

  it('fails loudly when the script runs out', async () => {
    const p = new ScriptedStreamProvider([]);
    await expect(collect(p.stream(req()))).rejects.toThrow('ScriptedStreamProvider: script exhausted');
  });
});

describe('stream on the other providers', () => {
  it('the unconfigured provider throws ProviderNotConfiguredError', async () => {
    await expect(collect(new UnconfiguredProvider().stream(req()))).rejects.toBeInstanceOf(ProviderNotConfiguredError);
  });
});
