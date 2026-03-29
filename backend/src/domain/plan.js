/**
 * Mirrors frontend `src/domain/savings-plan.js` for API validation.
 */

/**
 * @typedef {'daily' | 'weekly' | 'monthly'} SavingsFrequency
 * @typedef {{ amount: number, frequency: SavingsFrequency, duration: string, autoConvert: boolean, earnYield: boolean }} SavingsPlanPayload
 */

/**
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
