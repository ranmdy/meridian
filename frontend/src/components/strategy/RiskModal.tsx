'use client';

interface Props {
  riskScore: number;
  onConfirm: () => void;
  onCancel: () => void;
}

const riskTier = (score: number) => {
  if (score < 30) return { label: 'Low Risk', color: 'text-green-400', bar: 'bg-green-500' };
  if (score < 60) return { label: 'Medium Risk', color: 'text-yellow-400', bar: 'bg-yellow-500' };
  return { label: 'High Risk', color: 'text-red-400', bar: 'bg-red-500' };
};

export function RiskModal({ riskScore, onConfirm, onCancel }: Props) {
  const tier = riskTier(riskScore);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass max-w-md w-full p-6 space-y-5">
        {/* Title */}
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Risk Disclosure</h2>
          <p className="text-sm text-gray-400 mt-1">
            Review the risk profile of this strategy before proceeding.
          </p>
        </div>

        {/* Risk score bar */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Composite Risk Score</span>
            <span className={`text-sm font-semibold ${tier.color}`}>
              {tier.label} · {riskScore}/100
            </span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${tier.bar}`}
              style={{ width: `${riskScore}%` }}
            />
          </div>
        </div>

        {/* Disclosures */}
        <div className="space-y-2 text-sm text-gray-400">
          <div className="flex gap-2">
            <span className="text-yellow-500 shrink-0">⚠</span>
            <span>You are interacting with 3rd party DeFi protocols. Meridian does not control these contracts.</span>
          </div>
          <div className="flex gap-2">
            <span className="text-yellow-500 shrink-0">⚠</span>
            <span>Smart contract risk, bridge risk, and liquidation risk are inherent in cross-chain DeFi.</span>
          </div>
          <div className="flex gap-2">
            <span className="text-yellow-500 shrink-0">⚠</span>
            <span>This strategy is non-custodial. Your funds remain in protocol contracts — Meridian cannot recover them.</span>
          </div>
          {riskScore >= 60 && (
            <div className="flex gap-2">
              <span className="text-red-400 shrink-0">⛔</span>
              <span className="text-red-300 font-medium">
                High risk score detected. Proceed only if you understand and accept the risks.
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-lg bg-meridian-600 hover:bg-meridian-500 text-white text-sm font-medium transition-colors"
          >
            I Understand — Proceed
          </button>
        </div>
      </div>
    </div>
  );
}
