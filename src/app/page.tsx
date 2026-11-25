"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  ArrowDown,
  ArrowUp,
  RefreshCw,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Crown,
  Eye,
  EyeOff,
  Gamepad2,
  Globe2,
  Info,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  BarChart3,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
  Wallet as WalletIcon,
  X,
  Zap,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cycleSecondsForTier, FREE_CYCLE_SECONDS, FREE_TIER } from "@/lib/mining";
import { createClient } from "@/lib/supabase/client";
import { useBalance, useReadContract } from 'wagmi';
import { formatUnits, getAddress, isAddress, type Address } from 'viem';
import { base } from 'wagmi/chains';
import { saveProfileWalletAddress } from "@/lib/wallet-profile";
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import CustomSendModal from '@/components/CustomSendModal';
import CustomSwapModal from '@/components/CustomSwapModal';
import CustomDepositModal from '@/components/CustomDepositModal';
import CustomActivityLedger from '@/components/CustomActivityLedger';

type View = "dashboard" | "upgrades" | "market" | "trading" | "game" | "portfolio";
type Activation = { id: string; user_id: string; tier: string; activated_at: string; expires_at: string };
type Profile = {
  full_name?: string | null;
  avatar_url: string | null;
  total_accrued_balance?: number | string | null;
  last_balance_update?: string | null;
};
type MarketAsset = { id?: string; symbol: string; name: string; price: number | null; change: number | null; volume?: number | null; marketCap?: number | null; fdv?: number | null; pairAddress?: string; sparkline?: number[]; address?: string; logoURI?: string; totalSupply?: string | null; circulatingSupply?: string | null; decimals?: number };
type MarketQuote = {
  price: number | null;
  change: number | null;
  volume: number | null;
  marketCap: number | null;
  fdv: number | null;
  totalSupply: string | null;
  circulatingSupply: string | null;
  pairAddress?: string;
};
type MarketHistoryPoint = { timestamp: number; price: number };
type MarketTimeframe = "1h" | "24h" | "7d" | "30d" | "1y";
const supabase = createClient();
const rtrTokenAbi = [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;
const totalSupplyAbi = [{ name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] }] as const;
const AUTH_EMAIL_STORAGE_KEY = "user_email";
const LEGACY_AUTH_EMAIL_STORAGE_KEY = "rtr-email";
const MARKET_CACHE_KEY = "rtr-market-prices-v1";
const MARKET_QUOTE_CACHE_KEY = "rtr-base-token-quotes-v2";
const MARKET_CACHE_LIMIT = 100;
const BUILD_TIMESTAMP = process.env.NEXT_PUBLIC_BUILD_TIMESTAMP ?? "development";
const RTR_PRICE_USD = 0.075;
const RTR_TOKEN_DETAILS = {
  address: "0x1259d32d0E3dD7D28E8C96c1410712AFeeecF633",
  chainId: 8453,
  name: "RTR Network Token",
  symbol: "RTR",
  decimals: 18,
  logoURI: "/logo.png",
  priceUSD: RTR_PRICE_USD,
  change24h: 3.42,
  totalSupply: "10,000,000",
  circulatingSupply: "2,000,000",
  marketCap: 150000,
} as const;
const BASE_WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_USDT_ADDRESS = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";
const RTR_MARKET_ASSET: MarketAsset = {
  id: RTR_TOKEN_DETAILS.address,
  address: RTR_TOKEN_DETAILS.address,
  name: RTR_TOKEN_DETAILS.name,
  symbol: RTR_TOKEN_DETAILS.symbol,
  decimals: RTR_TOKEN_DETAILS.decimals,
  price: RTR_TOKEN_DETAILS.priceUSD,
  change: RTR_TOKEN_DETAILS.change24h,
  sparkline: [],
  marketCap: RTR_TOKEN_DETAILS.marketCap,
  fdv: RTR_TOKEN_DETAILS.priceUSD * Number(RTR_TOKEN_DETAILS.totalSupply.replaceAll(",", "")),
  logoURI: RTR_TOKEN_DETAILS.logoURI,
  totalSupply: RTR_TOKEN_DETAILS.totalSupply,
  circulatingSupply: RTR_TOKEN_DETAILS.circulatingSupply,
};

interface OneInchRegistryToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMarketQuote(value: unknown): value is MarketQuote {
  if (!isRecord(value)) return false;
  const numericOrNull = (field: string) =>
    value[field] === null || (typeof value[field] === "number" && Number.isFinite(value[field]));
  return numericOrNull("price")
    && numericOrNull("change")
    && numericOrNull("volume")
    && numericOrNull("marketCap")
    && numericOrNull("fdv")
    && (value.totalSupply === null || typeof value.totalSupply === "string")
    && (value.circulatingSupply === null || typeof value.circulatingSupply === "string")
    && (value.pairAddress === undefined || typeof value.pairAddress === "string");
}

function isOneInchRegistryToken(value: unknown): value is OneInchRegistryToken {
  return isRecord(value)
    && typeof value.address === "string"
    && typeof value.symbol === "string"
    && typeof value.name === "string"
    && typeof value.decimals === "number"
    && Number.isInteger(value.decimals)
    && (value.logoURI === undefined || typeof value.logoURI === "string");
}

function buildCoreMarketAssets(
  registryTokens: OneInchRegistryToken[],
  market: MarketAsset[],
  quoteCache: Map<string, MarketQuote>,
): MarketAsset[] {
  const registryByAddress = new Map(registryTokens.map((token) => [token.address.toLowerCase(), token]));
  const coreAssets = [
    { address: BASE_WETH_ADDRESS, symbol: "ETH", name: "Ethereum", decimals: 18 },
    { address: BASE_USDC_ADDRESS, symbol: "USDC", name: "USD Coin", decimals: 6 },
    { address: BASE_USDT_ADDRESS, symbol: "USDT", name: "Tether USD", decimals: 6 },
  ];

  return coreAssets.map((coreAsset): MarketAsset => {
    const address = coreAsset.address.toLowerCase();
    const metadata = registryByAddress.get(address);
    const cachedQuote = quoteCache.get(address);
    const marketAsset = market.find((asset) => asset.symbol.toUpperCase() === coreAsset.symbol);
    return {
      id: coreAsset.address,
      address: coreAsset.address,
      symbol: coreAsset.symbol,
      name: coreAsset.name,
      decimals: metadata?.decimals ?? coreAsset.decimals,
      logoURI: metadata?.logoURI ?? "",
      price: cachedQuote?.price ?? marketAsset?.price ?? null,
      change: cachedQuote?.change ?? marketAsset?.change ?? null,
      volume: cachedQuote?.volume ?? marketAsset?.volume ?? null,
      marketCap: cachedQuote?.marketCap ?? marketAsset?.marketCap ?? null,
      fdv: cachedQuote?.fdv ?? null,
      pairAddress: cachedQuote?.pairAddress,
      sparkline: [],
      totalSupply: cachedQuote?.totalSupply ?? marketAsset?.totalSupply ?? null,
      circulatingSupply: cachedQuote?.circulatingSupply ?? marketAsset?.circulatingSupply ?? null,
    };
  });
}

function buildMarketAssets(
  registryTokens: OneInchRegistryToken[],
  market: MarketAsset[],
  quoteCache: Map<string, MarketQuote>,
): MarketAsset[] {
  const coreAssets = buildCoreMarketAssets(registryTokens, market, quoteCache);
  const coreAddresses = new Set(coreAssets.map((asset) => asset.address?.toLowerCase()));
  const assetsByAddress = new Map<string, MarketAsset>();

  for (const token of registryTokens) {
    const address = token.address.toLowerCase();
    if (
      !isAddress(token.address) ||
      address === RTR_TOKEN_DETAILS.address.toLowerCase() ||
      token.symbol.toUpperCase() === RTR_TOKEN_DETAILS.symbol ||
      coreAddresses.has(address)
    ) continue;

    const cachedQuote = quoteCache.get(address);
    assetsByAddress.set(address, {
      id: token.address,
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      logoURI: token.logoURI,
      price: cachedQuote?.price ?? null,
      change: cachedQuote?.change ?? null,
      volume: cachedQuote?.volume ?? null,
      marketCap: cachedQuote?.marketCap ?? null,
      fdv: cachedQuote?.fdv ?? null,
      pairAddress: cachedQuote?.pairAddress,
      sparkline: [],
      totalSupply: cachedQuote?.totalSupply ?? null,
      circulatingSupply: cachedQuote?.circulatingSupply ?? null,
    });
  }

  return [...coreAssets, ...assetsByAddress.values()];
}

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

