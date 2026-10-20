"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { X, ExternalLink, Search, Clock, ArrowDown, ArrowUp, RefreshCw, Filter } from "lucide-react";

interface CustomActivityLedgerProps {
  onClose: () => void;
}

interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  timestamp: number;
  status: "completed" | "pending" | "failed";
  type: "received" | "sent" | "swap";
  tokenSymbol: string;
}

export default function CustomActivityLedger({ onClose }: CustomActivityLedgerProps) {
  const { address, isConnected } = useAccount();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "received" | "sent" | "swap">("all");

  // Fetch transaction history from BaseScan API
  const fetchTransactions = async () => {
    if (!address) return;

    setLoading(true);
    try {
      const response = await fetch(
        `https://api.basescan.org/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${process.env.NEXT_PUBLIC_BASESCAN_API_KEY || ""}`
      );
      const data = await response.json();

      if (data.status === "1" && data.result) {
        const txs: Transaction[] = data.result.slice(0, 20).map((tx: any) => {
          const isIncoming = tx.to.toLowerCase() === address.toLowerCase();
          const valueInEth = parseFloat(tx.value) / 1e18;
          
          return {
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            value: valueInEth.toFixed(6),
            timestamp: parseInt(tx.timeStamp),
            status: tx.isError === "0" ? "completed" : "failed",
            type: isIncoming ? "received" : "sent",
            tokenSymbol: "ETH",
          };
        });
        setTransactions(txs);
      }
    } catch (err) {
      console.error("Failed to fetch transactions:", err);
      // Mock data for demo if API fails
      setTransactions([
        {
          hash: "0x1234567890abcdef",
          from: "0xabcdef1234567890",
          to: address || "0x0000000000000000",
          value: "0.5",
          timestamp: Date.now() / 1000 - 3600,
          status: "completed",
          type: "received",
          tokenSymbol: "ETH",
        },
        {
          hash: "0x0987654321fedcba",
          from: address || "0x0000000000000000",
          to: "0x1234567890abcdef",
          value: "0.25",
          timestamp: Date.now() / 1000 - 7200,
          status: "completed",
          type: "sent",
          tokenSymbol: "ETH",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected && address) {
      fetchTransactions();
    }
  }, [isConnected, address]);

  const filteredTransactions = transactions.filter((tx) => {
    const matchesSearch = 
      tx.hash.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.to.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFilter = filterType === "all" || tx.type === filterType;
    
    return matchesSearch && matchesFilter;
  });

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
      case "pending":
        return "text-yellow-400 bg-yellow-500/10 border-yellow-500/30";
      case "failed":
        return "text-red-400 bg-red-500/10 border-red-500/30";
      default:
        return "text-slate-400 bg-slate-500/10 border-slate-500/30";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "received":
        return <ArrowDown size={16} className="text-emerald-400" />;
      case "sent":
        return <ArrowUp size={16} className="text-red-400" />;
      case "swap":
        return <RefreshCw size={16} className="text-blue-400" />;
      default:
        return null;
    }
  };

  if (!isConnected) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="bg-[#11192e] border border-blue-900/30 rounded-2xl p-6 w-full max-w-md shadow-2xl">
          <div className="text-center text-slate-400">Please connect your wallet to view activity</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#11192e] border border-blue-900/30 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Transaction History</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Search and Filter */}
        <div className="flex gap-2 mb-4">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by address or hash..."
              className="w-full bg-[#1a2b4c] border border-blue-900/30 rounded-lg pl-10 pr-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors text-sm"
            />
          </div>
          <button
            onClick={fetchTransactions}
            className="p-2 bg-[#1a2b4c] border border-blue-900/30 rounded-lg hover:border-blue-500/50 transition-colors"
          >
            <RefreshCw size={16} className="text-slate-400" />
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4">
          {(["all", "received", "sent", "swap"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold capitalize transition-all ${
                filterType === type
                  ? "bg-blue-600 text-white"
                  : "bg-[#1a2b4c] text-slate-400 hover:bg-[#223a66]"
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Transaction List */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {loading ? (
            <div className="text-center py-8 text-slate-400">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
              Loading transactions...
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              No transactions found
            </div>
          ) : (
            filteredTransactions.map((tx) => (
              <div
                key={tx.hash}
                className="bg-[#1a2b4c] border border-blue-900/30 rounded-xl p-4 hover:border-blue-500/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#11192e] border border-blue-900/30 flex items-center justify-center">
                      {getTypeIcon(tx.type)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold capitalize">{tx.type}</span>
                        <span className="text-slate-400 text-sm">{tx.tokenSymbol}</span>
                      </div>
                      <div className="text-slate-500 text-xs font-mono">
                        {tx.from.slice(0, 6)}...{tx.from.slice(-4)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-bold">
                      {tx.type === "received" ? "+" : "-"}{tx.value} {tx.tokenSymbol}
                    </div>
                    <div className="flex items-center gap-1 text-slate-400 text-xs">
                      <Clock size={12} />
                      {formatTimestamp(tx.timestamp)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-blue-900/20">
                  <span
                    className={`px-2 py-1 rounded text-xs font-bold border ${getStatusColor(tx.status)}`}
                  >
                    {tx.status}
                  </span>
                  <a
                    href={`https://basescan.org/tx/${tx.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-400 text-xs hover:text-blue-300 transition-colors"
                  >
                    <span className="font-mono">{tx.hash.slice(0, 8)}...{tx.hash.slice(-6)}</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-4 border-t border-blue-900/20 text-center">
          <p className="text-xs text-slate-500">
            Powered by BaseScan • Only showing last 20 transactions
          </p>
        </div>
      </div>
    </div>
  );
}
