/**
 * On-chain savings hooks (Starkzap on Sepolia).
 * Full save → swap → deposit: `sepolia-save-swap-deposit.js`.
 */
import { requireConnectedWallet } from '../wallet/starkzap-connection.js';

export { requireConnectedWallet };

export {
  assertSpendableBalance,
  quoteStrkToUsdc,
  swapStrkToUsdc,
  depositUsdcToVesu,
  saveSwapDepositOneTick,
  pickUsdcSupplyMarket,
  executeRawCalls,
} from './sepolia-save-swap-deposit.js';

export { runConnectedSaveSwapDeposit, runConnectedSwapStrkToUsdc } from './sepolia-pipeline.js';

export function lendingClient() {
  return requireConnectedWallet().lending();
}

export function swapContext() {
  return requireConnectedWallet();
}
