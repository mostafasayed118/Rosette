type Client = { from: (table: string) => any };

export type QuizCompletionInput = {
  sessionId: string;
  profileId: string | null;
  answers: { recipient: string; occasion: string; budget: string; color: string; style: string };
  locale: string;
  resultSlugs: string[];
};

/** Best-effort insert; returns true on success. Never throws to the caller. */
export async function insertQuizCompletion(client: Client, input: QuizCompletionInput): Promise<boolean> {
  try {
    const { error } = await client.from('quiz_completions').insert({
      session_id: input.sessionId,
      profile_id: input.profileId,
      recipient: input.answers.recipient,
      occasion: input.answers.occasion,
      budget: input.answers.budget,
      color: input.answers.color,
      style: input.answers.style,
      locale: input.locale,
      result_slugs: input.resultSlugs,
    });
    return !error;
  } catch {
    return false;
  }
}
