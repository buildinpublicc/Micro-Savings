/**
 * On-chain savings hooks (Starkzap on Sepolia).
 * Full save → swap → deposit: `sepolia-save-swap-deposit.js`.
 */
import { getActiveWallet } from '../wallet/starkzap-connection.js';

export {
  assertSpendableBalance,
  quoteStrkToUsdc,
  swapStrkToUsdc,
  depositUsdcToVesu,
  saveSwapDepositOneTick,
  pickUsdcSupplyMarket,
  executeRawCalls,
} from './sepolia-save-swap-deposit.js';

export { runConnectedSaveSwapDeposit } from './sepolia-pipeline.js';

export function requireConnectedWallet() {
  const w = getActiveWallet();
  if (!w) {
    throw new Error('Connect your account first.');
  }
  return w;
}

export function lendingClient() {
  return requireConnectedWallet().lending();
}

export function swapContext() {
  return requireConnectedWallet();
}
