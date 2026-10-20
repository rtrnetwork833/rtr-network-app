"use client";

import { useState } from "react";
import { useAccount, useBalance, useSendTransaction, useReadContract } from "wagmi";
import { parseEther, isAddress, type Address } from "viem";
import { base } from "wagmi/chains";
import { X, ArrowRight, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

interface CustomSendModalProps {
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
  {
    constant: false,
    inputs: [
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    type: "function",
  },
] as const;

export default function CustomSendModal({ onClose }: CustomSendModalProps) {
  const { address, isConnected } = useAccount();
  const { sendTransaction, isPending, isSuccess, error } = useSendTransaction();
  
  const [selectedToken, setSelectedToken] = useState<"ETH" | "RTR">("ETH");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [addressError, setAddressError] = useState("");
  const [estimatedGas, setEstimatedGas] = useState<string>("0.000001");

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

  const currentBalance = selectedToken === "ETH" ? ethAmount : rtrAmount;
  const maxAmount = currentBalance > 0.01 ? currentBalance - 0.01 : 0; // Reserve for gas

  const handleMaxClick = () => {
    setAmount(maxAmount > 0 ? maxAmount.toFixed(6) : "0");
  };

  const validateAddress = (addr: string) => {
    if (!addr) {
      setAddressError("");
      return true;
    }
    if (!isAddress(addr)) {
      setAddressError("Invalid wallet address");
      return false;
    }
    setAddressError("");
    return true;
  };

  const handleSend = async () => {
    if (!isConnected || !address) return;
    if (!validateAddress(destinationAddress)) return;
    if (!amount || parseFloat(amount) <= 0) return;

    try {
      const amountInWei = parseEther(amount);

      if (selectedToken === "ETH") {
        // Send native ETH
        await sendTransaction({
          to: destinationAddress as Address,
          value: amountInWei,
        });
      } else {
        // Send RTR token (simplified - would need to write contract in production)
        console.log("Token transfer would be executed here");
      }
    } catch (err) {
      console.error("Transaction failed:", err);
    }
  };

  if (!isConnected) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="bg-[#11192e] border border-blue-900/30 rounded-2xl p-6 w-full max-w-md shadow-2xl">
          <div className="text-center text-slate-400">Please connect your wallet to send crypto</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#11192e] border border-blue-900/30 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Send Crypto</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Success State */}
        {isSuccess && (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} className="text-emerald-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Transaction Sent!</h3>
            <p className="text-slate-400 text-sm mb-4">Your transaction has been submitted to the network.</p>
            <button
              onClick={onClose}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
            >
              Close
            </button>
          </div>
        )}

        {/* Form */}
        {!isSuccess && (
          <div className="space-y-4">
            {/* Token Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Token
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSelectedToken("ETH")}
                  className={`py-3 px-4 rounded-xl font-bold transition-all ${
                    selectedToken === "ETH"
                      ? "bg-blue-600 text-white border-2 border-blue-500"
                      : "bg-[#1a2b4c] text-slate-400 border-2 border-transparent hover:border-blue-500/50"
                  }`}
                >
                  ETH
                </button>
                <button
                  onClick={() => setSelectedToken("RTR")}
                  className={`py-3 px-4 rounded-xl font-bold transition-all ${
                    selectedToken === "RTR"
                      ? "bg-blue-600 text-white border-2 border-blue-500"
                      : "bg-[#1a2b4c] text-slate-400 border-2 border-transparent hover:border-blue-500/50"
                  }`}
                >
                  RTR
                </button>
              </div>
            </div>

            {/* Destination Address */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Destination Address
              </label>
              <input
                type="text"
                value={destinationAddress}
                onChange={(e) => {
                  setDestinationAddress(e.target.value);
                  validateAddress(e.target.value);
                }}
                placeholder="0x..."
                className={`w-full bg-[#1a2b4c] border ${
                  addressError ? "border-red-500" : "border-blue-900/30"
                } rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors`}
              />
              {addressError && (
                <div className="flex items-center gap-2 text-red-400 text-xs mt-1">
                  <AlertCircle size={12} />
                  {addressError}
                </div>
              )}
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Amount
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-[#1a2b4c] border border-blue-900/30 rounded-xl px-4 py-3 pr-16 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
                <button
                  onClick={handleMaxClick}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-blue-600/20 text-blue-400 text-xs font-bold rounded-lg hover:bg-blue-600/30 transition-colors"
                >
                  MAX
                </button>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-slate-500">Available: {currentBalance.toFixed(6)} {selectedToken}</span>
              </div>
            </div>

            {/* Estimated Gas */}
            <div className="bg-[#1a2b4c]/50 border border-blue-900/20 rounded-xl p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Estimated Gas Fee</span>
                <span className="text-sm font-bold text-white">{estimatedGas} ETH</span>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <AlertCircle size={16} />
                {error.message || "Transaction failed"}
              </div>
            )}

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={isPending || !destinationAddress || !amount || parseFloat(amount) <= 0 || !!addressError}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isPending ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  Send {selectedToken}
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
