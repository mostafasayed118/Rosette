type ProfileInput = { displayName: string; phone: string };
type ProfileClient = { from: (table: string) => any };

export function validateProfile(input: ProfileInput): 'invalid_name' | 'invalid_phone' | null {
  if (!input.displayName.trim()) return 'invalid_name';
  if (input.phone.trim().length > 50) return 'invalid_phone';
  return null;
}

export async function updateProfileRecord(client: ProfileClient, userId: string, input: ProfileInput): Promise<'saved' | 'failure'> {
  const { error } = await client.from('profiles')
    .update({ display_name: input.displayName.trim(), phone: input.phone.trim() })
    .eq('id', userId);
  return error ? 'failure' : 'saved';
}
