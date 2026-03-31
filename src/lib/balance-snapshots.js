/**
 * USDC balance samples for the Growth chart (throttled).
 */

const STORAGE_KEY = 'micro-savings-balance-snapshots-v1';
const MIN_INTERVAL_MS = 60 * 60 * 1000; // at most one sample per hour unless balance moves
const MAX_POINTS = 36;

/**
 * @param {number} usdcHuman
 */
export function maybeRecordUsdcSnapshot(usdcHuman) {
  if (!Number.isFinite(usdcHuman) || usdcHuman < 0) return;
  const list = readBalanceSnapshots();
  const now = Date.now();
  const last = list[list.length - 1];
  if (last) {
    const sameBal = Math.abs(last.usdc - usdcHuman) < 1e-6;
    if (sameBal && now - last.t < MIN_INTERVAL_MS) return;
  }
  list.push({ t: now, usdc: usdcHuman });
  while (list.length > MAX_POINTS) list.shift();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

/** @returns {{ t: number, usdc: number }[]} */
export function readBalanceSnapshots() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    return p.filter(
      (x) => x && typeof x.t === 'number' && typeof x.usdc === 'number' && Number.isFinite(x.usdc),
    );
  } catch {
    return [];
  }
}
