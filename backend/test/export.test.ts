import { describe, it, expect } from 'vitest';
import {
  toKoinlyCsv,
  toJson,
  toTextReport,
  type ExecutionReport,
} from '../src/services/export/index.js';

const sampleReport: ExecutionReport = {
  executionId: 'exec_abc123',
  strategyId: 'strat_xyz',
  walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
  startedAt: 1_716_000_000,
  completedAt: 1_716_000_600,
  status: 'completed',
  hops: [
    {
      stepIndex: 0,
      action: 'SWAP',
      fromAsset: 'ETH',
      toAsset: 'USDC',
      amountIn: '2.5',
      amountOut: '7500.00',
      chain: 1,
      txHash: '0xabc',
      timestamp: 1_716_000_100,
      gasPaidUsd: 4.20,
      protocolFeePaidUsd: 1.50,
      protocol: 'uniswap_v3',
    },
    {
      stepIndex: 1,
      action: 'BRIDGE',
      fromAsset: 'USDC',
      toAsset: 'USDC',
      amountIn: '7500.00',
      amountOut: '7485.00',
      chain: 1,
      txHash: '0xdef',
      timestamp: 1_716_000_250,
      gasPaidUsd: 8.10,
      protocolFeePaidUsd: 15.00,
      protocol: 'stargate',
    },
    {
      stepIndex: 2,
      action: 'LEND',
      fromAsset: 'USDC',
      toAsset: 'aUSDC',
      amountIn: '7485.00',
      amountOut: '7485.00',
      chain: 42161,
      txHash: '0xghi',
      timestamp: 1_716_000_500,
      gasPaidUsd: 0.30,
      protocolFeePaidUsd: 0.00,
      protocol: 'aave_v3',
    },
  ],
};

describe('ExportService', () => {
  describe('toKoinlyCsv', () => {
    it('produces a string', () => {
      expect(typeof toKoinlyCsv(sampleReport)).toBe('string');
    });

    it('starts with the Koinly header', () => {
      const csv = toKoinlyCsv(sampleReport);
      expect(csv.startsWith('Date,Sent Amount,Sent Currency')).toBe(true);
    });

    it('has one row per hop', () => {
      const csv = toKoinlyCsv(sampleReport);
      const lines = csv.trim().split('\n');
      // 1 header + 3 hops
      expect(lines).toHaveLength(4);
    });

    it('includes the txHash in each row', () => {
      const csv = toKoinlyCsv(sampleReport);
      expect(csv).toContain('0xabc');
      expect(csv).toContain('0xdef');
    });

    it('contains correct asset symbols', () => {
      const csv = toKoinlyCsv(sampleReport);
      expect(csv).toContain('ETH');
      expect(csv).toContain('USDC');
    });

    it('labels BRIDGE rows as transfer', () => {
      const csv = toKoinlyCsv(sampleReport);
      expect(csv).toContain('transfer');
    });

    it('labels SWAP rows as trade', () => {
      const csv = toKoinlyCsv(sampleReport);
      expect(csv).toContain('trade');
    });
  });

  describe('toJson', () => {
    it('returns valid JSON', () => {
      const json = toJson(sampleReport);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('round-trips the executionId', () => {
      const json = toJson(sampleReport);
      expect(JSON.parse(json).executionId).toBe('exec_abc123');
    });

    it('round-trips the hop count', () => {
      const json = toJson(sampleReport);
      expect(JSON.parse(json).hops).toHaveLength(3);
    });
  });

  describe('toTextReport', () => {
    it('returns a string', () => {
      expect(typeof toTextReport(sampleReport)).toBe('string');
    });

    it('includes the executionId', () => {
      const text = toTextReport(sampleReport);
      expect(text).toContain('exec_abc123');
    });

    it('includes each step', () => {
      const text = toTextReport(sampleReport);
      expect(text).toContain('Step 1');
      expect(text).toContain('Step 2');
      expect(text).toContain('Step 3');
    });

    it('includes the MERIDIAN header', () => {
      const text = toTextReport(sampleReport);
      expect(text).toContain('MERIDIAN EXECUTION REPORT');
    });

    it('includes total cost summary', () => {
      const text = toTextReport(sampleReport);
      expect(text).toContain('Total Cost');
    });

    it('computes correct total fees', () => {
      const text = toTextReport(sampleReport);
      // totalGas: 4.20 + 8.10 + 0.30 = 12.60
      // totalFee: 1.50 + 15.00 + 0.00 = 16.50
      // totalCost: 29.10
      expect(text).toContain('29.10');
    });
  });
});
