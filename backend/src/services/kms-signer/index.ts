/**
 * KMS Signer Service
 *
 * Provides a viem-compatible LocalAccount backed by AWS KMS (production)
 * or a plaintext private key (development).
 *
 * AWS KMS setup:
 *   1. Create an asymmetric KMS key with key spec ECC_SECG_P256K1 (secp256k1).
 *   2. Set key usage to SIGN_VERIFY.
 *   3. Set env vars:
 *        AWS_KMS_KEY_ID   — KMS key ARN or alias (e.g. alias/meridian-relayer)
 *        AWS_REGION       — e.g. us-east-1
 *        AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY  (or use instance role)
 *
 * Dev fallback (plaintext private key):
 *   Set RELAYER_PRIVATE_KEY=0x... in .env — KMS is skipped.
 *
 * Per-chain override:
 *   RELAYER_PK_ETH, RELAYER_PK_BASE, etc. override the global key for that chain.
 *   AWS_KMS_KEY_ID_ETH, AWS_KMS_KEY_ID_BASE, etc. for chain-specific KMS keys.
 *
 * Security note:
 *   Never log or serialize private keys or KMS signing responses.
 */

import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import {
  type Hex,
  type LocalAccount,
  toHex,
  keccak256,
  serializeTransaction,
  hashTypedData,
  type SignableMessage,
  type TypedData,
  type TypedDataDefinition,
} from 'viem';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RelayerAccount = PrivateKeyAccount | LocalAccount;

// Chain suffix map — matches the env var naming convention
const CHAIN_SUFFIX: Record<number, string> = {
  1:        'ETH',
  42161:    'ARB',
  8453:     'BASE',
  10:       'OPT',
  56:       'BNB',
  137:      'POLY',
  43114:    'AVAX',
  534352:   'SCROLL',
  324:      'ZKSYNC',
  // Testnets reuse the same relayer keys as their mainnet counterparts
  11155111: 'ETH',   // Sepolia   → RELAYER_PK_ETH
  84532:    'BASE',  // Base Sepolia → RELAYER_PK_BASE
};

// ─── KMS Account (lazy-loaded to avoid AWS SDK import in environments without it)
// ─── Separated into its own async factory to allow dynamic import ──────────────

type KMSClient = {
  send: (command: unknown) => Promise<unknown>;
};

type KMSModule = {
  KMSClient: new (config: { region: string }) => KMSClient;
  GetPublicKeyCommand: new (input: { KeyId: string }) => unknown;
  SignCommand: new (input: { KeyId: string; Message: Uint8Array; MessageType: string; SigningAlgorithm: string }) => unknown;
};

