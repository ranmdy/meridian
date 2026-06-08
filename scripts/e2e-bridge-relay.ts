/**
 * Bridge relay E2E test (Sepolia)
 *
 * Flow:
 *   1. Sign destination verification message
 *   2. executeStrategy(BRIDGE + SETTLE) on-chain
 *   3. Parse strategyId from StrategyStarted log
 *   4. Register with backend (POST /strategy/execute) including onChainSteps
 *   5. Poll GET /strategy/:id/status until status === 'completed'
 *      → confirms relayer called continueStrategy and funds settled
 *
 * Usage (from project root):
 *   source contracts/.env && npx tsx scripts/e2e-bridge-relay.ts
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  encodePacked,
  keccak256,
  decodeEventLog,
  parseAbi,
} from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// ── Config ────────────────────────────────────────────────────────────────────

const PRIVATE_KEY     = process.env.PRIVATE_KEY as `0x${string}`;
const RPC_URL         = process.env.ETH_SEPOLIA_RPC_URL as string;
const ROUTER_ADDRESS  = '0x0a2214F676ab38283ce180D1bd4FB114f26d6445' as const;
const BACKEND_URL     = process.env.BACKEND_URL ?? 'http://localhost:3001';
const SEND_AMOUNT     = parseEther('0.001');
const CHAIN_ID        = 11155111;

if (!PRIVATE_KEY) throw new Error('PRIVATE_KEY not set');
if (!RPC_URL)     throw new Error('ETH_SEPOLIA_RPC_URL not set');

// ── ABIs ──────────────────────────────────────────────────────────────────────

const ROUTER_ABI = parseAbi([
  'function executeStrategy((address sourceAsset, uint256 sourceAmount, (uint8 stepType, address protocol, bytes params, uint256 minOutput, address outputAsset)[] steps, address destinationWallet, bytes destinationSignature, uint256 deadline, address creator) strategy) payable',
  'event StrategyStarted(bytes32 indexed strategyId, address indexed user, uint256 amount, address sourceAsset, address destinationWallet)',
]);

// ── StepType enum ─────────────────────────────────────────────────────────────

const STEP_BRIDGE = 2;
const STEP_SETTLE = 4;
const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Build and sign the destination verification message.
 * Must match _verifyDestination in MeridianRouter.sol exactly:
 *
 *   keccak256(abi.encodePacked(
 *     "Meridian destination verification\n",
 *     "Chain: ", block.chainid, "\n",
 *     "I confirm this wallet is mine: ", destination,
 *     "\nUser: ", user,
 *     "\nDeadline: ", deadline
 *   ))
 *
 * Note: Solidity abi.encodePacked encodes uint256 as 32 bytes and address as 20 bytes.
 * viem encodePacked does the same when types are specified.
 */
function buildDestinationMessage(
  chainId: number,
  destination: `0x${string}`,
  user: `0x${string}`,
  deadline: bigint,
): `0x${string}` {
  return keccak256(
    encodePacked(
      ['string', 'string', 'uint256', 'string', 'string', 'address', 'string', 'address', 'string', 'uint256'],
      [
        'Meridian destination verification\n',
        'Chain: ',
        BigInt(chainId),
        '\n',
        'I confirm this wallet is mine: ',
        destination,
        '\nUser: ',
        user,
        '\nDeadline: ',
        deadline,
      ],
    ),
  );
}

