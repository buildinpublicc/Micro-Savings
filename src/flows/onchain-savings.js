/**
 * On-chain savings pipeline hooks (StarkZap).
 * Maps to `docs/USER_WORKFLOW.md`: swap to stable (AVNU) → yield (Vesu).
 * Extend with real token addresses and market ids from your backend.
 */
import { getActiveWallet } from '../wallet/starkzap-connection.js';

export function requireConnectedWallet() {
  const w = getActiveWallet();
  if (!w) {
    throw new Error('Connect your account first.');
  }
  return w;
}

/** Vesu (and other registered providers) via StarkZap `LendingClient`. */
export function lendingClient() {
  return requireConnectedWallet().lending();
}

/**
 * AVNU / Ekubo swaps — use `wallet.swap(...)` with the right `SwapInput`
 * (see Starkzap swap docs). This helper only ensures a session exists.
 */
export function swapContext() {
  return requireConnectedWallet();
}