function formatRemainingTime(seconds: number, tier: string) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (tier !== FREE_TIER && days > 0) return `${days}d ${hours}h remaining`;
  const totalHours = Math.floor(seconds / 3600);
  if (totalHours > 0) return `${totalHours}h remaining`;
  return `${Math.max(1, Math.ceil(seconds / 60))}m remaining`;
}

// Calculate global earning speed per second from all active nodes
function calculateGlobalEarningSpeedPerSecond(activations: Activation[], now: number): number {
  const nowUTC = Math.floor(now / 1000) * 1000;
  
  return activations.reduce((totalSpeed, activation) => {
    const expiresAt = Date.parse(activation.expires_at);
    const earningPerDay = Number(tiers.find(([tierName]) => tierName === activation.tier)?.[2]);
    
    // Only count activations that are currently active
    if (!Number.isFinite(expiresAt) || !Number.isFinite(earningPerDay) || expiresAt <= nowUTC) {
      return totalSpeed;
    }
    
    // Sum up RTR/day rates and convert to per-second rate
    return totalSpeed + (earningPerDay / 86400);
  }, 0);
}

// Calculate total earnings including offline progression
function calculateTotalEarnings(baseBalance: number, lastBalanceUpdate: number, activations: Activation[], now: number): number {
  const nowUTC = Math.floor(now / 1000) * 1000;
  const lastBalanceUpdateUTC = Math.floor(lastBalanceUpdate / 1000) * 1000;
  
  // Calculate global earning speed per second from all active nodes
  const globalEarningSpeedPerSecond = calculateGlobalEarningSpeedPerSecond(activations, nowUTC);
  
  // Calculate seconds elapsed since last balance update
  const secondsElapsed = (nowUTC - lastBalanceUpdateUTC) / 1000;
  
  // Offline Earnings = (Current UTC Timestamp - last_balance_update) * Total Earnings Per Second
  const offlineEarnings = secondsElapsed * globalEarningSpeedPerSecond;
  
  // Return total: base balance + offline earnings
  return baseBalance + offlineEarnings;
}

function formatMarketPrice(asset: MarketAsset) {
  if (typeof asset.price !== "number" || !Number.isFinite(asset.price)) return "—";
  const stablecoin = asset.symbol === "USDT" || asset.symbol === "USDC";
  return `$${asset.price.toLocaleString(undefined, { minimumFractionDigits: stablecoin ? 4 : 0, maximumFractionDigits: stablecoin ? 4 : 4 })}`;
}

