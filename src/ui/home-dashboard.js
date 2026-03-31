import { listPlans } from '../api/backend.js';
import {
  readDashboard,
  writeDashboard,
  formatNextSaveLabel,
  formatPlanHeadline,
  formatUsd,
} from '../lib/dashboard-state.js';
import { readConnectedWalletBalances } from '../lib/wallet-balances.js';
import { maybeRecordUsdcSnapshot } from '../lib/balance-snapshots.js';

/**
 * @param {Record<string, unknown>} row
 */
function mapApiPlanToActiveState(row) {
  return {
    amount: Number(row.amount),
    frequency: /** @type {'daily' | 'weekly' | 'monthly'} */ (row.frequency),
    duration: String(row.duration),
    autoConvert: Boolean(row.auto_convert),
    earnYield: Boolean(row.earn_yield),
    localNextRunAt: String(row.next_run_at),
    serverPlanId: Number(row.id),
  };
}

/**
 * @param {() => number | null} getUserId
 */
export async function refreshHomeDashboard(getUserId) {
  let merged = readDashboard();
  const uid = getUserId();
  if (uid != null) {
    try {
      const plans = await listPlans(uid);
      if (Array.isArray(plans) && plans.length > 0) {
        const active = plans.find((p) => p.active === 1) ?? plans[0];
        if (active && typeof active === 'object') {
          merged = {
            ...merged,
            activePlan: mapApiPlanToActiveState(/** @type {Record<string, unknown>} */ (active)),
          };
          writeDashboard(merged);
        }
      }
    } catch {
      // API offline — keep local mirror
    }
  }

  const balances = await readConnectedWalletBalances();
  const usdcUnit = balances ? parseFloat(balances.usdc.toUnit()) : NaN;
  const savedUsd = Number.isFinite(usdcUnit) ? usdcUnit : 0;
  if (balances && Number.isFinite(usdcUnit)) {
    maybeRecordUsdcSnapshot(usdcUnit);
  }

  const balEl = document.getElementById('display-balance');
  const hintEl = document.getElementById('home-balance-hint');
  if (balEl) {
    balEl.textContent = balances ? formatUsd(savedUsd) : '—';
  }
  if (hintEl) {
    hintEl.textContent = balances
      ? `Sepolia: ${balances.strk.toFormatted()} · USDC shown above as cash balance`
      : 'Sign in with Cartridge to load your Sepolia wallet.';
  }

  const { goal } = merged;
  const target = goal.targetUsd > 0 ? goal.targetUsd : 1;
  const pct = Math.min(100, Math.round((savedUsd / target) * 100));

  const goalTitle = document.getElementById('home-goal-title');
  const goalBadge = document.getElementById('home-goal-badge');
  const goalFill = document.getElementById('home-goal-fill');
  const goalMeta = document.getElementById('home-goal-meta');
  const goalBar = document.querySelector('#screen-home .card--accent .progress-bar');

  if (goalTitle) goalTitle.textContent = goal.title;
  if (goalBadge) goalBadge.textContent = `${pct}%`;
  if (goalFill) goalFill.style.width = `${pct}%`;
  if (goalBar) {
    goalBar.setAttribute('aria-valuenow', String(pct));
  }
  if (goalMeta) {
    goalMeta.textContent = `${formatUsd(goal.targetUsd)} target · ${formatUsd(savedUsd)} saved (wallet USDC)`;
  }

  const sug = document.getElementById('home-suggestion-text');
  if (sug) {
    if (merged.lock) {
      sug.innerHTML = `Funds are <strong>locked</strong> for ${merged.lock.days} days. Next milestone: <strong>${formatNextSaveLabel(merged.lock.lockedUntil)}</strong>.`;
    } else if (merged.activePlan) {
      const p = merged.activePlan;
      sug.innerHTML = `You’re on <strong>${formatPlanHeadline(p)}</strong>. Small, steady saves add up—keep going.`;
    } else {
      sug.textContent =
        'Create a savings plan to automate deposits and see your next run on the calendar.';
    }
  }

  const planTitle = document.getElementById('home-plan-title');
  const planMeta = document.getElementById('home-plan-meta');
  if (merged.activePlan) {
    const p = merged.activePlan;
    if (planTitle) planTitle.textContent = formatPlanHeadline(p);
    if (planMeta) {
      planMeta.textContent = `Next save: ${formatNextSaveLabel(p.localNextRunAt)} · ${p.duration}`;
    }
  } else {
    if (planTitle) planTitle.textContent = 'No active plan yet';
    if (planMeta) planMeta.textContent = 'Tap Edit to create one—you choose amount and rhythm.';
  }

  const earnEl = document.getElementById('home-earnings-stat');
  if (earnEl) {
    earnEl.replaceChildren();
    const monthlyEst = savedUsd * (0.085 / 12);
    const strong = document.createElement('strong');
    strong.textContent = `~${formatUsd(monthlyEst)} `;
    const span = document.createElement('span');
    span.className = 'muted';
    span.textContent = 'est. / mo at 8.5% APY on USDC (illustrative)';
    earnEl.append(strong, span);
  }

  const autoEl = document.getElementById('home-autosave-value');
  if (autoEl) {
    const on = merged.autoSaveEnabled && merged.activePlan != null;
    autoEl.textContent = on ? 'ON' : 'OFF';
    autoEl.classList.toggle('mini-card__value--on', on);
  }

  const nextEl = document.getElementById('home-next-save');
  if (nextEl) {
    nextEl.textContent = merged.activePlan
      ? formatNextSaveLabel(merged.activePlan.localNextRunAt)
      : '—';
  }
}
