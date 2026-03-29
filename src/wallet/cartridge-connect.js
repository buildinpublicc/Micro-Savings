import { RpcProvider } from 'starknet';
import { CartridgeWallet } from 'starkzap/cartridge';

/** Match Cartridge `waitForKeychain` default — penpal can take >10s on slow networks. */
const MAX_CONTROLLER_WAIT_MS = 50000;
const INITIAL_CONTROLLER_POLL_MS = 100;
const MAX_CONTROLLER_POLL_MS = 1000;

/**
 * Cartridge shows signup/login methods in `signupOptions` order. Without this, new users
 * often see passkey (webauthn) first. StarkZap's `connectCartridge` does not pass this through.
 * @see https://github.com/cartridge-gg/controller — KeychainOptions.signupOptions
 */
export const CARTRIDGE_SIGNUP_SOCIAL_FIRST = Object.freeze([
  'google',
  'discord',
  'password',
  'webauthn',
]);

function cartridgeDependencyError(extra) {
  return new Error(
    "Cartridge integration requires '@cartridge/controller'. " + (extra ?? ''),
  );
}

async function loadCartridgeControllerModule() {
  let imported;
  try {
    imported = await import('@cartridge/controller');
  } catch (error) {
    const details =
      error instanceof Error && error.message ? `Original error: ${error.message}` : undefined;
    throw cartridgeDependencyError(details);
  }
  const mod = imported;
  if (typeof mod.default !== 'function' || typeof mod.toSessionPolicies !== 'function') {
    throw cartridgeDependencyError('Loaded module does not expose expected exports.');
  }
  return mod;
}

/** @param {string} value @param {string} label */
function assertSafeHttpUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'https:' && protocol !== 'http:') {
    throw new Error(`${label} must use http:// or https://`);
  }
  return parsed;
}

function isCartridgeWalletAccount(value) {
  if (!value || typeof value !== 'object') return false;
  const account = value;
  return (
    typeof account.address === 'string' &&
    typeof account.execute === 'function' &&
    typeof account.executePaymasterTransaction === 'function' &&
    typeof account.signMessage === 'function' &&
    typeof account.simulateTransaction === 'function' &&
    typeof account.estimateInvokeFee === 'function'
  );
}

/**
 * Same as StarkZap `connectCartridge` but forwards `signupOptions` to the Controller so
 * social / password can be listed before passkeys.
 *
 * @param {import('starkzap').StarkZap} sdk
 * @param {import('starkzap').ConnectCartridgeOptions & { signupOptions?: string[] }} [options]
 */
export async function connectCartridgeWithSignupOrder(sdk, options = {}) {
  await sdk.ensureProviderChainMatchesConfig();
  const cfg = sdk.getResolvedConfig();
  const { default: Controller, toSessionPolicies } = await loadCartridgeControllerModule();

  const feeMode = options.feeMode ?? 'user_pays';
  const timeBounds = options.timeBounds;
  const explorer = options.explorer ?? cfg.explorer;
  const signupOptions = options.signupOptions ?? CARTRIDGE_SIGNUP_SOCIAL_FIRST;

  /**
   * Do not set `signupOptions` on the Controller constructor: it is merged into iframe options
   * and can prevent the keychain penpal handshake from completing. Pass order at `connect()` instead
   * (same as Cartridge’s own `connectOptions.signupOptions` path).
   */
  /** @type {Record<string, unknown>} */
  const controllerOptions = {
    defaultChainId: cfg.chainId.toFelt252(),
    chains: [{ rpcUrl: assertSafeHttpUrl(cfg.rpcUrl, 'Cartridge RPC URL').toString() }],
  };

  if (options.policies?.length) {
    controllerOptions.policies = toSessionPolicies(options.policies);
  }
  if (options.preset) {
    controllerOptions.preset = options.preset;
  }
  if (options.url) {
    controllerOptions.url = assertSafeHttpUrl(options.url, 'Cartridge controller URL').toString();
  }

  const controller = new Controller(controllerOptions);

  let waited = 0;
  let pollIntervalMs = INITIAL_CONTROLLER_POLL_MS;
  while (!controller.isReady() && waited < MAX_CONTROLLER_WAIT_MS) {
    const sleepMs = Math.min(pollIntervalMs, MAX_CONTROLLER_WAIT_MS - waited);
    await new Promise((r) => setTimeout(r, sleepMs));
    waited += sleepMs;
    pollIntervalMs = Math.min(pollIntervalMs * 2, MAX_CONTROLLER_POLL_MS);
  }
  if (!controller.isReady()) {
    throw new Error(
      'Cartridge Controller failed to initialize (keychain iframe did not connect in time). ' +
        'Check network, disable strict blockers for this site, and allow third-party cookies if prompted.',
    );
  }

  /** @type {string[]} */
  const signersOrder = Array.from(signupOptions);
  const connectedAccount = await controller.connect(signersOrder);
  if (!isCartridgeWalletAccount(connectedAccount)) {
    throw new Error('Cartridge connection failed. Make sure popups are allowed and try again.');
  }

  const nodeUrl = assertSafeHttpUrl(
    cfg.rpcUrl ?? controller.rpcUrl(),
    'Cartridge RPC URL',
  ).toString();
  const provider = new RpcProvider({ nodeUrl });
  let classHash = '0x0';
  try {
    classHash = await provider.getClassHashAt(connectedAccount.address);
  } catch {
    // undeployed / RPC quirks
  }

  const walletOptions = {
    feeMode,
    timeBounds,
    explorer,
    rpcUrl: cfg.rpcUrl,
    chainId: cfg.chainId,
  };

  return new CartridgeWallet(
    controller,
    connectedAccount,
    provider,
    cfg.chainId,
    classHash,
    cfg.staking,
    cfg.bridging,
    walletOptions,
  );
}
