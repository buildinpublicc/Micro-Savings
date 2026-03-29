/**
 * Compute next run from frequency (SQLite datetime string, UTC).
 * @param {'daily' | 'weekly' | 'monthly'} frequency
 * @param {string} [fromIso] — ISO or datetime; default now
 */
export function computeNextRunAt(frequency, fromIso) {
  const base = fromIso ? new Date(fromIso) : new Date();
  if (Number.isNaN(base.getTime())) {
    throw new Error('Invalid fromIso');
  }
  const d = new Date(base.getTime());
  if (frequency === 'daily') {
    d.setUTCDate(d.getUTCDate() + 1);
  } else if (frequency === 'weekly') {
    d.setUTCDate(d.getUTCDate() + 7);
  } else {
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return d.toISOString();
}