async function buildKmsAccount(keyId: string, region: string): Promise<LocalAccount> {
  // Dynamic import — AWS SDK is an optional peer dependency
  let awsKms: KMSModule;
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — optional peer dependency; not installed in dev
    awsKms = await import('@aws-sdk/client-kms') as unknown as KMSModule;
  } catch {
    throw new Error(
      'AWS KMS signing requires @aws-sdk/client-kms. Install it: pnpm add @aws-sdk/client-kms',
    );
  }

  const client = new awsKms.KMSClient({ region });

  // Fetch the public key once and derive the Ethereum address
  const pubKeyResponse = await client.send(
    new awsKms.GetPublicKeyCommand({ KeyId: keyId }),
  ) as { PublicKey?: Uint8Array };

  if (!pubKeyResponse.PublicKey) {
    throw new Error(`KMS key ${keyId} returned no public key`);
  }

  // KMS returns DER-encoded SubjectPublicKeyInfo — extract raw 65-byte uncompressed key
  // DER prefix for secp256k1 uncompressed: 3056301006072a8648ce3d020106052b8104000a034200
  const derBytes = pubKeyResponse.PublicKey;
  // Uncompressed point starts at byte 23 (0x04 prefix + 64 bytes)
  const pubKeyBytes = derBytes.slice(23); // 65 bytes: 04 || x || y
  const pubKeyHex = toHex(pubKeyBytes);

  // Ethereum address = last 20 bytes of keccak256(pubkey without 04 prefix)
  const pubKeyWithout04 = pubKeyBytes.slice(1); // 64 bytes: x || y
  const addressHash = keccak256(toHex(pubKeyWithout04));
  const address = `0x${addressHash.slice(-40)}` as `0x${string}`;

  // ── Signing functions ───────────────────────────────────────────────────────

  async function signWithKms(digestHex: Hex): Promise<Hex> {
    const digest = Buffer.from(digestHex.slice(2), 'hex');

    const sigResponse = await client.send(
      new awsKms.SignCommand({
        KeyId:            keyId,
        Message:          digest,
        MessageType:      'DIGEST',
        SigningAlgorithm: 'ECDSA_SHA_256',
      }),
    ) as { Signature?: Uint8Array };

    if (!sigResponse.Signature) {
      throw new Error('KMS returned no signature');
    }

    // KMS returns DER-encoded ECDSA signature — parse into r, s
    const sig = sigResponse.Signature;
    const r = sig.slice(4, 4 + sig[3]);
    const s = sig.slice(4 + sig[3] + 2, 4 + sig[3] + 2 + sig[4 + sig[3] + 1]);

    const rHex = toHex(r).padStart(66, '0x00').slice(-64);
    const sHex = toHex(s).padStart(64, '0');

    // Determine recovery bit (v) by trying both 27 and 28
    // Import secp256k1 for recovery (available via viem internals via noble-curves)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — @noble/curves is bundled with viem, available transitively
    const { secp256k1 } = await import('@noble/curves/secp256k1');
    const sig65 = secp256k1.Signature.fromCompact(rHex + sHex);

    for (const recovery of [0, 1] as const) {
      try {
        const recovered = sig65.addRecoveryBit(recovery)
          .recoverPublicKey(digest)
          .toRawBytes(false); // uncompressed
        if (toHex(recovered) === pubKeyHex) {
          // v = 27 + recovery (pre-EIP-155) — viem handles EIP-155 adjustment
          const v = recovery === 0 ? '1b' : '1c';
          return `0x${rHex}${sHex}${v}`;
        }
      } catch {
        continue;
      }
    }

    throw new Error('Could not recover public key from KMS signature');
  }

  async function signMessage({ message }: { message: SignableMessage }): Promise<Hex> {
    const prefixed =
      typeof message === 'string'
        ? `\x19Ethereum Signed Message:\n${message.length}${message}`
        : message.raw;
    return signWithKms(keccak256(
      typeof prefixed === 'string' ? toHex(Buffer.from(prefixed)) : toHex(prefixed),
    ));
  }

  async function signTransaction(tx: Parameters<typeof serializeTransaction>[0]): Promise<Hex> {
    const serialized = serializeTransaction(tx);
    return signWithKms(keccak256(serialized));
  }

  async function signTypedData<
    TTypedData extends TypedData | Record<string, unknown>,
    TPrimaryType extends string = string,
  >(typedData: TypedDataDefinition<TTypedData, TPrimaryType>): Promise<Hex> {
    const hash = hashTypedData(typedData);
    return signWithKms(hash);
  }

  return {
    address,
    publicKey: pubKeyHex as Hex,
    source: 'custom',
    type: 'local',
    signMessage,
    signTransaction,
    signTypedData,
  } as LocalAccount;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns a viem-compatible account for the given chain.
 *
 * Resolution order (most specific → most general):
 *   1. RELAYER_PK_<CHAIN>  (plaintext, chain-specific, dev only)
 *   2. AWS_KMS_KEY_ID_<CHAIN>  (KMS, chain-specific, production)
 *   3. RELAYER_PRIVATE_KEY  (plaintext, global, dev only)
 *   4. AWS_KMS_KEY_ID  (KMS, global, production)
 *   5. null — signing disabled (dev no-op mode)
 */
export async function getRelayerAccount(chainId: number): Promise<RelayerAccount | null> {
  const suffix = CHAIN_SUFFIX[chainId];
  const region  = process.env.AWS_REGION ?? 'us-east-1';

  // 1. Chain-specific plaintext key
  if (suffix) {
    const chainPk = process.env[`RELAYER_PK_${suffix}`] as Hex | undefined;
    if (chainPk) return privateKeyToAccount(chainPk);
  }

  // 2. Chain-specific KMS key
  if (suffix) {
    const chainKmsId = process.env[`AWS_KMS_KEY_ID_${suffix}`];
    if (chainKmsId) return buildKmsAccount(chainKmsId, region);
  }

  // 3. Global plaintext key
  const globalPk = process.env.RELAYER_PRIVATE_KEY as Hex | undefined;
  if (globalPk) return privateKeyToAccount(globalPk);

  // 4. Global KMS key
  const globalKmsId = process.env.AWS_KMS_KEY_ID;
  if (globalKmsId) return buildKmsAccount(globalKmsId, region);

  // 5. No key — dev no-op
  return null;
}

/**
 * Cache of resolved accounts per chain to avoid repeated KMS GetPublicKey calls.
 */
const accountCache = new Map<number, Promise<RelayerAccount | null>>();

export function getCachedRelayerAccount(chainId: number): Promise<RelayerAccount | null> {
  if (!accountCache.has(chainId)) {
    accountCache.set(chainId, getRelayerAccount(chainId));
  }
  return accountCache.get(chainId)!;
}

/**
 * Returns a human-readable description of the signing method configured for a chain.
 * Safe to log — does not expose key material.
 */
export function signerDescription(chainId: number): string {
  const suffix = CHAIN_SUFFIX[chainId] ?? `chain-${chainId}`;
  if (process.env[`RELAYER_PK_${suffix}`])        return `plaintext-key:${suffix}`;
  if (process.env[`AWS_KMS_KEY_ID_${suffix}`])    return `kms:${suffix}`;
  if (process.env.RELAYER_PRIVATE_KEY)             return 'plaintext-key:global';
  if (process.env.AWS_KMS_KEY_ID)                 return `kms:global`;
  return 'none';
}
