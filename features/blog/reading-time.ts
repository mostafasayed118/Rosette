const DEFAULT_WPM = 200;

export function estimateReadingTime(html: string, wpm = DEFAULT_WPM): number {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return 1;
  return Math.max(1, Math.ceil(text.split(' ').length / wpm));
}
