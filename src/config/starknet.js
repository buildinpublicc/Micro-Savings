/**
 * Starknet Sepolia testnet defaults.
 * Used by StarkZap (`src/sdk/starkzap-client.js`) and explorer links.
 * Override with VITE_STARKNET_RPC_URL / VITE_STARKNET_EXPLORER_URL in `.env` if needed.
 */

/** ASCII-derived chain id for `SN_SEPOLIA` (matches starknet.js `StarknetChainId.SN_SEPOLIA`). */
export const SN_SEPOLIA_CHAIN_ID = '0x534e5f5345504f4c4941';

const rpcDefault = 'https://api.cartridge.gg/x/starknet/sepolia';
const explorerDefault = 'https://sepolia.voyager.online';

export const starknetSepolia = Object.freeze({
  /** Human-readable network key */
  id: 'SN_SEPOLIA',
  /** Hex chain id for RPC / account checks */
  chainId: SN_SEPOLIA_CHAIN_ID,
  name: 'Starknet Sepolia',
  rpcUrl: import.meta.env.VITE_STARKNET_RPC_URL ?? rpcDefault,
  voyagerBaseUrl: import.meta.env.VITE_STARKNET_EXPLORER_URL ?? explorerDefault,
});

/**
 * @param {string} txHash
 * @returns {string}
 */
export function voyagerTxUrl(txHash) {
  const base = starknetSepolia.voyagerBaseUrl.replace(/\/$/, '');
  return `${base}/tx/${txHash}`;
}

/**
 * @param {string} contractAddress
 * @returns {string}
 */
export function voyagerContractUrl(contractAddress) {
  const base = starknetSepolia.voyagerBaseUrl.replace(/\/$/, '');
  return `${base}/contract/${contractAddress}`;
}
