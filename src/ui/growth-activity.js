import { fetchLedger } from '../api/backend.js';
import { readDashboard, formatUsd } from '../lib/dashboard-state.js';
import { readLocalActivities } from '../lib/activity-log.js';
import { readBalanceSnapshots } from '../lib/balance-snapshots.js';
import { readConnectedWalletBalances } from '../lib/wallet-balances.js';

/** @param {unknown} icon */
function validateActivityIcon(icon) {
  return icon === 'earn' || icon === 'convert' || icon === 'out' || icon === 'in' || icon === 'lock'
    ? icon
    : 'save';
}

/**
 * @param {Record<string, unknown>} r
 */
function normalizeActivityRow(r) {
  const av = r.amountVariant === 'pos' || r.amountVariant === 'neg' ? r.amountVariant : 'neutral';
  return {
    id: String(r.id ?? ''),
    ts: typeof r.ts === 'number' ? r.ts : 0,
    icon: validateActivityIcon(r.icon),
    title: String(r.title ?? ''),
    subtitle: String(r.subtitle ?? ''),
    amountDisplay: String(r.amountDisplay ?? '—'),
    amountVariant: /** @type {'pos' | 'neg' | 'neutral'} */ (av),
  };
}

/** @type {Record<string, string>} */
const ICON_PATHS = {
  save: '<path d="M12 5v14M5 12h14"/>',
  earn: '<path d="M12 2v20M17 7l-5-5-5 5"/>',
  convert: '<path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4"/>',
  out: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  in: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
};

/**
 * @param {number} ts
 */
