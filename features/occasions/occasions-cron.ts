import { getRequiredServerEnv } from '@/lib/server-env';
import { buildUnsubscribeUrl, getEngagementPreference, type EngagementPreference } from '@/features/email-preferences/preferences-service';
import { cycleYearFor, daysUntil, isReminderDue, nextOccurrence, type OccasionSchedule } from './occasion-dates';
import { sendOccasionEmail } from './email';

type CronClient = { from: (table: string) => any };
type PreferenceLookup = (email: string) => Promise<EngagementPreference>;

export type OccasionCronSummary = { checked: number; sent: number; failed: number; suppressed: number };

const select = 'id,customer_id,recipient_id,kind,recurrence,month,day,event_date,lead_days,locale,active,recipients(id,name),profiles(email)';

/** Today as YYYY-MM-DD in UTC. Reminders are day-granular. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDays(date: string, delta: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Heuristic suppression: orders store recipient_name as free text with no
 * foreign key (001_commerce.sql:78), so an identically-named recipient or a
 * typo defeats it. Stage 2 adds orders.recipient_id with checkout capture, at
 * which point this becomes exact.
 */
async function findCoveringOrder(client: CronClient, customerId: string, recipientName: string, occurrence: string): Promise<string | null> {
  const { data } = await client
    .from('orders')
    .select('id,recipient_name,delivery_date,payment_status')
    .eq('customer_id', customerId)
    .eq('payment_status', 'paid')
    .gte('delivery_date', shiftDays(occurrence, -3))
    .lte('delivery_date', shiftDays(occurrence, 3));
  const rows = (data ?? []) as Array<{ id: string; recipient_name?: string | null }>;
  const wanted = recipientName.trim().toLowerCase();
  const hit = rows.find((row) => (row.recipient_name ?? '').trim().toLowerCase() === wanted);
  return hit ? hit.id : null;
}

export async function runOccasionCron(
  client: CronClient,
  deps: { origin: string; today?: string; send?: typeof sendOccasionEmail; secret?: string; getPreference?: PreferenceLookup },
): Promise<OccasionCronSummary> {
  const today = deps.today ?? todayUtc();
  const send = deps.send ?? sendOccasionEmail;
  const secret = deps.secret ?? getRequiredServerEnv('EMAIL_PREFERENCES_SECRET');
  const getPreference = deps.getPreference ?? ((email: string) => getEngagementPreference(client, email));
  const summary: OccasionCronSummary = { checked: 0, sent: 0, failed: 0, suppressed: 0 };

  const { data } = await client.from('occasions').select(select);
  const rows = (data ?? []) as Array<Record<string, any>>;

  for (const row of rows) {
    if (row.active === false) continue;
    const schedule: OccasionSchedule = {
      recurrence: row.recurrence === 'once' ? 'once' : 'annual',
      month: row.month == null ? null : Number(row.month),
      day: row.day == null ? null : Number(row.day),
      eventDate: row.event_date ?? null,
      leadDays: Number(row.lead_days ?? 7),
    };

    summary.checked += 1;
    if (!isReminderDue(schedule, today)) continue;

    const occurrence = nextOccurrence(schedule, today);
    const cycleYear = cycleYearFor(schedule, today);
    if (!occurrence || cycleYear == null) continue;

    const recipient = row.recipients as { id?: string; name?: string } | null;
    const email = (row.profiles as { email?: string | null } | null)?.email;
    if (!recipient?.name || !email) { summary.failed += 1; continue; }

    // Claim the cycle BEFORE sending. A unique-constraint rejection means
    // another run already owns it, so overlapping invocations cannot double-send.
    const claimed = await client
      .from('occasion_reminders')
      .insert({ occasion_id: String(row.id), cycle_year: cycleYear })
      .select('id')
      .maybeSingle();
    if (claimed?.error || !claimed?.data?.id) continue;
    const reminderId = String(claimed.data.id);

    let preference: EngagementPreference;
    try {
      preference = await getPreference(email);
    } catch {
      preference = { status: 'error' };
    }
    if (preference.status === 'error') { summary.failed += 1; continue; }
    if (preference.status === 'disabled') {
      await client.from('occasion_reminders').update({ suppressed_reason: 'engagement_disabled' }).eq('id', reminderId);
      summary.suppressed += 1;
      continue;
    }

    const coveringOrderId = await findCoveringOrder(client, String(row.customer_id), recipient.name, occurrence);
    if (coveringOrderId) {
      await client.from('occasion_reminders')
        .update({ suppressed_reason: 'already_ordered', converted_order_id: coveringOrderId })
        .eq('id', reminderId);
      summary.suppressed += 1;
      continue;
    }

    const locale = row.locale === 'ar' || row.locale === 'fr' ? row.locale : 'en';
    const origin = deps.origin.replace(/\/$/, '');
    const shopUrl = `${origin}/${locale}/cairo/shop?occasion=${encodeURIComponent(String(row.kind))}&recipient=${encodeURIComponent(String(recipient.id ?? ''))}`;

    try {
      await send({
        to: email,
        locale,
        recipientName: recipient.name,
        occasionKind: String(row.kind),
        daysUntil: daysUntil(today, occurrence),
        shopUrl,
        unsubscribeUrl: buildUnsubscribeUrl(origin, email, secret, locale),
      });
      await client.from('occasion_reminders').update({ sent_at: new Date().toISOString() }).eq('id', reminderId);
      summary.sent += 1;
    } catch {
      summary.failed += 1;
    }
  }

  return summary;
}
