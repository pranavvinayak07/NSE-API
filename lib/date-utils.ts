/**
 * Format a Date to DD-MM-YYYY HH:mm:ss (IST-aware display string)
 */
export function format(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = pad(date.getDate());
  const m = pad(date.getMonth() + 1);
  const y = date.getFullYear();
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${d}-${m}-${y} ${hh}:${mm}:${ss}`;
}

/**
 * Format a Date to DD-MM-YYYY for filenames.
 */
export function formatForFilename(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
}
