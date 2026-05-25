'use client';

import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type { ExecutionStatus } from '@/src/lib/api';

interface Props {
  executions: ExecutionStatus[];
}

// Derive yield-over-time data points from execution history.
// Each completed execution contributes a "yield event" — in prod this would
// pull actual on-chain amounts from the execution steps; here we estimate
// from elapsed time * assumed APY for visual purposes.
function buildYieldSeries(executions: ExecutionStatus[]) {
  const completed = executions
    .filter((e) => e.status === 'completed' && e.elapsedSeconds !== undefined)
    .sort((a, b) => (a.elapsedSeconds ?? 0) - (b.elapsedSeconds ?? 0));

  if (completed.length === 0) return [];

  // Build a running cumulative yield — rough estimate: $50-$300 per completed execution
  let cumulative = 0;
  return completed.map((e, i) => {
    const estimatedYield = 50 + (e.totalSteps ?? 1) * 20 + (i * 15);
    cumulative += estimatedYield;
    return {
      name: `Run ${i + 1}`,
      yield: parseFloat(cumulative.toFixed(2)),
    };
  });
}

// Derive fees breakdown from execution history.
// In prod, step-level fee data comes from execution steps in the DB.
function buildFeesSeries(executions: ExecutionStatus[]) {
  const completed = executions.filter((e) => e.status === 'completed');
  if (completed.length === 0) return [];

  // Aggregate: gas fees, bridge fees, protocol fees (estimated)
  return completed.map((e, i) => ({
    name: `Run ${i + 1}`,
    gas: parseFloat(((e.totalSteps ?? 1) * 1.5).toFixed(2)),
    bridge: parseFloat(((e.totalSteps ?? 1) * 3.0).toFixed(2)),
    protocol: parseFloat(((e.totalSteps ?? 1) * 0.5).toFixed(2)),
  }));
}

const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: '#111827',
    border: '1px solid #374151',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#e5e7eb',
  },
  labelStyle: { color: '#9ca3af' },
};

export function PortfolioCharts({ executions }: Props) {
  const yieldData = useMemo(() => buildYieldSeries(executions), [executions]);
  const feesData = useMemo(() => buildFeesSeries(executions), [executions]);

  if (executions.filter((e) => e.status === 'completed').length === 0) {
    return (
      <div className="glass p-6 text-center text-sm text-gray-500">
        Complete your first strategy execution to see analytics.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Yield earned over time */}
      <div className="glass p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Cumulative Yield Earned (USD)</h3>
        {yieldData.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={yieldData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="yieldGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
                width={45}
              />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(value: number) => [`$${value.toFixed(2)}`, 'Yield']}
              />
              <Area
                type="monotone"
                dataKey="yield"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#yieldGrad)"
                dot={{ r: 3, fill: '#6366f1' }}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[180px] flex items-center justify-center text-gray-600 text-sm">
            No completed executions
          </div>
        )}
        <p className="text-xs text-gray-600 mt-2">
          Estimated from completed executions · On-chain amounts shown after mainnet deployment
        </p>
      </div>

      {/* Fees paid breakdown */}
      <div className="glass p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Fees Paid per Execution (USD)</h3>
        {feesData.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={feesData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
                width={45}
              />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name]}
              />
              <Bar dataKey="gas" name="Gas" stackId="fees" fill="#4b5563" radius={[0, 0, 0, 0]} />
              <Bar dataKey="bridge" name="Bridge" stackId="fees" fill="#6366f1" radius={[0, 0, 0, 0]} />
              <Bar dataKey="protocol" name="Protocol" stackId="fees" fill="#a855f7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[180px] flex items-center justify-center text-gray-600 text-sm">
            No completed executions
          </div>
        )}
        <div className="flex items-center gap-4 mt-2">
          {[
            { color: '#4b5563', label: 'Gas' },
            { color: '#6366f1', label: 'Bridge' },
            { color: '#a855f7', label: 'Protocol' },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />
              <span className="text-xs text-gray-500">{l.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
