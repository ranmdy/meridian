/**
 * Strategy NFT Minting Service
 *
 * Calls MeridianStrategyNFT.mint() on behalf of the backend minter wallet
 * when a strategy is published to the Marketplace.
 *
 * Phase 1: fire-and-forget with a 30s timeout, logs result.
 *          No retry queue — that's Phase 2 (Redis job queue).
 * Phase 2: metadata uploaded to Pinata IPFS before minting.
 *
 * Required env vars (all optional — NFT minting is gracefully skipped if absent):
 *   NFT_CONTRACT_ADDRESS   — deployed MeridianStrategyNFT address
 *   NFT_CHAIN_ID           — chain ID where the NFT contract is deployed (default 1)
 *   NFT_RPC_URL            — RPC URL for that chain
 *   MINTER_PRIVATE_KEY     — private key of the authorised minter wallet
 *   PINATA_JWT             — Bearer JWT from pinata.cloud (enables IPFS metadata)
 */

import { createPublicClient, createWalletClient, http, type Hash } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet, arbitrum, base, sepolia } from 'viem/chains';
import type { Chain } from 'viem';

// ─── ABI (minimal — only the mint function) ────────────────────────────────────

const NFT_ABI = [
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'strategyId', type: 'bytes32' },
      { name: 'creator', type: 'address' },
      { name: 'uri', type: 'string' },
    ],
    outputs: [{ name: 'tokenId', type: 'uint256' }],
  },
] as const;

// ─── Config ────────────────────────────────────────────────────────────────────

function resolveChain(chainId: number): Chain {
  const map: Record<number, Chain> = {
    1:     mainnet,
    42161: arbitrum,
    8453:  base,
    11155111: sepolia,
  };
  return map[chainId] ?? mainnet;
}

function isConfigured(): boolean {
  return !!(
    process.env.NFT_CONTRACT_ADDRESS &&
    process.env.NFT_RPC_URL &&
    process.env.MINTER_PRIVATE_KEY
  );
}

// ─── Mint ──────────────────────────────────────────────────────────────────────

export interface MintResult {
  success: boolean;
  txHash?: Hash;
  tokenId?: bigint;
  error?: string;
}

/**
 * Mint a Strategy NFT for a published strategy.
 *
 * @param strategyId  Marketplace strategy ID (string) — will be keccak256'd on-chain.
 * @param creator     Creator's EVM wallet address.
 * @param metadataUri IPFS URI pointing to the strategy metadata JSON.
 */
export async function mintStrategyNFT(
  strategyId: string,
  creator: `0x${string}`,
  metadataUri: string,
): Promise<MintResult> {
  if (!isConfigured()) {
    console.log('[NFT] Minting skipped — NFT_CONTRACT_ADDRESS / NFT_RPC_URL / MINTER_PRIVATE_KEY not set');
    return { success: false, error: 'NFT minting not configured' };
  }

  try {
    const contractAddress = process.env.NFT_CONTRACT_ADDRESS as `0x${string}`;
    const rpcUrl = process.env.NFT_RPC_URL!;
    const chainId = parseInt(process.env.NFT_CHAIN_ID ?? '1', 10);
    const chain = resolveChain(chainId);

    const account = privateKeyToAccount(process.env.MINTER_PRIVATE_KEY as `0x${string}`);

    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
    const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

    // Encode strategyId as bytes32 — left-pad the UTF-8 string up to 32 bytes
    const encoder = new TextEncoder();
    const raw = encoder.encode(strategyId).slice(0, 32);
    const bytes32 = new Uint8Array(32);
    bytes32.set(raw, 32 - raw.length); // right-align in 32 bytes
    const strategyIdBytes32 = `0x${Buffer.from(bytes32).toString('hex')}` as `0x${string}`;

    const { request } = await publicClient.simulateContract({
      address: contractAddress,
      abi: NFT_ABI,
      functionName: 'mint',
      args: [strategyIdBytes32, creator, metadataUri],
      account,
    });

    const txHash = await walletClient.writeContract(request);
    console.log(`[NFT] Mint tx submitted: ${txHash}`);

    // Wait for receipt (30s timeout)
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 30_000,
    });

    if (receipt.status === 'success') {
      console.log(`[NFT] Mint confirmed in block ${receipt.blockNumber}`);
      return { success: true, txHash };
    } else {
      return { success: false, txHash, error: 'Transaction reverted' };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[NFT] Mint failed: ${msg}`);
    return { success: false, error: msg };
  }
}

// ─── IPFS / Pinata upload ─────────────────────────────────────────────────────

interface PinataResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

/**
 * Upload JSON metadata to Pinata IPFS and return the ipfs:// URI.
 * Falls back to a base64 data URI if PINATA_JWT is not configured.
 */
async function pinToIPFS(metadata: Record<string, unknown>): Promise<string> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    // Dev fallback: base64 data URI (no external dependency)
    const json = JSON.stringify(metadata);
    const encoded = Buffer.from(json).toString('base64');
    return `data:application/json;base64,${encoded}`;
  }

  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ pinataContent: metadata }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Pinata upload failed: ${err}`);
  }

  const data = await res.json() as PinataResponse;
  console.log(`[NFT] Metadata pinned: ipfs://${data.IpfsHash}`);
  return `ipfs://${data.IpfsHash}`;
}

/**
 * Build strategy metadata and upload to IPFS (or base64 fallback).
 * Returns a URI suitable for use as the ERC-721 tokenURI.
 *
 * Env var:
 *   PINATA_JWT — if set, pins to Pinata and returns ipfs://Qm...
 *                otherwise returns a base64 data URI for local dev.
 */
export async function buildMetadataUri(opts: {
  name: string;
  description: string;
  estimatedApyBps: number;
  riskScore: number;
  creator: string;
}): Promise<string> {
  const metadata: Record<string, unknown> = {
    name: opts.name,
    description: opts.description,
    external_url: 'https://meridian.finance',
    attributes: [
      { trait_type: 'Estimated APY',   value: `${(opts.estimatedApyBps / 100).toFixed(2)}%` },
      { trait_type: 'Risk Score',      value: opts.riskScore },
      { trait_type: 'Creator',         value: opts.creator },
    ],
    created_at: new Date().toISOString(),
  };

  return pinToIPFS(metadata);
}
