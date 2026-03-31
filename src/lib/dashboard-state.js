/**
 * Client-side dashboard persistence (goal, plan mirror, auto-save, lock).
 */

export const DASHBOARD_STORAGE_KEY = 'micro-savings-dashboard-v1';

/**
 * @typedef {import('../domain/savings-plan.js').SavingsPlanPayload} SavingsPlanPayload
 */

/**
 * @typedef {{ title: string, targetUsd: number }} SavingsGoal
 * @typedef {SavingsPlanPayload & { localNextRunAt: string, serverPlanId?: number }} ActivePlanState
 * @typedef {{ days: string, lockedUntil: string }} LockState
 * @typedef {{
 *   goal: SavingsGoal,
 *   activePlan: ActivePlanState | null,
 *   autoSaveEnabled: boolean,
 *   lock: LockState | null,
 * }} DashboardState
 */

/** @returns {DashboardState} */
export function defaultDashboard() {
  return {
    goal: { title: 'Buy Laptop', targetUsd: 200_000 },
    activePlan: null,
    autoSaveEnabled: true,
    lock: null,
  };
}

/** @returns {DashboardState} */
export function readDashboard() {
  try {
    const raw = localStorage.getItem(DASHBOARD_STORAGE_KEY);
    if (!raw) return defaultDashboard();
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return defaultDashboard();
    const base = defaultDashboard();
    if (p.goal && typeof p.goal.title === 'string' && typeof p.goal.targetUsd === 'number') {
      base.goal = { title: p.goal.title, targetUsd: p.goal.targetUsd };
    }
    if (typeof p.autoSaveEnabled === 'boolean') base.autoSaveEnabled = p.autoSaveEnabled;
    if (p.lock && typeof p.lock.days === 'string' && typeof p.lock.lockedUntil === 'string') {
      base.lock = p.lock;
    }
    if (p.activePlan && typeof p.activePlan === 'object') {
      const ap = p.activePlan;
      if (
        typeof ap.amount === 'number' &&
        (ap.frequency === 'daily' || ap.frequency === 'weekly' || ap.frequency === 'monthly') &&
        typeof ap.duration === 'string' &&
        typeof ap.autoConvert === 'boolean' &&
        typeof ap.earnYield === 'boolean' &&
        typeof ap.localNextRunAt === 'string'
      ) {
        base.activePlan = {
          amount: ap.amount,
          frequency: ap.frequency,
          duration: ap.duration,
          autoConvert: ap.autoConvert,
          earnYield: ap.earnYield,
          localNextRunAt: ap.localNextRunAt,
          serverPlanId: typeof ap.serverPlanId === 'number' ? ap.serverPlanId : undefined,
        };
      }
    }
    return base;
  } catch {
    return defaultDashboard();
  }
}

/** @param {DashboardState} state */
export function writeDashboard(state) {
  try {
    localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

/**
 * @param {(prev: DashboardState) => DashboardState} updater
 * @returns {DashboardState}
 */
export function updateDashboard(updater) {
  const next = updater(readDashboard());
  writeDashboard(next);
  return next;
}

/** @param {import('../domain/savings-plan.js').SavingsFrequency} frequency */
export function computeLocalNextRunIso(frequency) {
  const d = new Date();
  if (frequency === 'daily') d.setDate(d.getDate() + 1);
  else if (frequency === 'weekly') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

/** @param {string} iso */
export function formatNextSaveLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = Date.now();
  if (d.getTime() <= now) return 'Due now';
  const days = Math.ceil((d.getTime() - now) / 86_400_000);
  if (days === 1) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * @param {{ amount: number, frequency: string }} plan
 * @param {string} [currencyPrefix]
 */
export function formatPlanHeadline(plan, currencyPrefix = '$') {
  const freq =
    plan.frequency === 'daily' ? 'daily' : plan.frequency === 'weekly' ? 'weekly' : 'monthly';
  return `Saving ${currencyPrefix}${plan.amount.toLocaleString()} ${freq}`;
}

/** @param {number} n */
export function formatUsd(n) {
  if (!Number.isFinite(n)) return '—';
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
