import { ChainId, StarkZap } from 'starkzap';
import { starknetSepolia } from '../config/starknet.js';

/** @type {StarkZap | null} */
let instance = null;

/**
 * Shared StarkZap SDK — Sepolia, Cartridge-compatible RPC, Voyager links.
 * Matches `docs/USER_WORKFLOW.md` (swap / Vesu / paymaster use this instance downstream).
 * Agent reference: `starkzap-skill/SKILL.md` (naming: `StarkZap` vs skill’s `StarkSDK`).
 */
export function getStarkZap() {
  if (!instance) {
    instance = new StarkZap({
      rpcUrl: starknetSepolia.rpcUrl,
      chainId: ChainId.SEPOLIA,
      explorer: { baseUrl: starknetSepolia.voyagerBaseUrl },
    });
  }
  return instance;
}

/** Build a separate SDK instance (tests / alternate RPC). @param {object} config */
export function createStarkZap(config) {
  return new StarkZap(config);
}
