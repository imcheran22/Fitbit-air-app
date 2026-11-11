// OllamaProvider configuration and provider selection. Streaming, warm-up and
// the <think> filter are covered in ollamaStream.test.ts.

import { OllamaConfigError, OllamaProvider, isLoopbackUrl, ollamaProviderFromEnv } from '../../src/coach/model/ollama';
import { getCoachProvider, resetCoachProviderFromEnv, setCoachProvider } from '../../src/coach/config';

describe('isLoopbackUrl', () => {
  it('accepts only loopback hosts', () => {
    for (const url of ['http://localhost:11434', 'http://127.0.0.1:11434', 'http://127.1.2.3', 'http://[::1]:11434']) {
      expect(isLoopbackUrl(url)).toBe(true);
    }
    for (const url of ['http://10.0.0.5:11434', 'http://ollama.example.com', 'not a url']) {
      expect(isLoopbackUrl(url)).toBe(false);
    }
  });
});

describe('OllamaProvider', () => {
  it('refuses a remote server unless explicitly allowed, and requires a model', () => {
    expect(() => new OllamaProvider({ baseUrl: 'http://10.0.0.5:11434', model: 'm' })).toThrow(OllamaConfigError);
    expect(() => new OllamaProvider({ baseUrl: 'http://10.0.0.5:11434', model: 'm', allowRemote: true })).not.toThrow();
    expect(() => new OllamaProvider({ baseUrl: 'http://localhost:11434', model: '' })).toThrow(OllamaConfigError);
  });

  it('is identified by its one model', () => {
    expect(new OllamaProvider({ baseUrl: 'http://localhost:11434', model: 'qwen3.6:35b' }).id).toBe('ollama:qwen3.6:35b');
  });
});

describe('coach provider selection', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
    setCoachProvider(null);
    resetCoachProviderFromEnv();
    jest.restoreAllMocks();
  });

  it('is unconfigured unless COACH_PROVIDER=ollama', () => {
    delete process.env.COACH_PROVIDER;
    resetCoachProviderFromEnv();
    expect(getCoachProvider().id).toBe('unconfigured');
  });

  it('builds the Ollama provider from OLLAMA_* env', () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    process.env.COACH_PROVIDER = 'ollama';
    process.env.OLLAMA_MODEL = 'qwen3.8:27b';
    resetCoachProviderFromEnv();

    expect(getCoachProvider().id).toBe('ollama:qwen3.8:27b');
  });

  it('degrades to unconfigured (and logs) on a bad Ollama configuration', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env.COACH_PROVIDER = 'ollama';
    process.env.OLLAMA_MODEL = 'm';
    process.env.OLLAMA_URL = 'http://203.0.113.9:11434';
    resetCoachProviderFromEnv();

    expect(getCoachProvider().id).toBe('unconfigured');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('coach.provider_config_invalid'));
  });

  it('lets an explicit override win over the environment', () => {
    process.env.COACH_PROVIDER = 'ollama';
    process.env.OLLAMA_MODEL = 'm';
    const stub = { id: 'stub', stream: jest.fn() };
    setCoachProvider(stub);
    expect(getCoachProvider()).toBe(stub);
  });

  it('rejects a bad numeric setting', () => {
    process.env.OLLAMA_MODEL = 'm';
    process.env.OLLAMA_NUM_CTX = 'lots';
    expect(() => ollamaProviderFromEnv()).toThrow(OllamaConfigError);
  });
});