function getMarketTokenLogo(asset: MarketAsset) {
  if (asset.address?.toLowerCase() === RTR_TOKEN_DETAILS.address.toLowerCase()) {
    return RTR_TOKEN_DETAILS.logoURI;
  }

  const logoURI = asset.logoURI?.trim();
  if (!logoURI || logoURI === RTR_TOKEN_DETAILS.logoURI) return null;
  if (logoURI.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${logoURI.slice("ipfs://".length)}`;
  }
  if (/^https?:\/\//i.test(logoURI)) return logoURI;
  return null;
}

function MarketTokenLogo({ asset, large = false }: { asset: MarketAsset; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const logo = getMarketTokenLogo(asset);
  const isRTR = asset.address?.toLowerCase() === RTR_TOKEN_DETAILS.address.toLowerCase();
  const sizeClass = large ? "h-14 w-14" : "h-9 w-9";

  if (!logo || failed) {
    return (
      <div
        aria-label={`${asset.symbol} token placeholder`}
        className={`${sizeClass} flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 ${
          isRTR ? "border-emerald-500/60 bg-emerald-950/60 text-emerald-300" : "border-slate-600 bg-slate-800 text-slate-300"
        }`}
        role="img"
      >
        <span className={`${large ? "text-lg" : "text-xs"} font-bold`}>{asset.symbol.slice(0, 1).toUpperCase()}</span>
      </div>
    );
  }

  return (
    <div className={`${sizeClass} shrink-0 overflow-hidden rounded-full border-2 border-slate-600 bg-slate-900`}>
      <img
        src={logo}
        alt={`${asset.symbol} logo`}
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  );
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
  const [activeWalletAddress, setActiveWalletAddress] = useState<Address | null>(null);
  const [walletProfileLoading, setWalletProfileLoading] = useState(true);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [, setPinState] = useState("");
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState<View>("dashboard");
  const previousView = useRef(view);
  const [navigationReady, setNavigationReady] = useState(false);
  const [depositStorageReady, setDepositStorageReady] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [activations, setActivations] = useState<Activation[]>([]);
  const [isFreeActivationPending, setIsFreeActivationPending] = useState(false);
  const freeActivationPendingRef = useRef(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoadedAt, setBalanceLoadedAt] = useState<number | null>(null);
  const [marketCacheReady, setMarketCacheReady] = useState(false);
  const [email, setEmail] = useState("");
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
      const restoreDeposit = window.localStorage.getItem("rtr-deposit-modal-open") === "true";
      if (restoreDeposit) {
        previousView.current = "portfolio";
        setView("portfolio");
        setShowDepositModal(true);
      } else {
        const savedView = window.localStorage.getItem("active_tab");
        if (savedView === "dashboard" || savedView === "upgrades" || savedView === "market" || savedView === "trading" || savedView === "game" || savedView === "portfolio") {
          setView(savedView);
        }
      }
      setNavigationReady(true);
      setDepositStorageReady(true);
    }, 0);
    return () => window.clearTimeout(mountTimer);
  }, []);

  useEffect(() => {
    if (navigationReady) window.localStorage.setItem("active_tab", view);
  }, [navigationReady, view]);

  useEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    // Close the overlay whenever the active app tab changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowDepositModal(false);
  }, [view]);

  useEffect(() => {
    if (!depositStorageReady) return;
    if (showDepositModal) {
      window.localStorage.setItem("rtr-deposit-modal-open", "true");
    } else {
      window.localStorage.removeItem("rtr-deposit-modal-open");
      window.localStorage.removeItem("rtr-deposit-modal-step");
    }
  }, [depositStorageReady, showDepositModal]);

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

  useEffect(() => {
    let cancelled = false;
    let authEventReceived = false;
    let walletRequestId = 0;
    const loadWalletAddress = async (sessionUser: User | null) => {
      const requestId = ++walletRequestId;
      setActiveWalletAddress(null);
      setWalletProfileLoading(Boolean(sessionUser));
      if (!sessionUser) return;

      await Promise.resolve();
      try {
        const { data, error: walletError } = await supabase
          .from("profiles")
          .select("wallet_address")
          .eq("id", sessionUser.id)
          .maybeSingle();
        if (walletError) throw walletError;
        if (cancelled || requestId !== walletRequestId) return;
        console.log("Fetched address:", data?.wallet_address);
        const walletAddress = data?.wallet_address;
        setActiveWalletAddress(
          typeof walletAddress === "string" && isAddress(walletAddress)
            ? getAddress(walletAddress)
            : null,
        );
        setWalletProfileLoading(false);
      } catch (walletError: unknown) {
        if (cancelled || requestId !== walletRequestId) return;
        console.error("Failed to load profile wallet address:", walletError);
        setActiveWalletAddress(null);
        setWalletProfileLoading(false);
        setError("Unable to load your profile wallet address.");
      }
    };

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) throw sessionError;
      if (cancelled || authEventReceived) return;
      const sessionUser = data.session?.user ?? null;
      void loadWalletAddress(sessionUser);
      setUser(sessionUser);
      setProfileName(displayNameFromUser(sessionUser));
      setProfileLoading(Boolean(sessionUser));
      setAuthLoading(false);
    }).catch((sessionError: unknown) => {
      if (cancelled || authEventReceived) return;
      console.error("Failed to restore Supabase session:", sessionError);
      setAuthLoading(false);
      setError("Unable to restore your session. Please refresh and try again.");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventReceived = true;
      const sessionUser = session?.user ?? null;
      void loadWalletAddress(sessionUser);
      setUser(sessionUser);
      setProfileName(displayNameFromUser(sessionUser));
      setProfileLoading(Boolean(sessionUser));
      setAuthLoading(false);
      if (!sessionUser) setActivations([]);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    let cancelled = false;

    async function loadActiveNodes() {
      const { data, error: activationsError } = await supabase
        .schema("public")
        .from("booster_activations")
        .select("id, user_id, tier, activated_at, expires_at")
        .eq("user_id", userId)
        .gt("expires_at", new Date().toISOString())
        .order("activated_at", { ascending: false });

      if (cancelled) return;
      if (activationsError) {
        console.error("Failed to load public.booster_activations:", activationsError);
        setError("Unable to load your active mining nodes.");
        return;
      }
      setActivations(data ?? []);
    }

    void loadActiveNodes().catch((loadError: unknown) => {
      if (cancelled) return;
      console.error("Failed to load active mining nodes:", loadError);
      setError("Unable to load your active mining nodes.");
    });

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Forced automatic background autosave every 10 seconds
  useEffect(() => {
    if (!user || balance === null || balanceLoadedAt === null || profileLoading || activations.length === 0) return;
    const userId = user.id;
    
    const autosaveTimer = window.setInterval(async () => {
      try {
        // Calculate current live balance using total earnings function
        const nowUTC = Date.now();
        const currentLiveBalance = calculateTotalEarnings(balance, balanceLoadedAt, activations, nowUTC);
        
        // Absolute write operation to Supabase backend
        const { error } = await supabase
          .from('profiles')
          .update({ 
            total_accrued_balance: currentLiveBalance,
            last_balance_update: new Date().toISOString()
          })
          .eq('id', userId);
        
        if (error) {
          console.error('Failed to autosave balance:', error);
        } else {
          console.log('Balance autosaved successfully:', currentLiveBalance);
        }
      } catch (err) {
        console.error('Error in balance autosave:', err);
      }
    }, 10000); // Autosave every 10 seconds
    
    return () => window.clearInterval(autosaveTimer);
  }, [user, balance, balanceLoadedAt, profileLoading, activations]);

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    let cancelled = false;
    async function loadProfile() {
      try {
        const accrualResponse = await fetchWithTimeout("/api/mining/accrue", { method: "POST" });
        if (!accrualResponse.ok) {
          const accrualResult = await accrualResponse.json() as { error?: string };
          // Use safe fallback instead of throwing error
          console.warn("Mining accrual API unavailable:", accrualResult.error);
          setBalance(0);
          setBalanceLoadedAt(Date.now());
          if (cancelled) return;
        }
        if (cancelled) return;

        const { data, error } = await supabase
          .from("profiles")
          .select("avatar_url, total_accrued_balance, last_balance_update")
          .eq("id", userId)
          .single<Profile>();
        if (cancelled) return;
        
        if (error || !data) {
          // Use safe fallback instead of throwing error
          console.warn("Profile data unavailable, using fallback:", error);
          setBalance(0);
          setBalanceLoadedAt(Date.now());
          if (cancelled) return;
        }
        
        // Solid timestamps on load & refresh: query database for total_accrued_balance and last_balance_update
        const accruedBalance = Number(data?.total_accrued_balance ?? 0);
        const accruedAt = typeof data?.last_balance_update === "string" ? Date.parse(data.last_balance_update) : NaN;
        
        // Use UTC timestamp for consistency
        const accruedAtUTC = !Number.isFinite(accruedAt) ? Date.now() : Math.floor(accruedAt / 1000) * 1000;
        
        // Use safe fallback for invalid data
        if (data?.total_accrued_balance == null || !Number.isFinite(accruedBalance) || !Number.isFinite(accruedAtUTC)) {
          console.warn("Invalid balance data, using fallback");
          setBalance(0);
          setBalanceLoadedAt(Date.now());
        } else {
          // Calculate exact offline progression gap: Offline Earnings = (Current UTC Timestamp - last_balance_update) * Total Earnings Per Second
          const nowUTC = Date.now();
          const calculatedTotal = calculateTotalEarnings(accruedBalance, accruedAtUTC, activations, nowUTC);
          
          // Set initial live counter state to exactly total_accrued_balance + Offline Earnings
          // Never let it reset to 0 or fall backwards
          setBalance(calculatedTotal);
          setBalanceLoadedAt(accruedAtUTC);
        }
        
        setAvatar(data?.avatar_url?.trim() || null);
      } catch (loadError: unknown) {
        if (cancelled) return;
        console.error("Failed to load saved mining balance:", loadError);
        // Use safe fallback instead of throwing error
        setBalance(0);
        setBalanceLoadedAt(Date.now());
        setError(null); // Clear any error state
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    }
    void loadProfile();
    return () => { cancelled = true; };
  }, [user]);

  async function activateTier(tier: string) {
    setError(null);
    let response: Response;
    let body: { activation?: Activation; error?: string };
    try {
      response = await fetch("/api/mining/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      body = await response.json() as { activation?: Activation; error?: string };
    } catch (activationError: unknown) {
      console.error("Failed to send the tier activation request:", activationError);
      setError("Unable to activate this node. Please try again.");
      return false;
    }
    if (!response.ok || !body.activation) {
      const message = body.error ?? "Unable to activate this tier.";
      console.error("Tier activation API returned an error:", { status: response.status, message });
      setError(message);
      return false;
    }
    const activated = body.activation;
    setActivations((current) =>
      [activated, ...current]
        .sort((left, right) => Date.parse(right.activated_at) - Date.parse(left.activated_at)),
    );
    return true;
  }

  async function purchase(tier: (typeof tiers)[number]) {
    const isFreeTier = tier[0] === FREE_TIER;
    if (isFreeTier) {
      if (freeActivationPendingRef.current) return;
      const activeFreeNode = activations.some(
        (activation) => activation.tier === FREE_TIER && Date.parse(activation.expires_at) > Date.now(),
      );
      if (activeFreeNode) {
        setError("Your Free Node Booster is already active.");
        return;
      }
      freeActivationPendingRef.current = true;
      setIsFreeActivationPending(true);
    }

    try {
      if (await activateTier(tier[0])) {
        setView("dashboard");
      }
    } catch (purchaseError: unknown) {
      console.error("Failed to complete the tier purchase:", purchaseError);
      setError("Unable to complete this purchase. Please try again.");
    } finally {
      if (isFreeTier) {
        freeActivationPendingRef.current = false;
        setIsFreeActivationPending(false);
      }
    }
  }

  const openDepositModal = () => {
    window.localStorage.setItem("rtr-deposit-modal-step", "menu");
    setShowDepositModal(true);
  };

  const changeTab = (nextView: View) => {
    setShowDepositModal(false);
    window.localStorage.removeItem("rtr-deposit-modal-open");
    window.localStorage.removeItem("rtr-deposit-modal-step");
    setView(nextView);
  };

  const closeDepositModal = () => {
    window.localStorage.removeItem("rtr-deposit-modal-open");
    window.localStorage.removeItem("rtr-deposit-modal-step");
    setShowDepositModal(false);
  };

  async function signOut() {
    setPinState("");
    window.dispatchEvent(new Event("rtr-auth-reset"));
    setUser(null);
    setProfileName(null);
    setAvatar(null);
    setActivations([]);
    setBalance(0);
    setBalanceLoadedAt(Date.now());

    // Save email for login memory
    if (typeof window !== 'undefined' && email) {
      window.localStorage.setItem('last_logged_in_email', email);
    }

    try {
      await supabase.auth.signOut();
    } finally {
      window.localStorage.removeItem("active_tab");
      window.localStorage.removeItem("rtr-deposit-modal-open");
      window.localStorage.removeItem("rtr-deposit-modal-step");
      window.localStorage.removeItem("saved_wallet_address");
      window.localStorage.removeItem(LEGACY_AUTH_EMAIL_STORAGE_KEY);
      window.localStorage.removeItem("rtr-balance-visible");
      window.sessionStorage.removeItem("rtr-auth-view");
      window.sessionStorage.removeItem("rtr-signup-verification");
      window.sessionStorage.removeItem("rtr-signup-email");
      window.location.replace("/login");
    }
  }

  if (splashVisible) return <SplashGate exiting={splashExiting} />;
  if (!user) return <AuthOverlay />;
  if (pathname === "/settings") return <AccountSettings profileName={profileName} avatar={avatar} onBack={() => router.push("/")} onSignOut={signOut} />;

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

      <section className={`content-scroll${view === "upgrades" ? " upgrades-content-scroll" : ""}`}>
        {error && <div className="error-banner" role="alert">{error}</div>}
        {view === "dashboard" && <Dashboard balance={balance} balanceLoadedAt={balanceLoadedAt} balanceLoading={profileLoading} isBalanceHidden={isBalanceHidden} onToggleBalance={() => setIsBalanceHidden((hidden) => !hidden)} activations={activations} />}
        {view === "upgrades" && <Upgrades onPurchase={purchase} activations={activations} isFreeActivationPending={isFreeActivationPending} />}
        {view === "market" && <MarketView market={market} />}
        {view === "trading" && <PlaceholderView icon={<Activity />} title="Trading desk" text="Execution routing is secured through the RTR relay." />}
        {view === "game" && <PlaceholderView icon={<Gamepad2 />} title="Node quests" text="Complete community missions to unlock bonus points." />}
        {view === "portfolio" && <PortfolioView market={market} activeWalletAddress={activeWalletAddress} walletProfileLoading={walletProfileLoading} onOpenDeposit={openDepositModal} />}
      </section>

      {showDepositModal && (
        <CustomDepositModal
          userWalletAddress={activeWalletAddress ?? ""}
          onClose={closeDepositModal}
        />
      )}

      <nav className="bottom-nav" aria-label="Primary navigation">
        <NavItem icon={<LayoutDashboard />} label="Dashboard" active={view === "dashboard"} onClick={() => changeTab("dashboard")} />
        <NavItem icon={<Crown />} label="Upgrades" active={view === "upgrades"} onClick={() => changeTab("upgrades")} />
        <NavItem icon={<TrendingUp />} label="Market" active={view === "market"} onClick={() => changeTab("market")} />
        <NavItem icon={<Activity />} label="Trading" active={view === "trading"} onClick={() => changeTab("trading")} />
        <NavItem icon={<Gamepad2 />} label="Game" active={view === "game"} onClick={() => changeTab("game")} />
        <NavItem icon={<WalletIcon />} label="Portfolio" active={view === "portfolio"} onClick={() => changeTab("portfolio")} />
      </nav>

    </main>
  );
}

function Dashboard({ balance, balanceLoadedAt, balanceLoading, isBalanceHidden, onToggleBalance, activations }: { balance: number | null; balanceLoadedAt: number | null; balanceLoading: boolean; isBalanceHidden: boolean; onToggleBalance: () => void; activations: Activation[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // Use UTC timestamp for consistent calculation
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const nowUTC = Math.floor(now / 1000) * 1000;
  const balanceLoadedAtUTC = balanceLoadedAt ? Math.floor(balanceLoadedAt / 1000) * 1000 : null;

  const activeActivations = useMemo(
    () => activations
      .filter((activation) => Date.parse(activation.expires_at) > nowUTC)
      .sort((left, right) => Date.parse(right.activated_at) - Date.parse(left.activated_at)),
    [activations, nowUTC],
  );
  const currentActivation = activeActivations[0];
  const remaining = currentActivation
    ? Math.max(0, Math.floor((Date.parse(currentActivation.expires_at) - nowUTC) / 1000))
    : 0;
  const cycleSeconds = currentActivation
    ? cycleSecondsForTier(currentActivation.tier) ?? FREE_CYCLE_SECONDS
    : FREE_CYCLE_SECONDS;
  const progress = Math.min(100, (remaining / cycleSeconds) * 100);
  
  // Calculate live balance using total earnings function
  const liveBalance = balance !== null && balanceLoadedAtUTC !== null
    ? calculateTotalEarnings(balance, balanceLoadedAtUTC, activations, nowUTC)
    : (balance ?? 0);
  
  const displayBalance = balanceLoading
    ? "Loading..."
    : isBalanceHidden
      ? "••••••"
      : liveBalance.toFixed(4);
  const displayFiatBalance = balanceLoading
    ? "Loading..."
    : isBalanceHidden
      ? "••••••"
      : `$${(liveBalance * RTR_PRICE_USD).toFixed(2)}`;

  return <div className="dashboard-view">
    <div className="balance-card"><div><div className="balance-label"><span className="eyebrow">TOTAL ACCRUED</span><button className="balance-toggle" type="button" onClick={onToggleBalance} aria-label={isBalanceHidden ? "Show balance" : "Hide balance"}>{isBalanceHidden ? <EyeOff size={16} /> : <Eye size={16} />}</button></div><strong>{displayBalance} <small>RTR</small></strong><span className="balance-fiat">{displayFiatBalance}</span></div><div className="balance-icon"><Zap size={21} /></div></div>
    <div className="section-heading"><div><span className="eyebrow">ACTIVE NODE</span><h2>{currentActivation?.tier ?? "Collection protocol"}</h2></div>{currentActivation && <span className="live-dot">LIVE</span>}</div>
    <div className="ring-wrap"><div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><div className="ring-inner"><Sparkles size={17} /><strong>{formatTime(remaining)}</strong><span>{currentActivation ? "Accumulating" : "Ready to collect"}</span></div></div></div>
    <section className="active-nodes-panel" aria-label="Active mining nodes">
      <h3>ACTIVE MINING NODES</h3>
      {activeActivations.length > 0 ? (
        <div className="active-node-list">
          {activeActivations.map((activation) => {
            const earningPower = tiers.find(([tierName]) => tierName === activation.tier)?.[2];
            const nodeRemaining = Math.max(0, Math.floor((Date.parse(activation.expires_at) - now) / 1000));
            return (
              <div className="active-node-row" key={activation.id}>
                <span className="active-node-name"><span className="active-node-dot" />{activation.tier}</span>
                <span className="active-node-remaining">{formatRemainingTime(nodeRemaining, activation.tier)}</span>
                <span className="active-node-earning">{earningPower ? `+${earningPower} RTR/day` : "Rate unavailable"}</span>
              </div>
            );
          })}
        </div>
      ) : <p className="active-nodes-empty">No active mining nodes.</p>}
    </section>
    <div className="metric-grid"><div><span>Network</span><strong>Base Mainnet</strong></div></div>
  </div>;
}
function PortfolioView({ market, activeWalletAddress, walletProfileLoading, onOpenDeposit }: { market: MarketAsset[]; activeWalletAddress: Address | null; walletProfileLoading: boolean; onOpenDeposit: () => void }) {
  const [isPrivate, setIsPrivate] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showActivityLedger, setShowActivityLedger] = useState(false);
  const [showWalletError, setShowWalletError] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const portfolioAddress = activeWalletAddress ?? undefined;
  const nativeBalance = useBalance({ address: portfolioAddress });
  const rtrTokenAddress = process.env.NEXT_PUBLIC_RTR_TOKEN_ADDRESS as Address | undefined;
  const rtrBalance = useReadContract({
    address: rtrTokenAddress,
    abi: rtrTokenAbi,
    functionName: "balanceOf",
    args: portfolioAddress ? [portfolioAddress] : undefined,
    query: { enabled: Boolean(portfolioAddress && rtrTokenAddress) },
  });

  const priceFor = (symbol: string) => market.find((asset) => asset.symbol === symbol)?.price ?? null;
  const rtrAmount = typeof rtrBalance.data === "bigint" ? Number(formatUnits(rtrBalance.data, 18)) : portfolioAddress ? 0 : 0;
  const ethAmount = nativeBalance.data ? Number(formatUnits(nativeBalance.data.value, nativeBalance.data.decimals)) : portfolioAddress ? 0 : 0;
  const rtrValue = rtrAmount * (priceFor("RTR") ?? 0);
  const ethValue = ethAmount * (priceFor("ETH") ?? 0);
  const totalValue = rtrValue + ethValue;
  const assetsLoading = walletProfileLoading || Boolean(portfolioAddress && (nativeBalance.isLoading || rtrBalance.isLoading));

  // Dynamic asset ledger array
  const assets = [
    {
      symbol: "RTR",
      name: "RTR Network",
      balance: rtrAmount,
      value: rtrValue,
      icon: "R",
      iconBg: "bg-purple-600",
      iconShadow: "shadow-purple-500/20",
    },
    {
      symbol: "ETH",
      name: "Ethereum",
      balance: ethAmount,
      value: ethValue,
      icon: "Ξ",
      iconBg: "bg-slate-800",
      iconShadow: "shadow-slate-500/20",
    },
  ].filter((asset) => asset.balance > 0);

  function formatUsdValue(value: number) {
    if (!Number.isFinite(value) || value === 0) return "0.00";
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const handleAction = (action: () => void) => {
    if (!activeWalletAddress) {
      setShowWalletError(true);
      return;
    }
    action();
  };

  if (!isMounted) return null;

  return (
    <div className="portfolio-view w-full px-0 py-6 space-y-6 select-none animate-fadeIn">
      
      {/* =========================================================================
          ZONE 1: HORIZONTALLY EXPANDED BALANCE CARD WITH CLEAN NO-WRAP LAYOUT
          ========================================================================= */}
      <div className="bg-[#11192e] border border-blue-900/30 rounded-2xl p-5 shadow-xl relative overflow-hidden w-full mx-0">
        <div className="flex items-center w-full mb-3 text-xs font-bold tracking-wide">
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
          <div className="flex-grow min-w-[24px]"></div>
          <button
            onClick={() => handleAction(() => setShowActivityLedger(true))}
            className="text-blue-400 hover:text-blue-300 transition-colors text-[11px] text-right font-bold whitespace-nowrap shrink-0 block"
          >
            Transaction History ›
          </button>
        </div>

        <div className="flex items-baseline gap-1.5 mt-2">
          <span className="text-4xl font-black text-white tracking-tight font-sans">
            {"$" + (isPrivate ? "••••••" : formatUsdValue(totalValue))}
          </span>
          <span className="text-sm font-extrabold text-blue-400 tracking-wide uppercase">USD</span>
        </div>

        <div className="mt-5 pt-3 border-t border-slate-800/40 text-[11px] text-slate-400 font-mono flex justify-between items-center w-full">
          <span className="text-slate-500 font-sans font-semibold uppercase tracking-wider text-[10px]">Node Wallet</span>
          <span className={`tracking-wider text-xs ${portfolioAddress ? "text-slate-400" : walletProfileLoading ? "text-blue-400 animate-pulse" : "text-slate-600"}`}>
            {walletProfileLoading ? "Loading profile wallet..." : portfolioAddress ? `${portfolioAddress.slice(0, 6)}...${portfolioAddress.slice(-4)}` : "No Wallet Linked"}
          </span>
        </div>
      </div>

     {/* =========================================================================
          ZONE 2: REOWN-STYLE LIGHT BLUE 3-ACTION CONTROL HUB WITH DEDICATED FIXED TARGET HOOKS
          ========================================================================= */}
      <div className="grid grid-cols-3 gap-4 py-2 justify-items-center w-full">
        
        {/* BUTTON 1: DEPOSIT - OPEN CUSTOM DEPOSIT MODAL */}
        <button
          onClick={() => {
            if (!activeWalletAddress && !walletProfileLoading) {
              setShowWalletError(true);
              return;
            }
            onOpenDeposit();
          }}
          className="flex flex-col items-center justify-center group focus:outline-none w-full"
        >
          <div className="w-full aspect-square max-w-[72px] rounded-2xl bg-[#1a2b4c] border border-blue-500/30 flex items-center justify-center text-[#3b82f6] shadow-lg shadow-blue-500/5 transition-all duration-200 group-hover:scale-105 group-hover:bg-[#223a66] group-hover:border-blue-400/50">
            <ArrowDown size={24} className="stroke-[2.5]" />
          </div>
          <span className="text-xs font-bold text-slate-300 mt-2.5 tracking-wide group-hover:text-white transition-colors">
            Deposit
          </span>
        </button>

        {/* BUTTON 2: CONVERT - OPEN CUSTOM SWAP MODAL */}
        <button
          onClick={() => handleAction(() => setShowSwapModal(true))}
          className="flex flex-col items-center justify-center group group-hover:scale-105 focus:outline-none w-full"
        >
          <div className="w-full aspect-square max-w-[72px] rounded-2xl bg-[#1a2b4c] border border-blue-500/30 flex items-center justify-center text-[#3b82f6] shadow-lg shadow-blue-500/5 transition-all duration-200 group-hover:scale-105 group-hover:bg-[#223a66] group-hover:border-blue-400/50">
            <RefreshCw size={22} className="stroke-[2.5]" />
          </div>
          <span className="text-xs font-bold text-slate-300 mt-2.5 tracking-wide group-hover:text-white transition-colors">
            Convert
          </span>
        </button>

        {/* BUTTON 3: SEND CRYPTO - NATIVE WALLETSEND PANEL */}
        <button
          onClick={() => setShowSendModal(true)}
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
        {assetsLoading ? (
          <div className="text-center py-8 text-slate-400" role="status">
            Scanning wallet assets...
          </div>
        ) : assets.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            No assets found in your wallet
          </div>
        ) : (
          assets.map((asset) => (
            <div
              key={asset.symbol}
              className="flex justify-between items-center bg-[#11192e]/40 p-4 rounded-xl border border-blue-950/40 w-full"
            >
              <span className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${asset.iconBg} flex items-center justify-center font-bold text-white shadow-lg ${asset.iconShadow} text-sm`}>
                  {asset.icon}
                </div>
                <div>
                  <strong className="block text-sm text-white font-semibold tracking-wide">{asset.name}</strong>
                  <small className="block text-xs text-slate-500 uppercase tracking-wider font-medium">{asset.symbol}</small>
                </div>
              </span>
              <div className="text-right">
                <strong className="block text-sm text-white font-bold tracking-wide portfolio-blur-target" data-private={isPrivate}>
                  {isPrivate ? "••••" : `${asset.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${asset.symbol}`}
                </strong>
                <small className="text-xs text-slate-400 font-semibold tracking-wide portfolio-blur-target" data-private={isPrivate}>
                  {isPrivate ? "••••" : `$${formatUsdValue(asset.value)}`}
                </small>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Custom Modals */}
      {showSwapModal && <CustomSwapModal activeWalletAddress={activeWalletAddress} onClose={() => setShowSwapModal(false)} />}
      {showSendModal && <CustomSendModal onClose={() => setShowSendModal(false)} />}
      {showActivityLedger && <CustomActivityLedger activeWalletAddress={activeWalletAddress} onClose={() => setShowActivityLedger(false)} />}
      
      {/* Wallet Connection Error Modal */}
      {showWalletError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#11192e] border border-blue-900/30 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <X size={32} className="text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Wallet Not Linked</h3>
              <p className="text-slate-400 text-sm mb-6">Link a wallet to your profile to continue.</p>
              <button
                onClick={() => setShowWalletError(false)}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
function SplashGate({ exiting }: { exiting: boolean }) {
  return <main className={`app-shell auth-loading${exiting ? " splash-exiting" : ""}`} aria-label="Loading RTR Network"><img className="splash-logo" src="/logo.png" alt="RTR Network shield" /></main>;
}

function Upgrades({ onPurchase, activations, isFreeActivationPending }: { onPurchase: (tier: (typeof tiers)[number]) => Promise<void>; activations: Activation[]; isFreeActivationPending: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const isFreeNodeActive = activations.some(
    (activation) => activation.tier === FREE_TIER && Date.parse(activation.expires_at) > now,
  );

  return (
    <div className="upgrades-view">
      <div className="page-intro">
        <span className="eyebrow">PROTOCOL STORE</span>
        <h2>Choose your node tier</h2>
        <p>Every paid tier runs for a fixed 30-day cycle and streams allocation directly from the deployment treasury.</p>
      </div>
      <div className="tier-list">
        {tiers.map((tier, index) => {
          const isFreeTier = tier[0] === FREE_TIER;
          const freeButtonDisabled = isFreeTier && (isFreeNodeActive || isFreeActivationPending);
          const buttonLabel = isFreeTier
            ? isFreeNodeActive ? "Active" : isFreeActivationPending ? "Activating..." : "Activate free node"
            : "Purchase with USDC";

          return (
            <article className={index === 3 ? "tier-card featured" : "tier-card"} key={tier[0]}>
              <div className="tier-top">
                <span className="tier-number">0{index + 1}</span>
                {index === 3 && <span className="featured-label">POPULAR</span>}
              </div>
              <h3>{tier[0]}</h3>
              <div className="tier-price">{tier[1] === "Free" ? "Free" : `$${tier[1]}`}<small>{tier[1] === "Free" ? "" : " USDC"}</small></div>
              <div className="tier-speed"><Zap size={15} /> {tier[2]} RTR <span>/ day</span></div>
              <div className="tier-details">
                <span><Globe2 size={14} /> {tier[3]}</span>
                <span><LockKeyhole size={14} /> {tier[4]}</span>
              </div>
              <button
                className="tier-button"
                disabled={freeButtonDisabled}
                onClick={() => void onPurchase(tier)}
              >
                {buttonLabel}
                {!(isFreeTier && isFreeNodeActive) && <ArrowUpRight size={16} />}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
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

  // Load last logged in email on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const lastEmail = window.localStorage.getItem('last_logged_in_email');
      if (lastEmail) {
        setEmail(lastEmail);
      }
      setAuthPreferencesReady(true);
    }
  }, []);

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
      // Also save to localStorage for auto-reconnection
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('saved_wallet_address', address);
      }
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

      // Save email for login memory on successful login
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('last_logged_in_email', email.trim());
      }

      // Fetch wallet address from profile to enable auto-reconnection
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('wallet_address')
          .eq('email', email.trim())
          .single();
        
        if (profile?.wallet_address) {
          window.localStorage.setItem('saved_wallet_address', profile.wallet_address);
        }
      } catch (err) {
        console.error('Failed to fetch wallet address:', err);
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
          
          {/* Premium Wallet Activation Card */}
          <div className="wallet-activation-card">
            <div className="wallet-activation-icon">
              <Zap size={24} />
            </div>
            <h3>Activate Your Secure Node Core</h3>
            <p>After verifying your account email code above, click below to initialize your permanent RTR Network Node Wallet to access your portfolio assets, transaction nodes, and exchange channels securely.</p>
            {!isConnected ? (
              <button type="button" className="wallet-activate-button" onClick={() => open()}>
                Initialize & Connect Node Wallet Core
              </button>
            ) : (
              <div className="wallet-connected-state">
                <div className="wallet-connected-icon">
                  <CheckCircle2 size={20} />
                </div>
                <span>Wallet Connected Ready</span>
              </div>
            )}
          </div>
          
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
  const [loading, setLoading] = useState(true);
  const [allTokens, setAllTokens] = useState<MarketAsset[]>([RTR_MARKET_ASSET]);
  const [visibleCount, setVisibleCount] = useState(50);
  const [searchResults, setSearchResults] = useState<MarketAsset[] | null>(null);
  const [comparedAddresses, setComparedAddresses] = useState<string[]>([]);
  const [quoteLoadingAddresses, setQuoteLoadingAddresses] = useState<string[]>([]);
  const [timeframe, setTimeframe] = useState<MarketTimeframe>("24h");
  const [quoteRefreshTick, setQuoteRefreshTick] = useState(0);
  const [chartState, setChartState] = useState<{
    key: string;
    points: MarketHistoryPoint[];
    loading: boolean;
    error: string | null;
  }>({ key: "", points: [], loading: false, error: null });
  const requestedQuoteAddresses = useRef(new Set<string>());
  const quoteCache = useRef(new Map<string, MarketQuote>());
  const drawerHistoryEntry = useRef(false);
  const { open } = useAppKit();

  useEffect(() => {
    try {
      const cached: unknown = JSON.parse(window.localStorage.getItem(MARKET_QUOTE_CACHE_KEY) ?? "null");
      if (!isRecord(cached)) return;
      for (const [address, value] of Object.entries(cached)) {
        if (isAddress(address) && isMarketQuote(value)) quoteCache.current.set(address.toLowerCase(), value);
      }
    } catch {
      // The persisted quote cache is optional; live market data remains authoritative.
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      requestedQuoteAddresses.current.clear();
      setQuoteRefreshTick((current) => current + 1);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const loadBaseMarketRegistry = async () => {
      try {
        const response = await fetch("https://tokens.1inch.io/v1.2/8453", {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`1inch token registry request failed: ${response.status}`);
        }

        const registry: unknown = await response.json();
        if (!isRecord(registry)) {
          throw new Error("1inch returned an invalid Base token registry.");
        }

        const registryTokens = Object.values(registry)
          .filter(isOneInchRegistryToken)
          .filter((token) =>
            isAddress(token.address) &&
            token.symbol.trim() !== "" &&
            token.decimals >= 0 &&
            token.decimals <= 255,
          );
        const verifiedEcosystem = buildMarketAssets(registryTokens, market, quoteCache.current);

        if (!controller.signal.aborted) {
          setAllTokens([RTR_MARKET_ASSET, ...verifiedEcosystem]);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Error setting up market view:", error);
        setAllTokens([
          RTR_MARKET_ASSET,
          ...buildCoreMarketAssets([], market, quoteCache.current),
        ]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadBaseMarketRegistry();
    return () => controller.abort();
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
  const quoteRequestAssets = displayTokens
    .filter((token) => token.symbol.toUpperCase() !== RTR_TOKEN_DETAILS.symbol && token.address && isAddress(token.address))
    .filter((token, index, assets) => assets.findIndex((asset) =>
      asset.address?.toLowerCase() === token.address?.toLowerCase()
    ) === index);
  const quoteRequestKey = [...new Set(quoteRequestAssets.map((token) => token.address!.toLowerCase()))].join(",");
  const quoteRequestDecimalKey = quoteRequestAssets
    .map((token) => `${token.address!.toLowerCase()}:${token.decimals ?? 18}`)
    .join(",");

  useEffect(() => {
    if (!quoteRequestKey) return;
    const addresses = quoteRequestKey.split(",").filter((address) => !requestedQuoteAddresses.current.has(address));
    if (addresses.length === 0) return;
    addresses.forEach((address) => requestedQuoteAddresses.current.add(address));
    setQuoteLoadingAddresses((current) => [...new Set([...current, ...addresses])]);
    const controller = new AbortController();

    const loadTokenQuotes = async () => {
      const quotes = new Map<string, MarketQuote>();

      try {
        const batches: string[][] = [];
        for (let index = 0; index < addresses.length; index += 30) {
          batches.push(addresses.slice(index, index + 30));
        }

        const decimalByAddress = new Map(quoteRequestDecimalKey.split(",").filter(Boolean).map((entry) => {
          const [address, decimals] = entry.split(":");
          return [address, decimals] as const;
        }));

        await Promise.all(batches.map(async (batch) => {
          const decimals = batch.map((address) => decimalByAddress.get(address) ?? "18").join(",");
          const response = await fetch(
            `/api/market/token-data?addresses=${batch.join(",")}&decimals=${decimals}`,
            { signal: controller.signal },
          );
          if (!response.ok) throw new Error(`Token quote request failed: ${response.status}`);
          const payload: unknown = await response.json();
          if (!isRecord(payload)) throw new Error("Token quote response was invalid.");

          for (const address of batch) {
            const quote = payload[address];
            if (!isRecord(quote)) continue;
            const numericField = (field: string) =>
              typeof quote[field] === "number" && Number.isFinite(quote[field]) ? quote[field] as number : null;
            quotes.set(address, {
              price: numericField("price"),
              change: numericField("change"),
              volume: numericField("volume"),
              marketCap: numericField("marketCap"),
              fdv: numericField("fdv"),
              totalSupply: typeof quote.totalSupply === "string" ? quote.totalSupply : null,
              circulatingSupply: typeof quote.circulatingSupply === "string" ? quote.circulatingSupply : null,
              pairAddress: typeof quote.pairAddress === "string" ? quote.pairAddress : undefined,
            });
          }
        }));

        if (controller.signal.aborted) return;
        setAllTokens((previous) => previous.map((token) => {
          const address = token.address?.toLowerCase();
          const quote = address ? quotes.get(address) : undefined;
          if (!address || !quote) return token;

          const cachedQuote = quoteCache.current.get(address);
          const mergedQuote = {
            price: quote.price ?? cachedQuote?.price ?? token.price,
            change: quote.change ?? cachedQuote?.change ?? token.change,
            volume: quote.volume ?? cachedQuote?.volume ?? token.volume ?? null,
            marketCap: quote.marketCap ?? cachedQuote?.marketCap ?? token.marketCap ?? null,
            fdv: quote.fdv ?? cachedQuote?.fdv ?? token.fdv ?? null,
            totalSupply: quote.totalSupply ?? cachedQuote?.totalSupply ?? token.totalSupply ?? null,
            circulatingSupply: quote.circulatingSupply ?? cachedQuote?.circulatingSupply ?? token.circulatingSupply ?? null,
            pairAddress: quote.pairAddress ?? cachedQuote?.pairAddress ?? token.pairAddress,
          };
          quoteCache.current.set(address, mergedQuote);
          return { ...token, ...mergedQuote };
        }));
        try {
          window.localStorage.setItem(
            MARKET_QUOTE_CACHE_KEY,
            JSON.stringify(Object.fromEntries(quoteCache.current)),
          );
        } catch {
          // A full or disabled storage area does not block the live quote update.
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Unable to load live Base token quotes:", error);
        }
      } finally {
        setQuoteLoadingAddresses((current) => current.filter((address) => !addresses.includes(address)));
      }
    };

    void loadTokenQuotes();
    return () => controller.abort();
  }, [quoteRefreshTick, quoteRequestKey, quoteRequestDecimalKey]);

  const activeSelectedAsset = selectedAsset
    ? allTokens.find((token) => token.address?.toLowerCase() === selectedAsset.address?.toLowerCase()) ?? selectedAsset
    : null;
  const selectedTokenAddress = activeSelectedAsset?.address && isAddress(activeSelectedAsset.address)
    ? getAddress(activeSelectedAsset.address)
    : undefined;
  const selectedOnchainSupply = useReadContract({
    address: selectedTokenAddress,
    abi: totalSupplyAbi,
    functionName: "totalSupply",
    chainId: base.id,
    query: {
      enabled: Boolean(selectedTokenAddress && selectedTokenAddress.toLowerCase() !== RTR_TOKEN_DETAILS.address.toLowerCase()),
    },
  });
  const sortedTokens = [
    RTR_MARKET_ASSET,
    ...displayTokens.filter((token) => token.symbol.toUpperCase() !== RTR_TOKEN_DETAILS.symbol),
  ];
  const chartKey = activeSelectedAsset?.pairAddress
    ? `${activeSelectedAsset.pairAddress}:${timeframe}`
    : "";
  const comparedAssets = comparedAddresses
    .map((address) => allTokens.find((token) => token.address?.toLowerCase() === address))
    .filter((token): token is MarketAsset => Boolean(token));
  const isQuoteLoading = (asset: MarketAsset) =>
    Boolean(asset.address && quoteLoadingAddresses.includes(asset.address.toLowerCase()));
  const selectedQuoteLoading = activeSelectedAsset ? isQuoteLoading(activeSelectedAsset) : false;
  const isAssetDrawerOpen = activeSelectedAsset !== null;
  const marketGridStyle = {
    display: "grid",
    gridTemplateColumns: "0.8fr 2.5fr 1.5fr 1.2fr",
    width: "100%",
    alignItems: "center",
  } as const;

  useEffect(() => {
    if (!isAssetDrawerOpen) return;

    const historyState = window.history.state;
    if (!isRecord(historyState) || historyState.rtrMarketAssetDrawer !== true) {
      window.history.pushState(
        { ...(isRecord(historyState) ? historyState : {}), rtrMarketAssetDrawer: true },
        "",
        window.location.href,
      );
    }
    drawerHistoryEntry.current = true;

    const handlePopState = () => {
      drawerHistoryEntry.current = false;
      setSelectedAsset(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (drawerHistoryEntry.current) {
        drawerHistoryEntry.current = false;
        window.history.back();
      } else {
        setSelectedAsset(null);
      }
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAssetDrawerOpen]);

  const closeAssetDrawer = () => {
    if (drawerHistoryEntry.current) {
      drawerHistoryEntry.current = false;
      window.history.back();
      return;
    }
    setSelectedAsset(null);
  };

  useEffect(() => {
    if (!chartKey || !activeSelectedAsset?.pairAddress) return;
    const controller = new AbortController();
    let active = true;

    const loadHistory = async () => {
      setChartState({ key: chartKey, points: [], loading: true, error: null });
      try {
        const response = await fetch(
          `/api/market/token-history?pair=${activeSelectedAsset.pairAddress}&timeframe=${timeframe}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Price history is unavailable.");
        const payload: unknown = await response.json();
        const rawPoints = isRecord(payload) && Array.isArray(payload.points) ? payload.points : null;
        if (!rawPoints) throw new Error("Price history response was invalid.");

        const points = rawPoints.flatMap((point) => {
          if (!isRecord(point) || typeof point.timestamp !== "number" || typeof point.price !== "number") return [];
          return Number.isFinite(point.timestamp) && Number.isFinite(point.price)
            ? [{ timestamp: point.timestamp, price: point.price }]
            : [];
        });
        if (active) setChartState({ key: chartKey, points, loading: false, error: null });
      } catch (error) {
        if (active && !controller.signal.aborted) {
          setChartState({
            key: chartKey,
            points: [],
            loading: false,
            error: error instanceof Error ? error.message : "Price history is unavailable.",
          });
        }
      }
    };

    void loadHistory();
    return () => {
      active = false;
      controller.abort();
    };
  }, [activeSelectedAsset?.pairAddress, chartKey, timeframe]);

  const isCompared = Boolean(activeSelectedAsset?.address && comparedAddresses.includes(activeSelectedAsset.address.toLowerCase()));
  const chartData = chartState.key === chartKey ? chartState.points : [];
  const chartLoading = Boolean(chartKey && chartState.key !== chartKey) || (chartState.key === chartKey && chartState.loading);
  const chartError = chartState.key === chartKey ? chartState.error : null;
  const formatUsdStat = (value: number | null | undefined) => typeof value !== "number" || !Number.isFinite(value)
    ? null
    : `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  const formatSupply = (value: string | null | undefined) => {
    if (typeof value !== "string" || value.trim() === "") return null;
    const match = value.replaceAll(",", "").match(/^(\d+)(?:\.(\d+))?$/);
    if (!match) return value;

    let whole = match[1].replace(/^0+(?=\d)/, "");
    const fraction = match[2] ?? "";
    let hundredths = Number(fraction.padEnd(2, "0").slice(0, 2));
    if (Number(fraction[2] ?? "0") >= 5) hundredths += 1;
    if (hundredths === 100) {
      hundredths = 0;
      const digits = whole.split("");
      let carry = true;
      for (let index = digits.length - 1; index >= 0 && carry; index -= 1) {
        const digit = Number(digits[index]) + 1;
        digits[index] = String(digit % 10);
        carry = digit === 10;
      }
      whole = `${carry ? "1" : ""}${digits.join("")}`;
    }

    const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const formattedFraction = String(hundredths).padStart(2, "0").replace(/0+$/, "");
    return formattedFraction ? `${groupedWhole}.${formattedFraction}` : groupedWhole;
  };
  const onchainSupplyValue = activeSelectedAsset && typeof selectedOnchainSupply.data === "bigint"
    ? formatUnits(selectedOnchainSupply.data, activeSelectedAsset.decimals ?? 18)
    : null;
  const circulatingSupply = formatSupply(activeSelectedAsset?.circulatingSupply);
  const totalSupply = onchainSupplyValue ?? formatSupply(activeSelectedAsset?.totalSupply);
  const supplyFallbackLabel = selectedOnchainSupply.isPending
    ? "Syncing On-Chain..."
    : selectedOnchainSupply.isError ? "Supply unavailable" : "Syncing On-Chain...";
  const formatDetailedPrice = (value: number | null | undefined) => typeof value !== "number" || !Number.isFinite(value)
    ? "Price unavailable"
    : `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;
  const hasSelectedChange = typeof activeSelectedAsset?.change === "number" && Number.isFinite(activeSelectedAsset.change);
  const selectedStats = activeSelectedAsset ? [
    { label: "Market Cap", value: formatUsdStat(activeSelectedAsset.marketCap) },
    { label: "24h Trading Volume", value: formatUsdStat(activeSelectedAsset.volume) },
    { label: "Fully Diluted Valuation", value: formatUsdStat(activeSelectedAsset.fdv) },
  ].filter((stat) => stat.value !== null || selectedQuoteLoading) : [];

  return <div className="market-view">
    <div className="page-intro"><span className="eyebrow">BASE ECOSYSTEM</span><h2>Market monitor</h2><p>Live spot prices and real-time movement across the RTR ecosystem.</p></div>
    <label className="market-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search market assets</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by symbol or name" /></label>
    <div className="w-full bg-[#0d1527]/60 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl mt-4" aria-label="Base ecosystem market monitor">
      <div className="gap-2 px-5 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800/80 bg-[#0d1527]" style={marketGridStyle}>
        <div className="text-left"># TREND</div>
        <div className="text-left">ASSET</div>
        <div className="text-right">SPOT PRICE</div>
        <div className="text-right">LIVE CHANGE</div>
      </div>
      <div className="divide-y divide-slate-800/40 max-h-[500px] overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">Loading assets...</div>
        ) : (
          <>
            {sortedTokens.map((asset, index) => {
              const isRTR = asset.symbol.toUpperCase() === RTR_TOKEN_DETAILS.symbol;
              const isSelected = activeSelectedAsset?.address?.toLowerCase() === asset.address?.toLowerCase();
              const hasChange = typeof asset.change === "number" && Number.isFinite(asset.change);
              const changeIsPositive = (asset.change ?? 0) >= 0;

              return (
                <div
                  key={asset.address || index}
                  onClick={() => setSelectedAsset(asset)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setSelectedAsset(asset);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`View ${asset.name} (${asset.symbol}) details`}
                  className={`gap-2 px-5 py-4 text-xs cursor-pointer transition-all duration-150 ${
                    isSelected ? "bg-blue-500/5 border-l-2 border-blue-500" : "hover:bg-[#121c33]/50"
                  }`}
                  style={marketGridStyle}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-slate-500 font-mono">{index + 1}</span>
                    {hasChange && (
                      (asset.change ?? 0) >= 0
                        ? <TrendingUp size={14} className="shrink-0 text-emerald-400" aria-label="Trending up" />
                        : <ArrowDown size={14} className="shrink-0 text-rose-400" aria-label="Trending down" />
                    )}
                    {isRTR && (
                      <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-[4px] text-[9px] font-extrabold uppercase tracking-wide">
                        Featured
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 min-w-0">
                    <MarketTokenLogo asset={asset} />
                    <div className="min-w-0 truncate">
                      <span className="font-bold block text-slate-100 tracking-wide uppercase font-mono">{asset.symbol}</span>
                      {!isRTR && <span className="text-[10px] text-slate-400 block font-medium truncate">{asset.name}</span>}
                    </div>
                  </div>
                  <div className="text-right font-bold text-slate-200 font-mono">
                    {typeof asset.price !== "number" || !Number.isFinite(asset.price)
                      ? isQuoteLoading(asset) ? "Loading..." : "—"
                      : formatMarketPrice(asset)}
                  </div>
                  <div className={`text-right font-bold font-mono ${
                    changeIsPositive ? "text-emerald-400" : "text-rose-400"
                  }`}>
                    {hasChange ? (
                      <>
                        {changeIsPositive ? "▲ +" : "▼ "}
                        {Math.abs(asset.change ?? 0).toFixed(2)}%
                      </>
                    ) : (
                      <span className="text-slate-500">{isQuoteLoading(asset) ? "Loading..." : "—"}</span>
                    )}
                  </div>
                </div>
              );
            })}
            {visibleCount < allTokens.length && !searchResults && (
              <button className="load-more-button w-full" onClick={loadMore}>Load More Assets</button>
            )}
          </>
        )}
      </div>
    </div>
    {activeSelectedAsset && (
      <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-5" onClick={closeAssetDrawer}>
        <section
          aria-label={`${activeSelectedAsset.name} asset details`}
          aria-modal="true"
          className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-slate-700/80 bg-[#0b1220] p-5 text-slate-100 shadow-2xl sm:rounded-3xl sm:p-7"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
        >
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <button
                type="button"
                className="rounded-xl border border-slate-700 p-2 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                onClick={closeAssetDrawer}
                aria-label="Back to market list"
              >
                <ArrowLeft size={20} />
              </button>
              <MarketTokenLogo asset={activeSelectedAsset} large />
              <div className="min-w-0">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">Base asset</span>
                <h2 className="truncate text-xl font-bold text-white sm:text-2xl">{activeSelectedAsset.name}</h2>
                <span className="font-mono text-sm font-semibold text-slate-400">{activeSelectedAsset.symbol}</span>
              </div>
            </div>
            <button type="button" className="rounded-xl border border-slate-700 p-2 text-slate-300 hover:bg-slate-800" onClick={closeAssetDrawer} aria-label="Close asset details">
              <X size={20} />
            </button>
          </div>

          <div className="mb-6 flex flex-wrap items-end gap-x-4 gap-y-2">
            <strong className="font-mono text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {typeof activeSelectedAsset.price !== "number" && selectedQuoteLoading ? "Loading..." : formatDetailedPrice(activeSelectedAsset.price)}
            </strong>
            <span className={`mb-1 rounded-lg px-2.5 py-1 text-sm font-bold ${
              (activeSelectedAsset.change ?? 0) >= 0
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-rose-500/10 text-rose-400"
            }`}>
              {!hasSelectedChange
                ? selectedQuoteLoading ? "Loading 24h change..." : "24h change unavailable"
                : `${(activeSelectedAsset.change ?? 0) >= 0 ? "+" : ""}${(activeSelectedAsset.change ?? 0).toFixed(2)}% (24h)`}
            </span>
          </div>

          {(selectedStats.length > 0 || selectedQuoteLoading) && (
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {selectedStats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-slate-800 bg-[#101a2d] p-4">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{stat.label}</span>
                  <strong className="mt-2 block font-mono text-lg text-white">
                    {stat.value ?? "Data loading..."}
                  </strong>
                </div>
              ))}
            </div>
          )}
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-[#101a2d] p-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Circulating Supply</span>
              <strong className="mt-2 block font-mono text-lg text-white">
                {formatSupply(circulatingSupply) ?? supplyFallbackLabel}
              </strong>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-[#101a2d] p-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total Supply</span>
              <strong className="mt-2 block font-mono text-lg text-white">
                {formatSupply(totalSupply) ?? supplyFallbackLabel}
              </strong>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200"><BarChart3 size={16} className="text-blue-300" /> Price performance</div>
            <div className="flex gap-1 rounded-xl border border-slate-800 bg-[#101a2d] p-1" aria-label="Chart timeframe">
              {(["1h", "24h", "7d", "30d", "1y"] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  aria-pressed={timeframe === period}
                  onClick={() => setTimeframe(period)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                    timeframe === period ? "bg-blue-500 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6 h-56 rounded-2xl border border-slate-800 bg-[#101a2d]/70 p-3">
            {chartLoading || selectedQuoteLoading && !chartKey ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading price history...</div>
            ) : chartKey && chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="market-detail-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#243149" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value: number) => new Date(value * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tickFormatter={(value: number) => `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 })}`}
                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={72}
                  />
                  <Tooltip
                    contentStyle={{ background: "#0b1220", border: "1px solid #334155", borderRadius: 12 }}
                    labelFormatter={(value) => new Date(Number(value) * 1000).toLocaleString()}
                    formatter={(value) => [formatDetailedPrice(typeof value === "number" ? value : Number(value)), "Price"]}
                  />
                  <Area type="monotone" dataKey="price" stroke="#60a5fa" strokeWidth={2} fill="url(#market-detail-gradient)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-5 text-center text-sm text-slate-400">
                <span>{chartError ?? (chartKey ? "Price history is not available for this asset yet." : "A live trading pair is not available for this asset.")}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3">
            <button
              type="button"
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-600 bg-[#101a2d] px-5 py-3 text-sm font-bold text-slate-100 transition-colors hover:border-blue-400 hover:bg-[#16243d]"
              onClick={() => {
                const address = activeSelectedAsset.address?.toLowerCase();
                if (!address) return;
                setComparedAddresses((current) => current.includes(address)
                  ? current.filter((item) => item !== address)
                  : current.length < 4 ? [...current, address] : current);
              }}
            >
              <BarChart3 size={17} /> {isCompared ? "Remove from Compare" : "Compare"}
            </button>
          </div>
          {comparedAssets.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-800 bg-[#101a2d] p-3">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Comparison watchlist · up to 4 assets</div>
              <div className="flex flex-wrap gap-2">
                {comparedAssets.map((asset) => (
                  <span key={asset.address} className="rounded-lg border border-slate-700 bg-[#0b1220] px-2.5 py-1.5 text-xs font-semibold text-slate-200">
                    {asset.symbol} <span className="ml-1 font-mono text-slate-400">{formatDetailedPrice(asset.price)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    )}
  </div>;
}

function PlaceholderView({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="placeholder-view"><div className="placeholder-icon">{icon}</div><span className="eyebrow">COMING ONLINE</span><h2>{title}</h2><p>{text}</p><button className="primary-button">View protocol status <ArrowUpRight size={16} /></button></div>; }

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) { return <button className={active ? "nav-item active" : "nav-item"} onClick={onClick}>{icon}<span>{label}</span></button>; }
