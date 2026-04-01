/**
 * Starkzap / Starknet Sepolia — save slice → AVNU swap → Vesu deposit.
 *
 * Building blocks for Micro-Savings. Use after `WalletInterface` is connected (e.g. Cartridge).
 * Tokens: `sepoliaTokens` from Starkzap (AVNU-sourced presets).
 *
 * Integration notes: `starkzap-skill/SKILL.md` (Address/Amount, preflight, sponsored fees).
 *
 * @see https://docs.starknet.io/build/starkzap/
 */

import { Amount, fromAddress, sepoliaTokens } from 'starkzap';

/** Typical slippage: 50 bps = 0.5% */
const DEFAULT_SLIPPAGE_BPS = 50n;

/**
 * “Save” here = assets already in the user wallet for this tick (e.g. STRK).
 * Replace with your own funding path if value arrives another way.
 *
 * @param {import('starkzap').WalletInterface} wallet
 * @param {import('starkzap').Token} token
 * @returns {Promise<import('starkzap').Amount>} Use `.toUnit()` / `.toFormatted()` in UI (not string coercion).
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
 * @param {import('starkzap').WalletInterface} wallet
 * @param {import('starkzap').Amount} amountIn — e.g. Amount.parse("25", sepoliaTokens.USDC)
 */
export async function quoteUsdcToStrk(wallet, amountIn) {
  return wallet.getQuote({
    tokenIn: sepoliaTokens.USDC,
    tokenOut: sepoliaTokens.STRK,
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
 * AVNU swap on Sepolia (`provider: 'avnu'`).
 *
 * @param {import('starkzap').WalletInterface} wallet
 * @param {import('starkzap').Amount} amountIn
 */
export async function swapUsdcToStrk(wallet, amountIn) {
  const tx = await wallet.swap(
    {
      tokenIn: sepoliaTokens.USDC,
      tokenOut: sepoliaTokens.STRK,
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
 * @param {import('starkzap').Address | string | undefined} [poolAddress] — plain hex strings are coerced with `fromAddress`
 */
export async function depositUsdcToVesu(wallet, amountUsdc, poolAddress) {
  const lending = wallet.lending();
  const markets = await lending.getMarkets({ provider: 'vesu' });
  const market = pickUsdcSupplyMarket(markets);
  if (!market) {
    throw new Error('No USDC Vesu market returned for Sepolia');
  }
  const pool =
    poolAddress == null
      ? market.poolAddress
      : typeof poolAddress === 'string'
        ? fromAddress(poolAddress)
        : poolAddress;
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
 * Withdraw supplied USDC from Vesu back into wallet balance.
 *
 * @param {import('starkzap').WalletInterface} wallet
 * @param {import('starkzap').Amount} amountUsdc
 * @param {import('starkzap').Address | string | undefined} [poolAddress]
 */
export async function withdrawUsdcFromVesu(wallet, amountUsdc, poolAddress) {
  const lending = wallet.lending();
  const markets = await lending.getMarkets({ provider: 'vesu' });
  const market = pickUsdcSupplyMarket(markets);
  if (!market) {
    throw new Error('No USDC Vesu market returned for Sepolia');
  }
  const pool =
    poolAddress == null
      ? market.poolAddress
      : typeof poolAddress === 'string'
        ? fromAddress(poolAddress)
        : poolAddress;

  const tx = await lending.withdraw(
    {
      token: sepoliaTokens.USDC,
      amount: amountUsdc,
      poolAddress: pool,
      provider: 'vesu',
      receiver: wallet.address,
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
 * Withdraw from Vesu and optionally convert to STRK before finishing in wallet balance.
 *
 * @param {import('starkzap').WalletInterface} wallet
 * @param {string | import('starkzap').Amount} amountUsdc
 * @param {{ convertToStrk?: boolean }} [opts]
 */
export async function withdrawSavingsOneTick(wallet, amountUsdc, opts = {}) {
  const requested =
    typeof amountUsdc === 'string'
      ? Amount.parse(amountUsdc, sepoliaTokens.USDC)
      : amountUsdc;

  const usdcBefore = await wallet.balanceOf(sepoliaTokens.USDC);
  const withdrawTx = await withdrawUsdcFromVesu(wallet, requested);

  if (!opts.convertToStrk) {
    return { withdrawTx, swapTx: null };
  }

  const usdcAfter = await wallet.balanceOf(sepoliaTokens.USDC);
  const delta = usdcAfter.toBase() - usdcBefore.toBase();
  if (delta <= 0n) {
    throw new Error('Withdraw succeeded but no USDC became available to swap. Try again in a moment.');
  }

  const swapAmount = Amount.fromRaw(delta, sepoliaTokens.USDC);
  const swapTx = await swapUsdcToStrk(wallet, swapAmount);
  return { withdrawTx, swapTx };
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
