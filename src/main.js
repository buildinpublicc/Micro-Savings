import './styles.css';
import { starknetSepolia } from './config/starknet.js';
import { isSavingsPlanPayload } from './domain/savings-plan.js';
import {
  readDashboard,
  updateDashboard,
  computeLocalNextRunIso,
  formatPlanHeadline,
} from './lib/dashboard-state.js';
import { appendLocalActivity } from './lib/activity-log.js';
import { maybeRecordUsdcSnapshot } from './lib/balance-snapshots.js';
import { readConnectedWalletBalances } from './lib/wallet-balances.js';
import { refreshHomeDashboard } from './ui/home-dashboard.js';
import { refreshGrowthTab, refreshActivityTab } from './ui/growth-activity.js';

if (import.meta.env.DEV) {
  import('./sdk/starkzap-client.js').then(({ getStarkZap }) => {
    getStarkZap();
    console.info('[StarkZap]', starknetSepolia.id, starknetSepolia.rpcUrl);
  });
}

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const onboarding = $('#screen-onboarding');
const mainShell = /** @type {HTMLElement | null} */ (document.getElementById('main-shell'));

function tabButtons() {
  return mainShell ? $$('button[data-tab]', mainShell) : [];
}
const headerTitle = $('#header-title');
const headerBack = $('.app-header__back');
const modalRoot = $('#modal-root');
const modalTitle = $('#modal-title');
const modalBody = $('#modal-body');
const toastEl = $('#toast');
const loadingOverlay = $('#loading-overlay');
const loadingText = $('#loading-text');
const SESSION_STORAGE_KEY = 'micro-savings-session-v1';

let currentTab = 'home';
/** @type {'plan' | 'lock' | 'goal' | 'send' | 'withdraw' | null} */
let stackScreen = null;
/** @type {((v: boolean) => void) | null} */
let modalResolve = null;

const TAB_TITLES = {
  home: 'Home',
  wallet: 'Wallet',
  earnings: 'Growth',
  history: 'Activity',
  settings: 'Profile',
};

function readSavedSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.loggedIn !== 'boolean') return null;
    if (parsed.profileLabel != null && typeof parsed.profileLabel !== 'string') return null;
    const userId =
      typeof parsed.userId === 'number' && Number.isInteger(parsed.userId) ? parsed.userId : null;
    const externalRef =
      typeof parsed.externalRef === 'string' && parsed.externalRef ? parsed.externalRef : null;
    return { ...parsed, userId, externalRef };
  } catch {
    return null;
  }
}

/**
 * @param {string | undefined | null} profileLabel
 * @param {number | null} [userId]
 * @param {string | null} [externalRef]
 */
function saveSession(profileLabel, userId, externalRef) {
  try {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        loggedIn: true,
        profileLabel: profileLabel ?? null,
        userId: userId ?? null,
        externalRef: externalRef ?? null,
      }),
    );
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

function getSessionUserId() {
  return readSavedSession()?.userId ?? null;
}

