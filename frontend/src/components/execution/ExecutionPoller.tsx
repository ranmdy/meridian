'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/src/lib/api';
import type { ExecutionStatus } from '@/src/lib/api';
import { StepTracker } from './StepTracker';
import { SettlementScreen } from './SettlementScreen';

interface ExecutionPollerProps {
  executionId: string;
  showSettlement?: boolean;
}

const TERMINAL_STATES = new Set(['completed', 'failed', 'emergency_exited']);
const POLL_INTERVAL_MS = 3000;

export function ExecutionPoller({ executionId, showSettlement = true }: ExecutionPollerProps) {
  const [status, setStatus] = useState<ExecutionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let active = true;

    // Attempt WebSocket first; fall back to polling if WS unavailable
    const wsUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001')
      .replace(/^http/, 'ws');

    try {
      const ws = new WebSocket(`${wsUrl}/ws/strategy/${executionId}`);
      wsRef.current = ws;

      ws.onmessage = (event: MessageEvent<string>) => {
        const msg = JSON.parse(event.data) as { type: string; data?: ExecutionStatus };
        if (msg.type === 'status_update' || msg.type === 'strategy_complete' || msg.type === 'strategy_failed') {
          void api.strategy.status(executionId).then((s) => {
            if (active) setStatus(s);
          });
        }
      };

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'get_status' }));
      };

      ws.onerror = () => {
        // WS failed — start polling fallback
        ws.close();
        startPolling();
      };

      ws.onclose = () => {
        if (active) startPolling();
      };
    } catch {
      startPolling();
    }

    function startPolling() {
      const poll = async () => {
        if (!active) return;
        try {
          const s = await api.strategy.status(executionId);
          setStatus(s);
          if (!TERMINAL_STATES.has(s.status)) {
            timerRef.current = setTimeout(() => void poll(), POLL_INTERVAL_MS);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to fetch status');
        }
      };
      void poll();
    }

    // Initial fetch regardless of WS
    void api.strategy.status(executionId).then((s) => {
      if (active) setStatus(s);
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : 'Failed to fetch status');
    });

    return () => {
      active = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [executionId]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
        Error loading execution status: {error}
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex items-center gap-2 text-sm text-white/40">
        <span className="h-3 w-3 rounded-full bg-white/20 animate-pulse" />
        Loading execution status…
      </div>
    );
  }

  // Show the rich settlement screen once the strategy completes
  if (showSettlement && status.status === 'completed') {
    return <SettlementScreen status={status} executionId={executionId} />;
  }

  return <StepTracker status={status} />;
}
