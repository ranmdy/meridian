import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SimulationPanel } from '../SimulationPanel';
import type { SimulationResult } from '@/src/lib/api';

function makeSimulation(overrides: Partial<SimulationResult> = {}): SimulationResult {
  return {
    available: true,
    allStepsPass: true,
    steps: [],
    totalGasUsd: 4.50,
    estimatedApyBps: 850,  // 8.50%
    riskScore: 20,
    exploitAlerts: [],
    simulatedAt: Date.now(),
    ...overrides,
  };
}

describe('SimulationPanel', () => {
  // ─── Loading state ────────────────────────────────────────────────────────────

  it('shows loading spinner when isLoading is true', () => {
    render(<SimulationPanel simulation={makeSimulation()} isLoading={true} />);
    expect(screen.getByText(/Running pre-execution simulation/)).toBeInTheDocument();
  });

  it('does not show results when loading', () => {
    render(<SimulationPanel simulation={makeSimulation()} isLoading={true} />);
    expect(screen.queryByText('Simulation Results')).not.toBeInTheDocument();
  });

  // ─── Available / unavailable header ──────────────────────────────────────────

  it('shows "Simulation Results" header when available=true', () => {
    render(<SimulationPanel simulation={makeSimulation({ available: true })} isLoading={false} />);
    expect(screen.getByText('Simulation Results')).toBeInTheDocument();
  });

  it('shows "Estimated Results" header when available=false', () => {
    render(<SimulationPanel simulation={makeSimulation({ available: false })} isLoading={false} />);
    expect(screen.getByText('Estimated Results')).toBeInTheDocument();
  });

  it('shows Tenderly disclaimer when available=false', () => {
    render(<SimulationPanel simulation={makeSimulation({ available: false })} isLoading={false} />);
    expect(screen.getByText(/Tenderly not configured/)).toBeInTheDocument();
  });

  it('does not show Tenderly disclaimer when available=true', () => {
    render(<SimulationPanel simulation={makeSimulation({ available: true })} isLoading={false} />);
    expect(screen.queryByText(/Tenderly not configured/)).not.toBeInTheDocument();
  });

  // ─── APY display ────────────────────────────────────────────────────────────

  it('renders APY formatted to 2 decimal places', () => {
    render(<SimulationPanel simulation={makeSimulation({ estimatedApyBps: 1234 })} isLoading={false} />);
    expect(screen.getByText('12.34%')).toBeInTheDocument();
  });

  // ─── Gas display ────────────────────────────────────────────────────────────

  it('renders total gas cost', () => {
    render(<SimulationPanel simulation={makeSimulation({ totalGasUsd: 7.25 })} isLoading={false} />);
    expect(screen.getByText('$7.25')).toBeInTheDocument();
  });

  // ─── Risk label color-coding ──────────────────────────────────────────────────

  it('shows Low risk label with green styling for score < 30', () => {
    render(<SimulationPanel simulation={makeSimulation({ riskScore: 15 })} isLoading={false} />);
    const el = screen.getByText(/Low · 15\/100/);
    expect(el).toHaveClass('text-green-400');
  });

  it('shows Medium risk label with yellow styling for score 30–59', () => {
    render(<SimulationPanel simulation={makeSimulation({ riskScore: 50 })} isLoading={false} />);
    const el = screen.getByText(/Medium · 50\/100/);
    expect(el).toHaveClass('text-yellow-400');
  });

  it('shows High risk label with red styling for score >= 60', () => {
    render(<SimulationPanel simulation={makeSimulation({ riskScore: 80 })} isLoading={false} />);
    const el = screen.getByText(/High · 80\/100/);
    expect(el).toHaveClass('text-red-400');
  });

  it('boundary 30 is Medium (not Low)', () => {
    render(<SimulationPanel simulation={makeSimulation({ riskScore: 30 })} isLoading={false} />);
    expect(screen.getByText(/Medium · 30\/100/)).toBeInTheDocument();
  });

  it('boundary 60 is High (not Medium)', () => {
    render(<SimulationPanel simulation={makeSimulation({ riskScore: 60 })} isLoading={false} />);
    expect(screen.getByText(/High · 60\/100/)).toBeInTheDocument();
  });

  // ─── Step results ────────────────────────────────────────────────────────────

  it('renders passing and failing steps', () => {
    const steps = [
      { stepIndex: 0, passed: true,  gasUsd: 2.00 },
      { stepIndex: 1, passed: false, gasUsd: 3.50, revertReason: 'insufficient liquidity' },
    ];
    render(<SimulationPanel simulation={makeSimulation({ steps })} isLoading={false} />);
    expect(screen.getByText('Step 1')).toBeInTheDocument();
    expect(screen.getByText('Step 2')).toBeInTheDocument();
    expect(screen.getByText('insufficient liquidity')).toBeInTheDocument();
  });

  it('shows ✓ for passing step and ✗ for failing step', () => {
    const steps = [
      { stepIndex: 0, passed: true,  gasUsd: 1 },
      { stepIndex: 1, passed: false, gasUsd: 1 },
    ];
    render(<SimulationPanel simulation={makeSimulation({ steps, allStepsPass: false })} isLoading={false} />);
    const checks = screen.getAllByText('✓');
    const crosses = screen.getAllByText('✗');
    expect(checks).toHaveLength(1);
    expect(crosses).toHaveLength(1);
  });

  it('shows no step rows when steps array is empty', () => {
    render(<SimulationPanel simulation={makeSimulation({ steps: [] })} isLoading={false} />);
    expect(screen.queryByText('Step 1')).not.toBeInTheDocument();
  });

  // ─── allStepsPass banner ─────────────────────────────────────────────────────

  it('shows all-steps-pass message when allStepsPass=true and steps present', () => {
    const steps = [{ stepIndex: 0, passed: true, gasUsd: 1 }];
    render(<SimulationPanel simulation={makeSimulation({ steps, allStepsPass: true })} isLoading={false} />);
    expect(screen.getByText(/All 1 steps pass simulation/)).toBeInTheDocument();
  });

  it('does not show all-steps-pass banner when allStepsPass=false', () => {
    const steps = [
      { stepIndex: 0, passed: false, gasUsd: 1, revertReason: 'fail' },
    ];
    render(<SimulationPanel simulation={makeSimulation({ steps, allStepsPass: false })} isLoading={false} />);
    expect(screen.queryByText(/steps pass simulation/)).not.toBeInTheDocument();
  });

  it('does not show banner when steps array is empty (even if allStepsPass=true)', () => {
    render(<SimulationPanel simulation={makeSimulation({ steps: [], allStepsPass: true })} isLoading={false} />);
    expect(screen.queryByText(/steps pass simulation/)).not.toBeInTheDocument();
  });

  // ─── Exploit alerts ──────────────────────────────────────────────────────────

  it('shows exploit alert section when alerts present', () => {
    render(
      <SimulationPanel
        simulation={makeSimulation({ exploitAlerts: ['Reentrancy detected', 'Flash loan risk'] })}
        isLoading={false}
      />,
    );
    expect(screen.getByText(/Exploit Alerts/)).toBeInTheDocument();
    expect(screen.getByText('Reentrancy detected')).toBeInTheDocument();
    expect(screen.getByText('Flash loan risk')).toBeInTheDocument();
  });

  it('does not show exploit alerts section when array is empty', () => {
    render(<SimulationPanel simulation={makeSimulation({ exploitAlerts: [] })} isLoading={false} />);
    expect(screen.queryByText(/Exploit Alerts/)).not.toBeInTheDocument();
  });
});