function formatActivityWhenLine() {
  return new Date().toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function setAriaHidden(el, hidden) {
  el.setAttribute('aria-hidden', hidden ? 'true' : 'false');
}

/**
 * @param {string} [profileLabel] — Cartridge username or shortened address (no full address in UI).
 * @param {{ userId?: number | null, externalRef?: string | null }} [backend]
 */
function enterApp(profileLabel, backend = {}) {
  onboarding.classList.remove('screen--active');
  mainShell.classList.remove('is-hidden');
  mainShell.setAttribute('aria-hidden', 'false');
  setAriaHidden(onboarding, true);
  closeStack();
  showTab('home');
  if (profileLabel) {
    const nameEl = document.querySelector('.profile-card__name');
    const emailEl = document.querySelector('.profile-card__email');
    if (nameEl) nameEl.textContent = profileLabel;
    if (emailEl) emailEl.textContent = 'Signed in with Cartridge';
  }
  saveSession(profileLabel, backend.userId ?? null, backend.externalRef ?? null);
  showToast('You’re in. Let’s grow your savings.');
}

async function leaveApp() {
  showLoading('Signing you out…');
  try {
    const { disconnectActiveWallet } = await import('./wallet/starkzap-connection.js');
    await disconnectActiveWallet();
  } finally {
    hideLoading();
  }

  closeStack();
  clearSession();
  onboarding.classList.add('screen--active');
  setAriaHidden(onboarding, false);
  mainShell.classList.add('is-hidden');
  mainShell.setAttribute('aria-hidden', 'true');
  showToast('Logged out successfully.');
}

function getTabScreen(tab) {
  return $(`.tab-screen[data-tab="${tab}"]`);
}

async function refreshWalletBalances() {
  const strkEl = $('#wallet-strk-balance');
  const usdcEl = $('#wallet-usdc-balance');
  if (!strkEl || !usdcEl) return;
  strkEl.textContent = '…';
  usdcEl.textContent = '…';
  try {
    const bal = await readConnectedWalletBalances();
    if (!bal) {
      strkEl.textContent = '—';
      usdcEl.textContent = '—';
      return;
    }
    strkEl.textContent = bal.strk.toFormatted();
    usdcEl.textContent = bal.usdc.toFormatted();
    const u = parseFloat(bal.usdc.toUnit());
    if (Number.isFinite(u)) maybeRecordUsdcSnapshot(u);
  } catch {
    strkEl.textContent = '—';
    usdcEl.textContent = '—';
  }
}

function showTab(tab) {
  currentTab = tab;
  stackScreen = null;
  $$('.tab-screen').forEach((s) => s.classList.remove('screen--active'));
  const screen = getTabScreen(tab);
  if (screen) screen.classList.add('screen--active');
  $$('.stack-screen').forEach((s) => s.classList.remove('screen--active'));

  tabButtons().forEach((b) => {
    const is = b.dataset.tab === tab;
    b.classList.toggle('is-active', is);
    if (is) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });

  headerTitle.textContent = TAB_TITLES[tab] ?? 'Home';
  headerBack.classList.add('is-hidden');
  mainShell.classList.remove('stack-open');

  if (tab === 'wallet') void refreshWalletBalances();
  if (tab === 'home') void refreshHomeDashboard(getSessionUserId);
  if (tab === 'earnings') void refreshGrowthTab(getSessionUserId);
  if (tab === 'history') void refreshActivityTab(getSessionUserId);
}

function syncPlanFormFromDashboard() {
  const { activePlan } = readDashboard();
  const amt = /** @type {HTMLInputElement | null} */ (document.getElementById('plan-amount'));
  const dur = /** @type {HTMLSelectElement | null} */ (document.getElementById('plan-duration'));
  const stable = document.getElementById('toggle-stablecoin');
  const interest = document.getElementById('toggle-interest');
  const chipRoot = document.querySelector('#screen-plan fieldset .chips');
  if (!activePlan) {
    if (amt) amt.value = '2000';
    return;
  }
  if (amt) amt.value = String(activePlan.amount);
  chipRoot?.querySelectorAll('.chip').forEach((c) => {
    if (!c.classList.contains('chip--lock')) {
      c.classList.toggle('is-active', c.dataset.freq === activePlan.frequency);
    }
  });
  if (dur) {
    const opts = dur.querySelectorAll('option');
    for (const o of opts) {
      if (o.textContent.trim() === activePlan.duration) {
        dur.value = o.value;
        break;
      }
    }
  }
  if (stable) stable.setAttribute('aria-checked', activePlan.autoConvert ? 'true' : 'false');
  if (interest) interest.setAttribute('aria-checked', activePlan.earnYield ? 'true' : 'false');
}

function syncGoalFormFromDashboard() {
  const { goal } = readDashboard();
  const n = /** @type {HTMLInputElement | null} */ (document.getElementById('goal-name-input'));
  const t = /** @type {HTMLInputElement | null} */ (document.getElementById('goal-target-input'));
  if (n) n.value = goal.title;
  if (t) t.value = String(goal.targetUsd);
}

function collectPlanPayloadFromForm() {
  const amount = Number(document.getElementById('plan-amount')?.value);
  const durationEl = /** @type {HTMLSelectElement | null} */ (document.getElementById('plan-duration'));
  const durationLabel =
    durationEl?.selectedOptions[0]?.textContent?.trim() ?? '12 months';
  const freqEl = document.querySelector(
    '#screen-plan fieldset .chips .chip.is-active:not(.chip--lock)',
  );
  const frequency = freqEl?.dataset.freq;
  const stableOn = document.getElementById('toggle-stablecoin')?.getAttribute('aria-checked') === 'true';
  const interestOn = document.getElementById('toggle-interest')?.getAttribute('aria-checked') === 'true';
  if (!frequency) return null;
  return {
    amount,
    frequency: /** @type {'daily' | 'weekly' | 'monthly'} */ (frequency),
    duration: durationLabel,
    autoConvert: stableOn,
    earnYield: interestOn,
  };
}

function openStack(screenId) {
  stackScreen = screenId;
  $$('.tab-screen').forEach((s) => s.classList.remove('screen--active'));
  $$('.stack-screen').forEach((s) => s.classList.remove('screen--active'));
  const el = $(`#screen-${screenId}`);
  if (el) el.classList.add('screen--active');

  headerBack.classList.remove('is-hidden');
  mainShell.classList.add('stack-open');

  if (screenId === 'plan') {
    headerTitle.textContent = 'New savings plan';
    syncPlanFormFromDashboard();
  }
  if (screenId === 'lock') headerTitle.textContent = 'Lock savings';
  if (screenId === 'goal') {
    headerTitle.textContent = 'Savings goal';
    syncGoalFormFromDashboard();
  }
  if (screenId === 'send') headerTitle.textContent = 'Send to address';
  if (screenId === 'withdraw') headerTitle.textContent = 'Withdraw savings';
}

function closeStack() {
  if (!stackScreen) {
    $$('.stack-screen').forEach((s) => s.classList.remove('screen--active'));
    return;
  }
  stackScreen = null;
  $$('.stack-screen').forEach((s) => s.classList.remove('screen--active'));
  const screen = getTabScreen(currentTab);
  if (screen) screen.classList.add('screen--active');
  headerTitle.textContent = TAB_TITLES[currentTab] ?? 'Home';
  headerBack.classList.add('is-hidden');
  mainShell.classList.remove('stack-open');
}

/**
 * @param {{ title: string; body: string; confirmText?: string; cancelText?: string }} opts
 * @returns {Promise<boolean>}
 */
function openModal(opts) {
  const { title, body, confirmText = 'Yes, continue', cancelText = 'Not now' } = opts;
  modalTitle.textContent = title;
  if (modalBody) modalBody.textContent = body;
  const confirmBtn = $('[data-action="modal-confirm"]');
  const cancelBtn = $('[data-action="modal-cancel"]');
  confirmBtn.textContent = confirmText;
  const single = !cancelText;
  cancelBtn.style.display = single ? 'none' : '';
  if (!single) cancelBtn.textContent = cancelText;

  modalRoot.classList.remove('is-hidden');
  modalRoot.setAttribute('aria-hidden', 'false');
  return new Promise((resolve) => {
    modalResolve = resolve;
  });
}

function closeModal(result) {
  modalRoot.classList.add('is-hidden');
  modalRoot.setAttribute('aria-hidden', 'true');
  const cancelBtn = $('[data-action="modal-cancel"]');
  cancelBtn.style.display = '';
  if (modalResolve) modalResolve(result);
  modalResolve = null;
}

let toastTimer;
function showToast(message, ms = 3200) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.remove('is-hidden');
  toastTimer = window.setTimeout(() => {
    toastEl.classList.add('is-hidden');
  }, ms);
}

