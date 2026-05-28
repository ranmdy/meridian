'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageHead, Tag, Spinner } from '@/src/components/ui';
import { riskColor } from '@/src/lib/mockData';
import { api, type MarketplaceStrategy } from '@/src/lib/api';
import { useAuthStore } from '@/src/stores/auth';

const CHAIN_NAME: Record<number, string> = {
  1: 'Eth', 42161: 'Arb', 8453: 'Base', 137: 'Poly',
  56: 'BNB', 10: 'OP', 43114: 'AVAX', 534352: 'Scroll', 324: 'zkSync',
};

function getRiskLabel(score: number): string {
  if (score < 25) return 'Low';
  if (score < 50) return 'Moderate';
  if (score < 75) return 'High';
  return 'Very High';
}

function fmtAddr(addr: string): string {
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function MarketplacePage() {
  const router = useRouter();
  const { token } = useAuthStore();

  const [sort, setSort] = useState('votes');
  const [items, setItems] = useState<MarketplaceStrategy[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [voted, setVoted] = useState<Record<string, boolean>>({});
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    setLoading(true);
    api.marketplace.browse({ sort, limit: 50 })
      .then(r => {
        setItems(r.strategies);
        setTotal(r.total);
        // Seed vote counts from API data
        const counts: Record<string, number> = {};
        r.strategies.forEach(s => { counts[s.id] = s.votes; });
        setVoteCounts(counts);
      })
      .catch(() => { setItems([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, [sort]);

  async function handleVote(id: string) {
    if (voted[id]) return; // already voted this session
    if (!token) return;    // must be authenticated
    setVoted(v => ({ ...v, [id]: true }));
    setVoteCounts(c => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
    try {
      await api.marketplace.vote(id);
    } catch {
      // revert optimistic update
      setVoted(v => ({ ...v, [id]: false }));
      setVoteCounts(c => ({ ...c, [id]: Math.max(0, (c[id] ?? 1) - 1) }));
    }
  }

  function handleCopy(s: MarketplaceStrategy) {
    // Navigate to home with strategy pre-filled via query params
    const params = new URLSearchParams({
      srcAsset: s.sourceAsset,
      srcChain: String(s.sourceChain),
      dstChain: String(s.destinationChain),
      riskTolerance: String(s.riskTolerance),
      timeHorizon: String(s.timeHorizonDays),
    });
    router.push(`/?${params.toString()}`);
  }

  return (
    <div className="shell" style={{ paddingBottom: 32 }}>
      <PageHead
        eyebrow={`Marketplace · ${total > 0 ? total + ' published' : 'strategies'}`}
        title={<span>Strategies, <em className="serif-it">published</em>.</span>}
        desc="Routes built by other operators. Vote for what you'd run; copy to your own form. Every author keeps a 0.02% share of execution fees from copies."
        right={
          <div className="col gap-2 items-end">
            <span className="meta">Strategies</span>
            <span className="num-md">{total.toLocaleString()}</span>
          </div>
        }
      />

      <div className="between mt-8 mb-5">
        <div className="flex gap-2 items-center">
          <span className="label">Sort by</span>
          <select
            className="select"
            style={{ width: 200 }}
            value={sort}
            onChange={e => setSort(e.target.value)}
          >
            <option value="votes">Most voted</option>
            <option value="apy">Highest yield</option>
            <option value="risk">Lowest risk</option>
            <option value="copies">Most used</option>
            <option value="newest">Newest</option>
          </select>
        </div>
        <span className="caption mono c-ink-3">{loading ? '…' : `${items.length} strategies`}</span>
      </div>

      <div className="panel">
        {loading ? (
          <div className="p-10 flex justify-center"><Spinner size={20} /></div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center caption muted">
            No strategies published yet. Be the first!
          </div>
        ) : (
          <table className="table">
            <colgroup>
              <col style={{ width: '48px' }} />
              <col />
              <col style={{ width: '120px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '220px' }} />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>Strategy</th>
                <th className="text-right">APY</th>
                <th className="text-right">Risk</th>
                <th className="text-right">Used</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((s, i) => {
                const apy = s.publishedApyBps / 100;
                const risk = s.route.riskScore;
                const v = voted[s.id];
                const vCount = voteCounts[s.id] ?? s.votes;
                const routeLabel = `${CHAIN_NAME[s.sourceChain] ?? s.sourceChain} → ${CHAIN_NAME[s.destinationChain] ?? s.destinationChain}`;

                return (
                  <tr key={s.id} className="row-hover">
                    <td>
                      <div className="serif-it" style={{ fontSize: 28, lineHeight: 1, color: 'var(--ink-3)' }}>
                        {String(i + 1).padStart(2, '0')}
                      </div>
                    </td>
                    <td>
                      <div className="col gap-1">
                        <div className="flex items-center gap-2">
                          <span style={{ fontWeight: 500, fontSize: 15 }}>{s.name}</span>
                          {s.riskTolerance <= 2 && <Tag tone="ok">Conservative</Tag>}
                          {s.deprecated && <Tag tone="bad">Deprecated</Tag>}
                        </div>
                        <div className="body" style={{ fontSize: 13, color: 'var(--ink-2)', maxWidth: 540 }}>
                          {s.description}
                        </div>
                        <div className="flex gap-3 mt-1" style={{ fontSize: 11 }}>
                          <span className="mono c-ink-3">@{fmtAddr(s.creatorWallet)}</span>
                          <span className="mono c-ink-3">·</span>
                          <span className="mono c-ink-3">{routeLabel}</span>
                          <span className="mono c-ink-3">·</span>
                          <span className="mono c-ink-3">{fmtDate(s.publishedAt)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="text-right num-md">
                      {apy.toFixed(1)}
                      <span className="c-ink-3" style={{ fontSize: 11 }}>%</span>
                    </td>
                    <td className="text-right">
                      <div className="col gap-1 items-end">
                        <span className="mono" style={{ color: riskColor(risk), fontSize: 14 }}>{risk}</span>
                        <span className="caption mono c-ink-3" style={{ fontSize: 10 }}>{getRiskLabel(risk)}</span>
                      </div>
                    </td>
                    <td className="text-right mono">{s.executionCount.toLocaleString()}</td>
                    <td>
                      <div className="flex gap-2 justify-end">
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => void handleVote(s.id)}
                          disabled={v || !token}
                          title={!token ? 'Sign in to vote' : v ? 'Already voted' : 'Vote'}
                          style={v ? { background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' } : {}}
                        >
                          ▲ {vCount.toLocaleString()}
                        </button>
                        <button className="btn btn-signal btn-sm" onClick={() => handleCopy(s)}>
                          Copy →
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
