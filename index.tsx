```tsx
import React, { useEffect, useState } from 'react';

type TabId = 'dashboard' | 'upgrades' | 'trading' | 'game' | 'wallet';

const tabs: { id: TabId; label: string; icon: string }[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V16zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V16z',
  },
  {
    id: 'upgrades',
    label: 'Upgrades',
    icon: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
  },
  {
    id: 'trading',
    label: 'Trading',
    icon: 'M7 12l3-3 3 3 4-4M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
  },
  {
    id: 'game',
    label: 'Game',
    icon: 'M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2H5z',
  },
  {
    id: 'wallet',
    label: 'Wallet',
    icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  },
];

const INITIAL_TIME = 2_592_000;

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [rtrBalance, setRtrBalance] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(INITIAL_TIME);
  const [isMiningActive] = useState(true);

  useEffect(() => {
    if (!isMiningActive) {
      return undefined;
    }

    const ticker = window.setInterval(() => {
      setTimeRemaining((previous) => {
        if (previous <= 1) {
          window.clearInterval(ticker);
          return 0;
        }

        setRtrBalance((balance) => balance + 0.000018);
        return previous - 1;
      });
    }, 1000);

    return () => window.clearInterval(ticker);
  }, [isMiningActive]);

  const days = Math.floor(timeRemaining / 86_400)
    .toString()
    .padStart(2, '0');
  const hours = Math.floor((timeRemaining % 86_400) / 3_600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((timeRemaining % 3_600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (timeRemaining % 60).toString().padStart(2, '0');

  const ringOffset = 660 - (timeRemaining / INITIAL_TIME) * 660;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex justify-center items-start antialiased font-sans">
      <div className="w-full max-w-[450px] min-h-screen bg-slate-950 border-x border-slate-900 shadow-2xl flex flex-col relative pb-24">
        <header className="sticky top-0 bg-slate-950/90 backdrop-blur-md border-b border-slate-900 px-4 py-4 flex justify-between items-center z-40">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 relative">
              <svg
                viewBox="0 0 100 100"
                className="w-full h-full text-blue-500 fill-current drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]"
              >
                <path
                  d="M50 15 L25 25 V50 C25 68 50 85 50 85 C50 85 75 68 75 50 V25 L50 15 Z"
                  className="fill-slate-900/60 stroke-blue-500 stroke-[3px]"
                />
                <path
                  d="M42 35 H58 C62 35 65 37 65 41 C65 45 62 47 58 47 H48 V53 H58 L66 65 H54 L48 56 V65 H42 V35 Z M48 41 V43 H56 C57 43 58 42 58 42 C58 41 57 41 56 41 H48 Z"
                  className="fill-slate-300"
                />
              </svg>
            </div>
            <span className="font-black text-base tracking-wider text-slate-100">
              RTR NETWORK
            </span>
          </div>

          <button
            type="button"
            aria-label="User profile"
            className="w-8 h-8 rounded-full border border-slate-800 bg-slate-900 overflow-hidden flex items-center justify-center"
          >
            <svg
              className="w-4 h-4 text-slate-500"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </button>
        </header>

        <main className="flex-1 p-5 overflow-y-auto space-y-6">
          {activeTab === 'dashboard' ? (
            <div className="space-y-6">
              <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 p-5 rounded-2xl shadow-xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block mb-1">
                  $RTR BALANCE
                </span>
                <h3 className="text-3xl font-black font-mono tracking-tight text-white">
                  {rtrBalance.toFixed(6)}{' '}
                  <span className="text-xs font-sans text-slate-500 font-normal">
                    RTR
                  </span>
                </h3>
              </div>

              <div className="bg-slate-900/30 border border-slate-900 p-6 rounded-3xl flex flex-col items-center justify-center shadow-lg">
                <div className="relative w-60 h-60 flex items-center justify-center">
                  <svg className="absolute inset-0 w-full h-full -rotate-90">
                    <circle
                      cx="120"
                      cy="120"
                      r="105"
                      className="stroke-slate-900 stroke-[5px] fill-none"
                      transform="translate(10,10)"
                    />
                    <circle
                      cx="120"
                      cy="120"
                      r="105"
                      className="stroke-blue-500 stroke-[5px] fill-none transition-all duration-1000"
                      strokeDasharray="660"
                      strokeDashoffset={ringOffset}
                      transform="translate(10,10)"
                    />
                  </svg>

                  <div className="text-center z-10 px-4">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-0.5">
                      Active Protocol Node
                    </span>
                    <h4 className="text-2xl font-black font-mono text-white tracking-tight">
                      {rtrBalance.toFixed(3)}
                    </h4>
                    <span className="text-[10px] text-blue-400 block mt-1 font-bold">
                      1.66 RTR / day
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 w-full mt-6 text-center font-mono">
                  {[
                    ['DAYS', days],
                    ['HOURS', hours],
                    ['MINS', minutes],
                    ['SECS', seconds],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="bg-slate-950 border border-slate-900 p-2.5 rounded-xl"
                    >
                      <div className="text-base font-black text-blue-400">
                        {value}
                      </div>
                      <div className="text-[8px] text-slate-500 font-bold font-sans">
                        {label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500 text-xs">
              <h4 className="font-bold text-slate-400 uppercase tracking-widest mb-1">
                {activeTab} View Placeholder
              </h4>
              <p>This interface will be implemented in a future update.</p>
            </div>
          )}
        </main>

        <nav className="absolute bottom-0 inset-x-0 bg-slate-900/90 backdrop-blur-md border-t border-slate-800 px-1 py-2 flex justify-between items-center z-40">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
                activeTab === tab.id
                  ? 'text-blue-400 font-bold scale-105'
                  : 'text-slate-500'
              }`}
            >
              <svg
                className="w-5 h-5 mb-0.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={tab.icon}
                />
              </svg>
              <span className="text-[9px] font-sans font-medium tracking-wide">
                {tab.label}
              </span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
```