function formatActivityWhen(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * @param {Record<string, unknown>} row
 */
function mapServerLedgerRow(row) {
  const ts = new Date(String(row.created_at)).getTime();
  /** @type {Record<string, unknown>} */
  let payload = {};
  try {
    payload = JSON.parse(String(row.payload ?? '{}'));
  } catch {
    payload = {};
  }
  const kind = String(row.kind);
  const when = formatActivityWhen(ts);

  if (kind === 'plan_created') {
    return {
      id: `srv-ledger-${row.id}`,
      ts,
      icon: /** @type {const} */ ('save'),
      title: 'Savings plan created',
      subtitle: when,
      amountDisplay: '—',
      amountVariant: /** @type {const} */ ('neutral'),
    };
  }
  if (kind === 'auto_save_tick') {
    const amt = payload.amount;
    const freq = payload.frequency;
    const sub = freq ? `${when} · ${freq}` : when;
    return {
      id: `srv-ledger-${row.id}`,
      ts,
      icon: /** @type {const} */ ('save'),
      title: 'Auto-save (stub tick)',
      subtitle: sub,
      amountDisplay:
        typeof amt === 'number' ? `+$${amt.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—',
      amountVariant: /** @type {const} */ ('pos'),
    };
  }

  return {
    id: `srv-ledger-${row.id}`,
    ts,
    icon: /** @type {const} */ ('save'),
    title: kind.replace(/_/g, ' '),
    subtitle: `${when} · ${String(row.status ?? '')}`,
    amountDisplay: '—',
    amountVariant: /** @type {const} */ ('neutral'),
  };
}

/**
 * @param {import('../lib/activity-log.js').LocalActivity[]} local
 * @param {ReturnType<typeof mapServerLedgerRow>[]} server
 */
function mergeActivityRows(local, server) {
  const rows = [
    ...local.map((x) => normalizeActivityRow(/** @type {Record<string, unknown>} */ (x))),
    ...server.map((s) => normalizeActivityRow(/** @type {Record<string, unknown>} */ (s))),
  ];
  return rows.sort((a, b) => b.ts - a.ts).slice(0, 60);
}

/**
 * @param {{
 *   icon: keyof typeof ICON_PATHS,
 *   title: string,
 *   subtitle: string,
 *   amountDisplay: string,
 *   amountVariant: 'pos' | 'neg' | 'neutral',
 * }} row
 */
function buildTxItem(row) {
  const li = document.createElement('li');
  li.className = 'tx-item';

  const iconWrap = document.createElement('span');
  const iconClass =
    row.icon === 'save'
      ? 'tx-item__icon--save'
      : row.icon === 'earn'
        ? 'tx-item__icon--earn'
        : row.icon === 'convert'
          ? 'tx-item__icon--convert'
          : row.icon === 'out'
            ? 'tx-item__icon--out'
            : row.icon === 'in'
              ? 'tx-item__icon--save'
              : row.icon === 'lock'
                ? 'tx-item__icon--earn'
                : 'tx-item__icon--save';
  iconWrap.className = `tx-item__icon ${iconClass}`;
  iconWrap.setAttribute('aria-hidden', 'true');
  iconWrap.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ICON_PATHS[row.icon] ?? ICON_PATHS.save}</svg>`;

  const mid = document.createElement('div');
  const t = document.createElement('p');
  t.className = 'tx-item__title';
  t.textContent = row.title;
  const d = document.createElement('p');
  d.className = 'tx-item__date';
  d.textContent = row.subtitle;
  mid.append(t, d);

  const amt = document.createElement('span');
  amt.className = 'tx-item__amt';
  amt.textContent = row.amountDisplay;
  if (row.amountVariant === 'pos') amt.classList.add('tx-item__amt--pos');
  if (row.amountVariant === 'neg') amt.classList.add('tx-item__amt--neg');

  li.append(iconWrap, mid, amt);
  return li;
}

/**
 * @param {ReturnType<typeof mergeActivityRows>} rows
 */
export function renderActivityList(rows) {
  const ul = document.getElementById('activity-tx-list');
  if (!ul) return;
  ul.replaceChildren();
  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'tx-item tx-item--empty';
    const p = document.createElement('p');
    p.style.margin = '0';
    p.style.width = '100%';
    p.style.textAlign = 'center';
    p.textContent =
      'No activity yet. Create a plan, run the backend cron, swap, or send — events will show here.';
    li.appendChild(p);
    ul.appendChild(li);
    return;
  }
  for (const row of rows) {
    ul.appendChild(
      buildTxItem({
        icon: row.icon,
        title: row.title,
        subtitle: row.subtitle,
        amountDisplay: row.amountDisplay,
        amountVariant: row.amountVariant,
      }),
    );
  }
}

/**
 * @param {{ t: number, usdc: number }[]} snapshots
 */
function updateGrowthChart(snapshots) {
  const fillEl = document.getElementById('growth-chart-fill-path');
  const lineEl = document.getElementById('growth-chart-line-path');
  const labelsEl = document.getElementById('growth-chart-labels');
  const noteEl = document.getElementById('growth-chart-note');
  if (!fillEl || !lineEl) return;

  if (snapshots.length < 2) {
    fillEl.setAttribute('d', 'M0 100 L300 100 L300 120 L0 120 Z');
    lineEl.setAttribute('d', 'M0 100 L300 100');
    if (labelsEl) labelsEl.replaceChildren();
    if (noteEl) {
      noteEl.textContent =
        snapshots.length === 1
          ? 'Check back after another balance snapshot (open Home or Wallet later) to see a trend line.'
          : 'USDC balance trend appears after you connect a wallet and we record a few snapshots over time.';
    }
    return;
  }

  if (noteEl) noteEl.textContent = 'USDC in wallet (Sepolia), sampled over time.';

  const w = 300;
  const h = 120;
  const pad = 18;
  const values = snapshots.map((s) => s.usdc);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const span = maxV - minV || 1;
  const n = snapshots.length;

  const pts = snapshots.map((s, i) => {
    const x = n === 1 ? w / 2 : (i / (n - 1)) * w;
    const ny = pad + (1 - (s.usdc - minV) / span) * (h - 2 * pad);
    const y = Math.min(h - pad, Math.max(pad, ny));
    return { x, y, t: s.t };
  });

  const lineD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const fillD = `${lineD} L${w} ${h} L0 ${h} Z`;
  fillEl.setAttribute('d', fillD);
  lineEl.setAttribute('d', lineD);

  if (labelsEl) {
    labelsEl.replaceChildren();
    const pick = [0, Math.floor((n - 1) / 2), n - 1];
    const seen = new Set();
    for (const idx of pick) {
      if (seen.has(idx)) continue;
      seen.add(idx);
      const spanEl = document.createElement('span');
      spanEl.textContent = new Date(pts[idx].t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      labelsEl.appendChild(spanEl);
    }
  }
}

/**
 * @param {() => number | null} getUserId
 */
export async function refreshGrowthTab(getUserId) {
  const balances = await readConnectedWalletBalances();
  const usdc = balances ? parseFloat(balances.usdc.toUnit()) : NaN;
  const usdcOk = Number.isFinite(usdc) ? usdc : 0;

  const kicker = document.getElementById('growth-hero-kicker');
  const title = document.getElementById('growth-hero-title');
  const sub = document.getElementById('growth-hero-sub');
  if (kicker) kicker.textContent = balances ? 'Your money on Sepolia' : 'Connect to track growth';
  if (title) {
    title.textContent =
      usdcOk > 0 ? `${formatUsd(usdcOk)} in stablecoin` : balances ? 'Fund USDC to see growth' : 'Sign in to begin';
  }
  if (sub) {
    const dash = readDashboard();
    sub.textContent = dash.activePlan?.earnYield
      ? 'Illustrative yield below assumes 8.5% APY on USDC — not guaranteed or on-chain unless you use a real yield venue.'
      : 'Turn on “Earn interest” in your savings plan to align this view with your intent. Numbers are illustrative on testnet.';
  }

  const apyEl = document.getElementById('growth-apy-value');
  if (apyEl) apyEl.textContent = '8.5';

  const monthlyEst = usdcOk * (0.085 / 12);
  const totalEl = document.getElementById('growth-total-earned');
  if (totalEl) {
    totalEl.textContent = `~${formatUsd(monthlyEst)}`;
  }
  const totalMeta = document.getElementById('growth-total-meta');
  if (totalMeta) {
    totalMeta.textContent =
      'Estimated this month at 8.5% APY on your wallet USDC (illustrative — not paid automatically on-chain).';
  }

  updateGrowthChart(readBalanceSnapshots());
}

/**
 * @param {() => number | null} getUserId
 */
export async function refreshActivityTab(getUserId) {
  const local = readLocalActivities();
  const uid = getUserId();
  /** @type {ReturnType<typeof mapServerLedgerRow>[]} */
  let serverRows = [];
  if (uid != null) {
    try {
      const raw = await fetchLedger(uid);
      if (Array.isArray(raw)) {
        serverRows = raw.map((r) => mapServerLedgerRow(/** @type {Record<string, unknown>} */ (r)));
      }
    } catch {
      // offline
    }
  }
  const merged = mergeActivityRows(local, serverRows);
  renderActivityList(merged);
}
