// ─── Meridian Homepage — Claude Design Export ────────────────────────────────
// Self-contained React component. Paste into claude.ai/design.
// Uses Tailwind CSS (assumed available in the design sandbox).
// Mock data included so the full UI is visible.

const MOCK_ROUTES = [
  {
    rank: 1,
    label: "Best",
    apyPct: "14.20",
    steps: [
      { icon: "↔", label: "ETH → USDC", sub: "Uniswap v3" },
      { icon: "🌉", label: "USDC → Arbitrum", sub: "Stargate" },
      { icon: "🏦", label: "USDC Lend", sub: "Aave v3" },
      { icon: "✓", label: "Settle", sub: "Destination" },
    ],
    fees: "12.40",
    time: "~8m",
    risk: 42,
    selected: true,
  },
  {
    rank: 2,
    label: null,
    apyPct: "11.85",
    steps: [
      { icon: "↔", label: "ETH → USDC", sub: "Uniswap v3" },
      { icon: "🌉", label: "USDC → Arbitrum", sub: "Across" },
      { icon: "🏦", label: "USDC Lend", sub: "Compound v3" },
      { icon: "✓", label: "Settle", sub: "Destination" },
    ],
    fees: "9.10",
    time: "~12m",
    risk: 31,
    selected: false,
  },
  {
    rank: 3,
    label: null,
    apyPct: "9.50",
    steps: [
      { icon: "🌉", label: "ETH → Arbitrum", sub: "Hop Protocol" },
      { icon: "🏦", label: "ETH Lend", sub: "Aave v3" },
      { icon: "✓", label: "Settle", sub: "Destination" },
    ],
    fees: "6.20",
    time: "~6m",
    risk: 22,
    selected: false,
  },
];

function riskColor(score) {
  if (score < 30) return "text-green-400";
  if (score < 60) return "text-yellow-400";
  return "text-red-400";
}

function Navbar() {
  return (
    <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-meridian-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">◆</span>
          </div>
          <span className="font-bold text-gray-100 tracking-tight">Meridian</span>
          <span className="hidden sm:block text-gray-500 text-sm">Cross-Chain DeFi Router</span>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-sm text-gray-400 hover:text-gray-200 cursor-pointer transition-colors">Marketplace</span>
          <span className="text-sm text-gray-400 hover:text-gray-200 cursor-pointer transition-colors">Portfolio</span>
          <button className="text-sm bg-meridian-600 hover:bg-meridian-500 text-white px-4 py-2 rounded-lg transition-colors font-medium">
            Connect Wallet
          </button>
        </div>
      </div>
    </nav>
  );
}

function RouteCard({ route }) {
  return (
    <div
      className={`w-full text-left rounded-xl border p-5 transition-all cursor-pointer ${
        route.selected
          ? "bg-gray-900/60 border-indigo-500 shadow-lg shadow-indigo-500/10"
          : "bg-gray-900/40 border-gray-800 hover:border-gray-600"
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {route.label && (
            <span className="text-xs bg-indigo-900 text-indigo-400 border border-indigo-700 px-2 py-0.5 rounded-full">
              {route.label}
            </span>
          )}
          <span className="text-sm text-gray-400">Route #{route.rank}</span>
        </div>
        <span className="text-xl font-bold text-indigo-400">{route.apyPct}% APY</span>
      </div>

      <div className="flex items-center gap-1 flex-wrap mb-4">
        {route.steps.map((step, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 font-mono text-gray-300">
              {step.icon} {step.label}
            </span>
            {i < route.steps.length - 1 && (
              <span className="text-gray-600 text-xs">→</span>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-xs text-gray-500 mb-1">Fees</div>
          <div className="text-sm font-medium text-gray-200">${route.fees}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Time</div>
          <div className="text-sm font-medium text-gray-200">{route.time}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Risk</div>
          <div className={`text-sm font-medium ${riskColor(route.risk)}`}>
            {route.risk}/100
          </div>
        </div>
      </div>
    </div>
  );
}

function StrategyForm() {
  return (
    <div className="bg-gray-900/60 backdrop-blur-sm border border-gray-800 rounded-xl p-6 space-y-5">
      <h2 className="text-lg font-semibold text-gray-100">Build Your Strategy</h2>

      {/* Source row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Source Asset</label>
          <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500">
            <option>ETH</option>
            <option>USDC</option>
            <option>USDT</option>
            <option>WBTC</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Source Chain</label>
          <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500">
            <option>Ethereum</option>
            <option>Base</option>
            <option>Arbitrum</option>
          </select>
        </div>
      </div>

      {/* Amount */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Amount (USD)</label>
        <input
          type="number"
          placeholder="e.g. 8250"
          defaultValue="8250"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Destination chain */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Destination Chain</label>
        <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500">
          <option>Arbitrum</option>
          <option>Base</option>
          <option>BNB Chain</option>
          <option>Polygon</option>
        </select>
      </div>

      {/* Destination wallet */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">
          Destination Wallet{" "}
          <span className="text-yellow-500 text-xs">(must be yours — verified by signature)</span>
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="0x..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 font-mono focus:outline-none focus:border-indigo-500"
          />
          <button className="px-3 py-2 rounded-lg text-sm font-medium bg-green-900 text-green-400 border border-green-800">
            ✓ Verified
          </button>
        </div>
      </div>

      {/* Risk + time horizon */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Risk Tolerance — <span className="text-gray-300">Moderate</span>
          </label>
          <input type="range" min={1} max={5} defaultValue={3} className="w-full accent-indigo-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Time Horizon (days)</label>
          <input
            type="number"
            defaultValue="30"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-lg font-medium transition-colors">
        Find Best Routes
      </button>
    </div>
  );
}

function RouteList() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-100">3 Routes Found</h2>
      </div>

      {MOCK_ROUTES.map((route) => (
        <RouteCard key={route.rank} route={route} />
      ))}

      <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-lg font-medium transition-colors mt-2">
        Execute Selected Route
      </button>

      <p className="text-xs text-gray-500 text-center">
        ⚠ You are interacting with 3rd party DeFi protocols. Meridian is non-custodial. Funds are not insured.
      </p>
    </div>
  );
}

export default function MeridianHomepage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Navbar />

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-100 mb-4">
          Every asset has a destination.
          <br />
          <span className="text-indigo-400">We find the best path there.</span>
        </h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto">
          Deposit any asset. Define a destination. Meridian autonomously routes your funds
          through the best yield-generating DeFi strategies across multiple chains — fully
          transparent, fully auditable.
        </p>
      </section>

      {/* Main grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <StrategyForm />
          <RouteList />
        </div>
      </main>
    </div>
  );
}
