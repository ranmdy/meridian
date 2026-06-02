/**
 * Bridge Event Listener Service
 *
 * Subscribes to destination-chain contract events so Meridian knows when
 * a cross-chain transfer has settled, and can mark executions complete.
 *
 * Bridges supported:
 *   - Across v3   → FilledV3Relay(inputToken, outputToken, inputAmount,
 *                     outputAmount, repaymentChainId, originChainId, depositId,
 *                     fillDeadline, exclusivityDeadline, exclusiveRelayer,
 *                     relayer, depositor, recipient, message, relayExecutionInfo)
 *   - Stargate v2 → OFTReceived(guid, srcEid, toAddress, amountReceivedLD)
 *
 * Phase 1: in-process event bus (Map of callbacks).
 * Phase 2: write to Redis stream so multiple workers can consume.
 *
 * Transport selection (automatic via rpcTransport):
 *   - wss:// or ws:// URL  → viem webSocket() transport  (real-time push, preferred)
 *   - https:// URL         → viem http() transport        (polling fallback)
 *   - No URL configured    → chain is silently skipped
 *
 * Env vars read via config (ETH_RPC_URL / ETH_RPC_URL_FALLBACK, etc.) — set in .env.
 */

import { createPublicClient, type PublicClient, type Abi } from 'viem';
import { rpcTransport } from '../rpc-transport/index.js';
import { config } from '../../config/index.js';
import { mainnet, arbitrum, base, optimism, polygon, bsc, avalanche, scroll, zkSync } from 'viem/chains';
import { EventEmitter } from 'node:events';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface BridgeFillEvent {
  bridge:       'across' | 'stargate';
  chainId:      number;          // destination chain
  originChainId?: number;        // for Across
  depositId?:   bigint;          // for Across
  guid?:        `0x${string}`;   // for Stargate
  recipient:    `0x${string}`;
  outputToken:  `0x${string}`;
  outputAmount: bigint;
  relayer?:     `0x${string}`;   // for Across
  blockNumber:  bigint;
  txHash:       `0x${string}`;
  timestamp:    number;
}

export type FillCallback = (event: BridgeFillEvent) => void;

// ─── Across v3 SpokePool addresses per chain ──────────────────────────────────

const ACROSS_SPOKE_POOLS: Partial<Record<number, `0x${string}`>> = {
  1:      '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5',
  42161:  '0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A',
  8453:   '0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64',
  10:     '0x6f26Bf09B1C792e3228e5467807a900A503c0281',
  137:    '0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096',
  56:     '0x7f55C57dC42AFAaEC18bEF8DaDD78cf064e49059',
  43114:  '0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096',
  534352: '0x3baD7AD0728f9917d1Bf08af5782dCbD516cDd96',
  324:    '0xE0B015E54d54fc84a6cB9B666099c46adE9335FF',
};

// ─── Stargate v2 Pool addresses per chain (USDC pool as representative) ───────

const STARGATE_POOLS: Partial<Record<number, `0x${string}`>> = {
  1:      '0xc026395860Db2d07ee33e05fE50ed7bD583189C7', // Stargate USDC pool ETH
  42161:  '0xe8CDF27AcD73a434D661C84887215F7598e7d0d3',
  8453:   '0x27a16dc786820B16E5c9028b75B99F6f604b5d26',
  10:     '0xcE8CcA271Ebc0533920C83d39F417ED6A0abB7D0',
  137:    '0x9Aa02D4Fae7F58b8E8f34c66E756cC734DAc7fe4',
  43114:  '0x45A01E4e04F14f7A4a6702c74187c5F6222033cd',
};

// ─── ABI fragments ─────────────────────────────────────────────────────────────

const ACROSS_ABI = [
  {
    type: 'event',
    name: 'FilledV3Relay',
    inputs: [
      { name: 'inputToken',           type: 'address', indexed: false },
      { name: 'outputToken',          type: 'address', indexed: false },
      { name: 'inputAmount',          type: 'uint256', indexed: false },
      { name: 'outputAmount',         type: 'uint256', indexed: false },
      { name: 'repaymentChainId',     type: 'uint256', indexed: false },
      { name: 'originChainId',        type: 'uint256', indexed: true  },
      { name: 'depositId',            type: 'uint32',  indexed: true  },
      { name: 'fillDeadline',         type: 'uint32',  indexed: false },
      { name: 'exclusivityDeadline',  type: 'uint32',  indexed: false },
      { name: 'exclusiveRelayer',     type: 'address', indexed: false },
      { name: 'relayer',              type: 'address', indexed: true  },
      { name: 'depositor',            type: 'address', indexed: false },
      { name: 'recipient',            type: 'address', indexed: false },
      { name: 'message',              type: 'bytes',   indexed: false },
    ],
  },
] as const satisfies Abi;

const STARGATE_ABI = [
  {
    type: 'event',
    name: 'OFTReceived',
    inputs: [
      { name: 'guid',             type: 'bytes32', indexed: true  },
      { name: 'srcEid',           type: 'uint32',  indexed: false },
      { name: 'toAddress',        type: 'address', indexed: true  },
      { name: 'amountReceivedLD', type: 'uint256', indexed: false },
    ],
  },
] as const satisfies Abi;

