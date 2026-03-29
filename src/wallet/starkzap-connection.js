import { getStarkZap } from '../sdk/starkzap-client.js';
import { connectCartridgeWithSignupOrder } from './cartridge-connect.js';

/** @type {import('starkzap').WalletInterface | null} */
let activeWallet = null;

/**
 * Connect via Cartridge Controller (social / passkey / email in the Controller UI).
 * Uses signup order so Google / Discord / password appear before passkeys for new users
 * (StarkZap’s `connectCartridge` does not pass `signupOptions` through).
 * @param {import('starkzap').ConnectCartridgeOptions} [options]
 */
export async function connectCartridge(options) {
  const sdk = getStarkZap();
  const wallet = await connectCartridgeWithSignupOrder(sdk, {
    feeMode: 'sponsored',
    ...options,
  });
  await wallet.ensureReady({ deploy: 'if_needed' });
  activeWallet = wallet;
  return wallet;
}

/** @returns {import('starkzap').WalletInterface | null} */
export function getActiveWallet() {
  return activeWallet;
}

export async function disconnectActiveWallet() {
  if (!activeWallet) return;
  try {
    await activeWallet.disconnect();
  } finally {
    activeWallet = null;
  }
}

/**
 * Short display for settings header (no full “wallet address” UX).
 * @returns {Promise<string | undefined>}
 */
export async function getWalletDisplayName() {
  const w = activeWallet;
  if (!w) return undefined;
  try {
    const name = await w.username?.();
    if (name) return name;
    const addr = String(w.address);
    return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
  } catch {
    return undefined;
  }
}
