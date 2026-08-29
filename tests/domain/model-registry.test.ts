import { afterEach, describe, expect, it } from 'vitest';
import { getModelChain } from '@/features/chat/model-registry';

const GROQ_MODEL = 'GROQ_MODEL';
const GROQ_MODEL_DEFAULT = 'qwen/qwen3.8-27b';

afterEach(() => {
  delete process.env[GROQ_MODEL];
});

describe('chat model registry', () => {
  it('chains the default primary ahead of stable fallbacks', () => {
    const chain = getModelChain();
    expect(chain[0]).toBe(GROQ_MODEL_DEFAULT);
    expect(chain).toContain('llama-3.3-70b-versatile');
    expect(chain).toContain('llama-3.1-8b-instant');
    expect(chain).toContain('groq/compound-mini');
  });

  it('uses GROQ_MODEL as primary when configured', () => {
    process.env[GROQ_MODEL] = 'llama-3.3-70b-versatile';
    const chain = getModelChain();
    expect(chain[0]).toBe('llama-3.3-70b-versatile');
    expect(chain.filter((model) => model === 'llama-3.3-70b-versatile')).toHaveLength(1);
  });

  it('deduplicates when GROQ_MODEL equals a fallback', () => {
    process.env[GROQ_MODEL] = 'groq/compound-mini';
    const chain = getModelChain();
    expect(chain).toEqual(['groq/compound-mini', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant']);
  });
});
