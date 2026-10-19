"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  ArrowDown,
  ArrowUp,
  RefreshCw,
  ArrowDownLeft,
  Bell,
  Check,
  ChevronRight,
  Copy,
  Crown,
  Eye,
  EyeOff,
  ExternalLink,
  Gamepad2,
  Globe2,
  Info,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
  Wallet as WalletIcon,
  X,
  Zap,
} from "lucide-react";
import { Area, AreaChart, Line, LineChart, ResponsiveContainer } from "recharts";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { normalizeDateOfBirth } from "@/lib/date";
import { cycleSecondsForTier, FREE_CYCLE_SECONDS, FREE_TIER } from "@/lib/mining";
import { createClient } from "@/lib/supabase/client";
import { useAccount, useBalance, useReadContract } from 'wagmi';
import { formatUnits, getAddress, type Address } from 'viem';
import { base } from 'wagmi/chains';
import { fetchProfileWalletAddress, profileWalletQueryKey, saveProfileWalletAddress } from "@/lib/wallet-profile";
import { useAppKit, AppKitAccountButton, useAppKitAccount } from '@reown/appkit/react';

type View = "dashboard" | "upgrades" | "market" | "trading" | "game" | "portfolio";
type Activation = { tier: string; activated_at: string; expires_at: string };
type Profile = { full_name?: string | null; avatar_url: string | null; balance: number | string | null };
type MarketAsset = { id?: string; symbol: string; name: string; price: number | null; change: number | null; volume?: number | null; sparkline?: number[]; address?: string; totalSupply?: string | null; circulatingSupply?: string | null; decimals?: number };
const supabase = createClient();
const rtrTokenAbi = [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;
const AUTH_EMAIL_STORAGE_KEY = "user_email";
const LEGACY_AUTH_EMAIL_STORAGE_KEY = "rtr-email";
const MARKET_CACHE_KEY = "rtr-market-prices-v1";
const MARKET_CACHE_LIMIT = 100;
const BUILD_TIMESTAMP = process.env.NEXT_PUBLIC_BUILD_TIMESTAMP ?? "development";
const marketWatchlist = [
  { id: "rtr-network", symbol: "RTR", name: "RTR Network" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum" },
  { id: "coinbase-wrapped-btc", symbol: "cbBTC", name: "Coinbase Wrapped Bitcoin" },
  { id: "wrapped-solana", symbol: "wSOL", name: "Wrapped Solana" },
  { id: "wbnb", symbol: "wBNB", name: "Wrapped BNB" },
  { id: "usd-coin", symbol: "USDC", name: "Bridged USDC" },
] as const;

function readStoredEmail() {
  if (typeof window === "undefined") return "";
  try {
    const validEmail = (value: string | null) => value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : "";
    const storedEmail = validEmail(window.localStorage.getItem(AUTH_EMAIL_STORAGE_KEY));
    if (storedEmail) {
      window.localStorage.removeItem(LEGACY_AUTH_EMAIL_STORAGE_KEY);
      return storedEmail;
    }

    const legacyEmail = validEmail(window.localStorage.getItem(LEGACY_AUTH_EMAIL_STORAGE_KEY));
    if (legacyEmail) window.localStorage.setItem(AUTH_EMAIL_STORAGE_KEY, legacyEmail);
    window.localStorage.removeItem(LEGACY_AUTH_EMAIL_STORAGE_KEY);
    return legacyEmail;
  } catch {
    return "";
  }
}

function saveStoredEmail(value: string) {
  if (typeof window === "undefined") return;
  try {
    const normalizedEmail = value.trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      window.localStorage.setItem(AUTH_EMAIL_STORAGE_KEY, normalizedEmail);
    } else {
      window.localStorage.removeItem(AUTH_EMAIL_STORAGE_KEY);
    }
  } catch {
    // Email persistence is optional; authentication uses the in-memory value.
  }
}

function readMarketCache(): MarketAsset[] {
  if (typeof window === "undefined") return [];
  try {
    const cached: unknown = JSON.parse(window.localStorage.getItem(MARKET_CACHE_KEY) ?? "null");
    if (!Array.isArray(cached)) return [];
    return cached.slice(0, MARKET_CACHE_LIMIT).filter((asset): asset is MarketAsset =>
      typeof asset === "object" && asset !== null &&
      typeof asset.symbol === "string" && typeof asset.name === "string" &&
      (typeof asset.price === "number" || asset.price === null) &&
      (typeof asset.change === "number" || asset.change === null) &&
      (asset.sparkline === undefined || Array.isArray(asset.sparkline)),
    );
  } catch {
    return [];
  }
}

function writeMarketCache(assets: MarketAsset[]) {
  if (typeof window === "undefined") return;
  try {
    const compactCache = assets.slice(0, MARKET_CACHE_LIMIT).map(({ id, symbol, name, price, change, sparkline }) => ({ id, symbol, name, price, change, sparkline }));
    window.localStorage.setItem(MARKET_CACHE_KEY, JSON.stringify(compactCache));
  } catch {
    // Price cache is optional; the live market query remains authoritative.
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, cache: "no-store", signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchMarketRows(): Promise<MarketAsset[]> {
  const response = await fetchWithTimeout("/api/market");
  if (!response.ok) throw new Error("market unavailable");
  const marketRows = await response.json() as MarketAsset[];
  if (!Array.isArray(marketRows)) throw new Error("market unavailable");
  writeMarketCache(marketRows);
  return marketRows;
}

const tiers = [
  ["Free Node Booster", "Free", "0.16", "Base Level", "Manual 24-hour verification"],
  ["Starter Utility Boost", "4.99", "0.66", "Level 2 Priority", "30 day subscription"],
  ["Silver Protocol License", "9.99", "1.66", "Enhanced Tier", "30 day subscription"],
  ["Gold Protocol License", "19.99", "3.33", "Advanced Tier", "30 day subscription"],
  ["Premium Platform Booster", "34.99", "6.66", "High-Performance Tier", "30 day subscription"],
  ["Advanced Network Tier", "79.99", "16.66", "Enterprise Level", "30 day subscription"],
  ["Master Infrastructure Pass", "119.99", "25.00", "Ultimate Tier", "30 day subscription"],
  ["Regional Allocation Access", "199.99", "50.00", "Elite Tier", "30 day subscription"],
  ["Continental System License", "399.99", "116.66", "Core Protocol Level", "30 day subscription"],
  ["Global System Core", "499.99", "166.66", "Sovereign Protocol Level", "30 day subscription"],
  ["Sovereign Genesis License", "899.99", "333.33", "Genesis Core Level", "30 day subscription"],
];

function formatTime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
}

function formatMarketPrice(asset: MarketAsset) {
  if (asset.price === null) return "--";
  const stablecoin = asset.symbol === "USDT" || asset.symbol === "USDC";
  return `$${asset.price.toLocaleString(undefined, { minimumFractionDigits: stablecoin ? 4 : 0, maximumFractionDigits: stablecoin ? 4 : 4 })}`;
}

function displayNameFromUser(user: User | null) {
  const displayName = user?.user_metadata?.display_name;
  return typeof displayName === "string" && displayName.trim() ? displayName.trim() : null;
}

export default function Home() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [, setPinState] = useState("");
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState<View>("dashboard");
  const [navigationReady, setNavigationReady] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [activation, setActivation] = useState<Activation | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [balance, setBalance] = useState<number | null>(null);
  const [marketCacheReady, setMarketCacheReady] = useState(false);
  const marketQuery = useQuery({
    queryKey: ["market-assets"],
    queryFn: fetchMarketRows,
    enabled: marketCacheReady,
    staleTime: 30000,
    refetchInterval: 30000,
    retry: 1,
  });
  const market = marketQuery.data ?? [];
  const [isBalanceHidden, setIsBalanceHidden] = useState(false);
  const [visibilityReady, setVisibilityReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashExiting, setSplashExiting] = useState(false);

  useEffect(() => {
    const cachedMarket = readMarketCache();
    if (cachedMarket.length) queryClient.setQueryData(["market-assets"], cachedMarket);
    setMarketCacheReady(true);
    window.localStorage.removeItem("rtr-market-assets-v1");
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, [queryClient]);

  useEffect(() => {
    if (authLoading) return;
    const splashTimer = window.setTimeout(() => {
      setSplashExiting(true);
      window.setTimeout(() => setSplashVisible(false), 420);
    }, 0);
    return () => window.clearTimeout(splashTimer);
  }, [authLoading]);

  useEffect(() => {
    const mountTimer = window.setTimeout(() => {
      const savedView = window.localStorage.getItem("active_tab");
      if (savedView === "dashboard" || savedView === "upgrades" || savedView === "market" || savedView === "trading" || savedView === "game" || savedView === "portfolio") {
        setView(savedView);
      }
      setNavigationReady(true);
    }, 0);
    return () => window.clearTimeout(mountTimer);
  }, []);

  useEffect(() => {
    if (navigationReady) window.localStorage.setItem("active_tab", view);
  }, [navigationReady, view]);

  useEffect(() => {
    window.setTimeout(() => {
      const storedVisibility = window.localStorage.getItem("rtr-balance-visible");
      if (storedVisibility !== null) setIsBalanceHidden(storedVisibility === "false");
      setVisibilityReady(true);
    }, 0);
  }, []);

  useEffect(() => {
    if (visibilityReady) window.localStorage.setItem("rtr-balance-visible", String(!isBalanceHidden));
  }, [isBalanceHidden, visibilityReady]);

  async function loadActivation() {
    try {
      const response = await fetchWithTimeout("/api/mining/activate");
      if (!response.ok) return;
      const body = await response.json() as { activation: Activation | null };
      setActivation(body.activation);
    } catch {
      setActivation(null);
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setProfileName(displayNameFromUser(data.user));
      setProfileLoading(Boolean(data.user));
      setAuthLoading(false);
      if (data.user) void loadActivation();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setProfileName(displayNameFromUser(session?.user ?? null));
      setProfileLoading(Boolean(session?.user));
      setAuthLoading(false);
      if (session?.user) void loadActivation();
      else {
        setActivation(null);
        setActive(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    let cancelled = false;
    async function loadProfile() {
      try {
        const { data, error } = await supabase.from("profiles").select("avatar_url, balance").eq("id", userId).single<Profile>();
        if (error) throw error;
        if (!cancelled) {
          setAvatar(data?.avatar_url?.trim() || null);
          const nextBalance = Number(data?.balance ?? 0);
          setBalance(Number.isFinite(nextBalance) ? nextBalance : 0);
          setProfileLoading(false);
        }
      } catch {
        if (!cancelled) {
          setBalance(null);
          setProfileLoading(false);
        }
      }
    }
    void loadProfile();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!activation) return;
    const updateRemaining = () => {
      const seconds = Math.max(0, Math.floor((new Date(activation.expires_at).getTime() - Date.now()) / 1000));
      setRemaining(seconds);
      setActive(seconds > 0);
    };
    updateRemaining();
    const timer = window.setInterval(() => {
      updateRemaining();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activation]);

  const cycleSeconds = activation ? cycleSecondsForTier(activation.tier) ?? FREE_CYCLE_SECONDS : FREE_CYCLE_SECONDS;
  const progress = useMemo(() => (remaining / cycleSeconds) * 100, [cycleSeconds, remaining]);

  async function activateTier(tier: string) {
    setError(null);
    let response: Response;
    let body: { activation?: Activation; error?: string; standard?: boolean };
    try {
      response = await fetch("/api/mining/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      body = await response.json() as { activation?: Activation; error?: string; standard?: boolean };
    } catch {
      setActivation(null);
      return false;
    }
    if (body.standard) {
      setActivation(null);
      return false;
    }
    if (!response.ok || !body.activation) {
      setError(body.error ?? "Unable to activate this tier.");
      return false;
    }
    setActivation(body.activation);
    return true;
  }

  function startCollection() {
    if (!active) void activateTier(FREE_TIER);
  }

  async function purchase(tier: (typeof tiers)[number]) {
    if (await activateTier(tier[0])) {
      setView("dashboard");
    }
  }

  async function signOut() {
    setPinState("");
    window.dispatchEvent(new Event("rtr-auth-reset"));
    setUser(null);
    setProfileName(null);
    setAvatar(null);
    setActivation(null);
    setActive(false);
    setBalance(0);
    try {
      await supabase.auth.signOut();
    } finally {
      window.localStorage.removeItem("active_tab");
      window.localStorage.removeItem(LEGACY_AUTH_EMAIL_STORAGE_KEY);
      window.localStorage.removeItem("rtr-balance-visible");
      window.sessionStorage.removeItem("rtr-auth-view");
      window.sessionStorage.removeItem("rtr-signup-verification");
      window.sessionStorage.removeItem("rtr-signup-email");
      document.cookie.split(";").forEach((cookie) => {
        const name = cookie.split("=")[0]?.trim();
        if (name) document.cookie = `${name}=; Max-Age=0; path=/`;
      });
      window.location.replace("/login");
    }
  }

  if (splashVisible) return <SplashGate exiting={splashExiting} />;
  if (!user) return <AuthOverlay />;
  if (pathname === "/settings") return <AccountSettings profileName={profileName} avatar={avatar} onBack={() => router.push("/")} onSignOut={() => void signOut()} />;

  return (
    <main className="app-shell" data-build={BUILD_TIMESTAMP}>
      <header className="topbar">
        <div className="brand-lockup">
          <img className="shield-mark" src="/logo.png" alt="RTR NETWORK LOGO" />
          <div><strong>RTR NETWORK</strong><span>SECURE NODE PLATFORM</span></div>
        </div>
        <div className="header-actions">
          <button className="icon-button" aria-label="Notifications"><Bell size={18} /></button>
          <button className="avatar-button" aria-label="Open account settings" onClick={() => router.push("/settings")}>
            {avatar ? <img src={avatar} alt="Profile" /> : <UserRound size={20} />}
          </button>
        </div>
      </header>

      {view === "dashboard" && (
        <section className="identity-row">
          <div className="greeting" aria-live="polite">
            {profileLoading ? <span className="greeting-skeleton" aria-label="Loading profile name" /> : profileName ? <h1>Hello, {profileName}</h1> : <h1>Hello</h1>}
          </div>
          <div className="status-pill">{profileName && <strong>{profileName}</strong>}<span /> Node online</div>
        </section>
      )}

      <section className="content-scroll">
        {error && <div className="error-banner" role="alert">{error}</div>}
        {view === "dashboard" && <Dashboard balance={balance} balanceLoading={profileLoading} isBalanceHidden={isBalanceHidden} onToggleBalance={() => setIsBalanceHidden((hidden) => !hidden)} active={active} tier={activation?.tier} progress={progress} remaining={remaining} onStart={startCollection} />}
        {view === "upgrades" && <Upgrades onPurchase={purchase} />}
        {view === "market" && <MarketView market={market} />}
        {view === "trading" && <PlaceholderView icon={<Activity />} title="Trading desk" text="Execution routing is secured through the RTR relay." />}
        {view === "game" && <PlaceholderView icon={<Gamepad2 />} title="Node quests" text="Complete community missions to unlock bonus points." />}
        {view === "portfolio" && <PortfolioView market={market} />}
      </section>

      <nav className="bottom-nav" aria-label="Primary navigation">
        <NavItem icon={<LayoutDashboard />} label="Dashboard" active={view === "dashboard"} onClick={() => setView("dashboard")} />
        <NavItem icon={<Crown />} label="Upgrades" active={view === "upgrades"} onClick={() => setView("upgrades")} />
        <NavItem icon={<TrendingUp />} label="Market" active={view === "market"} onClick={() => setView("market")} />
        <NavItem icon={<Activity />} label="Trading" active={view === "trading"} onClick={() => setView("trading")} />
        <NavItem icon={<Gamepad2 />} label="Game" active={view === "game"} onClick={() => setView("game")} />
        <NavItem icon={<WalletIcon />} label="Portfolio" active={view === "portfolio"} onClick={() => setView("portfolio")} />
      </nav>

    </main>
  );
}

function Dashboard({ balance, balanceLoading, isBalanceHidden, onToggleBalance, active, tier, progress, remaining, onStart }: { balance: number | null; balanceLoading: boolean; isBalanceHidden: boolean; onToggleBalance: () => void; active: boolean; tier?: string; progress: number; remaining: number; onStart: () => void }) {
  const displayBalance = balanceLoading ? "Loading..." : isBalanceHidden ? "••••••" : `$${(balance ?? 0).toFixed(4)}`;
  return <div className="dashboard-view">
    <div className="balance-card"><div><div className="balance-label"><span className="eyebrow">TOTAL ACCRUED</span><button className="balance-toggle" type="button" onClick={onToggleBalance} aria-label={isBalanceHidden ? "Show balance" : "Hide balance"}>{isBalanceHidden ? <EyeOff size={16} /> : <Eye size={16} />}</button></div><strong>{displayBalance} <small>RTR</small></strong><span className="delta"><ArrowUpRight size={14} /> {isBalanceHidden ? "•••••• / day" : "+0.16 RTR / day"}</span></div><div className="balance-icon"><Zap size={21} /></div></div>
    <div className="section-heading"><div><span className="eyebrow">ACTIVE NODE</span><h2>{tier ?? "Collection protocol"}</h2></div><span className="live-dot">{active ? "LIVE" : "PAUSED"}</span></div>
    <div className="ring-wrap"><div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><div className="ring-inner"><Sparkles size={17} /><strong>{formatTime(remaining)}</strong><span>{active ? "Accumulating" : "Ready to collect"}</span></div></div></div>
    <button className="collect-button" onClick={onStart}><span className="pulse" />{active ? "Collection active" : "Start 24-hour free node"}<ChevronRight size={18} /></button>
    <div className="metric-grid"><div><span>Network</span><strong>Base Mainnet</strong></div><div><span>Protocol</span><strong>v2.4.8</strong></div><div><span>Multiplier</span><strong>1.0x</strong><small>Standard Hashrate Protocol</small></div></div>
  </div>;
}
function PortfolioView({ market }: { market: MarketAsset[] }) {
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();
  const [isPrivate, setIsPrivate] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const nativeBalance = useBalance({ address: address ?? undefined });
  const rtrTokenAddress = process.env.NEXT_PUBLIC_RTR_TOKEN_ADDRESS as Address | undefined;
  const rtrBalance = useReadContract({
    address: rtrTokenAddress,
    abi: rtrTokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && rtrTokenAddress) },
  });

  const priceFor = (symbol: string) => market.find((asset) => asset.symbol === symbol)?.price ?? null;
  const rtrAmount = typeof rtrBalance.data === "bigint" ? Number(formatUnits(rtrBalance.data, 18)) : address ? 0 : 0;
  const ethAmount = nativeBalance.data ? Number(formatUnits(nativeBalance.data.value, nativeBalance.data.decimals)) : address ? 0 : 0;
  const rtrValue = rtrAmount * (priceFor("RTR") ?? 0);
  const ethValue = ethAmount * (priceFor("ETH") ?? 0);
  const totalValue = rtrValue + ethValue;

  function formatUsdValue(value: number) {
    if (!Number.isFinite(value) || value === 0) return "0.00";
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  if (!isMounted) return null;

  return (
    <div className="portfolio-view w-full px-0 py-6 space-y-6 select-none animate-fadeIn">
      
      {/* =========================================================================
          ZONE 1: HORIZONTALLY EXPANDED BALANCE CARD WITH CLEAN NO-WRAP LAYOUT
          ========================================================================= */}
      <div className="bg-[#11192e] border border-blue-900/30 rounded-2xl p-5 shadow-xl relative overflow-hidden w-full mx-0">
        
        {/* Full horizontal straight line container alignment */}
        <div className="flex items-center w-full mb-3 text-xs font-bold tracking-wide">
          
          {/* Left Block: Title and visibility controls */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-slate-400 uppercase text-[11px] whitespace-nowrap">EST. TOTAL VALUE</span>
            <button 
              type="button" 
              onClick={() => setIsPrivate(!isPrivate)} 
              className="text-slate-400 hover:text-white transition-colors p-0.5 flex items-center justify-center"
              aria-label={isPrivate ? "Show balance" : "Hide balance"}
            >
              {isPrivate ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          
          {/* Central Structural Spacer: Creates the necessary gap and forces expansion to left/right sides */}
          <div className="flex-grow min-w-[24px]"></div>
          
          {/* Right Block: Clean, unclipped Action text link */}
          <button
            onClick={() => open({ view: 'Account' })}
            className="text-blue-400 hover:text-blue-300 transition-colors text-[11px] text-right font-bold whitespace-nowrap shrink-0 block"
          >
            Transaction History ›
          </button>
        </div>

        {/* Clean numerical currency presentation without any backslash characters */}
        <div className="flex items-baseline gap-1.5 mt-2">
          <span className="text-4xl font-black text-white tracking-tight font-sans">
            {"$" + (isPrivate ? "••••••" : formatUsdValue(totalValue))}
          </span>
          <span className="text-sm font-extrabold text-blue-400 tracking-wide uppercase">USD</span>
        </div>

        {/* System node network wallet display layout */}
        <div className="mt-5 pt-3 border-t border-slate-800/40 text-[11px] text-slate-400 font-mono flex justify-between items-center w-full">
          <span className="text-slate-500 font-sans font-semibold uppercase tracking-wider text-[10px]">Node Wallet</span>
          <span className="tracking-wider text-slate-400 text-xs">{address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "0xe0D1...A91C"}</span>
        </div>
      </div>

      {/* =========================================================================
          ZONE 2: REOWN-STYLE LIGHT BLUE 3-ACTION CONTROL HUB WITH TARGETED SDK FIXED ROUTING
          ========================================================================= */}
      <div className="grid grid-cols-3 gap-4 py-2 justify-items-center w-full">
        
        {/* BUTTON 1: DEPOSIT - TRIGGER ONRAMP PROVIDERS VIEW */}
        <button
          onClick={() => open({ view: 'OnRampProviders' })}
          className="flex flex-col items-center justify-center group focus:outline-none w-full"
        >
          <div className="w-full aspect-square max-w-[72px] rounded-2xl bg-[#1a2b4c] border border-blue-500/30 flex items-center justify-center text-[#3b82f6] shadow-lg shadow-blue-500/5 transition-all duration-200 group-hover:scale-105 group-hover:bg-[#223a66] group-hover:border-blue-400/50">
            <ArrowDown size={24} className="stroke-[2.5]" />
          </div>
          <span className="text-xs font-bold text-slate-300 mt-2.5 tracking-wide group-hover:text-white transition-colors">
            Deposit
          </span>
        </button>

        {/* BUTTON 2: CONVERT - TRIGGERS DECENTRALIZED SWAP LAYOUT OVERLAY */}
        <button
          onClick={() => open({ view: 'Swap' })}
          className="flex flex-col items-center justify-center group focus:outline-none w-full"
        >
          <div className="w-full aspect-square max-w-[72px] rounded-2xl bg-[#1a2b4c] border border-blue-500/30 flex items-center justify-center text-[#3b82f6] shadow-lg shadow-blue-500/5 transition-all duration-200 group-hover:scale-105 group-hover:bg-[#223a66] group-hover:border-blue-400/50">
            <RefreshCw size={22} className="stroke-[2.5]" />
          </div>
          <span className="text-xs font-bold text-slate-300 mt-2.5 tracking-wide group-hover:text-white transition-colors">
            Convert
          </span>
        </button>

        {/* BUTTON 3: SEND CRYPTO - PRESERVED TO AUTOMATICALLY TARGET TRANSACTION INPUT MATRIX FORMS */}
        <button
          onClick={() => open({ view: 'Networks' })}
          className="flex flex-col items-center justify-center group focus:outline-none w-full"
        >
          <div className="w-full aspect-square max-w-[72px] rounded-2xl bg-[#1a2b4c] border border-blue-500/30 flex items-center justify-center text-[#3b82f6] shadow-lg shadow-blue-500/5 transition-all duration-200 group-hover:scale-105 group-hover:bg-[#223a66] group-hover:border-blue-400/50">
            <ArrowUp size={24} className="stroke-[2.5]" />
          </div>
          <span className="text-xs font-bold text-slate-300 mt-2.5 tracking-wide group-hover:text-white transition-colors">
            Send Crypto
          </span>
        </button>

      </div>

      {/* =========================================================================
          ZONE 3: PRODUCTION LIVE MULTI-ASSET BLOCKCHAIN LEDGER DIRECTORY
          ========================================================================= */}
      <div className="portfolio-section-heading pt-2 w-full">
        <h3 className="text-xs font-bold tracking-widest text-slate-500 uppercase">Assets Ledger</h3>
      </div>
      
      <div className="portfolio-holdings flex flex-col gap-2.5 w-full">
        
        <div className="flex justify-between items-center bg-[#11192e]/40 p-4 rounded-xl border border-blue-950/40 w-full">
          <span className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-purple-500/20 text-sm">R</div>
            <div>
              <strong className="block text-sm text-white font-semibold tracking-wide">RTR Network</strong>
              <small className="block text-xs text-slate-500 uppercase tracking-wider font-medium">RTR</small>
            </div>
          </span>
          <div className="text-right">
            <strong className="block text-sm text-white font-bold tracking-wide portfolio-blur-target" data-private={isPrivate}>
              {isPrivate ? "••••" : `${rtrAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} RTR`}
            </strong>
            <small className="text-xs text-slate-400 font-semibold tracking-wide portfolio-blur-target" data-private={isPrivate}>
              {isPrivate ? "••••" : `$${formatUsdValue(rtrValue)}`}
            </small>
          </div>
        </div>

        <div className="flex justify-between items-center bg-[#11192e]/20 p-4 rounded-xl border border-blue-950/20 w-full">
          <span className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-300 text-sm">Ξ</div>
            <div>
              <strong className="block text-sm text-white font-semibold tracking-wide">Ethereum</strong>
              <small className="block text-xs text-slate-500 uppercase tracking-wider font-medium">ETH</small>
            </div>
          </span>
          <div className="text-right">
            <strong className="block text-sm text-white font-bold tracking-wide portfolio-blur-target" data-private={isPrivate}>
              {isPrivate ? "••••" : `${ethAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} ETH`}
            </strong>
            <small className="text-xs text-slate-400 font-semibold tracking-wide portfolio-blur-target" data-private={isPrivate}>
              {isPrivate ? "••••" : `$${formatUsdValue(ethValue)}`}
            </small>
          </div>
        </div>

      </div>

    </div>
  );
}
function SplashGate({ exiting }: { exiting: boolean }) {
  return <main className={`app-shell auth-loading${exiting ? " splash-exiting" : ""}`} aria-label="Loading RTR Network"><img className="splash-logo" src="/logo.png" alt="RTR Network shield" /></main>;
}

function Upgrades({ onPurchase }: { onPurchase: (tier: (typeof tiers)[number]) => void }) {
  return <div className="upgrades-view"><div className="page-intro"><span className="eyebrow">PROTOCOL STORE</span><h2>Choose your node tier</h2><p>Every paid tier runs for a fixed 30-day cycle and streams allocation directly from the deployment treasury.</p></div><div className="tier-list">{tiers.map((tier, index) => <article className={index === 3 ? "tier-card featured" : "tier-card"} key={tier[0]}><div className="tier-top"><span className="tier-number">0{index + 1}</span>{index === 3 && <span className="featured-label">POPULAR</span>}</div><h3>{tier[0]}</h3><div className="tier-price">{tier[1] === "Free" ? "Free" : `$${tier[1]}`}<small>{tier[1] === "Free" ? "" : " USDC"}</small></div><div className="tier-speed"><Zap size={15} /> {tier[2]} RTR <span>/ day</span></div><div className="tier-details"><span><Globe2 size={14} /> {tier[3]}</span><span><LockKeyhole size={14} /> {tier[4]}</span></div><button className="tier-button" onClick={() => onPurchase(tier)}>{tier[1] === "Free" ? "Activate free node" : "Purchase with USDC"}<ArrowUpRight size={16} /></button></article>)}</div></div>;
}

function AccountSettings({ profileName, avatar, onBack, onSignOut }: { profileName: string | null; avatar: string | null; onBack: () => void; onSignOut: () => void }) {
  const settings = [["Two-Factor", ShieldCheck], ["Face ID Login", LockKeyhole], ["Change Password", KeyRound], ["Tasks", Check], ["Whitepaper", ArrowUpRight]] as const;
  return <main className="app-shell settings-shell"><header className="topbar"><button className="settings-back" onClick={onBack} aria-label="Back to dashboard"><ChevronRight size={20} /></button><strong className="settings-top-title">Account Settings</strong><div className="avatar-button" aria-hidden="true">{avatar ? <img src={avatar} alt="" /> : <UserRound size={20} />}</div></header><section className="settings-content"><div className="settings-identity"><div className="settings-avatar">{avatar ? <img src={avatar} alt="Profile" /> : <UserRound size={28} />}</div><span className="eyebrow">ACCOUNT SECURITY</span><h1>Account Settings</h1><p>{profileName || "RTR Network member"}</p></div><div className="settings-list">{settings.map(([label, Icon]) => <button className="settings-row" key={label}><span><Icon size={18} />{label}</span><ChevronRight size={16} /></button>)}<button className="settings-row settings-signout" onClick={onSignOut}><span><LogOut size={18} />Sign out</span><ChevronRight size={16} /></button></div></section></main>;
}

function AuthOverlay() {
  const router = useRouter();
  const { address, isConnected } = useAppKitAccount();
  const { open } = useAppKit();
  const [profilePreview, setProfilePreview] = useState<Profile | null>(null);
  const [mode, setMode] = useState<"login" | "signup" | "recovery">("login");
  const [email, setEmail] = useState("");
  const [pinState, setPinState] = useState("");
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [signupVerification, setSignupVerification] = useState(false);
  const [recoveryVerification, setRecoveryVerification] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [enteredToken, setEnteredToken] = useState("");
  const [showDobInfo, setShowDobInfo] = useState(false);
  const [emailVisible, setEmailVisible] = useState(true);
  const [authPreferencesReady, setAuthPreferencesReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(60);
  const pinInput = useRef<HTMLInputElement>(null);
  const loginForm = useRef<HTMLFormElement>(null);
  const pinIsValid = /^\d{6}$/.test(pinState);
  const pinsMatch = pinIsValid && pinState === confirmPin;
  const canActivateSignup = enteredToken.length === 6 && isConnected && Boolean(address);

  useLayoutEffect(() => {
    if (!authPreferencesReady || mode !== "login" || signupVerification || recoveryVerification) return;
    setPinState("");
    if (pinInput.current) {
      pinInput.current.value = "";
      pinInput.current.setAttribute("autocomplete", "new-password");
    }
  }, [authPreferencesReady, mode, recoveryVerification, signupVerification]);

  useEffect(() => {
    const savedMode = window.sessionStorage.getItem("rtr-auth-view");
    setMode(savedMode === "signup" || savedMode === "recovery" ? savedMode : "login");
    setEmail(readStoredEmail());
    setSignupVerification(window.sessionStorage.getItem("rtr-signup-verification") === "true");
    setEmailVisible(window.localStorage.getItem("rtr-email-visible") !== "false");
    window.sessionStorage.removeItem("rtr-signup-email");
    setAuthPreferencesReady(true);
  }, []);

  useEffect(() => {
    if (!authPreferencesReady) return;
    window.sessionStorage.setItem("rtr-auth-view", mode);
  }, [authPreferencesReady, mode]);

  useEffect(() => {
    if (!authPreferencesReady) return;
    window.localStorage.setItem("rtr-email-visible", String(emailVisible));
  }, [authPreferencesReady, emailVisible]);

  useEffect(() => {
    if (!authPreferencesReady) return;
    if (signupVerification) window.sessionStorage.setItem("rtr-signup-verification", "true");
    else window.sessionStorage.removeItem("rtr-signup-verification");
  }, [authPreferencesReady, signupVerification]);

  useEffect(() => {
    if (!signupVerification) return;
    const timer = window.setInterval(() => {
      setResendSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [signupVerification]);

  useEffect(() => {
    const resetAuthForm = () => {
      setEmail("");
      setPinState("");
      if (pinInput.current) pinInput.current.value = "";
      setFullName("");
      setDateOfBirth("");
      setConfirmPin("");
      setEnteredToken("");
      setRecoveryCode("");
      setRecoveryPassword("");
      setSignupVerification(false);
      setRecoveryVerification(false);
      setMessage(null);
      setProfilePreview(null);
      setBusy(false);
      setIsUserTyping(false);
      window.localStorage.removeItem(LEGACY_AUTH_EMAIL_STORAGE_KEY);
      window.sessionStorage.removeItem("rtr-auth-view");
      window.sessionStorage.removeItem("rtr-signup-verification");
      window.sessionStorage.removeItem("rtr-signup-email");
    };
    window.addEventListener("rtr-auth-reset", resetAuthForm);
    return () => window.removeEventListener("rtr-auth-reset", resetAuthForm);
  }, []);

  useEffect(() => {
    if (mode !== "login" || !email.includes("@")) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetchWithTimeout("/api/auth/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
        const body = await response.json() as { profile: Profile | null };
        if (!cancelled) setProfilePreview(body.profile);
      } catch {
        if (!cancelled) setProfilePreview(null);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [email, mode]);

  async function verifySignupCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await supabase.auth.verifyOtp({ email, token: enteredToken, type: "signup" });
    setBusy(false);
    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    // Save wallet address to profile if connected
    if (isConnected && address) {
      await saveProfileWalletAddress(address as `0x${string}`);
    }

    setSignupVerification(false);
    setMode("login");
    setMessage("Your account is verified. You can now sign in.");
  }

  async function resendSignupCode() {
    if (busy || resendSeconds > 0 || !email) return;
    setBusy(true);
    setMessage(null);
    const result = await supabase.auth.resend({ type: "signup", email });
    setBusy(false);
    if (result.error) {
      setMessage(result.error.message);
      return;
    }
    setResendSeconds(60);
    setMessage("A new verification code was sent.");
  }

  async function submitLogin(pin: string) {
    if (busy || !email.trim() || pin.length !== 6) return;
    const submittedPin = pin;
    if (pinInput.current) pinInput.current.value = "";
    setPinState("");
    setBusy(true);
    setMessage(null);
    try {
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password: submittedPin });
      if (result.error) {
        setMessage("Incorrect PIN. Try again.");
        window.requestAnimationFrame(() => pinInput.current?.focus());
        return;
      }

      if (pinInput.current) pinInput.current.value = "";
      setPinState("");
      loginForm.current?.reset();
    } catch {
      setMessage("Unable to sign in right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "recovery") {
        const response = await fetchWithTimeout("/api/auth/recover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim().toLowerCase(), dateOfBirth }),
        });
        const body = await response.json() as { error?: string };
        if (!response.ok) {
          setMessage(body.error || "The details provided do not match our records.");
          return;
        }
        setRecoveryCode("");
        setRecoveryPassword("");
        setRecoveryVerification(true);
        return;
      }

      const result = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: pinState,
        options: { data: { display_name: fullName.trim(), date_of_birth: dateOfBirth } },
      });
      if (result.error) {
        setMessage(result.error.message);
        return;
      }
      if (!result.data.user) {
        setMessage("Unable to create your account. Please try again.");
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      saveStoredEmail(normalizedEmail);
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: result.data.user.id,
        email: normalizedEmail,
        full_name: fullName.trim(),
        date_of_birth: dateOfBirth,
      }, { onConflict: "id" });
      if (profileError && !/row-level security|permission denied/i.test(profileError.message)) {
        setMessage("Your account was created, but your profile could not be saved. Please contact support.");
        return;
      }
      setResendSeconds(60);
      setSignupVerification(true);
    } catch {
      setMessage("Unable to complete your request right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitRecoveryVerification(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetchWithTimeout("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: recoveryCode, newPassword: recoveryPassword }),
      });
      const body = await response.json() as { error?: string; message?: string };
      if (!response.ok) {
        setMessage(body.error || "Recovery code verification failed.");
        return;
      }
      setPinState("");
      if (pinInput.current) pinInput.current.value = "";
      setConfirmPin("");
      setRecoveryVerification(false);
      setRecoveryCode("");
      setRecoveryPassword("");
      setDateOfBirth("");
      setMode("login");
      setMessage(body.message || "Your password has been changed. You can now log in.");
    } catch {
      setMessage("Unable to verify your recovery code right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!authPreferencesReady) return null;

  if (mode === "recovery" && recoveryVerification) return (
    <main className="app-shell auth-shell">
      <div className="auth-panel">
        <img className="shield-mark" src="/logo.png" alt="RTR Network shield" />
        <span className="eyebrow">ACCOUNT RECOVERY</span>
        <h1>Enter your recovery code</h1>
        <p>Enter the code sent to {email}, then choose a new 6-digit PIN.</p>
        <form autoComplete="off" onSubmit={submitRecoveryVerification}>
          <label>6-digit recovery code<input type="text" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" autoComplete="one-time-code" value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required /></label>
          <label>New 6-digit PIN<input type="password" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" autoComplete="new-password" value={recoveryPassword} onChange={(event) => setRecoveryPassword(event.target.value.replace(/\D/g, "").slice(0, 6))} required /></label>
          {message && <div className="auth-message" role="alert">{message}</div>}
          <button className="primary-button auth-submit" type="submit" disabled={busy || recoveryCode.length !== 6 || recoveryPassword.length !== 6}>{busy ? "Verifying recovery code..." : "Reset PIN"}</button>
        </form>
        <button type="button" className="auth-switch" disabled={busy} onClick={() => { setRecoveryVerification(false); setRecoveryCode(""); setRecoveryPassword(""); setMessage(null); }}>Back</button>
      </div>
    </main>
  );

  if (signupVerification) return (
    <main className="app-shell auth-shell">
      <div className="auth-panel otp-panel">
        <img className="shield-mark" src="/logo.png" alt="RTR Network shield" />
        <span className="eyebrow">REGISTRATION ACTIVATION</span>
        <h1>Verify Your Account</h1>
        <p>Enter the 6-digit verification code sent to {email}.</p>
        <form onSubmit={verifySignupCode}>
          <label className="otp-label">Security token
            <input className="otp-input" type="text" inputMode="numeric" maxLength={6} pattern="[0-9]*" value={enteredToken} onChange={(event) => setEnteredToken(event.target.value.replace(/\D/g, "").slice(0, 6))} required autoComplete="one-time-code" />
          </label>
          {message && <div className="auth-message" role="alert">{message}</div>}
          {!isConnected && (
            <button type="button" className="primary-button auth-submit" onClick={() => open()} style={{ marginBottom: "12px" }}>
              Connect Wallet to Activate
            </button>
          )}
          <button className="primary-button auth-submit" disabled={busy || !canActivateSignup}>
            {busy ? <><span className="loading-dots" aria-hidden="true"><i /><i /><i /></span>Authenticating token...</> : "Activate Node & Enter Dashboard"}
          </button>
        </form>
        <p className="resend-status" aria-live="polite">{resendSeconds > 0 ? `Resend code in 00:${String(resendSeconds).padStart(2, "0")}` : "You can request a new code."}</p>
        <button type="button" className="auth-switch" disabled={busy || resendSeconds > 0} onClick={() => void resendSignupCode()}>Resend Code</button>
        <button type="button" className="auth-switch" onClick={() => { setSignupVerification(false); setMode("login"); setMessage(null); router.push("/login"); }}>Back to Login</button>
      </div>
    </main>
  );

  if (mode === "login") return (
    <main className="app-shell auth-shell">
      <div className="auth-panel login-panel">
        <div className="auth-identity login-auth-identity">
          <img className="auth-logo" src="/logo.png" alt="RTR Network shield" />
          <strong>{profilePreview?.full_name?.trim() || "RTR Network member"}</strong>
          <span className="auth-identity-subtitle">Secure node access</span>
          <span className="eyebrow">SECURE NODE PLATFORM</span>
          <h1>Welcome back</h1>
          <p>Enter your 6-digit PIN to access your persistent node dashboard.</p>
        </div>
        <form ref={loginForm} autoComplete="off" style={{ width: "100%" }} onSubmit={(event) => { event.preventDefault(); void submitLogin(pinState); }}>
          <label>User email
            <div className="email-input-wrap">
              <input id="user-email-address" name="user-email-address" type={emailVisible ? "email" : "password"} value={email} onChange={(event) => { setEmail(event.target.value); setProfilePreview(null); }} onBlur={() => saveStoredEmail(email)} required autoComplete="username" aria-label="User email address" />
              <button type="button" className="email-visibility" onClick={() => setEmailVisible((visible) => !visible)} aria-label={emailVisible ? "Hide email address" : "Show email address"}>{emailVisible ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </label>
          <label>6-digit PIN
            <div className="pin-input-wrap">
              <input ref={pinInput} id="user-pin-code" name="user-pin-code" className="pin-input" type="password" autoComplete="new-password" inputMode="numeric" maxLength={6} value={pinState} onKeyDown={(event) => { if (/^\d$/.test(event.key)) setIsUserTyping(true); }} onChange={(event) => { const pin = event.target.value.replace(/\D/g, "").slice(0, 6); setPinState(pin); if (pin.length === 6 && isUserTyping) { void submitLogin(pin); setIsUserTyping(false); } }} pattern="[0-9]{6}" required />
            </div>
          </label>
          {message && <div className="auth-message" role="alert">{message}</div>}
          {busy && <div className="login-status" aria-live="polite">Verifying secure PIN...</div>}
          <button className="primary-button auth-submit" type="submit" disabled={busy || !pinIsValid}>{busy ? "Verifying secure PIN..." : "Log in"}</button>
        </form>
        <button type="button" className="auth-switch" onClick={() => { setMode("recovery"); setRecoveryVerification(false); setRecoveryCode(""); setRecoveryPassword(""); setMessage(null); setPinState(""); }}>Forgot your PIN?</button>
        <button type="button" className="auth-switch" onClick={() => { setMode("signup"); setMessage(null); setPinState(""); }}>Need an account? Sign up</button>
      </div>
    </main>
  );

  const isSignup = mode === "signup";
  const isRecovery = mode === "recovery";
  const canSubmit = Boolean(email.trim()) && (isSignup ? Boolean(fullName.trim() && dateOfBirth && pinsMatch) : Boolean(dateOfBirth));

  return (
    <main className="app-shell auth-shell">
      <div className="auth-panel">
        <img className="shield-mark" src="/logo.png" alt="RTR Network shield" />
        <span className="eyebrow">SECURE NODE PLATFORM</span>
        <h1>{isRecovery ? "Recover your account" : "Create your account"}</h1>
        <p>{isRecovery ? "Verify your registered details to receive a secure password reset code." : "Create a secure account for your persistent node dashboard."}</p>
        <form autoComplete="off" onSubmit={submit}>
          {isSignup && <label>Full name<input type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} required autoComplete="name" /></label>}
          <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} onBlur={() => saveStoredEmail(email)} required autoComplete="email" /></label>
          <label className="date-field">Date of birth
            <div className="date-input-wrap">
              <input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} required />
              <button type="button" className="info-button" aria-label="Why we need your date of birth" aria-expanded={showDobInfo} onClick={() => setShowDobInfo(!showDobInfo)}><Info size={15} /></button>
              {showDobInfo && <div className="dob-tooltip" role="tooltip"><strong>Why we need your date of birth:</strong><span>Account recovery: verify your identity if you lose access.</span><span>Anti-hack protection: this helps prevent fraudulent reset requests.</span><span>Security lock: this information cannot be changed after registration.</span></div>}
            </div>
          </label>
          {isSignup && <>
            <label>Create 6-digit PIN<div className="pin-input-wrap"><input type="password" value={pinState} onChange={(event) => setPinState(event.target.value.replace(/\D/g, "").slice(0, 6))} required inputMode="numeric" maxLength={6} pattern="[0-9]{6}" autoComplete="new-password" /></div></label>
            <label>Confirm 6-digit PIN<div className="pin-input-wrap"><input type="password" value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6))} required inputMode="numeric" maxLength={6} pattern="[0-9]{6}" autoComplete="new-password" /></div></label>
            {confirmPin && !pinsMatch && <div className="pin-error" role="alert">PINs must match and contain exactly 6 digits.</div>}
          </>}
          {message && <div className="auth-message" role="alert">{message}</div>}
          <button className="primary-button auth-submit" type="submit" disabled={busy || !canSubmit}>{busy ? (isRecovery ? "Sending recovery code..." : "Securing account...") : isRecovery ? "Send recovery code" : "Register"}</button>
        </form>
        <button type="button" className="auth-switch" onClick={() => { setMode("login"); setMessage(null); setShowDobInfo(false); }}>Back to log in</button>
      </div>
    </main>
  );
}

function MarketView({ market }: { market: MarketAsset[] }) {
  const [query, setQuery] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<MarketAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [allTokens, setAllTokens] = useState<MarketAsset[]>([]);
  const [visibleCount, setVisibleCount] = useState(50);
  const [searchResults, setSearchResults] = useState<MarketAsset[] | null>(null);
  const { open } = useAppKit();

  // Fetch tokens from 1inch API
  useEffect(() => {
    const fetchTokens = async () => {
      setLoading(true);
      try {
        const response = await fetch('https://api.1inch.io/v5.0/8453/tokens');
        const data = await response.json();
        const tokens = Object.values(data.tokens).map((token: any) => ({
          id: token.address,
          symbol: token.symbol,
          name: token.name,
          price: null, // Will be fetched separately
          change: null,
          sparkline: [],
          address: token.address,
          decimals: token.decimals,
          totalSupply: null,
          circulatingSupply: null
        }));
        setAllTokens(tokens);
      } catch (error) {
        console.error('Failed to fetch tokens from 1inch:', error);
        // Fallback to cached market data
        setAllTokens(market);
      } finally {
        setLoading(false);
      }
    };

    fetchTokens();
  }, [market]);

  // Search filter with async debounce
  useEffect(() => {
    const searchTokens = async () => {
      if (!query.trim()) {
        setSearchResults(null);
        return;
      }

      const normalizedQuery = query.trim().toLowerCase();
      const filtered = allTokens.filter((token) =>
        token.symbol.toLowerCase().includes(normalizedQuery) ||
        token.name.toLowerCase().includes(normalizedQuery)
      );
      setSearchResults(filtered);
    };

    const timer = setTimeout(searchTokens, 300);
    return () => clearTimeout(timer);
  }, [query, allTokens]);

  // Load more tokens on scroll
  const loadMore = () => {
    setVisibleCount((prev) => prev + 50);
  };

  // Display tokens
  const displayTokens = searchResults ?? allTokens.slice(0, visibleCount);

  // Always keep RTR at position #1
  const rtrToken = allTokens.find((t) => t.symbol === "RTR") || { 
    symbol: "RTR", 
    name: "RTR Network", 
    price: null, 
    change: null, 
    sparkline: [],
    address: "0x0000000000000000000000000000000000000000",
    totalSupply: "1,000,000,000",
    circulatingSupply: "500,000,000"
  };
  const otherTokens = displayTokens.filter((t) => t.symbol !== "RTR");
  const sortedTokens = [rtrToken, ...otherTokens];

  const renderAsset = (asset: MarketAsset, index: number) => (
    <div 
      className={`market-row${asset.symbol === "RTR" ? " market-row-pinned" : ""}`} 
      key={asset.id ?? asset.symbol}
      onClick={() => setSelectedAsset(asset)}
    >
      <span className="market-rank">{index + 1}</span>
      <span className="market-asset-icon">
        <div className="token-logo">{asset.symbol.slice(0, 1)}</div>
      </span>
      <span className="market-asset-name">
        {asset.symbol === "RTR" && <span className="featured-badge">Featured Node Asset</span>}
        <strong>{asset.symbol}</strong>
        <small>{asset.name}</small>
      </span>
      <span>{formatMarketPrice(asset)}</span>
      <span className={asset.change !== null && asset.change >= 0 ? "market-up" : "market-down"}>
        {asset.change === null ? "--" : `${asset.change >= 0 ? "+" : ""}${asset.change.toFixed(2)}%`}
      </span>
      <MarketSparkline values={asset.sparkline ?? []} positive={asset.change === null || asset.change >= 0} />
    </div>
  );

  return <div className="market-view">
    <div className="page-intro"><span className="eyebrow">BASE ECOSYSTEM</span><h2>Market monitor</h2><p>Live spot prices and real-time movement across the RTR ecosystem.</p></div>
    <section className="onramp-banner" aria-label="Buy crypto">
      <div className="onramp-banner-heading"><span className="eyebrow">FUND YOUR BASE WALLET</span><h3>Move from fiat to onchain.</h3></div>
      <button className="onramp-fund-card">Buy Crypto with Card / Bank</button>
      <p className="onramp-disclaimer">Secure processing powered safely by Coinbase Onramp. Quick identity check or log-in may be required for first-time fiat processing.</p>
    </section>
    <label className="market-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search market assets</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by symbol or name" /></label>
    <div className="market-table" aria-label="Base ecosystem market monitor">
      <div className="market-row market-header"><span>#</span><span>Asset</span><span>Spot price</span><span>Live Change</span><span>Trend</span></div>
      {loading ? (
        <div className="market-loading">Loading assets...</div>
      ) : (
        <>
          {sortedTokens.map((asset, index) => renderAsset(asset, index))}
          {visibleCount < allTokens.length && !searchResults && (
            <button className="load-more-button" onClick={loadMore}>Load More Assets</button>
          )}
        </>
      )}
    </div>
    {selectedAsset && (
      <div className="market-detail-drawer" onClick={() => setSelectedAsset(null)}>
        <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
          <button className="drawer-close" onClick={() => setSelectedAsset(null)}><X size={20} /></button>
          <div className="drawer-header">
            <div className="drawer-logo">{selectedAsset.symbol.slice(0, 1)}</div>
            <div>
              <h2>{selectedAsset.name}</h2>
              <span className="drawer-symbol">{selectedAsset.symbol}</span>
            </div>
          </div>
          <div className="drawer-metrics">
            <div className="metric">
              <span>Total Supply</span>
              <strong>{selectedAsset.totalSupply || "—"}</strong>
            </div>
            <div className="metric">
              <span>Circulating Supply</span>
              <strong>{selectedAsset.circulatingSupply || "—"}</strong>
            </div>
            <div className="metric">
              <span>Contract Address</span>
              <strong className="contract-address">{selectedAsset.address || "—"}</strong>
            </div>
          </div>
          <button 
            className="drawer-swap-button"
            onClick={() => {
              setSelectedAsset(null);
              open({ view: 'Swap' });
            }}
          >
            [ SWAP THIS ASSET IN WALLET ]
          </button>
        </div>
      </div>
    )}
  </div>;
}

function MarketSparkline({ values, positive }: { values: number[]; positive: boolean }) {
  if (values.length < 2) return <span className="market-sparkline-empty" aria-label="Trend unavailable" />;
  return <span className="market-sparkline" aria-label="Seven-day price trend"><ResponsiveContainer width="100%" height="100%"><LineChart data={values.map((value, index) => ({ index, value }))} margin={{ top: 2, right: 1, bottom: 2, left: 1 }}><Line type="monotone" dataKey="value" stroke={positive ? "#69d5e8" : "#ff9f81"} strokeWidth={1.5} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></span>;
}

function PlaceholderView({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="placeholder-view"><div className="placeholder-icon">{icon}</div><span className="eyebrow">COMING ONLINE</span><h2>{title}</h2><p>{text}</p><button className="primary-button">View protocol status <ArrowUpRight size={16} /></button></div>; }

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) { return <button className={active ? "nav-item active" : "nav-item"} onClick={onClick}>{icon}<span>{label}</span></button>; }
