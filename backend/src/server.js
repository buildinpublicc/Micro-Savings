import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { startSaveScheduler } from './jobs/cron.js';
import { openDatabase } from './db/index.js';
import { apiRouter } from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3001;
const DATABASE_PATH =
  process.env.DATABASE_PATH || path.join(__dirname, '../data/micro-savings.sqlite');
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '*/5 * * * *';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

const db = openDatabase(DATABASE_PATH);
const app = express();

app.use(express.json({ limit: '64kb' }));
app.use(
  cors({
    origin: CORS_ORIGIN.split(',').map((s) => s.trim()),
    methods: ['GET', 'POST', 'OPTIONS'],
  }),
);

app.use('/api', apiRouter(db));

const server = app.listen(PORT, () => {
  console.info(`[micro-savings-api] listening on http://localhost:${PORT}`);
  console.info(`[micro-savings-api] DB ${DATABASE_PATH}`);
  console.info(`[micro-savings-api] cron "${CRON_SCHEDULE}" (UTC)`);
  startSaveScheduler(db, CRON_SCHEDULE, (n) => {
    console.info(`[cron] processed ${n} due plan(s)`);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[micro-savings-api] Port ${PORT} is already in use (another server or a stuck node process).\n` +
        `  Stop it:  kill $(lsof -t -i :${PORT})\n` +
        `  Or use a free port:  PORT=3002 npm run dev`,
    );
  } else {
    console.error('[micro-savings-api] listen error', err);
  }
  process.exit(1);
});
