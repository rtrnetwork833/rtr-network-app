"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { X, Copy, Check, QrCode, ExternalLink } from "lucide-react";

interface CustomDepositModalProps {
  onClose: () => void;
}

export default function CustomDepositModal({ onClose }: CustomDepositModalProps) {
  const { address, isConnected } = useAccount();
  const [copied, setCopied] = useState(false);

  const handleCopyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
  };

  // Generate QR code URL using a public QR code API
  const qrCodeUrl = address 
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${address}`
    : "";

  if (!isConnected) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="bg-[#11192e] border border-blue-900/30 rounded-2xl p-6 w-full max-w-md shadow-2xl">
          <div className="text-center text-slate-400">Please connect your wallet to deposit funds</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#11192e] border border-blue-900/30 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Deposit Funds</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="space-y-6">
          {/* Wallet Address Display */}
          <div className="bg-[#1a2b4c] border border-blue-900/30 rounded-xl p-4">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              Your Wallet Address
            </label>
            <div className="flex items-center gap-2 bg-[#11192e] border border-blue-900/30 rounded-lg p-3">
              <span className="flex-1 text-sm text-slate-300 font-mono break-all">
                {address}
              </span>
              <button
                onClick={handleCopyAddress}
                className="flex items-center gap-1 px-3 py-2 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30 transition-colors"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                <span className="text-xs font-bold">{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
          </div>

          {/* QR Code */}
          <div className="flex flex-col items-center">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 self-start">
              Scan to Deposit
            </label>
            <div className="bg-white rounded-xl p-4 shadow-lg">
              {qrCodeUrl ? (
                <img 
                  src={qrCodeUrl} 
                  alt="Wallet QR Code" 
                  className="w-48 h-48"
                />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center bg-slate-200">
                  <span className="text-slate-500 text-sm">No address</span>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-3 text-center">
              Scan with any wallet app to send funds directly
            </p>
          </div>

          {/* Fiat On-Ramp Section */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              Buy Crypto with Card
            </label>
            <div className="bg-[#1a2b4c] border border-blue-900/30 rounded-xl p-4 space-y-3">
              <p className="text-sm text-slate-400">
                Purchase ETH, USDC, or other tokens directly using your credit card or bank account.
              </p>
              
              {/* On-Ramp Provider Options */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => window.open("https://transak.com", "_blank")}
                  className="flex items-center justify-center gap-2 py-3 bg-[#11192e] border border-blue-900/30 rounded-lg hover:border-blue-500/50 transition-colors"
                >
                  <ExternalLink size={16} className="text-blue-400" />
                  <span className="text-white text-sm font-bold">Transak</span>
                </button>
                <button
                  onClick={() => window.open("https://moonpay.com", "_blank")}
                  className="flex items-center justify-center gap-2 py-3 bg-[#11192e] border border-blue-900/30 rounded-lg hover:border-blue-500/50 transition-colors"
                >
                  <ExternalLink size={16} className="text-blue-400" />
                  <span className="text-white text-sm font-bold">MoonPay</span>
                </button>
              </div>

              <div className="text-xs text-slate-500 text-center pt-2">
                Powered by secure payment processors
              </div>
            </div>
          </div>

          {/* Network Info */}
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
            <div className="flex items-center gap-2 text-emerald-400">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-bold">Base Network</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              All deposits are processed on the Base Mainnet for fast, low-cost transactions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
