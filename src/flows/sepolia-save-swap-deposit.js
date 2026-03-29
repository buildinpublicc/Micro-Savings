/**
 * Starkzap / Starknet Sepolia — save slice → AVNU swap → Vesu deposit.
 *
 * Building blocks for Micro-Savings. Use after `WalletInterface` is connected (e.g. Cartridge).
 * Tokens: `sepoliaTokens` from Starkzap (AVNU-sourced presets).
 *
 * @see https://docs.starknet.io/build/starkzap/
 */

import { Amount, sepoliaTokens } from 'starkzap';

/** Typical slippage: 50 bps = 0.5% */
const DEFAULT_SLIPPAGE_BPS = 50n;

/**
 * “Save” here = assets already in the user wallet for this tick (e.g. STRK).
 * Replace with your own funding path if value arrives another way.
 *
 * @param {import('starkzap').WalletInterface} wallet
 * @param {import('starkzap').Token} token
 */
export async function assertSpendableBalance(wallet, token) {
  return wallet.balanceOf(token);
}

/**
 * @param {import('starkzap').WalletInterface} wallet
 * @param {import('starkzap').Amount} amountIn — e.g. Amount.parse("25", sepoliaTokens.STRK)
 */
export async function quoteStrkToUsdc(wallet, amountIn) {
  return wallet.getQuote({
    tokenIn: sepoliaTokens.STRK,
    tokenOut: sepoliaTokens.USDC,
    amountIn,
    slippageBps: DEFAULT_SLIPPAGE_BPS,
  });
}

/**
 * AVNU swap on Sepolia (`provider: 'avnu'`).
 *
 * @param {import('starkzap').WalletInterface} wallet
 * @param {import('starkzap').Amount} amountIn
 */
export async function swapStrkToUsdc(wallet, amountIn) {
  const tx = await wallet.swap(
    {
      tokenIn: sepoliaTokens.STRK,
      tokenOut: sepoliaTokens.USDC,
      amountIn,
      provider: 'avnu',
      slippageBps: DEFAULT_SLIPPAGE_BPS,
    },
    { feeMode: 'sponsored' },
  );
  await tx.wait();
  return tx;
}

/**
 * @param {import('starkzap').LendingMarket[]} markets
 */
export function pickUsdcSupplyMarket(markets) {
  return (
    markets.find((m) => m.asset.symbol === 'USDC') ??
    markets.find((m) => m.asset.symbol === 'USDC.e')
  );
}

/**
 * Vesu supply / earn deposit for USDC.
 *
 * @param {import('starkzap').WalletInterface} wallet
 * @param {import('starkzap').Amount} amountUsdc
 * @param {import('starkzap').Address} [poolAddress]
 */
export async function depositUsdcToVesu(wallet, amountUsdc, poolAddress) {
  const lending = wallet.lending();
  const markets = await lending.getMarkets({ provider: 'vesu' });
  const market = pickUsdcSupplyMarket(markets);
  if (!market) {
    throw new Error('No USDC Vesu market returned for Sepolia');
  }
  const pool = poolAddress ?? market.poolAddress;
  const tx = await lending.deposit(
    {
      token: sepoliaTokens.USDC,
      amount: amountUsdc,
      poolAddress: pool,
      provider: 'vesu',
    },
    { feeMode: 'sponsored' },
  );
  await tx.wait();
  return tx;
}

/**
 * One scheduler tick: quote → swap STRK→USDC → deposit USDC to Vesu.
 * Uses 99% of quoted USDC out as a safety margin vs execution slippage.
 *
 * @param {import('starkzap').WalletInterface} wallet
 * @param {string | import('starkzap').Amount} saveAmountStrk
 */
export async function saveSwapDepositOneTick(wallet, saveAmountStrk) {
  const amountIn =
    typeof saveAmountStrk === 'string'
      ? Amount.parse(saveAmountStrk, sepoliaTokens.STRK)
      : saveAmountStrk;

  const quote = await quoteStrkToUsdc(wallet, amountIn);
  await swapStrkToUsdc(wallet, amountIn);

  const safeOut = (quote.amountOutBase * 99n) / 100n;
  const depositAmount = Amount.fromRaw(safeOut, sepoliaTokens.USDC);
  await depositUsdcToVesu(wallet, depositAmount);
}

/**
 * starknet.js escape hatch: execute arbitrary calls with the same account + paymaster.
 *
 * @param {import('starkzap').WalletInterface} wallet
 * @param {import('starknet').Call[]} calls
 */
export async function executeRawCalls(wallet, calls) {
  const tx = await wallet.execute(calls, { feeMode: 'sponsored' });
  await tx.wait();
  return tx;
}
