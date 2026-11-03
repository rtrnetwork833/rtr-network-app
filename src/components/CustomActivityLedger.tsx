"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, ExternalLink, Search, Clock, ArrowDown, ArrowUp, RefreshCw } from "lucide-react";

interface CustomActivityLedgerProps {
  activeWalletAddress: `0x${string}` | null;
  onClose: () => void;
}

interface TransactionRecord {
  id: string;
  wallet_address: string;
  type: "deposit" | "swap" | "withdrawal";
  amount: string | number;
  token_symbol: string;
  status: "completed" | "pending" | "failed";
  tx_hash: string | null;
  created_at: string;
}

export default function CustomActivityLedger({ activeWalletAddress, onClose }: CustomActivityLedgerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | TransactionRecord["type"]>("all");
  const transactionQuery = useQuery({
    queryKey: ["profile-transactions", activeWalletAddress],
    enabled: Boolean(activeWalletAddress),
    queryFn: async () => {
      const response = await fetch(`/api/profile/transactions?walletAddress=${encodeURIComponent(activeWalletAddress!)}`, { cache: "no-store" });
      const body = await response.json() as { transactions?: TransactionRecord[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to load transaction history.");
      return body.transactions ?? [];
    },
  });
  const transactions = transactionQuery.data ?? [];

  const filteredTransactions = transactions.filter((transaction) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = (transaction.tx_hash ?? "").toLowerCase().includes(query)
      || transaction.wallet_address.toLowerCase().includes(query);
    const matchesFilter = filterType === "all" || transaction.type === filterType;
    return matchesSearch && matchesFilter;
  });

  const formatTimestamp = (timestamp: string) => new Date(timestamp).toLocaleString();
  const getStatusColor = (status: TransactionRecord["status"]) => {
    switch (status) {
      case "completed": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
      case "pending": return "text-yellow-400 bg-yellow-500/10 border-yellow-500/30";
      case "failed": return "text-red-400 bg-red-500/10 border-red-500/30";
    }
  };

  const getTypeIcon = (type: TransactionRecord["type"]) => {
    switch (type) {
      case "deposit": return <ArrowDown size={16} className="text-emerald-400" />;
      case "withdrawal": return <ArrowUp size={16} className="text-red-400" />;
      case "swap": return <RefreshCw size={16} className="text-blue-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#11192e] border border-blue-900/30 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Transaction History</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors" aria-label="Close transaction history">
            <X size={24} />
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by wallet or hash..."
              className="w-full bg-[#1a2b4c] border border-blue-900/30 rounded-lg pl-10 pr-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors text-sm"
            />
          </div>
          <button
            onClick={() => void transactionQuery.refetch()}
            className="p-2 bg-[#1a2b4c] border border-blue-900/30 rounded-lg hover:border-blue-500/50 transition-colors"
            aria-label="Refresh history"
          >
            <RefreshCw size={16} className="text-slate-400" />
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          {(["all", "deposit", "swap", "withdrawal"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold capitalize transition-all ${
                filterType === type ? "bg-blue-600 text-white" : "bg-[#1a2b4c] text-slate-400 hover:bg-[#223a66]"
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {transactionQuery.isPending ? (
            <div className="text-center py-8 text-slate-400" role="status">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
              Loading transactions...
            </div>
          ) : transactionQuery.error ? (
            <div className="text-center py-8 text-red-400" role="alert">{transactionQuery.error.message}</div>
          ) : filteredTransactions.length === 0 ? (
            <div className="text-center py-8 text-slate-400">No transactions found</div>
          ) : (
            filteredTransactions.map((transaction) => (
              <div key={transaction.id} className="bg-[#1a2b4c] border border-blue-900/30 rounded-xl p-4 hover:border-blue-500/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#11192e] border border-blue-900/30 flex items-center justify-center">
                      {getTypeIcon(transaction.type)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold capitalize">{transaction.type}</span>
                        <span className="text-slate-400 text-sm">{transaction.token_symbol}</span>
                      </div>
                      <div className="text-slate-500 text-xs font-mono">
                        {transaction.wallet_address.slice(0, 6)}...{transaction.wallet_address.slice(-4)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-bold">
                      {Number(transaction.amount).toLocaleString()} {transaction.token_symbol}
                    </div>
                    <div className="flex items-center gap-1 text-slate-400 text-xs">
                      <Clock size={12} />
                      {formatTimestamp(transaction.created_at)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-blue-900/20">
                  <span className={`px-2 py-1 rounded text-xs font-bold border ${getStatusColor(transaction.status)}`}>
                    {transaction.status}
                  </span>
                  {transaction.tx_hash && (
                    <a
                      href={`https://basescan.org/tx/${transaction.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-400 text-xs hover:text-blue-300 transition-colors"
                    >
                      <span className="font-mono">{transaction.tx_hash.slice(0, 8)}...{transaction.tx_hash.slice(-6)}</span>
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-blue-900/20 text-center">
          <p className="text-xs text-slate-500">Transaction records • Latest 100</p>
        </div>
      </div>
    </div>
  );
}