async function pollStatus(strategyId: string, maxWaitMs = 120_000): Promise<string> {
  const start = Date.now();
  const endpoint = `${BACKEND_URL}/strategy/${strategyId}/status`;

  while (Date.now() - start < maxWaitMs) {
    try {
      const res  = await fetch(endpoint);
      const body = await res.json() as { status?: string; steps?: unknown[] };
      const s    = body.status ?? 'unknown';
      console.log(`  [poll] status=${s}  (${Math.round((Date.now() - start) / 1000)}s elapsed)`);
      if (s === 'completed') return s;
      if (s === 'failed')    throw new Error(`Strategy failed on-chain`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Strategy failed')) throw err;
      console.warn(`  [poll] fetch error: ${err}`);
    }
    await sleep(3_000);
  }
  throw new Error(`Timed out waiting for strategy to complete (${maxWaitMs / 1000}s)`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL),
  });
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL),
  });

  const deployer = account.address;
  const balance  = await publicClient.getBalance({ address: deployer });

  console.log('=== Meridian Bridge Relay E2E ===');
  console.log(`Chain    : Sepolia (${CHAIN_ID})`);
  console.log(`Router   : ${ROUTER_ADDRESS}`);
  console.log(`Wallet   : ${deployer}`);
  console.log(`Balance  : ${Number(balance) / 1e15} mETH`);
  console.log(`Backend  : ${BACKEND_URL}`);
  console.log('');

  if (balance < SEND_AMOUNT * 2n) {
    throw new Error(`Insufficient ETH: need at least ${Number(SEND_AMOUNT * 2n) / 1e18} ETH`);
  }

  // ── 1. Build strategy ──────────────────────────────────────────────────────

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  // Build & sign the destination message (destination == sender for this test).
  // signMessage({ message: { raw: hash } }) applies EIP-191 prefix matching
  // MessageHashUtils.toEthSignedMessageHash(message) in Solidity.
  const msgHash = buildDestinationMessage(CHAIN_ID, deployer, deployer, deadline);
  const destSig = await account.signMessage({ message: { raw: msgHash } });

  const steps = [
    {
      stepType:    STEP_BRIDGE,
      protocol:    ETH_ADDRESS,
      params:      '0x' as `0x${string}`,
      minOutput:   0n,
      outputAsset: ETH_ADDRESS,
    },
    {
      stepType:    STEP_SETTLE,
      protocol:    ETH_ADDRESS,
      params:      '0x' as `0x${string}`,
      minOutput:   0n,
      outputAsset: ETH_ADDRESS,
    },
  ];

  console.log('[Step 1] Sending executeStrategy(BRIDGE + SETTLE)...');
  const hash = await walletClient.writeContract({
    address: ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: 'executeStrategy',
    args: [
      {
        sourceAsset:          ETH_ADDRESS,
        sourceAmount:         SEND_AMOUNT,
        steps,
        destinationWallet:    deployer,
        destinationSignature: destSig,
        deadline,
        creator:              ETH_ADDRESS,
      },
    ],
    value: SEND_AMOUNT,
  });
  console.log(`  tx hash: ${hash}`);

  // ── 2. Wait for receipt & parse strategyId ─────────────────────────────────

  console.log('[Step 2] Waiting for receipt...');
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });

  if (receipt.status !== 'success') {
    throw new Error(`Transaction reverted! Check ${hash} on Sepolia Etherscan`);
  }
  console.log(`  block: ${receipt.blockNumber}  gas: ${receipt.gasUsed}`);

  let strategyId: `0x${string}` | undefined;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: ROUTER_ABI,
        eventName: 'StrategyStarted',
        data: log.data,
        topics: log.topics,
      });
      strategyId = decoded.args.strategyId as `0x${string}`;
      break;
    } catch {
      // not this log
    }
  }

  if (!strategyId) throw new Error('StrategyStarted event not found in receipt logs');
  console.log(`  strategyId: ${strategyId}`);

  // ── 3. Register with backend ───────────────────────────────────────────────

  console.log('[Step 3] Registering with backend...');
  const registerBody = {
    strategyId,
    walletAddress:   deployer,
    sourceAsset:     'ETH',
    sourceChain:     CHAIN_ID,
    destinationChain: CHAIN_ID,
    sourceAmountUsd: 3,     // ~$3 for 0.001 ETH at ~$3000
    stepCount:       steps.length,
    initialTxHash:   hash,
    onChainSteps:    steps.map((s) => ({
      stepType:    s.stepType,
      protocol:    s.protocol,
      params:      s.params,
      minOutput:   s.minOutput.toString(),
      outputAsset: s.outputAsset,
    })),
  };

  const registerRes = await fetch(`${BACKEND_URL}/strategy/execute`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(registerBody),
  });
  const registerData = await registerRes.json();

  if (!registerRes.ok) {
    console.warn(`  backend registration failed (${registerRes.status}):`, JSON.stringify(registerData));
    console.warn('  Continuing — relayer may still pick up the on-chain event directly.');
  } else {
    console.log(`  registered OK:`, JSON.stringify(registerData));
  }

  // ── 4. Poll until completed ────────────────────────────────────────────────

  console.log('[Step 4] Polling status until relayer completes the strategy...');
  console.log('  (relayer should call continueStrategy → router settles → StrategyCompleted)');

  const finalStatus = await pollStatus(strategyId, 120_000);
  console.log(`\n  Final status: ${finalStatus}`);
  console.log('\n=== PASS: Bridge relay flow completed end-to-end ===');
}

main().catch((err) => {
  console.error('\n=== FAIL ===');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
