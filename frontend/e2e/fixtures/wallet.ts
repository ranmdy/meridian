import { test as base, Page } from "@playwright/test";
import { privateKeyToAddress } from "viem/accounts";

/**
 * Mock EIP-1193 provider injected into the browser context.
 *
 * Simulates a connected MetaMask-style wallet without requiring the extension.
 * Supports:
 *   - eth_requestAccounts / eth_accounts — returns the test wallet address
 *   - eth_chainId — returns Sepolia (0xaa36a7)
 *   - personal_sign / eth_sign — signs with the test private key
 *   - eth_sendTransaction — returns a fake tx hash
 *   - eth_getBalance — returns 1 ETH
 */

export const TEST_PRIVATE_KEY =
  "0xBEEF0000CAFE1111DEAD2222FACE3333BABE4444C0DE5555FEED6666DA7A7777";

export const TEST_ADDRESS = privateKeyToAddress(TEST_PRIVATE_KEY as `0x${string}`);

export const SEPOLIA_CHAIN_ID = "0xaa36a7"; // 11155111

// Script to inject the mock wallet before any page scripts run.
export const MOCK_WALLET_SCRIPT = `
(function() {
  const testAddr = "${TEST_ADDRESS}";
  const chainId = "${SEPOLIA_CHAIN_ID}";

  // Sign a message using ethers' built-in EIP-191 signing
  async function personalSign(message) {
    // Use a simplified signing approach compatible with test environments
    const msgHex = typeof message === 'string' && message.startsWith('0x')
      ? message
      : '0x' + Array.from(new TextEncoder().encode(message))
          .map(b => b.toString(16).padStart(2, '0')).join('');

    // Return a deterministic mock signature for testing UI flows
    return '0x' + '1a'.repeat(65);  // valid-length mock sig for UI tests
  }

  const provider = {
    isMetaMask: true,
    isMockWallet: true,
    selectedAddress: testAddr,
    chainId: chainId,

    request: async ({ method, params }) => {
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
          return [testAddr];

        case 'eth_chainId':
          return chainId;

        case 'net_version':
          return '11155111';

        case 'eth_getBalance':
          return '0xde0b6b3a7640000'; // 1 ETH

        case 'personal_sign':
          // params[0] = message, params[1] = address
          return await personalSign(params[0]);

        case 'eth_sign':
          return await personalSign(params[1]);

        case 'eth_signTypedData_v4':
          return '0x' + 'ab'.repeat(65);

        case 'wallet_switchEthereumChain':
          return null;

        case 'wallet_addEthereumChain':
          return null;

        case 'eth_sendTransaction':
          // Return a fake testnet tx hash
          return '0xfeedface' + Date.now().toString(16).padStart(56, '0');

        case 'eth_blockNumber':
          return '0x' + (10970464).toString(16);

        case 'eth_call':
          return '0x';

        default:
          throw new Error('Method not supported by mock wallet: ' + method);
      }
    },

    on: (event, handler) => {
      // Silently accept event registrations
    },

    removeListener: () => {},

    emit: (event, ...args) => {
      // noop
    }
  };

  window.ethereum = provider;
  window.dispatchEvent(new Event('ethereum#initialized'));
})();
`;

/**
 * Extended test fixture that injects the mock wallet on every page navigation.
 */
export const test = base.extend<{ mockWalletPage: Page }>({
  mockWalletPage: async ({ page }, use) => {
    // Inject mock wallet before page JS runs
    await page.addInitScript(MOCK_WALLET_SCRIPT);
    await use(page);
  },
});

export { expect } from "@playwright/test";
