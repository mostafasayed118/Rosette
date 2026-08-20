import { describe, expect, it } from 'vitest';
import { customerVoterKey, getVoteState, toggleVote, visitorVoterKey } from '@/features/reviews/vote-service';

type Vote = { review_id: string; voter_key: string };

function fakeClient(options: { reviewExists?: boolean; votes?: Vote[] } = {}) {
  const votes: Vote[] = [...(options.votes ?? [])];
  const reviewExists = options.reviewExists ?? true;
  const from = (table: string) => {
    if (table === 'product_reviews') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: reviewExists ? { id: 'r1' } : null, error: null }) }) }) };
    }
    if (table === 'review_votes') {
      return {
        select: (cols?: unknown, opts?: { count?: string }) => {
          if (opts?.count === 'exact') {
            return { eq: (_c: string, reviewId: string) => Promise.resolve({ count: votes.filter((v) => v.review_id === reviewId).length }) };
          }
          return {
            eq: (_c: string, reviewId: string) => ({
              eq: (_c2: string, voterKey: string) => ({
                maybeSingle: async () => ({ data: votes.find((v) => v.review_id === reviewId && v.voter_key === voterKey) ?? null, error: null }),
              }),
            }),
          };
        },
        delete: () => ({
          eq: (col: string, val: string) => {
            const rest = votes.filter((v) => v[col as keyof Vote] !== val);
            votes.splice(0, votes.length, ...rest);
            return {
              eq: (col2: string, val2: string) => {
                const rest2 = votes.filter((v) => v[col2 as keyof Vote] !== val2);
                votes.splice(0, votes.length, ...rest2);
                return { error: null };
              },
              error: null,
            };
          },
        }),
        insert: (payload: { review_id: string; voter_key: string }) => { votes.push(payload); return { error: null }; },
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  };
  return { client: { from }, votes };
}

describe('voter keys', () => {
  it('formats a customer voter key', () => {
    expect(customerVoterKey('c1')).toBe('customer:c1');
  });
  it('formats a visitor voter key', () => {
    expect(visitorVoterKey('v1')).toBe('visitor:v1');
  });
});

describe('getVoteState', () => {
  it('returns the count and un-voted state', async () => {
    const { client } = fakeClient({ votes: [{ review_id: 'r1', voter_key: 'customer:a' }, { review_id: 'r1', voter_key: 'visitor:b' }] });
    const result = await getVoteState(client, { reviewId: 'r1', voterKey: 'customer:c1' });
    expect(result).toEqual({ status: 'ok', helpful: 2, voted: false });
  });
  it('returns voted true when the voter has a row', async () => {
    const { client } = fakeClient({ votes: [{ review_id: 'r1', voter_key: 'customer:c1' }] });
    const result = await getVoteState(client, { reviewId: 'r1', voterKey: 'customer:c1' });
    expect(result).toEqual({ status: 'ok', helpful: 1, voted: true });
  });
  it('returns not_found when the review is missing', async () => {
    const { client } = fakeClient({ reviewExists: false });
    const result = await getVoteState(client, { reviewId: 'r1', voterKey: 'customer:c1' });
    expect(result).toEqual({ status: 'not_found' });
  });
});

describe('toggleVote', () => {
  it('inserts on the first toggle', async () => {
    const { client, votes } = fakeClient();
    const result = await toggleVote(client, { reviewId: 'r1', voterKey: 'customer:c1' });
    expect(result).toEqual({ status: 'ok', helpful: 1, voted: true });
    expect(votes).toContainEqual({ review_id: 'r1', voter_key: 'customer:c1' });
  });
  it('deletes on the second toggle', async () => {
    const { client, votes } = fakeClient({ votes: [{ review_id: 'r1', voter_key: 'customer:c1' }] });
    const result = await toggleVote(client, { reviewId: 'r1', voterKey: 'customer:c1' });
    expect(result).toEqual({ status: 'ok', helpful: 0, voted: false });
    expect(votes).toHaveLength(0);
  });
  it('returns not_found when the review is missing', async () => {
    const { client } = fakeClient({ reviewExists: false });
    const result = await toggleVote(client, { reviewId: 'r1', voterKey: 'customer:c1' });
    expect(result).toEqual({ status: 'not_found' });
  });
});
