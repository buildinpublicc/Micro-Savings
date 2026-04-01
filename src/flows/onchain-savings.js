/**
 * On-chain savings hooks (Starkzap on Sepolia).
 * Full save → swap → deposit: `sepolia-save-swap-deposit.js`.
 */
import { requireConnectedWallet } from '../wallet/starkzap-connection.js';

export { requireConnectedWallet };

export {
  assertSpendableBalance,
  quoteStrkToUsdc,
  quoteUsdcToStrk,
  swapStrkToUsdc,
  swapUsdcToStrk,
  depositUsdcToVesu,
  withdrawUsdcFromVesu,
  saveSwapDepositOneTick,
  withdrawSavingsOneTick,
  pickUsdcSupplyMarket,
  executeRawCalls,
} from './sepolia-save-swap-deposit.js';

export {
  runConnectedSaveSwapDeposit,
  runConnectedSwapStrkToUsdc,
  runConnectedWithdrawFromVesu,
} from './sepolia-pipeline.js';

export function lendingClient() {
  return requireConnectedWallet().lending();
}

export function swapContext() {
  return requireConnectedWallet();
}
