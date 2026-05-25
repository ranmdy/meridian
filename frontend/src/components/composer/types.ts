// ─── Composer Types ───────────────────────────────────────────────────────────

export type NodeKind = 'wallet' | 'lend' | 'bridge' | 'swap' | 'stake';

export interface ComposerNodeData extends Record<string, unknown> {
  label: string;
  kind: NodeKind;
  protocol: string;
  chain: number;
  chainName: string;
  asset: string;
  apyBps?: number;
  tvlUsd?: number;
}

/** A palette entry the user can drag onto the canvas */
export interface PaletteItem {
  kind: NodeKind;
  protocol: string;
  label: string;
  chain: number;
  chainName: string;
  asset: string;
  apyBps?: number;
}
