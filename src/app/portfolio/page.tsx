'use client';

import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, ArrowUpRight, ArrowDownLeft, X, Copy, Check, ExternalLink } from 'lucide-react';
import { useAccount, useBalance, useReadContract, useSendTransaction, useSwitchChain } from 'wagmi';
import { Wallet, ConnectWallet } from '@coinbase/onchainkit/wallet';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { formatUnits, getAddress, isAddress, parseEther, type Address } from 'viem';
import { base } from 'wagmi/chains';
import QRCode from 'qrcode';
import Image from 'next/image';
import { createClient } from "@/lib/supabase/client";
import { fetchProfileWalletAddress, profileWalletQueryKey, saveProfileWalletAddress } from "@/lib/wallet-profile";

type MarketAsset = { id: string; symbol: string; name: string; price: number | null; change: number | null; volume?: number; sparkline?: number[] };
const rtrTokenAbi = [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;
const supabase = createClient();

async function fetchMarketAssets(): Promise<MarketAsset[]> {
  const response = await fetch("/api/market", { cache: "no-store" });
  if (!response.ok) throw new Error("Market data is temporarily unavailable.");
  return await response.json() as MarketAsset[];
}

function formatUsd(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "$—";
  return value.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function AssetTrendChart({ values }: { values: number[] }) {
  const samples = values.length > 1 ? values : [0, 1, 0.5, 1.5];
  const minimum = Math.min(...samples);
  const maximum = Math.max(...samples);
  const spread = maximum - minimum || 1;
  const points = samples.map((value, index) => `${(index / (samples.length - 1)) * 400},${88 - ((value - minimum) / spread) * 72}`).join(" ");
  const firstPoint = points.split(" ")[0];
  const lastPoint = points.split(" ").at(-1);
  const fillPath = `M ${firstPoint} L ${points.replaceAll(" ", " L ")} L 400 100 L 0 100 Z`;

  return <div className="w-full h-32 relative mt-4 overflow-hidden rounded-xl bg-slate-950/20">
    <svg className="w-full h-full" viewBox="0 0 400 100" preserveAspectRatio="none" aria-label="Portfolio asset trend">
      <defs>
        <linearGradient id="tracerGradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#a855f7" /><stop offset="100%" stopColor="#14b8a6" /></linearGradient>
        <linearGradient id="fillGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a855f7" stopOpacity="0.25" /><stop offset="100%" stopColor="#020617" stopOpacity="0" /></linearGradient>
      </defs>
      <path d={fillPath} fill="url(#fillGradient)" />
      <polyline points={points} fill="none" stroke="url(#tracerGradient)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <title>{`Portfolio trend ending at ${lastPoint ?? "current value"}`}</title>
    </svg>
  </div>;
}

export default function PortfolioTab() {
  const router = useRouter();
  const { address, chainId, isConnected } = useAccount();
  const { sendTransactionAsync, isPending: isSending } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [activeRange, setActiveRange] = useState('7D');
  const [showTopUp, setShowTopUp] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrCodeSvg, setQrCodeSvg] = useState("");
  const [destination, setDestination] = useState("");
  const [amountEth, setAmountEth] = useState("");
  const [transferNotice, setTransferNotice] = useState("");
  const [transactionHash, setTransactionHash] = useState("");

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUserId(data.user?.id ?? "");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? "");
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const profileWalletQuery = useQuery({
    queryKey: profileWalletQueryKey(userId),
    queryFn: fetchProfileWalletAddress,
    enabled: Boolean(userId),
    staleTime: Infinity,
    retry: 1,
  });
  const marketQuery = useQuery({ queryKey: ["market-assets"], queryFn: fetchMarketAssets, staleTime: 30000, refetchInterval: 30000, retry: 1 });
  const market = marketQuery.data ?? [];
  const dbWalletAddress = profileWalletQuery.data;
  const activeAddress = address ?? dbWalletAddress ?? undefined;
  const nativeBalance = useBalance({ address: activeAddress });
  const cbBtcTokenAddress = (process.env.NEXT_PUBLIC_BASE_CBBTC_TOKEN_ADDRESS ?? "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf") as Address;
  const cbBtcBalance = useBalance({ address: activeAddress, token: cbBtcTokenAddress, query: { enabled: Boolean(activeAddress) } });
  const rtrTokenAddress = process.env.NEXT_PUBLIC_RTR_TOKEN_ADDRESS as Address | undefined;
  const rtrBalance = useReadContract({
    address: rtrTokenAddress,
    abi: rtrTokenAbi,
    functionName: "balanceOf",
    args: activeAddress ? [activeAddress] : undefined,
    query: { enabled: Boolean(activeAddress && rtrTokenAddress) },
  });
  const priceFor = (symbol: string) => market.find((asset) => asset.symbol === symbol)?.price ?? null;
  const rtrAmount = typeof rtrBalance.data === "bigint" ? Number(formatUnits(rtrBalance.data, 18)) : activeAddress ? 0 : null;
  const ethAmount = nativeBalance.data ? Number(formatUnits(nativeBalance.data.value, nativeBalance.data.decimals)) : activeAddress ? 0 : null;
  const cbBtcAmount = cbBtcBalance.data ? Number(formatUnits(cbBtcBalance.data.value, cbBtcBalance.data.decimals)) : activeAddress ? 0 : null;
  const rtrValue = rtrAmount !== null && priceFor("RTR") !== null ? rtrAmount * (priceFor("RTR") ?? 0) : null;
  const ethValue = ethAmount !== null && priceFor("ETH") !== null ? ethAmount * (priceFor("ETH") ?? 0) : null;
  const cbBtcValue = cbBtcAmount !== null && priceFor("cbBTC") !== null ? cbBtcAmount * (priceFor("cbBTC") ?? 0) : null;
  const totalValue = [rtrValue, ethValue, cbBtcValue].reduce<number>((sum, value) => sum + (value ?? 0), 0);

  useEffect(() => {
    if (!userId || !isConnected || !address || chainId !== base.id || dbWalletAddress?.toLowerCase() === address.toLowerCase()) return;
    let active = true;
    void saveProfileWalletAddress(getAddress(address)).then(() => {
      if (active) queryClient.setQueryData(profileWalletQueryKey(userId), getAddress(address));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [address, chainId, dbWalletAddress, isConnected, queryClient, userId]);

  useEffect(() => {
    if (!activeAddress || !showTopUp) return;
    let active = true;
    void QRCode.toString(activeAddress, { type: "svg", width: 220, margin: 1, errorCorrectionLevel: "M", color: { dark: "#10101b", light: "#ffffff" } })
      .then((svg) => { if (active) setQrCodeSvg(svg); })
      .catch(() => { if (active) setQrCodeSvg(""); });
    return () => { active = false; };
  }, [activeAddress, showTopUp]);

  const ethPrice = priceFor("ETH");
  const maxEth = Math.max(0, (ethAmount ?? 0) - 0.0001);

  const handleCopyAddress = () => {
    if (!activeAddress) return;
    void navigator.clipboard.writeText(activeAddress)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => window.alert("Clipboard access is unavailable in this browser."));
  };

  async function submitWithdraw(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTransferNotice("");
    setTransactionHash("");
    if (!isConnected || !address) {
      window.alert("Connect your Coinbase wallet before signing a transfer.");
      return;
    }
    if (!isAddress(destination)) {
      setTransferNotice("Enter a valid destination 0x wallet address.");
      return;
    }
    const valueEth = Number(amountEth);
    if (!Number.isFinite(valueEth) || valueEth <= 0) {
      setTransferNotice("Enter an ETH amount greater than zero.");
      return;
    }
    if (valueEth > maxEth) {
      setTransferNotice("Insufficient ETH after reserving a small amount for Base network fees.");
      return;
    }
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      const hash = await sendTransactionAsync({ to: getAddress(destination), value: parseEther(amountEth), chainId: base.id });
      setTransactionHash(hash);
      setTransferNotice("Transaction submitted to Base.");
    } catch (error) {
      setTransferNotice(error instanceof Error ? error.message : "The transaction could not be submitted.");
    }
  };

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 font-sans p-4 pb-24 relative overflow-x-hidden">
      
      {/* HEADER OVERRIDE */}
      <header className="w-full flex items-center justify-between h-14 max-w-md mx-auto mb-6 px-1">
        <button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800/60 hover:text-white" aria-label="Back to dashboard" onClick={() => router.push("/")}><ArrowUpRight size={17} className="rotate-[-135deg]" /></button>
        <h1 className="text-xl font-bold tracking-wide bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
          Portfolio
        </h1>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-teal-500 p-[1px]">
          <div className="w-full h-full bg-[#0b0f19] rounded-[11px] flex items-center justify-center font-black text-sm text-teal-400">
            <Image src="/logo.png" width={30} height={30} alt="RTR Network" className="h-full w-full object-contain" />
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto space-y-6">

        {/* PREMIUM GLASSMORPHIC VALUE CARD */}
        <div className="w-full rounded-2xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-xl p-5 relative overflow-hidden shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]">
          <div className="flex items-center justify-between text-xs font-medium tracking-wider text-slate-400 uppercase mb-2">
            <span>Est. Total Value</span>
            <button onClick={() => setIsPrivate(!isPrivate)} className="p-1.5 rounded-lg bg-slate-800/50 border border-slate-700/40">
              {isPrivate ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          <div className="text-3xl font-bold tracking-tight mb-4 text-slate-100">
            {isPrivate ? "••••••" : activeAddress ? formatUsd(totalValue) : profileWalletQuery.isPending ? "Loading..." : "—"}
          </div>

          {/* OFFICIAL COINBASE CONNECTION BUTTON */}
          {!activeAddress ? (
            <div className="w-full theme-neon premium-btn-wrapper">
              <Wallet>
                <ConnectWallet disconnectedLabel="Create & Initialize Wallet" className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-teal-500 hover:from-purple-500 hover:to-teal-400 text-white font-bold text-sm transition-all duration-200 justify-center shadow-[0_4px_15px_rgba(168,85,247,0.4)]" />
              </Wallet>
            </div>
          ) : (
            <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs">
              <span className="font-mono text-slate-500">
                {`${activeAddress.slice(0, 6)}...${activeAddress.slice(-4)}`}
              </span>
              <button onClick={handleCopyAddress} className="text-teal-400 flex items-center gap-1 hover:underline">
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? "Copied" : "Copy Address"}
              </button>
            </div>
          )}
        </div>

        {/* ACTION BUTTONS ROW */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-[2px] rounded-full bg-gradient-to-r from-purple-600 to-teal-500 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
            <button 
              onClick={() => {
                if (!activeAddress) window.alert("No wallet address is linked to this profile.");
                else if (!isConnected) window.alert("Reconnect your Coinbase wallet before signing a withdrawal.");
                else setShowWithdraw(true);
              }}
              className="w-full py-3 rounded-full bg-[#0b0f19] hover:bg-[#0f1526] text-slate-100 font-semibold flex items-center justify-center gap-2"
            >
              <ArrowUpRight size={18} className="text-purple-400" />
              Withdraw
            </button>
          </div>

          <div className="p-[2px] rounded-full bg-gradient-to-r from-purple-600 to-teal-500 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
            <button 
              onClick={() => activeAddress ? setShowTopUp(true) : window.alert("No wallet address is linked to this profile.")}
              className="w-full py-3 rounded-full bg-[#0b0f19] hover:bg-[#0f1526] text-slate-100 font-semibold flex items-center justify-center gap-2"
            >
              <ArrowDownLeft size={18} className="text-teal-400" />
              Top Up
            </button>
          </div>
        </div>

        {/* GLOWING SPLINE GRAPH */}
        <div className="w-full rounded-2xl border border-slate-800/60 bg-slate-900/20 p-5">
          <div className="text-sm font-semibold tracking-wide text-slate-300">Asset Trend</div>
          <div className="text-xs text-slate-500 mt-0.5">Base Network Execution Layer</div>
          <AssetTrendChart values={market.find((asset) => asset.symbol === "ETH")?.sparkline ?? []} />
          <div className="flex items-center justify-between mt-4 bg-slate-950/60 p-1 rounded-xl border border-slate-800/40">
            {['7D', '30D', '180D', '360D'].map((range) => (
              <button
                key={range}
                onClick={() => setActiveRange(range)}
                className={`flex-1 py-1.5 text-center text-xs font-medium rounded-lg transition-all ${
                  activeRange === range ? 'bg-purple-600/20 text-purple-300 font-bold border border-purple-500/20' : 'text-slate-500'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {/* TOKEN BREAKDOWN LIST */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">Assets Breakdown</div>
          
          <div className="w-full flex items-center justify-between p-3.5 rounded-xl border border-slate-800/60 bg-slate-900/30 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center font-bold text-sm text-purple-400">R</div>
              <div>
                <div className="text-sm font-semibold text-slate-200">RTR Network</div>
                <div className="text-xs text-slate-500">RTR</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-slate-200">{isPrivate ? "••••" : rtrAmount === null ? "—" : `${rtrAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })} RTR`}</div>
              <div className="text-xs text-slate-500">{isPrivate ? "••••" : formatUsd(rtrValue)}</div>
            </div>
          </div>

          {[
            { symbol: "ETH", name: "Ethereum", amount: ethAmount, value: ethValue },
            { symbol: "cbBTC", name: "Coinbase Wrapped Bitcoin", amount: cbBtcAmount, value: cbBtcValue },
          ].map((asset) => (
            <div key={asset.symbol} className="w-full flex items-center justify-between p-3.5 rounded-xl border border-slate-800/60 bg-slate-900/30 backdrop-blur-md">
              <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-lg bg-slate-700/30 border border-slate-600/30 flex items-center justify-center font-bold text-sm text-slate-200">{asset.symbol.slice(0, 1)}</div><div><div className="text-sm font-semibold text-slate-200">{asset.name}</div><div className="text-xs text-slate-500">{asset.symbol}</div></div></div>
              <div className="text-right"><div className="text-sm font-semibold text-slate-200">{isPrivate ? "••••" : asset.amount === null ? "—" : `${asset.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${asset.symbol}`}</div><div className="text-xs text-slate-500">{isPrivate ? "••••" : formatUsd(asset.value)}</div></div>
            </div>
          ))}
        </div>
      </main>

      {/* POPUP 1: TOP UP QR MODAL */}
      {showTopUp && activeAddress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-[#0b0f19] p-6 relative">
            <button onClick={() => setShowTopUp(false)} className="absolute top-4 right-4 text-slate-400 p-1 bg-slate-900 rounded-lg">
              <X size={16} />
            </button>
            <h3 className="text-base font-bold text-slate-200 mb-1">Network Deposit</h3>
            <p className="text-xs text-slate-400 mb-4">Send supported Base network assets to this address.</p>
            <div className="w-44 h-44 mx-auto bg-white p-3 rounded-xl flex items-center justify-center mb-4">
              {qrCodeSvg ? <div className="h-full w-full" role="img" aria-label="QR code for your wallet address" dangerouslySetInnerHTML={{ __html: qrCodeSvg }} /> : <span className="text-xs text-slate-500">Generating QR...</span>}
            </div>
            <div className="w-full p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
              <span className="font-mono text-slate-400 truncate mr-3">{activeAddress}</span>
              <button type="button" onClick={handleCopyAddress} className="text-teal-400 flex items-center gap-1 shrink-0">
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showWithdraw && activeAddress && isConnected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowWithdraw(false); }}>
          <section className="w-full max-w-sm rounded-t-2xl border border-slate-800 bg-[#0b0f19] p-6 sm:rounded-2xl" role="dialog" aria-modal="true" aria-labelledby="withdraw-title">
            <div className="mb-5 flex items-center justify-between">
              <h3 id="withdraw-title" className="text-base font-bold text-slate-200">Withdraw</h3>
              <button type="button" onClick={() => setShowWithdraw(false)} className="rounded-lg bg-slate-900 p-2 text-slate-400" aria-label="Close withdraw dialog"><X size={16} /></button>
            </div>
            <form onSubmit={(event) => void submitWithdraw(event)}>
              <label className="mb-4 grid gap-2 text-xs text-slate-400">Destination 0x Wallet Address
                <input type="text" value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="0x..." autoComplete="off" required className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-slate-100 outline-none focus:border-purple-400" />
              </label>
              <label className="grid gap-2 text-xs text-slate-400">Amount (ETH)
                <span className="flex gap-2"><input type="number" min="0" step="any" value={amountEth} onChange={(event) => setAmountEth(event.target.value)} placeholder="0.00" required className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-slate-100 outline-none focus:border-purple-400" /><button type="button" onClick={() => setAmountEth(maxEth.toString())} className="rounded-lg border border-purple-500/40 px-3 text-purple-200">MAX</button></span>
              </label>
              <button type="submit" disabled={isSending} className="mt-5 w-full rounded-xl bg-gradient-to-r from-purple-600 to-teal-500 py-3 text-sm font-bold text-white disabled:opacity-60">{isSending ? "Confirm in wallet..." : "Confirm Asset Transfer"}</button>
              {transferNotice && <p className="mt-3 text-xs text-slate-300" role="status">{transferNotice}</p>}
              {transactionHash && <a className="mt-3 flex items-center gap-2 text-xs text-teal-300" href={`https://basescan.org/tx/${transactionHash}`} target="_blank" rel="noreferrer">View on BaseScan <ExternalLink size={12} /></a>}
            </form>
          </section>
        </div>
      )}
    </div>
  );
}