// features/occasions/repository.ts
import type { OccasionInput } from './validation';

type Client = { from: (table: string) => any };

export type OccasionRow = {
  id: string;
  recipientId: string;
  recipientName: string;
  relationship: string | null;
  kind: string;
  recurrence: 'annual' | 'once';
  month: number | null;
  day: number | null;
  eventDate: string | null;
  leadDays: number;
  active: boolean;
};

const listSelect = 'id,recipient_id,kind,recurrence,month,day,event_date,lead_days,active,recipients(name,relationship)';

export async function listOccasions(client: Client, customerId: string): Promise<OccasionRow[]> {
  const { data, error } = await client
    .from('occasions')
    .select(listSelect)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return ((data ?? []) as Array<Record<string, any>>).map((row) => ({
    id: String(row.id),
    recipientId: String(row.recipient_id),
    recipientName: String(row.recipients?.name ?? ''),
    relationship: row.recipients?.relationship ?? null,
    kind: String(row.kind),
    recurrence: row.recurrence === 'once' ? 'once' : 'annual',
    month: row.month == null ? null : Number(row.month),
    day: row.day == null ? null : Number(row.day),
    eventDate: row.event_date ?? null,
    leadDays: Number(row.lead_days ?? 7),
    active: row.active !== false,
  }));
}

export async function listRecipients(client: Client, customerId: string): Promise<Array<{ id: string; name: string; relationship: string | null }>> {
  const { data, error } = await client
    .from('recipients')
    .select('id,name,relationship')
    .eq('customer_id', customerId)
    .order('name', { ascending: true });
  if (error) return [];
  return ((data ?? []) as Array<Record<string, any>>).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    relationship: row.relationship ?? null,
  }));
}

/**
 * Reuse an existing contact when the name matches, otherwise create one.
 * The DB's unique (customer_id, name) makes this idempotent; looking first
 * keeps the returned id stable for the caller.
 */
export async function upsertRecipient(
  client: Client,
  customerId: string,
  input: { recipientName: string; recipientPhone?: string; relationship?: string },
): Promise<string | null> {
  const name = input.recipientName.trim();
  const { data: existing } = await client
    .from('recipients')
    .select('id')
    .eq('customer_id', customerId)
    .eq('name', name)
    .maybeSingle();
  if (existing?.id) return String(existing.id);

  const { data, error } = await client
    .from('recipients')
    .insert({
      customer_id: customerId,
      name,
      phone: input.recipientPhone?.trim() || null,
      relationship: input.relationship?.trim() || null,
    })
    .select('id')
    .maybeSingle();
  if (error || !data?.id) return null;
  return String(data.id);
}

/** Shape the row so it satisfies the occasion_shape check constraint. */
function occasionColumns(input: OccasionInput) {
  const annual = input.recurrence === 'annual';
  return {
    kind: input.kind,
    recurrence: input.recurrence,
    month: annual ? input.month ?? null : null,
    day: annual ? input.day ?? null : null,
    event_date: annual ? null : input.eventDate ?? null,
    lead_days: input.leadDays,
    locale: input.locale,
  };
}

export async function insertOccasion(client: Client, customerId: string, recipientId: string, input: OccasionInput): Promise<'saved' | 'failure'> {
  const { error } = await client.from('occasions').insert({
    customer_id: customerId,
    recipient_id: recipientId,
    ...occasionColumns(input),
  });
  return error ? 'failure' : 'saved';
}

export async function updateOccasion(client: Client, customerId: string, occasionId: string, input: OccasionInput): Promise<'saved' | 'failure'> {
  const { error } = await client
    .from('occasions')
    .update(occasionColumns(input))
    .eq('id', occasionId)
    .eq('customer_id', customerId);
  return error ? 'failure' : 'saved';
}

export async function deleteOccasion(client: Client, customerId: string, occasionId: string): Promise<'deleted' | 'failure'> {
  const { error } = await client
    .from('occasions')
    .delete()
    .eq('id', occasionId)
    .eq('customer_id', customerId);
  return error ? 'failure' : 'deleted';
}
