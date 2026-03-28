/**
 * Savings plan domain — aligns with backend JSON stored after “Create plan”.
 * Use for validation, API contracts, and future Starkzap / AVNU / Vesu orchestration.
 */

/** @typedef {'daily' | 'weekly' | 'monthly'} SavingsFrequency */

/**
 * @typedef {object} SavingsPlanPayload
 * @property {number} amount — principal per save tick (UI currency unit; backend may store minor units)
 * @property {SavingsFrequency} frequency
 * @property {string} duration — human label e.g. "3 months" (or migrate to ISO / enum later)
 * @property {boolean} autoConvert — swap to stablecoin before yield
 * @property {boolean} earnYield — deposit into Vesu (or similar)
 */

/** @type {SavingsPlanPayload} */
export const savingsPlanExample = Object.freeze({
  amount: 2000,
  frequency: 'weekly',
  duration: '3 months',
  autoConvert: true,
  earnYield: true,
});

/**
 * Narrow runtime check (no schema lib). Extend as you add fields.
 * @param {unknown} value
 * @returns {value is SavingsPlanPayload}
 */
export function isSavingsPlanPayload(value) {
  if (value === null || typeof value !== 'object') return false;
  const o = /** @type {Record<string, unknown>} */ (value);
  const freq = o.frequency;
  const amount = o.amount;
  return (
    typeof amount === 'number' &&
    amount > 0 &&
    (freq === 'daily' || freq === 'weekly' || freq === 'monthly') &&
    typeof o.duration === 'string' &&
    typeof o.autoConvert === 'boolean' &&
    typeof o.earnYield === 'boolean'
  );
}
