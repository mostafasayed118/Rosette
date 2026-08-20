type VoteClient = { from: (table: string) => any };

export type VoteState =
  | { status: 'ok'; helpful: number; voted: boolean }
  | { status: 'not_found' };

export function customerVoterKey(customerId: string): string {
  return `customer:${customerId}`;
}

export function visitorVoterKey(visitorId: string): string {
  return `visitor:${visitorId}`;
}

async function reviewExists(client: VoteClient, reviewId: string): Promise<boolean> {
  const { data } = await client.from('product_reviews').select('id').eq('id', reviewId).maybeSingle();
  return Boolean(data);
}

async function countVotes(client: VoteClient, reviewId: string): Promise<number> {
  const { count } = await client.from('review_votes').select('id', { count: 'exact', head: true }).eq('review_id', reviewId);
  return typeof count === 'number' ? count : 0;
}

async function hasVoted(client: VoteClient, reviewId: string, voterKey: string): Promise<boolean> {
  const { data } = await client.from('review_votes').select('id').eq('review_id', reviewId).eq('voter_key', voterKey).maybeSingle();
  return Boolean(data);
}

export async function getVoteState(client: VoteClient, input: { reviewId: string; voterKey: string }): Promise<VoteState> {
  if (!(await reviewExists(client, input.reviewId))) return { status: 'not_found' };
  const [helpful, voted] = await Promise.all([countVotes(client, input.reviewId), hasVoted(client, input.reviewId, input.voterKey)]);
  return { status: 'ok', helpful, voted };
}

export async function toggleVote(client: VoteClient, input: { reviewId: string; voterKey: string }): Promise<VoteState> {
  if (!(await reviewExists(client, input.reviewId))) return { status: 'not_found' };
  const voted = await hasVoted(client, input.reviewId, input.voterKey);
  if (voted) {
    await client.from('review_votes').delete().eq('review_id', input.reviewId).eq('voter_key', input.voterKey);
  } else {
    await client.from('review_votes').insert({ review_id: input.reviewId, voter_key: input.voterKey });
  }
  const helpful = await countVotes(client, input.reviewId);
  return { status: 'ok', helpful, voted: !voted };
}
