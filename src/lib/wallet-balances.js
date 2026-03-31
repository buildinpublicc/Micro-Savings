/**
 * Shared read of STRK / USDC balances for the active Cartridge session.
 */

/**
 * @returns {Promise<{ strk: import('starkzap').Amount, usdc: import('starkzap').Amount } | null>}
 */
export async function readConnectedWalletBalances() {
  const { getActiveWallet } = await import('../wallet/starkzap-connection.js');
  const { assertSpendableBalance } = await import('../flows/sepolia-save-swap-deposit.js');
  const { sepoliaTokens } = await import('starkzap');
  const w = getActiveWallet();
  if (!w) return null;
  const [strk, usdc] = await Promise.all([
    assertSpendableBalance(w, sepoliaTokens.STRK),
    assertSpendableBalance(w, sepoliaTokens.USDC),
  ]);
  return { strk, usdc };
}
