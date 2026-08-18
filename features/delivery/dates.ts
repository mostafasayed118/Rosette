function toLocalISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function minDeliveryDate(now: Date): string {
  return toLocalISO(now);
}

export function defaultDeliveryDate(now: Date): string {
  const date = new Date(now);
  date.setDate(date.getDate() + 2);
  return toLocalISO(date);
}
