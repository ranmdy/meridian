'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useExecutionStore } from '@/src/stores/execution';
import { api } from '@/src/lib/api';
import type { ExecutionStatus } from '@/src/lib/api';
import { PortfolioCharts } from './PortfolioCharts';

export function AnalyticsSection() {
  const { address } = useAccount();
  const { history: localHistory } = useExecutionStore();
  const [executions, setExecutions] = useState<ExecutionStatus[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) {
      setExecutions(localHistory);
      return;
    }
    setLoading(true);
    api.user.executions(address)
      .then((res) => setExecutions(res.executions))
      .catch(() => setExecutions(localHistory))
      .finally(() => setLoading(false));
  }, [address, localHistory]);

  if (loading) return null;

  return <PortfolioCharts executions={executions} />;
}
