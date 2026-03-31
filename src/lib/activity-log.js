/**
 * On-device activity feed for the Activity tab (and Growth context).
 */

const STORAGE_KEY = 'micro-savings-activity-v1';
const MAX_ITEMS = 80;

/**
 * @typedef {'save' | 'earn' | 'convert' | 'out' | 'in' | 'lock'} ActivityIcon
 */

/**
 * @typedef {{
 *   id: string,
 *   ts: number,
 *   icon: ActivityIcon,
 *   title: string,
 *   subtitle: string,
 *   amountDisplay: string,
 *   amountVariant: 'pos' | 'neg' | 'neutral',
 * }} LocalActivity
 */

/**
 * @param {Omit<LocalActivity, 'id' | 'ts'> & { ts?: number, id?: string }} partial
 */
export function appendLocalActivity(partial) {
  const id =
    partial.id ??
    (globalThis.crypto?.randomUUID?.() ?? `a-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  const ts = partial.ts ?? Date.now();
  /** @type {LocalActivity} */
  const item = {
    id,
    ts,
    icon: partial.icon,
    title: partial.title,
    subtitle: partial.subtitle,
    amountDisplay: partial.amountDisplay,
    amountVariant: partial.amountVariant,
  };
  const list = readLocalActivities();
  list.unshift(item);
  const trimmed = list.slice(0, MAX_ITEMS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
}

/** @returns {LocalActivity[]} */
export function readLocalActivities() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    return p.filter(
      (x) =>
        x &&
        typeof x.id === 'string' &&
        typeof x.ts === 'number' &&
        typeof x.title === 'string',
    );
  } catch {
    return [];
  }
}
