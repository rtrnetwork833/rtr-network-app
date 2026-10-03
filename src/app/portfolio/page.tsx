'use client';

import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, ArrowUpRight, ArrowDownLeft, X, Copy, Check } from 'lucide-react';
import { useAccount } from 'wagmi';
import { Wallet, ConnectWallet } from '@coinbase/onchainkit/wallet';
import { createClient } from "@/lib/supabase/client";

// --- Clean Fluid Tracer Graph ---
const AssetTrendChart = () => (
  <div className="w-full h-32 relative mt-4 overflow-hidden rounded-xl bg-slate-950/20">
    <svg className="w-full h-full" viewBox="0 0 400 100" preserveAspectRatio="none">
      <defs>
        <linearGradient id="tracerGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#14b8a6" />
        </linearGradient>
        <linearGradient id="fillGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#020617" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M 0 80 Q 100 20 200 60 T 400 30 L 400 100 L 0 100 Z" fill="url(#fillGradient)" />
      <path d="M 0 80 Q 100 20 200 60 T 400 30" fill="none" stroke="url(#tracerGradient)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  </div>
);

export default function PortfolioTab() {
  const { address, isConnected } = useAccount();
  const [isPrivate, setIsPrivate] = useState(false);
  const [activeRange, setActiveRange] = useState('7D');
  const [showTopUp, setShowTopUp] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dbWalletAddress, setDbWalletAddress] = useState<string | null>(null);

  // Sync and fetch directly from Supabase to confirm wallet linkage
  useEffect(() => {
    async function fetchProfile() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('profiles').select('wallet_address').eq('id', user.id).single();
        if (data?.wallet_address && data.wallet_address !== '—') {
          setDbWalletAddress(data.wallet_address);
        }
      }
    }
    fetchProfile();
  }, [address, isConnected]);

  const activeAddress = address || dbWalletAddress;

  const handleCopyAddress = () => {
    if (!activeAddress) return;
    navigator.clipboard.writeText(activeAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 font-sans p-4 pb-24 relative overflow-x-hidden">
      
      {/* HEADER OVERRIDE */}
      <header className="w-full flex items-center justify-between h-14 max-w-md mx-auto mb-6 px-1">
        <div className="w-8" />
        <h1 className="text-xl font-bold tracking-wide bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
          Portfolio
        </h1>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-teal-500 p-[1px]">
          <div className="w-full h-full bg-[#0b0f19] rounded-[11px] flex items-center justify-center font-black text-sm text-teal-400">
            R
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
            {isPrivate ? "••••••" : activeAddress ? "$12,450.85" : "$0.00"}
          </div>

          {/* OFFICIAL COINBASE CONNECTION BUTTON */}
          {!activeAddress ? (
            <div className="w-full theme-neon premium-btn-wrapper">
              <Wallet>
                <ConnectWallet className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-teal-500 hover:from-purple-500 hover:to-teal-400 text-white font-bold text-sm transition-all duration-200 justify-center shadow-[0_4px_15px_rgba(168,85,247,0.4)]">
                  Create & Initialize Wallet
                </ConnectWallet>
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
              onClick={() => activeAddress ? setShowWithdraw(true) : alert("Please create and initialize your wallet first.")}
              className="w-full py-3 rounded-full bg-[#0b0f19] hover:bg-[#0f1526] text-slate-100 font-semibold flex items-center justify-center gap-2"
            >
              <ArrowUpRight size={18} className="text-purple-400" />
              Withdraw
            </button>
          </div>

          <div className="p-[2px] rounded-full bg-gradient-to-r from-purple-600 to-teal-500 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
            <button 
              onClick={() => activeAddress ? setShowTopUp(true) : alert("Please create and initialize your wallet first.")}
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
          <AssetTrendChart />
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
              <div className="text-sm font-semibold text-slate-200">{isPrivate ? "••••" : activeAddress ? "25,000.00" : "0"}</div>
              <div className="text-xs text-slate-500">{isPrivate ? "••••" : activeAddress ? "$2,500.00" : "$-"}</div>
            </div>
          </div>
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
              <svg className="w-full h-full text-slate-900" viewBox="0 0 100 100" fill="currentColor">
                <path d="M5 5h30v30H5zm6 6v18h18V11zm60-6h30v30h-30zm6 6v18h18V11zM5 65h30v30H5zm6 6v18h18V71zm40-26h10v10H45zm10 10h10v10H55zm10-20h10v10H65zm10 10h10v10H75zm-30 20h10v10H45zm20 10h10v10H65zm10-10h10v10H75zm10 20h10v10H85z" />
              </svg>
            </div>
            <div className="w-full p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs">