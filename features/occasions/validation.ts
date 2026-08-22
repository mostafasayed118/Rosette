import { z } from 'zod';

export const OCCASION_KINDS = ['birthday', 'anniversary', 'graduation', 'other'] as const;
export const LEAD_DAY_CHOICES = [3, 7, 14] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarDate(v: string): boolean {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * Mirrors the `occasion_shape` check constraint in
 * supabase/migrations/018_occasion_reminders.sql so an invalid combination is
 * unreachable from the UI as well as the database.
 */
export const occasionInputSchema = z
  .object({
    recipientName: z.string().trim().min(1).max(120),
    recipientPhone: z.string().trim().max(50).transform((v) => (v === '' ? undefined : v)).optional(),
    relationship: z.string().trim().max(60).transform((v) => (v === '' ? undefined : v)).optional(),
    kind: z.enum(OCCASION_KINDS),
    recurrence: z.enum(['annual', 'once']),
    month: z.number().int().min(1).max(12).optional(),
    day: z.number().int().min(1).max(31).optional(),
    eventDate: z
      .string()
      .regex(ISO_DATE)
      .refine(isValidCalendarDate, { message: 'eventDate must be a valid calendar date' })
      .optional(),
    leadDays: z.number().int().min(1).max(30),
    locale: z.enum(['en', 'ar', 'fr']),
  })
  .refine(
    (value) =>
      value.recurrence === 'annual'
        ? value.month != null && value.day != null && value.eventDate == null
        : value.eventDate != null && value.month == null && value.day == null,
    { message: 'annual occasions need month and day; one-off occasions need an event date' },
  );

export type OccasionInput = z.infer<typeof occasionInputSchema>;

export function validateOccasion(input: unknown): { ok: true; value: OccasionInput } | { ok: false; error: string } {
  const parsed = occasionInputSchema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' };
}
