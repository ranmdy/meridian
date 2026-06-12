/**
 * Same-chain E2E test (Sepolia) — mirrors the frontend executeStrategy flow.
 *
 * Flow:
 *   1. Sign destination verification
 *   2. executeStrategy(SETTLE) on-chain — sends 0.0005 ETH through router
 *   3. Parse strategyId from StrategyStarted event
 *   4. Register with backend POST /strategy/execute
 *   5. Verify backend marks execution completed (same-chain atomic)
 *
 * Usage:
 *   source contracts/.env && npx tsx scripts/e2e-same-chain.ts
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
  formatEther,
} from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const PRIVATE_KEY    = process.env.PRIVATE_KEY as `0x${string}`;
const RPC_URL        = process.env.ETH_SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const ROUTER_ADDRESS = '0x2871506ADE1cA3cB4F6E86CEA4e3f1CDA820A94c' as const;
const BACKEND_URL    = process.env.BACKEND_URL ?? 'http://localhost:3001';
const SEND_AMOUNT    = parseEther('0.0005');
const CHAIN_ID       = 11155111;
const ETH_ADDRESS    = '0x0000000000000000000000000000000000000000' as const;
const STEP_SETTLE    = 4;

if (!PRIVATE_KEY) throw new Error('PRIVATE_KEY not set');

const ROUTER_ABI = parseAbi([
  'function executeStrategy((address sourceAsset, uint256 sourceAmount, (uint8 stepType, address protocol, bytes params, uint256 minOutput, address outputAsset)[] steps, address destinationWallet, bytes destinationSignature, uint256 deadline, address creator) strategy) payable',
  'event StrategyStarted(bytes32 indexed strategyId, address indexed user, uint256 amount, address sourceAsset, address destinationWallet)',
]);

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

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });

  const deployer = account.address;
  const balance  = await publicClient.getBalance({ address: deployer });

  console.log('=== Meridian Same-Chain E2E Test ===');
  console.log(`Router   : ${ROUTER_ADDRESS}`);
  console.log(`Wallet   : ${deployer}`);
  console.log(`Balance  : ${formatEther(balance)} ETH`);
  console.log(`Sending  : ${formatEther(SEND_AMOUNT)} ETH`);
  console.log('');

  // 1. Build strategy — single SETTLE step (pass-through)
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const msgHash = buildDestinationMessage(CHAIN_ID, deployer, deployer, deadline);
  const destSig = await account.signMessage({ message: { raw: msgHash } });

  const steps = [
    {
      stepType:    STEP_SETTLE,
      protocol:    ETH_ADDRESS,
      params:      '0x' as `0x${string}`,
      minOutput:   0n,
      outputAsset: ETH_ADDRESS,
    },
  ];

  // 2. Send executeStrategy on-chain
  console.log('[1/4] Calling executeStrategy(SETTLE)...');
  const hash = await walletClient.writeContract({
    address: ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: 'executeStrategy',
    args: [{
      sourceAsset:          ETH_ADDRESS,
      sourceAmount:         SEND_AMOUNT,
      steps,
      destinationWallet:    deployer,
      destinationSignature: destSig,
      deadline,
      creator:              ETH_ADDRESS,
    }],
    value: SEND_AMOUNT,
  });
  console.log(`  tx: ${hash}`);

  // 3. Wait for receipt
  console.log('[2/4] Waiting for receipt...');
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== 'success') {
    throw new Error(`TX REVERTED — check https://sepolia.etherscan.io/tx/${hash}`);
  }
  console.log(`  block: ${receipt.blockNumber}  gas: ${receipt.gasUsed}`);

  // Parse strategyId
  let strategyId: `0x${string}` | undefined;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: ROUTER_ABI, eventName: 'StrategyStarted', data: log.data, topics: log.topics });
      strategyId = decoded.args.strategyId as `0x${string}`;
      break;
    } catch { /* not this log */ }
  }
  if (!strategyId) throw new Error('StrategyStarted event not found');
  console.log(`  strategyId: ${strategyId}`);

  // 4. Register with backend
  console.log('[3/4] Registering with backend...');
  const res = await fetch(`${BACKEND_URL}/strategy/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      strategyId,
      walletAddress: deployer,
      sourceAsset: 'ETH',
      sourceChain: CHAIN_ID,
      destinationChain: CHAIN_ID,
      sourceAmountUsd: 1.5,
      stepCount: steps.length,
      initialTxHash: hash,
      onChainSteps: steps.map((s) => ({
        stepType: s.stepType,
        protocol: s.protocol,
        params: s.params,
        minOutput: s.minOutput.toString(),
        outputAsset: s.outputAsset,
      })),
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Backend registration failed (${res.status}): ${JSON.stringify(body)}`);
  console.log(`  registered: status=${body.status}`);

  // 5. Check status — should be completed immediately (same-chain atomic)
  console.log('[4/4] Checking execution status...');
  const statusRes = await fetch(`${BACKEND_URL}/strategy/${strategyId}/status`);
  const status = await statusRes.json() as { status: string; steps?: unknown[] };
  console.log(`  status: ${status.status}`);

  if (status.status === 'completed') {
    console.log(`\n  TX: https://sepolia.etherscan.io/tx/${hash}`);
    console.log('\n=== PASS: Same-chain execution works end-to-end ===');
  } else {
    console.log(`\n  Unexpected status: ${status.status}`);
    console.log('  Full response:', JSON.stringify(status, null, 2));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n=== FAIL ===');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
