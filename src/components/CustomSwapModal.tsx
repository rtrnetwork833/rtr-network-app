"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  LoaderCircle,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  formatUnits,
  isAddress,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useReadContract,
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { base } from "wagmi/chains";
import CustomActivityLedger from "@/components/CustomActivityLedger";

interface CustomSwapModalProps {
  activeWalletAddress: Address | null;
  onClose: () => void;
}

interface SwapToken {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  isNative?: boolean;
}

interface TokenListResponse {
  tokens: SwapToken[];
}

interface QuoteResponse {
  dstAmount: string;
  gas: string;
}

interface SwapResponse {
  approvalRequired: boolean;
  tx: {
    to: Address;
    data: Hex;
    value: string;
    gas?: string;
  };
}

type ModalView = "convert" | "preview" | "history" | "submitted";
type TokenSide = "spend" | "receive";

const nativeTokenAddress = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address;
const rtrTokenAddress = process.env.NEXT_PUBLIC_RTR_TOKEN_ADDRESS;
const erc20BalanceAbi = [{
  name: "balanceOf",
  type: "function",
  stateMutability: "view",
  inputs: [{ name: "account", type: "address" }],
  outputs: [{ name: "", type: "uint256" }],
}] as const;

const fallbackTokens: SwapToken[] = [
  { address: nativeTokenAddress, symbol: "ETH", name: "Ethereum", decimals: 18, isNative: true },
  { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", name: "USD Coin", decimals: 6 },
  { address: "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2", symbol: "USDT", name: "Tether USD", decimals: 6 },
  { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", name: "Wrapped Ether", decimals: 18 },
  { address: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", symbol: "cbBTC", name: "Coinbase Wrapped BTC", decimals: 8 },
];

const pinnedSymbols = ["USDT", "USDC", "WBTC", "cbBTC", "ETH", "WETH"];

function isValidAmount(value: string) {
  return /^\d+(?:\.\d+)?$/.test(value) && Number(value) > 0;
}

function formatBalance(value?: string) {
  if (!value) return "0";
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? numeric.toLocaleString(undefined, { maximumFractionDigits: 6 })
    : "0";
}

function TokenIcon({ token }: { token: SwapToken }) {
  return (
    <span
      aria-label={`${token.symbol} logo`}
      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#1e293b] bg-[#0d1527] text-xs font-bold text-white"
      role="img"
      style={token.logoURI ? { backgroundImage: `url("${token.logoURI}")`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}
    >
      {token.logoURI ? <span className="sr-only">{token.symbol}</span> : token.symbol.slice(0, 1)}
    </span>
  );
}

export default function CustomSwapModal({ activeWalletAddress, onClose }: CustomSwapModalProps) {
  const [view, setView] = useState<ModalView>("convert");
  const [selectorSide, setSelectorSide] = useState<TokenSide | null>(null);
  const [search, setSearch] = useState("");
  const [fromAmount, setFromAmount] = useState("");
  const [debouncedAmount, setDebouncedAmount] = useState("");
  const [fromToken, setFromToken] = useState<SwapToken>(fallbackTokens[0]);
  const [toToken, setToToken] = useState<SwapToken>(
    rtrTokenAddress && isAddress(rtrTokenAddress)
      ? { address: rtrTokenAddress, symbol: "RTR", name: "RTR Network", decimals: 18 }
      : fallbackTokens[1],
  );
  const [swapError, setSwapError] = useState("");
  const [transactionHash, setTransactionHash] = useState<Hex>();
  const [isPreparingSwap, setIsPreparingSwap] = useState(false);
  const [processingStep, setProcessingStep] = useState<"approval" | "swap" | null>(null);

  const { address: connectedAddress, isConnected } = useAccount();
  const { open } = useAppKit();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: base.id });
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync, isPending: isSending } = useSendTransaction();
  const receiptQuery = useWaitForTransactionReceipt({
    hash: transactionHash,
    chainId: base.id,
    query: { enabled: Boolean(transactionHash) },
  });

  const tokenQuery = useQuery<TokenListResponse>({
    queryKey: ["oneinch-base-tokens"],
    queryFn: async () => {
      const response = await fetch("/api/swap?action=tokens", { cache: "no-store" });
      const body = await response.json() as TokenListResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to load 1inch tokens.");
      return body;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedAmount(fromAmount), 350);
    return () => clearTimeout(timeout);
  }, [fromAmount]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (selectorSide) setSelectorSide(null);
      else onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectorSide, onClose]);

  const fromNativeBalance = useBalance({
    address: activeWalletAddress ?? undefined,
    chainId: base.id,
    query: { enabled: Boolean(activeWalletAddress && fromToken.isNative) },
  });
  const toNativeBalance = useBalance({
    address: activeWalletAddress ?? undefined,
    chainId: base.id,
    query: { enabled: Boolean(activeWalletAddress && toToken.isNative) },
  });
  const fromTokenBalance = useReadContract({
    address: fromToken.address,
    abi: erc20BalanceAbi,
    functionName: "balanceOf",
    args: activeWalletAddress ? [activeWalletAddress] : undefined,
    chainId: base.id,
    query: { enabled: Boolean(activeWalletAddress && !fromToken.isNative) },
  });
  const toTokenBalance = useReadContract({
    address: toToken.address,
    abi: erc20BalanceAbi,
    functionName: "balanceOf",
    args: activeWalletAddress ? [activeWalletAddress] : undefined,
    chainId: base.id,
    query: { enabled: Boolean(activeWalletAddress && !toToken.isNative) },
  });

  const rawAmount = useMemo(() => {
    if (!isValidAmount(debouncedAmount)) return "";
    try {
      return parseUnits(debouncedAmount, fromToken.decimals).toString();
    } catch {
      return "";
    }
  }, [debouncedAmount, fromToken.decimals]);
  const amountPrecisionError = useMemo(() => {
    if (!isValidAmount(debouncedAmount)) return "";
    try {
      parseUnits(debouncedAmount, fromToken.decimals);
      return "";
    } catch {
      return `Enter an amount with no more than ${fromToken.decimals} decimal places.`;
    }
  }, [debouncedAmount, fromToken.decimals]);

  const quoteQuery = useQuery<QuoteResponse>({
    queryKey: ["oneinch-base-quote", fromToken.address, toToken.address, rawAmount],
    queryFn: async () => {
      const params = new URLSearchParams({
        src: fromToken.address,
        dst: toToken.address,
        amount: rawAmount,
      });
      const response = await fetch(`/api/swap?action=quote&${params}`, { cache: "no-store" });
      const body = await response.json() as QuoteResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to get a swap quote.");
      return body;
    },
    enabled: Boolean(rawAmount && fromToken.address !== toToken.address),
    staleTime: 5000,
    retry: false,
  });

  const gasPriceQuery = useQuery({
    queryKey: ["base-gas-price-for-swap", quoteQuery.data?.gas],
    queryFn: async () => {
      if (!publicClient || !quoteQuery.data) throw new Error("Base network is unavailable.");
      return publicClient.getGasPrice();
    },
    enabled: Boolean(quoteQuery.data?.gas && publicClient),
    staleTime: 15_000,
    retry: false,
  });

  const tokens = useMemo(() => {
    const apiTokens = tokenQuery.data?.tokens ?? fallbackTokens;
    const rtrToken: SwapToken[] = rtrTokenAddress && isAddress(rtrTokenAddress)
      ? [{ address: rtrTokenAddress, symbol: "RTR", name: "RTR Network", decimals: 18 }]
      : [];
    const combined = [...rtrToken, ...apiTokens, ...fallbackTokens];
    const unique = new Map<string, SwapToken>();
    for (const token of combined) {
      const key = token.address.toLowerCase();
      if (!unique.has(key)) unique.set(key, token);
    }

    return [...unique.values()].sort((a, b) => {
      if (a.symbol === "RTR") return -1;
      if (b.symbol === "RTR") return 1;
      const aPriority = pinnedSymbols.indexOf(a.symbol);
      const bPriority = pinnedSymbols.indexOf(b.symbol);
      if (aPriority !== -1 || bPriority !== -1) {
        return (aPriority === -1 ? Number.MAX_SAFE_INTEGER : aPriority)
          - (bPriority === -1 ? Number.MAX_SAFE_INTEGER : bPriority);
      }
      return a.symbol.localeCompare(b.symbol);
    });
  }, [tokenQuery.data?.tokens]);

  const filteredTokens = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return tokens;
    return tokens.filter((token) =>
      token.symbol.toLowerCase().includes(normalized)
      || token.name.toLowerCase().includes(normalized)
      || token.address.toLowerCase().includes(normalized),
    );
  }, [search, tokens]);

  const amountSynchronized = fromAmount === debouncedAmount;
  const receivedAmount = quoteQuery.data && amountSynchronized
    ? formatUnits(BigInt(quoteQuery.data.dstAmount), toToken.decimals)
    : "";
  const exchangeRate = isValidAmount(fromAmount) && receivedAmount
    ? Number(receivedAmount) / Number(fromAmount)
    : null;
  const estimatedGasFee = quoteQuery.data && gasPriceQuery.data
    ? formatUnits(BigInt(quoteQuery.data.gas) * gasPriceQuery.data, 18)
    : null;
  const fromBalanceFormatted = fromToken.isNative
    ? fromNativeBalance.data
      ? formatUnits(fromNativeBalance.data.value, fromNativeBalance.data.decimals)
      : undefined
    : typeof fromTokenBalance.data === "bigint"
      ? formatUnits(fromTokenBalance.data, fromToken.decimals)
      : undefined;
  const toBalanceFormatted = toToken.isNative
    ? toNativeBalance.data
      ? formatUnits(toNativeBalance.data.value, toNativeBalance.data.decimals)
      : undefined
    : typeof toTokenBalance.data === "bigint"
      ? formatUnits(toTokenBalance.data, toToken.decimals)
      : undefined;
  const fromBalancePending = fromToken.isNative
    ? fromNativeBalance.isPending
    : fromTokenBalance.isPending;
  const toBalancePending = toToken.isNative
    ? toNativeBalance.isPending
    : toTokenBalance.isPending;
  const insufficientBalance = useMemo(() => {
    if (!rawAmount || !fromBalanceFormatted || fromBalancePending) return false;
    try {
      return BigInt(rawAmount) > parseUnits(fromBalanceFormatted, fromToken.decimals);
    } catch {
      return false;
    }
  }, [fromBalanceFormatted, fromBalancePending, fromToken.decimals, rawAmount]);

  const openTokenSelector = (side: TokenSide) => {
    setSelectorSide(side);
    setSearch("");
  };

  const selectToken = (token: SwapToken) => {
    if (selectorSide === "spend") {
      if (token.address.toLowerCase() === toToken.address.toLowerCase()) {
        setToToken(fromToken);
      }
      setFromToken(token);
    } else if (selectorSide === "receive") {
      if (token.address.toLowerCase() === fromToken.address.toLowerCase()) {
        setFromToken(toToken);
      }
      setToToken(token);
    }
    setSelectorSide(null);
    setFromAmount("");
    setSwapError("");
  };

  const invertTokens = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setFromAmount("");
    setSwapError("");
  };

  const handlePreview = () => {
    setSwapError("");
    if (!activeWalletAddress) {
      setSwapError("Connect a wallet to preview this swap.");
      return;
    }
    if (!isValidAmount(fromAmount)) {
      setSwapError("Enter an amount greater than zero.");
      return;
    }
    if (!quoteQuery.data || !amountSynchronized) {
      setSwapError(quoteQuery.error?.message ?? "A current 1inch quote is required to preview this swap.");
      return;
    }
    setView("preview");
  };

  const handleConfirmSwap = async () => {
    setSwapError("");
    if (!activeWalletAddress) {
      setSwapError("Connect a wallet before confirming this swap.");
      return;
    }
    if (!isConnected || !connectedAddress || connectedAddress.toLowerCase() !== activeWalletAddress.toLowerCase()) {
      await open();
      return;
    }

    setIsPreparingSwap(true);
    try {
      if (chainId !== base.id) {
        await switchChainAsync({ chainId: base.id });
      }

      const requestTransaction = async (action: "prepare" | "swap") => {
        const response = await fetch("/api/swap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            src: fromToken.address,
            dst: toToken.address,
            amount: rawAmount,
            from: activeWalletAddress,
            slippage: 1,
          }),
        });
        const body = await response.json() as SwapResponse & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Unable to prepare the swap transaction.");
        return body;
      };

      let prepared = await requestTransaction("prepare");
      if (prepared.approvalRequired) {
        if (!publicClient) throw new Error("Unable to connect to the Base network.");
        setProcessingStep("approval");
        const approvalHash = await sendTransactionAsync({
          to: prepared.tx.to,
          data: prepared.tx.data,
          value: BigInt(prepared.tx.value),
          ...(prepared.tx.gas && /^\d+$/.test(prepared.tx.gas) ? { gas: BigInt(prepared.tx.gas) } : {}),
          chainId: base.id,
        });
        const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash });
        if (approvalReceipt.status !== "success") {
          throw new Error("The token approval transaction failed.");
        }
        prepared = await requestTransaction("swap");
        if (prepared.approvalRequired) {
          throw new Error("Token approval is still pending. Please refresh the quote and try again.");
        }
      }

      setProcessingStep("swap");
      const hash = await sendTransactionAsync({
        to: prepared.tx.to,
        data: prepared.tx.data,
        value: BigInt(prepared.tx.value),
        ...(prepared.tx.gas && /^\d+$/.test(prepared.tx.gas) ? { gas: BigInt(prepared.tx.gas) } : {}),
        chainId: base.id,
      });
      setTransactionHash(hash);
      setView("submitted");
    } catch (error) {
      console.error("Swap confirmation failed:", error);
      setSwapError(error instanceof Error ? error.message : "The swap transaction could not be submitted.");
    } finally {
      setIsPreparingSwap(false);
      setProcessingStep(null);
    }
  };

  if (view === "history") {
    return (
      <CustomActivityLedger
        activeWalletAddress={activeWalletAddress}
        onClose={() => setView("convert")}
      />
    );
  }

  const renderTokenPicker = () => (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-[#0d1527]/95 p-0 backdrop-blur-md sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) setSelectorSide(null);
      }}
    >
      <section
        aria-label={`Select ${selectorSide === "spend" ? "spend" : "receive"} token`}
        aria-modal="true"
        className="flex max-h-[100dvh] min-h-[min(100dvh,34rem)] w-full max-w-xl flex-col overflow-hidden border border-[#1e293b] bg-[#0d1527] p-5 shadow-[0_24px_100px_rgba(0,0,0,0.55)] sm:max-h-[92dvh] sm:min-h-0 sm:rounded-3xl sm:p-7"
        role="dialog"
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              aria-label="Back to convert"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#1e293b] bg-[#16223f] text-slate-300 transition-colors hover:border-[#3b82f6] hover:text-white"
              onClick={() => setSelectorSide(null)}
              type="button"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h2 className="font-bold text-white">Select a token</h2>
              <p className="text-xs text-[#94a3b8]">Base Network · 1inch supported assets</p>
            </div>
          </div>
          <button
            aria-label="Close token selector"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#1e293b] bg-[#16223f] text-slate-400 hover:border-[#3b82f6] hover:text-white"
            onClick={() => setSelectorSide(null)}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <label className="relative mb-4 block">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" size={17} />
          <input
            autoFocus
            className="w-full rounded-xl border border-[#1e293b] bg-[#16223f] py-3 pl-10 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#3b82f6]"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, symbol, or address"
            value={search}
          />
        </label>

        {tokenQuery.error && (
          <p className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-200" role="status">
            {tokenQuery.error.message} Showing common Base tokens. Configure the 1inch API to load the full token list and live quotes.
          </p>
        )}

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
          {filteredTokens.map((token, index) => {
            const isSelected = token.address.toLowerCase()
              === (selectorSide === "spend" ? fromToken.address : toToken.address).toLowerCase();
            const isPriority = token.symbol === "RTR" || pinnedSymbols.includes(token.symbol);
            return (
              <button
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                  isSelected
                    ? "border-[#3b82f6] bg-[#16223f]"
                    : "border-[#1e293b] bg-[#16223f] hover:border-[#3b82f6]"
                }`}
                key={`${token.address}-${index}`}
                onClick={() => selectToken(token)}
                type="button"
              >
                <TokenIcon token={token} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold text-white">
                    {token.symbol}
                    {token.symbol === "RTR" && (
                      <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-blue-300">
                        Priority
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-[#94a3b8]">{token.name}</span>
                </span>
                {isPriority && token.symbol !== "RTR" && (
                  <span className="text-[10px] uppercase tracking-wide text-[#94a3b8]">Popular</span>
                )}
                {isSelected && <CheckCircle2 aria-label="Selected" className="text-[#3b82f6]" size={18} />}
              </button>
            );
          })}
          {filteredTokens.length === 0 && (
            <p className="py-8 text-center text-sm text-[#94a3b8]">No supported tokens match that search.</p>
          )}
        </div>
      </section>
    </div>
  );

  const renderTokenInput = (side: TokenSide) => {
    const isSpend = side === "spend";
    const token = isSpend ? fromToken : toToken;
    const balanceFormatted = isSpend ? fromBalanceFormatted : toBalanceFormatted;
    const balancePending = isSpend ? fromBalancePending : toBalancePending;
    const amountValue = isSpend ? fromAmount : receivedAmount;

    return (
      <div className="rounded-2xl border border-[#1e293b] bg-[#16223f] p-4 transition-colors focus-within:border-[#3b82f6] sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-white">{isSpend ? "Spend" : "Receive"}</span>
          <span className="truncate text-right text-xs text-[#94a3b8]">
            Available: {balancePending ? "Loading..." : formatBalance(balanceFormatted)} {token.symbol}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            aria-label={`Select ${isSpend ? "spend" : "receive"} token, currently ${token.symbol}`}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-[#1e293b] bg-[#0d1527] px-3 py-2.5 text-white transition-colors hover:border-[#3b82f6]"
            onClick={() => openTokenSelector(side)}
            type="button"
          >
            <TokenIcon token={token} />
            <span className="font-semibold">{token.symbol}</span>
            <ChevronDown aria-hidden="true" className="text-[#94a3b8]" size={16} />
          </button>
          <input
            aria-label={isSpend ? "Spend amount" : "Estimated receive amount"}
            className={`min-w-0 flex-1 bg-transparent text-right text-2xl font-semibold text-white outline-none placeholder:text-slate-500 sm:text-3xl ${
              isSpend ? "" : "cursor-default"
            }`}
            inputMode="decimal"
            maxLength={50}
            onChange={isSpend ? (event) => {
              const nextValue = event.target.value;
              if (/^\d*\.?\d*$/.test(nextValue)) {
                setFromAmount(nextValue);
                setSwapError("");
              }
            } : undefined}
            placeholder={isSpend ? "1–10,000,000" : "0.000012–120"}
            readOnly={!isSpend}
            type="text"
            value={amountValue}
          />
        </div>
        {isSpend && (
          <div className="mt-3 flex justify-end">
            <button
              className="text-xs font-semibold text-[#94a3b8] transition-colors hover:text-white"
              onClick={() => {
                const available = Number(fromBalanceFormatted ?? 0);
                if (Number.isFinite(available) && available > 0) {
                  setFromAmount(available.toFixed(Math.min(fromToken.decimals, 8)).replace(/\.?0+$/, ""));
                  setSwapError("");
                }
              }}
              type="button"
            >
              Max
            </button>
          </div>
        )}
      </div>
    );
  };

  const handleClose = () => {
    setSelectorSide(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[50] flex items-start justify-center bg-[#0d1527]/95 p-0 backdrop-blur-md sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <section
        aria-label="Convert tokens"
        aria-modal="true"
        className="relative max-h-[100dvh] w-full max-w-xl overflow-y-auto border border-[#1e293b] bg-[#0d1527] p-5 pb-8 shadow-[0_24px_100px_rgba(0,0,0,0.55)] sm:max-h-[92dvh] sm:rounded-3xl sm:p-7"
        role="dialog"
      >
        <div className="mb-6 flex items-center justify-between gap-3 border-b border-[#1e293b] pb-4">
          <div className="flex min-w-0 items-center gap-2">
            <button
              aria-pressed={true}
              className="whitespace-nowrap rounded-xl border border-[#3b82f6] bg-[#16223f] px-3 py-2 text-sm font-semibold text-white transition-colors sm:px-4"
              onClick={() => setView(transactionHash ? "submitted" : "convert")}
              type="button"
            >
              Convert Tokens
            </button>
            <button
              aria-pressed={false}
              className="whitespace-nowrap rounded-xl border border-[#1e293b] bg-[#0d1527] px-3 py-2 text-xs font-semibold text-[#94a3b8] transition-colors hover:text-white sm:px-4 sm:text-sm"
              onClick={() => setView("history")}
              type="button"
            >
              Converts History
            </button>
          </div>
          <button
            aria-label="Close convert modal"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#1e293b] bg-[#16223f] text-slate-400 transition-colors hover:border-[#3b82f6] hover:text-white"
            onClick={handleClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {view === "convert" && (
          <div className="space-y-3">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Base Network</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">Convert Tokens</h2>
              <p className="mt-1 text-sm text-[#94a3b8]">Find an optimal route with 1inch.</p>
            </div>

            {renderTokenInput("spend")}
            <div className="relative z-10 -my-1 flex justify-center">
              <button
                aria-label="Invert spend and receive tokens"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#1e293b] bg-[#16223f] text-[#3b82f6] transition-colors hover:border-[#3b82f6] hover:text-white"
                onClick={invertTokens}
                type="button"
              >
                <ArrowDownUp size={19} />
              </button>
            </div>
            {renderTokenInput("receive")}

            {!activeWalletAddress && (
              <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200">
                Connect a wallet to view balances and preview a swap.
              </p>
            )}
            {tokenQuery.error && (
              <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-200" role="status">
                {tokenQuery.error.message} Common Base tokens are shown; configure the server 1inch API key for the complete list and live quotes.
              </p>
            )}
            {isValidAmount(fromAmount) && (!amountSynchronized || quoteQuery.isFetching) && (
              <p className="flex items-center gap-2 px-1 text-xs text-[#94a3b8]" role="status">
                <LoaderCircle className="animate-spin" size={14} />
                {amountSynchronized ? "Getting a live 1inch route..." : "Updating quote..."}
              </p>
            )}
            {quoteQuery.error && rawAmount && amountSynchronized && !quoteQuery.isFetching && (
              <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-200" role="alert">
                {quoteQuery.error.message}
              </p>
            )}
            {amountPrecisionError && (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300" role="alert">
                {amountPrecisionError}
              </p>
            )}
            {insufficientBalance && (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300" role="alert">
                The spend amount exceeds your available {fromToken.symbol} balance.
              </p>
            )}
            {swapError && (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" role="alert">
                {swapError}
              </p>
            )}

            <button
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-blue-400/30 bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3.5 font-bold text-white shadow-lg shadow-blue-900/20 transition hover:from-blue-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!isValidAmount(fromAmount) || Boolean(amountPrecisionError) || insufficientBalance || !amountSynchronized || quoteQuery.isFetching || !quoteQuery.data}
              onClick={handlePreview}
              type="button"
            >
              Preview <ArrowRight size={17} />
            </button>
          </div>
        )}

        {view === "preview" && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <button
                aria-label="Back to convert"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#1e293b] bg-[#16223f] text-slate-300 hover:border-[#3b82f6] hover:text-white"
                onClick={() => setView("convert")}
                type="button"
              >
                <ArrowLeft size={18} />
              </button>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Review</p>
                <h2 className="text-xl font-bold text-white">Confirm your swap</h2>
              </div>
            </div>

            <div className="rounded-2xl border border-[#1e293b] bg-[#16223f] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-[#94a3b8]">You spend</p>
                  <p className="mt-1 text-lg font-semibold text-white">{fromAmount} {fromToken.symbol}</p>
                </div>
                <ArrowRight className="shrink-0 text-[#94a3b8]" size={18} />
                <div className="text-right">
                  <p className="text-xs text-[#94a3b8]">You receive (estimated)</p>
                  <p className="mt-1 text-lg font-semibold text-white">{receivedAmount || "—"} {toToken.symbol}</p>
                </div>
              </div>
            </div>

            <div className="divide-y divide-[#1e293b] rounded-2xl border border-[#1e293b] bg-[#16223f] px-4">
              <div className="flex items-center justify-between gap-4 py-4">
                <span className="text-sm text-[#94a3b8]">1inch route rate</span>
                <span className="text-right text-sm font-medium text-white">
                  {exchangeRate !== null && Number.isFinite(exchangeRate)
                    ? `1 ${fromToken.symbol} = ${exchangeRate.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${toToken.symbol}`
                    : "Unavailable"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 py-4">
                <span className="text-sm text-[#94a3b8]">Estimated gas fee*</span>
                <span className="text-right text-sm font-medium text-white">
                  {estimatedGasFee
                    ? `~${Number(estimatedGasFee).toLocaleString(undefined, { maximumFractionDigits: 6 })} ETH`
                    : quoteQuery.data?.gas
                      ? `~${Number(quoteQuery.data.gas).toLocaleString()} gas units`
                      : "Unavailable"}
                </span>
              </div>
              <div className="flex items-start gap-2 py-4 text-xs leading-5 text-[#94a3b8]">
                <ShieldCheck className="mt-0.5 shrink-0 text-blue-400" size={16} />
                Fee estimate excludes Base L1 data charges. Your wallet shows the final transaction details and asks for approval before it is sent.
              </div>
            </div>

            {swapError && (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" role="alert">
                {swapError}
              </p>
            )}
            <button
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-400/30 bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3.5 font-bold text-white shadow-lg shadow-blue-900/20 transition hover:from-blue-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSending || isPreparingSwap || !quoteQuery.data || !rawAmount}
              onClick={() => void handleConfirmSwap()}
              type="button"
            >
              {isSending || isPreparingSwap
                ? <LoaderCircle className="animate-spin" size={17} />
                : <ShieldCheck size={17} />}
              {isSending
                ? processingStep === "approval" ? "Approve in wallet..." : "Confirm in wallet..."
                : isPreparingSwap
                  ? processingStep === "approval" ? "Waiting for approval..." : "Preparing swap..."
                  : "Confirm Swap"}
            </button>
          </div>
        )}

        {view === "submitted" && (
          <div className="py-7 text-center">
            {receiptQuery.isSuccess ? (
              <CheckCircle2 className="mx-auto mb-4 text-emerald-400" size={46} />
            ) : receiptQuery.isError ? (
              <Clock3 className="mx-auto mb-4 text-amber-300" size={46} />
            ) : (
              <LoaderCircle className="mx-auto mb-4 animate-spin text-blue-400" size={42} />
            )}
            <h2 className="text-xl font-bold text-white">
              {receiptQuery.isSuccess
                ? "Swap confirmed"
                : receiptQuery.isError
                  ? "Transaction submitted"
                  : "Swap submitted"}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#94a3b8]">
              {receiptQuery.isSuccess
                ? "Your swap has been confirmed on Base."
                : receiptQuery.isError
                  ? "The transaction is on-chain, but confirmation could not be checked."
                  : "Waiting for the Base network to confirm your transaction."}
            </p>
            {transactionHash && (
              <a
                className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[#1e293b] bg-[#16223f] px-4 py-2.5 text-sm font-medium text-blue-300 hover:border-[#3b82f6]"
                href={`https://basescan.org/tx/${transactionHash}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                View transaction <ExternalLink size={15} />
              </a>
            )}
            {receiptQuery.isSuccess && (
              <button
                className="mt-5 block w-full rounded-xl border border-blue-400/30 bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 font-bold text-white"
                onClick={() => {
                  setTransactionHash(undefined);
                  setFromAmount("");
                  setView("convert");
                }}
                type="button"
              >
                Make another swap
              </button>
            )}
          </div>
        )}

        {selectorSide && renderTokenPicker()}
      </section>
    </div>
  );
}
