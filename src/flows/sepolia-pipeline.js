/**
 * Sepolia pipeline bound to the active Cartridge session.
 */
export {
  assertSpendableBalance,
  quoteStrkToUsdc,
  swapStrkToUsdc,
  pickUsdcSupplyMarket,
  depositUsdcToVesu,
  saveSwapDepositOneTick,
  executeRawCalls,
} from './sepolia-save-swap-deposit.js';

import { saveSwapDepositOneTick as runTick } from './sepolia-save-swap-deposit.js';
import { requireConnectedWallet } from '../wallet/starkzap-connection.js';

/**
 * @param {string} saveAmountStrk — e.g. "5"
 */
export async function runConnectedSaveSwapDeposit(saveAmountStrk) {
  const wallet = requireConnectedWallet();
  return runTick(wallet, saveAmountStrk);
}
