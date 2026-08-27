import { afterEach, describe, expect, it } from 'vitest';
import { getQuizSessionId } from '@/features/gift-finder/session';

describe('getQuizSessionId', () => {
  afterEach(() => { window.localStorage.clear(); });

  it('creates and persists a stable anonymous session id', () => {
    const first = getQuizSessionId();
    const second = getQuizSessionId();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second).toBe(first);
  });

  it('reuses an existing stored id across calls', () => {
    window.localStorage.setItem('rosette.quiz.session', '00000000-0000-4000-8000-000000000000');
    expect(getQuizSessionId()).toBe('00000000-0000-4000-8000-000000000000');
  });
});