function showLoading(message = 'One moment…') {
  loadingText.textContent = message;
  loadingOverlay.classList.remove('is-hidden');
}

function hideLoading() {
  loadingOverlay.classList.add('is-hidden');
}

/**
 * Show connected wallet address (Cartridge / Starknet Sepolia).
 * @param {string} title
 * @param {string} intro
 */
async function openWalletAddressModal(title, intro) {
  const { getActiveWallet } = await import('./wallet/starkzap-connection.js');
  const w = getActiveWallet();
  if (!w) {
    showToast('Sign in with Cartridge to see your Starknet address.');
    return;
  }
  const addr = String(w.address);
  const ok = await openModal({
    title,
    body: `${intro}\n\n${addr}`,
    confirmText: 'Copy address',
    cancelText: 'Close',
  });
  if (ok) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(addr);
        showToast('Address copied to clipboard.');
        return;
      } catch {
        // fall through
      }
    }
    showToast('Select the address in the dialog to copy it.');
  }
}

function bindSwitches() {
  $$('.switch').forEach((sw) => {
    sw.addEventListener('click', () => {
      const on = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  });
}

function bindSendTokenChips() {
  const root = document.getElementById('send-token-chips');
  if (!root) return;
  root.querySelectorAll('.chip').forEach((c) => {
    c.addEventListener('click', () => {
      root.querySelectorAll('.chip').forEach((x) => x.classList.remove('is-active'));
      c.classList.add('is-active');
    });
  });
}

async function openSendStackIfConnected() {
  const { getActiveWallet } = await import('./wallet/starkzap-connection.js');
  if (!getActiveWallet()) {
    showToast('Sign in with Cartridge to send tokens.');
    return;
  }
  openStack('send');
}

function bindWithdrawOutputChips() {
  const root = document.getElementById("withdraw-output-chips");
  if (!root) return;
  root.querySelectorAll(".chip").forEach((c) => {
    c.addEventListener("click", () => {
      root.querySelectorAll(".chip").forEach((x) => x.classList.remove("is-active"));
      c.classList.add("is-active");
    });
  });
}

async function openWithdrawStackIfConnected() {
  const { getActiveWallet } = await import("./wallet/starkzap-connection.js");
  if (!getActiveWallet()) {
    showToast("Sign in with Cartridge to withdraw from Vesu.");
    return;
  }
  openStack("withdraw");
}

function bindPlanScreen() {
  $$('#screen-plan .chips .chip:not(.chip--lock)').forEach((c) => {
    c.addEventListener('click', () => {
      c.parentElement?.querySelectorAll('.chip').forEach((x) => {
        if (!x.classList.contains('chip--lock')) x.classList.remove('is-active');
      });
      c.classList.add('is-active');
    });
  });

  $$('.chip--lock').forEach((c) => {
    c.addEventListener('click', () => {
      $$('.chip--lock').forEach((x) => x.classList.remove('is-active'));
      c.classList.add('is-active');
    });
  });
}

document.body.addEventListener('click', async (e) => {
  const t = e.target;
  if (!(t instanceof Element)) return;
  const actionEl = t.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;

  switch (action) {
    case 'login-cartridge': {
      const ok = await openModal({
        title: 'Continue to your account?',
        body: 'You’ll sign in with Cartridge (your Starknet wallet). You can always change preferences later.',
        confirmText: 'Continue',
        cancelText: 'Go back',
      });
      if (!ok) break;
      try {
        showLoading('Opening Cartridge…');
        const { connectCartridge, getWalletDisplayName } = await import(
          './wallet/starkzap-connection.js'
        );
        await connectCartridge();
        hideLoading();
        const { getActiveWallet } = await import('./wallet/starkzap-connection.js');
        const w = getActiveWallet();
        let userId = null;
        let externalRef = null;
        if (w) {
          externalRef = String(w.address);
          try {
            const { ensureUser } = await import('./api/backend.js');
            const row = await ensureUser(externalRef);
            userId = row.id;
          } catch {
            // API optional — Home still works from local state
          }
        }
        const label = await getWalletDisplayName();
        enterApp(label, { userId, externalRef });
      } catch (err) {
        hideLoading();
        const msg =
          err instanceof Error ? err.message : 'Something went wrong. Please try again.';
        showToast(msg);
      }
      break;
    }

    case 'nav-back':
      closeStack();
      break;

    case 'open-notifications': {
      await openModal({
        title: 'Notifications',
        body: 'You’re all caught up. We’ll remind you before each save and when you earn growth.',
        confirmText: 'OK',
        cancelText: '',
      });
      break;
    }

    case 'add-money': {
      const ok = await openModal({
        title: 'Add funds (Sepolia)',
        body:
          'This build runs on Starknet Sepolia. Get STRK from a faucet, open the Wallet tab, then swap STRK → USDC. Your Home balance uses wallet USDC as cash.',
        confirmText: 'Open Wallet',
        cancelText: 'Close',
      });
      if (ok) {
        showTab('wallet');
        void refreshWalletBalances();
        void refreshHomeDashboard(getSessionUserId);
      }
      break;
    }

    case 'withdraw':
      await openWithdrawStackIfConnected();
      break;

    case 'open-plan':
      openStack('plan');
      break;

    case 'open-lock':
      openStack('lock');
      break;

    case 'start-saving': {
      const payload = collectPlanPayloadFromForm();
      if (!payload || !isSavingsPlanPayload(payload)) {
        showToast('Choose a valid amount, schedule, and options.');
        break;
      }
      const ok = await openModal({
        title: 'Start this plan?',
        body: 'We’ll save on your schedule. You can pause or edit anytime from Home. If the API is running, the plan syncs to your account.',
        confirmText: 'Start Saving',
        cancelText: 'Review again',
      });
      if (!ok) break;
      showLoading('Saving your plan…');
      const session = readSavedSession();
      const localNext = computeLocalNextRunIso(payload.frequency);
      let activePlanState = { ...payload, localNextRunAt: localNext };
      if (session?.userId != null) {
        try {
          const { createPlan } = await import('./api/backend.js');
          const row = await createPlan(session.userId, payload);
          activePlanState = {
            ...payload,
            localNextRunAt: String(row.next_run_at),
            serverPlanId: row.id,
          };
        } catch {
          showToast('Saved on this device only — API unreachable.', 4500);
        }
      }
      hideLoading();
      updateDashboard((d) => ({
        ...d,
        activePlan: activePlanState,
        autoSaveEnabled: true,
      }));
      closeStack();
      void refreshHomeDashboard(getSessionUserId);
      appendLocalActivity({
        icon: 'save',
        title: 'Savings plan started',
        subtitle: `${formatActivityWhenLine()} · ${formatPlanHeadline(payload)}`,
        amountDisplay: `${payload.amount.toLocaleString()} / ${payload.frequency}`,
        amountVariant: 'neutral',
      });
      void refreshActivityTab(getSessionUserId);
      showToast('Plan is live.');
      break;
    }

    case 'edit-goal':
      openStack('goal');
      break;

    case 'save-goal': {
      const title = document.getElementById('goal-name-input')?.value?.trim() ?? '';
      const target = Number(
        /** @type {HTMLInputElement | null} */ (document.getElementById('goal-target-input'))?.value,
      );
      if (!title || !Number.isFinite(target) || target < 1) {
        showToast('Enter a goal name and a target of at least 1.');
        break;
      }
      updateDashboard((d) => ({ ...d, goal: { title, targetUsd: target } }));
      closeStack();
      void refreshHomeDashboard(getSessionUserId);
      showToast('Goal saved.');
      break;
    }

    case 'toggle-autosave': {
      const wasOn = readDashboard().autoSaveEnabled;
      if (!readDashboard().activePlan) {
        showToast('Create a savings plan first.');
        break;
      }
      updateDashboard((d) => ({ ...d, autoSaveEnabled: !d.autoSaveEnabled }));
      void refreshHomeDashboard(getSessionUserId);
      showToast(wasOn ? 'Auto-save paused on this device.' : 'Auto-save on.');
      break;
    }

    case 'convert-stable': {
      const amountInput = /** @type {HTMLInputElement | null} */ (document.getElementById('swap-strk-amount'));
      const raw = amountInput?.value?.trim() ?? '';
      if (!raw) {
        showToast('Enter how much STRK to swap (e.g. 0.5).');
        break;
      }
      const ok = await openModal({
        title: 'Swap STRK to USDC?',
        body: 'This uses AVNU on Starknet Sepolia. Approve the transaction in Cartridge when prompted. Gas may be sponsored if your session allows it.',
        confirmText: 'Swap',
        cancelText: 'Cancel',
      });
      if (!ok) break;
      try {
        showLoading('Preparing swap…');
        const { runConnectedSwapStrkToUsdc } = await import('./flows/onchain-savings.js');
        const tx = await runConnectedSwapStrkToUsdc(raw);
        hideLoading();
        showToast('Swap confirmed. Updating balances…');
        void refreshWalletBalances();
        void refreshHomeDashboard(getSessionUserId);
        const h = tx.hash ? `${tx.hash.slice(0, 10)}…` : '';
        appendLocalActivity({
          icon: 'convert',
          title: 'Swapped STRK → USDC',
          subtitle: h ? `${formatActivityWhenLine()} · ${h}` : formatActivityWhenLine(),
          amountDisplay: `−${raw} STRK`,
          amountVariant: 'neutral',
        });
        void refreshActivityTab(getSessionUserId);
        if (tx.explorerUrl) {
          window.open(tx.explorerUrl, '_blank', 'noopener,noreferrer');
        }
      } catch (err) {
        hideLoading();
        const msg =
          err instanceof Error ? err.message : 'Swap failed. Check balance, network, and try again.';
        showToast(msg, 6000);
      }
      break;
    }

    case 'submit-withdraw': {
      const amountStr =
        /** @type {HTMLInputElement | null} */ (document.getElementById('withdraw-amount'))?.value?.trim() ?? '';
      if (!amountStr) {
        showToast('Enter how much USDC to withdraw from Vesu.');
        break;
      }
      const outputEl = document.querySelector('#withdraw-output-chips .chip.is-active');
      const output = outputEl?.getAttribute('data-withdraw-output') === 'STRK' ? 'STRK' : 'USDC';

      const ok = await openModal({
        title: 'Confirm withdraw',
        body:
          output === 'STRK'
            ? `Withdraw ${amountStr} USDC from Vesu, then convert to STRK via AVNU and return to your wallet.`
            : `Withdraw ${amountStr} USDC from Vesu back to your wallet balance.`,
        confirmText: 'Withdraw',
        cancelText: 'Back',
      });
      if (!ok) break;
      try {
        showLoading('Withdrawing from Vesu…');
        const { runConnectedWithdrawFromVesu } = await import('./flows/onchain-savings.js');
        const result = await runConnectedWithdrawFromVesu(amountStr, {
          convertToStrk: output === 'STRK',
        });
        hideLoading();
        closeStack();
        void refreshWalletBalances();
        void refreshHomeDashboard(getSessionUserId);
        void refreshGrowthTab(getSessionUserId);

        appendLocalActivity({
          icon: 'in',
          title: output === 'STRK' ? 'Withdrew from Vesu + swapped to STRK' : 'Withdrew from Vesu',
          subtitle: formatActivityWhenLine(),
          amountDisplay: `+${amountStr} ${output === 'STRK' ? 'STRK' : 'USDC'}`,
          amountVariant: 'pos',
        });
        void refreshActivityTab(getSessionUserId);

        if (result.swapTx?.explorerUrl) {
          window.open(result.swapTx.explorerUrl, '_blank', 'noopener,noreferrer');
        } else if (result.withdrawTx?.explorerUrl) {
          window.open(result.withdrawTx.explorerUrl, '_blank', 'noopener,noreferrer');
        }
        showToast(
          output === 'STRK'
            ? 'Withdraw + convert completed. Funds are now in your wallet.'
            : 'Withdraw completed. Funds are now in your wallet.',
        );
      } catch (err) {
        hideLoading();
        const msg =
          err instanceof Error ? err.message : 'Withdraw failed. Check Vesu position, amount, and try again.';
        showToast(msg, 7000);
      }
      break;
    }

    case 'send-money':
      await openSendStackIfConnected();
      break;

    case 'submit-send': {
      const recipient =
        /** @type {HTMLInputElement | null} */ (document.getElementById('send-recipient'))?.value?.trim() ??
        '';
      const amountStr =
        /** @type {HTMLInputElement | null} */ (document.getElementById('send-amount'))?.value?.trim() ?? '';
      const tokenEl = document.querySelector('#send-token-chips .chip.is-active');
      const rawTok = tokenEl?.getAttribute('data-send-token');
      const tokenKey = rawTok === 'STRK' ? 'STRK' : 'USDC';
      if (!recipient.startsWith('0x') || recipient.length < 10) {
        showToast('Enter a full Starknet address starting with 0x.');
        break;
      }
      if (!amountStr) {
        showToast('Enter how much to send.');
        break;
      }
      const { requireConnectedWallet } = await import('./wallet/starkzap-connection.js');
      let wallet;
      try {
        wallet = requireConnectedWallet();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Connect your wallet first.');
        break;
      }
      if (String(wallet.address).toLowerCase() === recipient.toLowerCase()) {
        showToast('That’s your own wallet address. Enter the recipient’s address.');
        break;
      }
      const ok = await openModal({
        title: 'Confirm send',
        body: `Send ${amountStr} ${tokenKey} to:\n${recipient}\n\nYou’ll approve this in Cartridge. Fees may be sponsored if your session allows.`,
        confirmText: 'Send',
        cancelText: 'Back',
      });
      if (!ok) break;
      try {
        showLoading('Submitting transfer…');
        const { transferSepoliaToken } = await import('./flows/sepolia-transfer.js');
        const tx = await transferSepoliaToken(wallet, tokenKey, recipient, amountStr);
        hideLoading();
        showToast('Transfer confirmed.');
        closeStack();
        void refreshWalletBalances();
        void refreshHomeDashboard(getSessionUserId);
        const th = tx.hash ? `${tx.hash.slice(0, 10)}…` : '';
        appendLocalActivity({
          icon: 'out',
          title: `Sent ${tokenKey}`,
          subtitle: th ? `${formatActivityWhenLine()} · ${th}` : formatActivityWhenLine(),
          amountDisplay: `−${amountStr} ${tokenKey}`,
          amountVariant: 'neg',
        });
        void refreshActivityTab(getSessionUserId);
        if (tx.explorerUrl) {
          window.open(tx.explorerUrl, '_blank', 'noopener,noreferrer');
        }
      } catch (err) {
        hideLoading();
        const msg =
          err instanceof Error ? err.message : 'Transfer failed. Check balance, address, and try again.';
        showToast(msg, 6500);
      }
      break;
    }

    case 'receive-money':
      await openWalletAddressModal(
        'Receive on Sepolia',
        'Share this address so others can send you STRK or USDC on Starknet Sepolia (testnet). Only share if you trust the sender.',
      );
      break;

    case 'lock-now': {
      const days = $('.chip--lock.is-active')?.dataset.lock ?? '30';
      const ok = await openModal({
        title: `Lock for ${days} days?`,
        body: 'During this time, the locked amount won’t be available to withdraw. Everything else stays flexible. (Demo: reminder only on Home.)',
        confirmText: 'Lock now',
        cancelText: 'Cancel',
      });
      if (ok) {
        const daysNum = Number(days) || 30;
        const lockedUntil = new Date(Date.now() + daysNum * 86_400_000).toISOString();
        updateDashboard((d) => ({ ...d, lock: { days, lockedUntil } }));
        closeStack();
        void refreshHomeDashboard(getSessionUserId);
        appendLocalActivity({
          icon: 'lock',
          title: `Savings locked (${days} days)`,
          subtitle: formatActivityWhenLine(),
          amountDisplay: '—',
          amountVariant: 'neutral',
        });
        void refreshActivityTab(getSessionUserId);
        showToast(`Locked for ${days} days — we’ll highlight this on Home.`);
      }
      break;
    }

    case 'edit-profile': {
      await openModal({
        title: 'Profile',
        body: 'Name and email can be updated here in the full app. This preview keeps things simple.',
        confirmText: 'Got it',
        cancelText: '',
      });
      break;
    }

    case 'notifications': {
      const saved = await openModal({
        title: 'Notification settings',
        body: 'Turn on reminders for saves, growth, and weekly summaries. You control each type.',
        confirmText: 'Save preferences',
        cancelText: 'Close',
      });
      if (saved) showToast('Preferences saved.');
      break;
    }

    case 'security': {
      await openModal({
        title: 'Security',
        body: 'Use fingerprint or face unlock to open the app, plus a PIN for sensitive actions.',
        confirmText: 'OK',
        cancelText: '',
      });
      break;
    }

    case 'logout': {
      const ok = await openModal({
        title: 'Log out?',
        body: 'You will be signed out of your Cartridge session on this device.',
        confirmText: 'Log out',
        cancelText: 'Stay signed in',
      });
      if (ok) await leaveApp();
      break;
    }

    case 'modal-close':
    case 'modal-cancel':
      closeModal(false);
      break;

    case 'modal-confirm':
      closeModal(true);
      break;

    default:
      break;
  }
});

mainShell?.addEventListener('click', (e) => {
  const btn = e.target instanceof Element ? e.target.closest('button[data-tab]') : null;
  if (!btn || !mainShell.contains(btn)) return;
  const tab = btn.dataset.tab;
  if (tab) showTab(tab);
});

modalRoot.addEventListener('click', (e) => {
  const t = e.target;
  if (t instanceof Element && t.dataset.action === 'modal-close') closeModal(false);
});

bindSwitches();
bindPlanScreen();
bindSendTokenChips();
bindWithdrawOutputChips();

const savedSession = readSavedSession();
if (savedSession?.loggedIn) {
  enterApp(savedSession.profileLabel ?? undefined, {
    userId: savedSession.userId,
    externalRef: savedSession.externalRef,
  });
}
