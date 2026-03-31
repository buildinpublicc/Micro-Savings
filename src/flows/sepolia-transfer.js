/**
 * ERC20 send on Sepolia (Starkzap + Cartridge).
 */

import { Amount, fromAddress, sepoliaTokens } from 'starkzap';

/**
 * @param {'STRK' | 'USDC'} tokenKey
 */
function tokenFromKey(tokenKey) {
  return tokenKey === 'STRK' ? sepoliaTokens.STRK : sepoliaTokens.USDC;
}

/**
 * @param {import('starkzap').WalletInterface} wallet
 * @param {'STRK' | 'USDC'} tokenKey
 * @param {string} recipientHex
 * @param {string} amountHuman
 */
export async function transferSepoliaToken(wallet, tokenKey, recipientHex, amountHuman) {
  const token = tokenFromKey(tokenKey);
  const to = fromAddress(recipientHex.trim());
  const amount = Amount.parse(String(amountHuman).trim(), token);
  const tx = await wallet.transfer(token, [{ to, amount }], { feeMode: 'sponsored' });
  await tx.wait();
  return tx;
}