// ─── Chain config ──────────────────────────────────────────────────────────────
// Maps each chain to its config entry. rpcTransport() reads ETH_RPC_URL /
// ETH_RPC_URL_FALLBACK etc. and returns a WebSocket transport when the URL
// starts with wss:// — enabling real-time push events instead of polling.

const CHAIN_CONFIG = [
  { chain: mainnet,   id: 1,      rpcCfg: config.chains.ethereum  },
  { chain: arbitrum,  id: 42161,  rpcCfg: config.chains.arbitrum  },
  { chain: base,      id: 8453,   rpcCfg: config.chains.base      },
  { chain: optimism,  id: 10,     rpcCfg: config.chains.optimism  },
  { chain: polygon,   id: 137,    rpcCfg: config.chains.polygon   },
  { chain: bsc,       id: 56,     rpcCfg: config.chains.bnb       },
  { chain: avalanche, id: 43114,  rpcCfg: config.chains.avalanche },
  { chain: scroll,    id: 534352, rpcCfg: config.chains.scroll    },
  { chain: zkSync,    id: 324,    rpcCfg: config.chains.zkSync    },
] as const;

// ─── Service ──────────────────────────────────────────────────────────────────

type UnwatchFn = () => void;

export class BridgeListenerService {
  private emitter = new EventEmitter();
  private unwatchers: UnwatchFn[] = [];
  private clients = new Map<number, PublicClient>();

  /** Register a callback for every fill event across all monitored chains. */
  onFill(cb: FillCallback): void {
    this.emitter.on('fill', cb);
  }

  offFill(cb: FillCallback): void {
    this.emitter.off('fill', cb);
  }

  /**
   * Start watching all configured chains.
   * Chains without any RPC URL configured are silently skipped.
   * Chains with a wss:// URL get a WebSocket transport (real-time push).
   * Chains with an https:// URL fall back to HTTP polling.
   */
  async start(): Promise<void> {
    let started = 0;
    for (const { chain, id, rpcCfg } of CHAIN_CONFIG) {
      const transport = rpcTransport(rpcCfg);
      if (!transport) continue; // no RPC configured — skip silently

      const client = createPublicClient({ chain, transport }) as PublicClient;
      this.clients.set(id, client);

      this.watchAcross(client, id);
      this.watchStargate(client, id);
      started++;
    }

    console.log(`[BridgeListener] Watching ${started} chains (WebSocket where wss:// URL is set)`);
  }

  stop(): void {
    for (const unwatch of this.unwatchers) {
      try { unwatch(); } catch { /* ignore */ }
    }
    this.unwatchers = [];
    this.clients.clear();
    console.log('[BridgeListener] Stopped');
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private watchAcross(client: PublicClient, chainId: number): void {
    const spokePool = ACROSS_SPOKE_POOLS[chainId];
    if (!spokePool) return;

    try {
      const unwatch = client.watchContractEvent({
        address: spokePool,
        abi: ACROSS_ABI,
        eventName: 'FilledV3Relay',
        onLogs: (logs) => {
          for (const log of logs) {
            const args = log.args as {
              outputToken: `0x${string}`;
              outputAmount: bigint;
              originChainId: bigint;
              depositId: number;
              relayer: `0x${string}`;
              recipient: `0x${string}`;
            };
            const fill: BridgeFillEvent = {
              bridge:        'across',
              chainId,
              originChainId: Number(args.originChainId),
              depositId:     BigInt(args.depositId),
              recipient:     args.recipient,
              outputToken:   args.outputToken,
              outputAmount:  args.outputAmount,
              relayer:       args.relayer,
              blockNumber:   log.blockNumber ?? 0n,
              txHash:        log.transactionHash ?? '0x',
              timestamp:     Date.now(),
            };
            this.emitter.emit('fill', fill);
          }
        },
        onError: (err) => {
          console.warn(`[BridgeListener] Across watch error on chain ${chainId}:`, err.message);
        },
      });
      this.unwatchers.push(unwatch);
    } catch (err) {
      console.warn(`[BridgeListener] Failed to watch Across on chain ${chainId}:`, (err as Error).message);
    }
  }

  private watchStargate(client: PublicClient, chainId: number): void {
    const pool = STARGATE_POOLS[chainId];
    if (!pool) return;

    try {
      const unwatch = client.watchContractEvent({
        address: pool,
        abi: STARGATE_ABI,
        eventName: 'OFTReceived',
        onLogs: (logs) => {
          for (const log of logs) {
            const args = log.args as {
              guid: `0x${string}`;
              toAddress: `0x${string}`;
              amountReceivedLD: bigint;
            };
            const fill: BridgeFillEvent = {
              bridge:       'stargate',
              chainId,
              guid:         args.guid,
              recipient:    args.toAddress,
              outputToken:  '0x0000000000000000000000000000000000000000', // resolved via pool
              outputAmount: args.amountReceivedLD,
              blockNumber:  log.blockNumber ?? 0n,
              txHash:       log.transactionHash ?? '0x',
              timestamp:    Date.now(),
            };
            this.emitter.emit('fill', fill);
          }
        },
        onError: (err) => {
          console.warn(`[BridgeListener] Stargate watch error on chain ${chainId}:`, err.message);
        },
      });
      this.unwatchers.push(unwatch);
    } catch (err) {
      console.warn(`[BridgeListener] Failed to watch Stargate on chain ${chainId}:`, (err as Error).message);
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const bridgeListener = new BridgeListenerService();
