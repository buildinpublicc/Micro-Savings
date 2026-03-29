import cron from 'node-cron';
import { processDuePlans } from './runDueSaves.js';

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} expression — node-cron 5-field pattern (see CRON_SCHEDULE in .env.example)
 * @param {(processed: number) => void} [onTick]
 */
export function startSaveScheduler(db, expression, onTick) {
  const task = cron.schedule(
    expression,
    () => {
      try {
        const n = processDuePlans(db);
        if (onTick && n > 0) onTick(n);
      } catch (e) {
        console.error('[cron] processDuePlans failed', e);
      }
    },
    { timezone: 'UTC' },
  );
  return task;
}
