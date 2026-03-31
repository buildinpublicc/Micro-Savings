/**
 * Optional Express API (`backend/`). Set `VITE_API_URL` if not on localhost:3001.
 */

const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

/**
 * @param {string} externalRef
 * @returns {Promise<{ id: number, external_ref: string, created_at: string }>}
 */
export async function ensureUser(externalRef) {
  const res = await fetch(`${API_BASE}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ externalRef }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `POST /api/users failed (${res.status})`);
  }
  return res.json();
}

/**
 * @param {number} userId
 * @param {import('../domain/savings-plan.js').SavingsPlanPayload} payload
 */
export async function createPlan(userId, payload) {
  const res = await fetch(`${API_BASE}/api/users/${userId}/plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `POST plans failed (${res.status})`);
  }
  return res.json();
}

/**
 * @param {number} userId
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function listPlans(userId) {
  const res = await fetch(`${API_BASE}/api/users/${userId}/plans`);
  if (!res.ok) throw new Error(`GET plans failed (${res.status})`);
  return res.json();
}

/**
 * @param {number} userId
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function fetchLedger(userId) {
  const res = await fetch(`${API_BASE}/api/users/${userId}/ledger`);
  if (!res.ok) throw new Error(`GET ledger failed (${res.status})`);
  return res.json();
}
