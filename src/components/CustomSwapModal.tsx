"use client";

import { useState } from "react";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { type Address } from "viem";
import { ArrowDownUp, ArrowRight, Loader2, AlertCircle, CheckCircle2, X } from "lucide-react";

interface CustomSwapModalProps {
  onClose: () => void;
}

const rtrTokenAddress = process.env.NEXT_PUBLIC_RTR_TOKEN_ADDRESS as Address;
const rtrTokenAbi = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
] as const;

interface Token {
  symbol: string;
  name: string;
  address?: string;
  isNative?: boolean;
}

const tokens: Token[] = [
  { symbol: "ETH", name: "Ethereum", isNative: true },
  { symbol: "RTR", name: "RTR Network", address: rtrTokenAddress },
  { symbol: "USDC", name: "USD Coin", isNative: false },
  { symbol: "USDT", name: "Tether USD", isNative: false },
];

export default function CustomSwapModal({ onClose }: CustomSwapModalProps) {
  const { address, isConnected } = useAccount();
  const [fromToken, setFromToken] = useState<Token>(tokens[0]);
  const [toToken, setToToken] = useState<Token>(tokens[1]);
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [slippage, setSlippage] = useState<string>("1");
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapSuccess, setSwapSuccess] = useState(false);
  const [swapError, setSwapError] = useState("");

  // Fetch balances
  const ethBalance = useBalance({ address });
  const rtrBalance = useReadContract({
    address: rtrTokenAddress,
    abi: rtrTokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && rtrTokenAddress) },
  });

  const ethAmount = ethBalance.data ? Number(ethBalance.data.value) / 1e18 : 0;
  const rtrAmount = typeof rtrBalance.data === "bigint" ? Number(rtrBalance.data) / 1e18 : 0;

  const getBalance = (token: Token) => {
    if (token.symbol === "ETH") return ethAmount;
    if (token.symbol === "RTR") return rtrAmount;
    return 0;
  };

  // Simulated exchange rate (in production, fetch from DEX API)
  const getExchangeRate = () => {
    if (fromToken.symbol === "ETH" && toToken.symbol === "RTR") return 1000;
    if (fromToken.symbol === "RTR" && toToken.symbol === "ETH") return 0.001;
    if (fromToken.symbol === "ETH" && toToken.symbol === "USDC") return 2000;
    if (fromToken.symbol === "USDC" && toToken.symbol === "ETH") return 0.0005;
    return 1;
  };

  const handleFromAmountChange = (value: string) => {
    setFromAmount(value);
    const rate = getExchangeRate();
    const numValue = parseFloat(value) || 0;
    setToAmount((numValue * rate).toFixed(6));
  };

  const handleSwapTokens = () => {
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
    handleFromAmountChange(toAmount);
  };

  const handleSwap = async () => {
    if (!isConnected || !address) return;
    if (!fromAmount || parseFloat(fromAmount) <= 0) return;

    setIsSwapping(true);
    setSwapError("");

    try {
      // In production, this would call a DEX aggregator API (0x, 1inch, etc.)
      // and execute the swap transaction via wagmi
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Simulate API call
      setSwapSuccess(true);
    } catch (err) {
      setSwapError("Swap failed. Please try again.");
      console.error("Swap error:", err);
    } finally {
      setIsSwapping(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="bg-[#11192e] border border-blue-900/30 rounded-2xl p-6 w-full max-w-md shadow-2xl">
          <div className="text-center text-slate-400">Please connect your wallet to swap tokens</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#11192e] border border-blue-900/30 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Convert Tokens</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Success State */}
        {swapSuccess && (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} className="text-emerald-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Swap Complete!</h3>
            <p className="text-slate-400 text-sm mb-4">Your tokens have been swapped successfully.</p>
            <button
              onClick={() => {
                setSwapSuccess(false);
                setFromAmount("");
                setToAmount("");
              }}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
            >
              Make Another Swap
            </button>
          </div>
        )}

        {/* Form */}
        {!swapSuccess && (
          <div className="space-y-4">
            {/* From Token */}
            <div className="bg-[#1a2b4c] border border-blue-900/30 rounded-xl p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-slate-400">From</span>
                <span className="text-xs text-slate-400">
                  Balance: {getBalance(fromToken).toFixed(4)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const tokenMenu = tokens.filter(t => t.symbol !== toToken.symbol);
                    setFromToken(tokenMenu[0]);
                  }}
                  className="flex items-center gap-2 bg-[#11192e] border border-blue-900/30 rounded-lg px-3 py-2 hover:border-blue-500/50 transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                    {fromToken.symbol[0]}
                  </div>
                  <span className="text-white font-bold text-sm">{fromToken.symbol}</span>
                </button>
                <input
                  type="number"
                  value={fromAmount}
                  onChange={(e) => handleFromAmountChange(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 bg-transparent text-white text-2xl font-bold text-right focus:outline-none placeholder-slate-600"
                />
              </div>
            </div>

            {/* Swap Button */}
            <button
              onClick={handleSwapTokens}
              className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center mx-auto border-4 border-[#11192e] -my-5 z-10 transition-colors"
            >
              <ArrowDownUp size={20} className="text-white" />
            </button>

            {/* To Token */}
            <div className="bg-[#1a2b4c] border border-blue-900/30 rounded-xl p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-slate-400">To</span>
                <span className="text-xs text-slate-400">
                  Balance: {getBalance(toToken).toFixed(4)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const tokenMenu = tokens.filter(t => t.symbol !== fromToken.symbol);
                    setToToken(tokenMenu[0]);
                  }}
                  className="flex items-center gap-2 bg-[#11192e] border border-blue-900/30 rounded-lg px-3 py-2 hover:border-blue-500/50 transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs font-bold">
                    {toToken.symbol[0]}
                  </div>
                  <span className="text-white font-bold text-sm">{toToken.symbol}</span>
                </button>
                <input
                  type="number"
                  value={toAmount}
                  readOnly
                  placeholder="0.00"
                  className="flex-1 bg-transparent text-white text-2xl font-bold text-right focus:outline-none placeholder-slate-600"
                />
              </div>
            </div>

            {/* Exchange Rate */}
            <div className="text-center text-sm text-slate-400">
              1 {fromToken.symbol} = {getExchangeRate().toFixed(4)} {toToken.symbol}
            </div>

            {/* Slippage Settings */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Price Slippage
              </label>
              <div className="flex gap-2">
                {["0.5", "1", "3"].map((val) => (
                  <button
                    key={val}
                    onClick={() => setSlippage(val)}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                      slippage === val
                        ? "bg-blue-600 text-white"
                        : "bg-[#1a2b4c] text-slate-400 hover:bg-[#223a66]"
                    }`}
                  >
                    {val}%
                  </button>
                ))}
              </div>
            </div>

            {/* Error Message */}
            {swapError && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <AlertCircle size={16} />
                {swapError}
              </div>
            )}

            {/* Swap Button */}
            <button
              onClick={handleSwap}
              disabled={isSwapping || !fromAmount || parseFloat(fromAmount) <= 0}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSwapping ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Swapping...
                </>
              ) : (
                <>
                  Convert
                  <ArrowRight size={20} />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
