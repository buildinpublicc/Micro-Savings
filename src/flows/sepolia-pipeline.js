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

import { saveSwapDepositOneTick as runTick, swapStrkToUsdc } from './sepolia-save-swap-deposit.js';
import { Amount, sepoliaTokens } from 'starkzap';
import { requireConnectedWallet } from '../wallet/starkzap-connection.js';

/**
 * AVNU swap only (STRK → USDC). Use for “convert to stablecoin” without Vesu deposit.
 *
 * @param {string} amountStrk — e.g. "1.5"
 */
export async function runConnectedSwapStrkToUsdc(amountStrk) {
  const wallet = requireConnectedWallet();
  const amountIn = Amount.parse(String(amountStrk).trim(), sepoliaTokens.STRK);
  return swapStrkToUsdc(wallet, amountIn);
}

/**
 * @param {string} saveAmountStrk — e.g. "5"
 */
export async function runConnectedSaveSwapDeposit(saveAmountStrk) {
  const wallet = requireConnectedWallet();
  return runTick(wallet, saveAmountStrk);
}
