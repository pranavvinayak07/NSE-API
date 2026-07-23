/**
 * Evaluates whether the Indian stock market is currently open.
 * Standard NSE market hours: 09:15 to 15:30 IST, Monday through Friday.
 */
export function isMarketOpenIST(): boolean {
  const now = new Date();

  // Use Intl.DateTimeFormat to reliably get IST components regardless of environment
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
  });
  
  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value;
  
  const weekday = getPart('weekday');
  const hours = parseInt(getPart('hour') || '0', 10);
  const minutes = parseInt(getPart('minute') || '0', 10);

  // Weekend check (Sat, Sun)
  if (weekday === 'Sun' || weekday === 'Sat') {
    return false;
  }

  const current = hours + minutes / 60;

  // Market opens at 9:15 (9.25) and allow fetching until 15:36 (15.6) to capture final settlement prices
  return current >= 9.25 && current < 15.6;
}
