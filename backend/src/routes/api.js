import express from 'express';
import { isSavingsPlanPayload } from '../domain/plan.js';
import { processDuePlans } from '../jobs/runDueSaves.js';

/**
 * @param {import('better-sqlite3').Database} db
 */
export function apiRouter(db) {
  const r = express.Router();

  r.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'micro-savings-api' });
  });

  /** Upsert user by external ref (Cartridge username, Privy id, etc.) */
  r.post('/users', (req, res) => {
    const externalRef = req.body?.externalRef;
    if (typeof externalRef !== 'string' || !externalRef.trim()) {
      res.status(400).json({ error: 'externalRef required' });
      return;
    }
    const ref = externalRef.trim();
    db.prepare('INSERT OR IGNORE INTO users (external_ref) VALUES (?)').run(ref);
    const row = db.prepare('SELECT * FROM users WHERE external_ref = ?').get(ref);
    res.status(201).json(row);
  });

  r.get('/users/:userId/plans', (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId)) {
      res.status(400).json({ error: 'invalid userId' });
      return;
    }
    const rows = db
      .prepare(
        `SELECT id, user_id, amount, frequency, duration, auto_convert, earn_yield,
                active, next_run_at, created_at, updated_at
         FROM savings_plans WHERE user_id = ? ORDER BY id DESC`,
      )
      .all(userId);
    res.json(rows);
  });

  r.post('/users/:userId/plans', (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId)) {
      res.status(400).json({ error: 'invalid userId' });
      return;
    }
    const u = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!u) {
      res.status(404).json({ error: 'user not found' });
      return;
    }
    if (!isSavingsPlanPayload(req.body)) {
      res.status(400).json({ error: 'invalid savings plan body' });
      return;
    }
    const p = req.body;
    /** First tick: eligible on next cron as soon as `next_run_at <= now`. */
    const nextRunAt = new Date().toISOString();

    const row = db
      .prepare(
        `INSERT INTO savings_plans (
           user_id, amount, frequency, duration, auto_convert, earn_yield, next_run_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING *`,
      )
      .get(
        userId,
        p.amount,
        p.frequency,
        p.duration,
        p.autoConvert ? 1 : 0,
        p.earnYield ? 1 : 0,
        nextRunAt,
      );

    db.prepare(
      `INSERT INTO ledger_events (plan_id, kind, status, payload)
       VALUES (?, 'plan_created', 'ok', ?)`,
    ).run(row.id, JSON.stringify({ source: 'api' }));

    res.status(201).json(row);
  });

  /** Manual trigger for testing (no auth — add API key in production). */
  r.post('/internal/run-due', (_req, res) => {
    const n = processDuePlans(db);
    res.json({ processed: n });
  });

  return r;
}
