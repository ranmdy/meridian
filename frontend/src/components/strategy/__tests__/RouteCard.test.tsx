import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RouteCard } from '../RouteCard';
import type { Route } from '@/src/lib/api';

function makeRoute(overrides: Partial<Route> = {}): Route {
  return {
    steps: [
      {
        stepType: 'SWAP',
        protocol: 'Uniswap',
        protocolAddress: '0x0',
        fromAsset: 'USDC',
        toAsset: 'WETH',
        fromChain: 1,
        toChain: 1,
        estimatedOutput: 1000,
        gasEstimateUsd: 5,
        bridgeFeeUsd: 0,
        slippageBps: 30,
        apyBps: 0,
      },
    ],
    totalScore: 80,
    estimatedApyBps: 1200,   // 12.00%
    totalGasUsd: 5.5,
    totalBridgeFeeUsd: 2.0,
    totalProtocolFeeUsd: 1.0,
    estimatedTimeSeconds: 300, // 5 min
    hopCount: 1,
    bridgeCount: 0,
    riskScore: 25,
    ...overrides,
  };
}

describe('RouteCard', () => {
  // ─── APY display ────────────────────────────────────────────────────────────

  it('renders APY formatted to 2 decimal places', () => {
    render(
      <RouteCard route={makeRoute({ estimatedApyBps: 1234 })} rank={1} selected={false} onSelect={vi.fn()} />,
    );
    expect(screen.getByText('12.34% APY')).toBeInTheDocument();
  });

  it('renders 0.00% APY for zero bps', () => {
    render(
      <RouteCard route={makeRoute({ estimatedApyBps: 0 })} rank={1} selected={false} onSelect={vi.fn()} />,
    );
    expect(screen.getByText('0.00% APY')).toBeInTheDocument();
  });

  // ─── Fee display ────────────────────────────────────────────────────────────

  it('renders summed fees (gas + bridge + protocol)', () => {
    render(
      <RouteCard
        route={makeRoute({ totalGasUsd: 3.50, totalBridgeFeeUsd: 1.25, totalProtocolFeeUsd: 0.75 })}
        rank={1}
        selected={false}
        onSelect={vi.fn()}
      />,
    );
    // 3.50 + 1.25 + 0.75 = 5.50
    expect(screen.getByText('$5.50')).toBeInTheDocument();
  });

  it('renders zero total fee as $0.00', () => {
    render(
      <RouteCard
        route={makeRoute({ totalGasUsd: 0, totalBridgeFeeUsd: 0, totalProtocolFeeUsd: 0 })}
        rank={1}
        selected={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });

  // ─── Time display ────────────────────────────────────────────────────────────

  it('renders estimated time in minutes rounded', () => {
    render(
      <RouteCard route={makeRoute({ estimatedTimeSeconds: 370 })} rank={1} selected={false} onSelect={vi.fn()} />,
    );
    // 370s / 60 = 6.17 → rounds to 6
    expect(screen.getByText('~6m')).toBeInTheDocument();
  });

  it('renders ~1m for less than 90 seconds', () => {
    render(
      <RouteCard route={makeRoute({ estimatedTimeSeconds: 60 })} rank={1} selected={false} onSelect={vi.fn()} />,
    );
    expect(screen.getByText('~1m')).toBeInTheDocument();
  });

  // ─── Risk score color-coding ────────────────────────────────────────────────

  it('colors low risk (< 30) green', () => {
    render(
      <RouteCard route={makeRoute({ riskScore: 10 })} rank={1} selected={false} onSelect={vi.fn()} />,
    );
    const riskEl = screen.getByText('10/100');
    expect(riskEl).toHaveClass('text-green-400');
  });

  it('colors medium risk (30–59) yellow', () => {
    render(
      <RouteCard route={makeRoute({ riskScore: 45 })} rank={1} selected={false} onSelect={vi.fn()} />,
    );
    const riskEl = screen.getByText('45/100');
    expect(riskEl).toHaveClass('text-yellow-400');
  });

  it('colors high risk (>= 60) red', () => {
    render(
      <RouteCard route={makeRoute({ riskScore: 75 })} rank={1} selected={false} onSelect={vi.fn()} />,
    );
    const riskEl = screen.getByText('75/100');
    expect(riskEl).toHaveClass('text-red-400');
  });

  it('colors risk score at boundary 30 yellow (not green)', () => {
    render(
      <RouteCard route={makeRoute({ riskScore: 30 })} rank={1} selected={false} onSelect={vi.fn()} />,
    );
    expect(screen.getByText('30/100')).toHaveClass('text-yellow-400');
  });

  it('colors risk score at boundary 60 red (not yellow)', () => {
    render(
      <RouteCard route={makeRoute({ riskScore: 60 })} rank={1} selected={false} onSelect={vi.fn()} />,
    );
    expect(screen.getByText('60/100')).toHaveClass('text-red-400');
  });

  // ─── Rank / Best badge ───────────────────────────────────────────────────────

  it('shows Best badge only for rank 1', () => {
    const { rerender } = render(
      <RouteCard route={makeRoute()} rank={1} selected={false} onSelect={vi.fn()} />,
    );
    expect(screen.getByText('Best')).toBeInTheDocument();

    rerender(<RouteCard route={makeRoute()} rank={2} selected={false} onSelect={vi.fn()} />);
    expect(screen.queryByText('Best')).not.toBeInTheDocument();
  });

  it('shows Route # label', () => {
    render(<RouteCard route={makeRoute()} rank={3} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText('Route #3')).toBeInTheDocument();
  });

  // ─── Selection state ─────────────────────────────────────────────────────────

  it('applies selected border class when selected', () => {
    const { container } = render(
      <RouteCard route={makeRoute()} rank={1} selected={true} onSelect={vi.fn()} />,
    );
    expect(container.firstChild).toHaveClass('border-meridian-500');
  });

  it('does not apply selected border class when not selected', () => {
    const { container } = render(
      <RouteCard route={makeRoute()} rank={1} selected={false} onSelect={vi.fn()} />,
    );
    expect(container.firstChild).not.toHaveClass('border-meridian-500');
  });

  // ─── Interaction ─────────────────────────────────────────────────────────────

  it('calls onSelect when clicked', () => {
    const onSelect = vi.fn();
    render(<RouteCard route={makeRoute()} rank={1} selected={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  // ─── Cross-chain step display ────────────────────────────────────────────────

  it('shows bridge destination chain when fromChain != toChain', () => {
    const route = makeRoute({
      steps: [
        {
          stepType: 'BRIDGE',
          protocol: 'Stargate',
          protocolAddress: '0x0',
          fromAsset: 'USDC',
          toAsset: 'USDC',
          fromChain: 1,
          toChain: 42161,
          estimatedOutput: 1000,
          gasEstimateUsd: 2,
          bridgeFeeUsd: 1,
          slippageBps: 10,
          apyBps: 0,
        },
      ],
    });
    render(<RouteCard route={route} rank={1} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText(/Arbitrum/)).toBeInTheDocument();
  });

  it('does not show chain arrow for same-chain steps', () => {
    render(<RouteCard route={makeRoute()} rank={1} selected={false} onSelect={vi.fn()} />);
    // No cross-chain label since fromChain == toChain == 1
    expect(screen.queryByText(/Ethereum/)).not.toBeInTheDocument();
  });
});
