import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ExecutionStatus, RouteStep } from '@/src/lib/api';

interface ExecutionState {
  // Active execution being tracked
  activeExecutionId: string | null;
  activeStatus: ExecutionStatus | null;

  // Execution history (newest first, limited to last 20 for localStorage)
  history: ExecutionStatus[];

  // Route step metadata keyed by executionId (for protocol labels on execution page)
  stepMeta: Record<string, RouteStep[]>;

  // Actions
  setActiveExecution: (id: string) => void;
  updateStatus: (status: ExecutionStatus) => void;
  clearActive: () => void;
  addToHistory: (status: ExecutionStatus) => void;
  setStepMeta: (executionId: string, steps: RouteStep[]) => void;
}

export const useExecutionStore = create<ExecutionState>()(
  persist(
    (set, get) => ({
      activeExecutionId: null,
      activeStatus: null,
      history: [],
      stepMeta: {},

      setActiveExecution: (id) => set({ activeExecutionId: id, activeStatus: null }),

      updateStatus: (status) => {
        set({ activeStatus: status });
        // When completed/failed, move to history
        if (status.status === 'completed' || status.status === 'failed' || status.status === 'emergency_exited') {
          const { history } = get();
          const alreadyIn = history.some((h) => h.executionId === status.executionId);
          if (!alreadyIn) {
            set({ history: [status, ...history].slice(0, 20) });
          }
        }
      },

      clearActive: () => set({ activeExecutionId: null, activeStatus: null }),

      addToHistory: (status) =>
        set((s) => {
          const alreadyIn = s.history.some((h) => h.executionId === status.executionId);
          if (alreadyIn) return s;
          return { history: [status, ...s.history].slice(0, 20) };
        }),

      setStepMeta: (executionId, steps) =>
        set((s) => ({ stepMeta: { ...s.stepMeta, [executionId]: steps } })),
    }),
    {
      name: 'meridian-execution',
      partialize: (s) => ({
        // Persist history so user sees past executions after page reload.
        // Active status is ephemeral — poller will refetch it.
        history: s.history,
        activeExecutionId: s.activeExecutionId,
        stepMeta: s.stepMeta,
      }),
    },
  ),
);
