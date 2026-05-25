/**
 * Tax Report Export Service
 *
 * Generates per-execution reports in CSV, JSON, and PDF-ready text formats.
 * Compatible with Koinly, CoinTracker, TaxBit, Coinpanda CSV schemas.
 *
 * In Phase 1 the execution history is in-memory (BullMQ jobs).
 * In Phase 2 this will query PostgreSQL executions + execution_steps tables.
 */

export interface ExecutionHop {
  stepIndex: number;
  action: 'SWAP' | 'LEND' | 'BRIDGE' | 'STAKE' | 'SETTLE';
  fromAsset: string;
  toAsset: string;
  amountIn: string;   // string to preserve precision
  amountOut: string;
  chain: number;
  txHash?: string;
  timestamp: number;  // unix seconds
  gasPaidUsd: number;
  protocolFeePaidUsd: number;
  protocol: string;
}

export interface ExecutionReport {
  executionId: string;
  strategyId?: string;
  walletAddress: string;
  startedAt: number;
  completedAt?: number;
  status: 'completed' | 'failed' | 'in_progress';
  hops: ExecutionHop[];
}

// ─── CSV export (Koinly-compatible) ──────────────────────────────────────────
//
// Koinly format:
// Date,Sent Amount,Sent Currency,Received Amount,Received Currency,Fee Amount,Fee Currency,Net Worth Amount,Net Worth Currency,Label,Description,TxHash
//
// For each hop we generate two rows when assets differ (in/out), one row when it's
// a same-asset action like LEND/STAKE (treated as a "deposit" with no swap).

const CHAIN_NAMES: Record<number, string> = {
  1: 'ethereum',
  8453: 'base',
  42161: 'arbitrum',
  56: 'bnb',
  137: 'polygon',
};

function isoDate(unix: number): string {
  return new Date(unix * 1000).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

export function toKoinlyCsv(report: ExecutionReport): string {
  const header =
    'Date,Sent Amount,Sent Currency,Received Amount,Received Currency,' +
    'Fee Amount,Fee Currency,Net Worth Amount,Net Worth Currency,' +
    'Label,Description,TxHash\n';

  const rows = report.hops.map((hop) => {
    const date = isoDate(hop.timestamp);
    const totalFee = (hop.gasPaidUsd + hop.protocolFeePaidUsd).toFixed(6);
    const chain = CHAIN_NAMES[hop.chain] ?? String(hop.chain);
    const desc = `Meridian ${hop.action} via ${hop.protocol} on ${chain} (execution ${report.executionId.slice(0, 8)})`;
    const txHash = hop.txHash ?? '';

    let sent = '';
    let sentCur = '';
    let recv = '';
    let recvCur = '';
    let label = '';

    switch (hop.action) {
      case 'SWAP':
      case 'BRIDGE':
        sent = hop.amountIn;
        sentCur = hop.fromAsset;
        recv = hop.amountOut;
        recvCur = hop.toAsset;
        label = hop.action === 'BRIDGE' ? 'transfer' : 'trade';
        break;
      case 'LEND':
      case 'STAKE':
        sent = hop.amountIn;
        sentCur = hop.fromAsset;
        recv = hop.amountOut;
        recvCur = hop.toAsset;
        label = 'invest';
        break;
      case 'SETTLE':
        recv = hop.amountOut;
        recvCur = hop.toAsset;
        label = 'settlement';
        break;
    }

    const cols = [
      date,
      sent, sentCur,
      recv, recvCur,
      totalFee, 'USD',
      '', '',  // net worth — left blank, Koinly derives from price
      label, `"${desc}"`, txHash,
    ];
    return cols.join(',');
  });

  return header + rows.join('\n');
}

// ─── JSON export (raw data) ───────────────────────────────────────────────────

export function toJson(report: ExecutionReport): string {
  return JSON.stringify(report, null, 2);
}

// ─── Plain-text PDF-ready report ─────────────────────────────────────────────
//
// Returns a text block that can be fed into any PDF generator (pdfkit, puppeteer, etc.).
// Phase 2: replace with actual PDF generation.

export function toTextReport(report: ExecutionReport): string {
  const lines: string[] = [];

  lines.push('MERIDIAN EXECUTION REPORT');
  lines.push('='.repeat(50));
  lines.push(`Execution ID : ${report.executionId}`);
  if (report.strategyId) lines.push(`Strategy ID  : ${report.strategyId}`);
  lines.push(`Wallet       : ${report.walletAddress}`);
  lines.push(`Status       : ${report.status.toUpperCase()}`);
  lines.push(`Started      : ${isoDate(report.startedAt)}`);
  if (report.completedAt) lines.push(`Completed    : ${isoDate(report.completedAt)}`);
  lines.push('');

  lines.push('EXECUTION STEPS');
  lines.push('-'.repeat(50));

  for (const hop of report.hops) {
    const chain = CHAIN_NAMES[hop.chain] ?? String(hop.chain);
    lines.push(`Step ${hop.stepIndex + 1}: ${hop.action} via ${hop.protocol} (${chain})`);
    lines.push(`  From   : ${hop.amountIn} ${hop.fromAsset}`);
    lines.push(`  To     : ${hop.amountOut} ${hop.toAsset}`);
    lines.push(`  Gas    : $${hop.gasPaidUsd.toFixed(4)}`);
    lines.push(`  Fee    : $${hop.protocolFeePaidUsd.toFixed(4)}`);
    if (hop.txHash) lines.push(`  TxHash : ${hop.txHash}`);
    lines.push(`  Time   : ${isoDate(hop.timestamp)}`);
    lines.push('');
  }

  const totalGas = report.hops.reduce((s, h) => s + h.gasPaidUsd, 0);
  const totalFee = report.hops.reduce((s, h) => s + h.protocolFeePaidUsd, 0);

  lines.push('SUMMARY');
  lines.push('-'.repeat(50));
  lines.push(`Total Steps  : ${report.hops.length}`);
  lines.push(`Total Gas    : $${totalGas.toFixed(4)}`);
  lines.push(`Total Fees   : $${totalFee.toFixed(4)}`);
  lines.push(`Total Cost   : $${(totalGas + totalFee).toFixed(4)}`);
  lines.push('');
  lines.push('Generated by Meridian — meridian.finance');

  return lines.join('\n');
}
