import './styles.css';
import { starknetSepolia } from './config/starknet.js';

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
/** @type {'plan' | 'lock' | null} */
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
    return parsed;
  } catch {
    return null;
  }
}

function saveSession(profileLabel) {
  try {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        loggedIn: true,
        profileLabel: profileLabel ?? null,
      })
    );
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
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
 */
function enterApp(profileLabel) {
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
  saveSession(profileLabel);
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
}

function openStack(screenId) {
  stackScreen = screenId;
  $$('.tab-screen').forEach((s) => s.classList.remove('screen--active'));
  $$('.stack-screen').forEach((s) => s.classList.remove('screen--active'));
  const el = $(`#screen-${screenId}`);
  if (el) el.classList.add('screen--active');

  headerBack.classList.remove('is-hidden');
  mainShell.classList.add('stack-open');

  if (screenId === 'plan') headerTitle.textContent = 'New savings plan';
  if (screenId === 'lock') headerTitle.textContent = 'Lock savings';
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
  modalBody.textContent = body;
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

function simulateAsync(btn, message, doneMessage, ms = 1400, onDone) {
  if (btn) {
    btn.classList.add('is-loading');
    btn.disabled = true;
  }
  showLoading(message);
  window.setTimeout(() => {
    hideLoading();
    if (btn) {
      btn.classList.remove('is-loading');
      btn.disabled = false;
    }
    showToast(doneMessage);
    onDone?.();
  }, ms);
}

function bindSwitches() {
  $$('.switch').forEach((sw) => {
    sw.addEventListener('click', () => {
      const on = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  });
}

function bindPlanScreen() {
  $$('.segmented__btn').forEach((b) => {
    b.addEventListener('click', () => {
      $$('.segmented__btn').forEach((x) => x.classList.remove('is-active'));
      b.classList.add('is-active');
      const cur = b.dataset.currency;
      const prefix = $('#plan-currency');
      if (prefix) prefix.textContent = cur === 'usd' ? '$' : '₦';
    });
  });

  $$('.chips .chip:not(.chip--lock)').forEach((c) => {
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
        const label = await getWalletDisplayName();
        enterApp(label);
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
        title: 'Add money?',
        body: 'You’ll choose an amount and a funding source you already trust (card or bank).',
        confirmText: 'Continue',
        cancelText: 'Cancel',
      });
      if (ok) simulateAsync(null, 'Connecting safely…', 'Ready — pick an amount on the next step.');
      break;
    }

    case 'withdraw': {
      const ok = await openModal({
        title: 'Withdraw to your bank?',
        body: 'Money usually arrives within 1 business day. Small limits may apply for your safety.',
        confirmText: 'Continue',
        cancelText: 'Cancel',
      });
      if (ok) {
        simulateAsync(null, 'Preparing transfer…', 'Withdrawal submitted. We’ll notify you when it’s sent.');
      }
      break;
    }

    case 'open-plan':
      openStack('plan');
      break;

    case 'open-lock':
      openStack('lock');
      break;

    case 'start-saving': {
      const ok = await openModal({
        title: 'Start this plan?',
        body: 'We’ll save on your schedule. You can pause or edit anytime from Home.',
        confirmText: 'Start Saving',
        cancelText: 'Review again',
      });
      if (ok) {
        simulateAsync(actionEl, 'Setting up your plan…', 'Nice — your plan is live.', 1400, closeStack);
      }
      break;
    }

    case 'convert-stable': {
      const ok = await openModal({
        title: 'Switch to stable balance?',
        body: 'We’ll move your chosen amount into a steadier form of value. This usually takes a few minutes.',
        confirmText: 'Convert',
        cancelText: 'Cancel',
      });
      if (ok) simulateAsync(actionEl, 'Converting…', 'Done — your stable balance is updated.');
      break;
    }

    case 'send-money': {
      const ok = await openModal({
        title: 'Send money?',
        body: 'You’ll pick a saved contact or enter details we can verify for you.',
        confirmText: 'Continue',
        cancelText: 'Cancel',
      });
      if (ok) showToast('Opening send flow…');
      break;
    }

    case 'receive-money': {
      const ok = await openModal({
        title: 'Receive money?',
        body: 'We’ll show a simple code you can share. No long codes to copy by hand.',
        confirmText: 'Show my code',
        cancelText: 'Cancel',
      });
      if (ok) showToast('Your receive code is ready to share.');
      break;
    }

    case 'lock-now': {
      const days = $('.chip--lock.is-active')?.dataset.lock ?? '30';
      const ok = await openModal({
        title: `Lock for ${days} days?`,
        body: 'During this time, the locked amount won’t be available to withdraw. Everything else stays flexible.',
        confirmText: 'Lock now',
        cancelText: 'Cancel',
      });
      if (ok) {
        simulateAsync(actionEl, 'Locking your savings…', `Locked for ${days} days. Growth rate updated.`, 1400, closeStack);
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

const savedSession = readSavedSession();
if (savedSession?.loggedIn) {
  enterApp(savedSession.profileLabel ?? undefined);
}
