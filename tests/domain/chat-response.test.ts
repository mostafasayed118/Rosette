import { describe, expect, it } from 'vitest';
import { parseChatResponse } from '@/features/chat/response-schema';

describe('chat response validation', () => {
  it('accepts a bounded product response', () => {
    expect(parseChatResponse({ answer: 'Try our roses.', language: 'en', action: 'show_products', productSlugs: ['rose-hour'] })).toEqual({ answer: 'Try our roses.', language: 'en', action: 'show_products', productSlugs: ['rose-hour'] });
  });

  it('rejects unknown actions and oversized answers', () => {
    expect(parseChatResponse({ answer: 'x'.repeat(1001), language: 'en', action: 'execute_sql' })).toBeNull();
  });
});
