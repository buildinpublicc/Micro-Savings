/**
 * Cron worker: find due plans, log ledger rows, bump next_run_at.
 * Replace `executeSaveTick` with queue → worker → Starknet / paymaster calls.
 */

import { computeNextRunAt } from '../lib/schedule.js';

/**
 * @param {import('better-sqlite3').Database} db
 */
export function processDuePlans(db) {
  const due = db
    .prepare(
      `SELECT * FROM savings_plans
       WHERE active = 1 AND datetime(next_run_at) <= datetime('now')
       ORDER BY next_run_at ASC
       LIMIT 50`,
    )
    .all();

  const insertLedger = db.prepare(
    `INSERT INTO ledger_events (plan_id, kind, status, payload)
     VALUES (@plan_id, @kind, @status, @payload)`,
  );

  const bumpPlan = db.prepare(
    `UPDATE savings_plans
     SET next_run_at = @next_run_at, updated_at = datetime('now')
     WHERE id = @id`,
  );

  for (const plan of due) {
    const payload = JSON.stringify({
      amount: plan.amount,
      frequency: plan.frequency,
      autoConvert: Boolean(plan.auto_convert),
      earnYield: Boolean(plan.earn_yield),
      note: 'Stub: wire Starkzap save → AVNU → Vesu here',
    });

    insertLedger.run({
      plan_id: plan.id,
      kind: 'auto_save_tick',
      status: 'completed_stub',
      payload,
    });

    const next = computeNextRunAt(
      /** @type {'daily' | 'weekly' | 'monthly'} */ (plan.frequency),
      new Date().toISOString(),
    );
    bumpPlan.run({ id: plan.id, next_run_at: next });
  }

  return due.length;
}
