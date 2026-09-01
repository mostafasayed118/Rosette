export function formatStepTime(at: string | undefined, locale: string, pendingLabel: string): string {
  if (!at) return pendingLabel;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return pendingLabel;
  return date.toLocaleTimeString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-EG', {
    hour: 'numeric',
    minute: '2-digit',
  });
}
