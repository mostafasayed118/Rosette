export type Frequency = 'weekly' | 'biweekly' | 'monthly';
export type DateRef = string; // 'YYYY-MM-DD'

export function toDateRef(date: Date): DateRef {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateRef(ref: DateRef): Date {
  const [y = 0, m = 1, d = 1] = ref.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

export function addInterval(base: DateRef, frequency: Frequency): DateRef {
  const d = parseDateRef(base);
  if (frequency === 'weekly') return toDateRef(new Date(d.getTime() + 7 * 86_400_000));
  if (frequency === 'biweekly') return toDateRef(new Date(d.getTime() + 14 * 86_400_000));
  const lastDayOfCurrent = daysInMonth(d.getUTCFullYear(), d.getUTCMonth());
  const targetYear = d.getUTCFullYear();
  const targetMonth0 = d.getUTCMonth() + 1;
  const lastDayOfTarget = daysInMonth(targetYear, targetMonth0);
  const day = d.getUTCDate() === lastDayOfCurrent ? lastDayOfTarget : Math.min(d.getUTCDate(), lastDayOfTarget);
  return toDateRef(new Date(Date.UTC(targetYear, targetMonth0, day)));
}

export function datesFrom(anchor: DateRef, frequency: Frequency, count: number): DateRef[] {
  const result: DateRef[] = [];
  let current = anchor;
  for (let i = 0; i < count; i += 1) { result.push(current); current = addInterval(current, frequency); }
  return result;
}
