"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  ChevronDown,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import { SwapController, type SwapControllerState } from "@reown/appkit-controllers";
import { useAppKit, useAppKitAccount } from "@reown/appkit/react";
import CustomActivityLedger from "@/components/CustomActivityLedger";

interface CustomSwapModalProps {
  activeWalletAddress: `0x${string}` | null;
  onClose: () => void;
}

type AppKitToken = NonNullable<SwapControllerState["tokens"]>[number];
type ModalView = "convert" | "history";
type TokenSide = "spend" | "receive";

function formatBalance(value?: string) {
  if (!value) return "0.00";
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? numeric.toLocaleString(undefined, { maximumFractionDigits: 6 })
    : "0.00";
}

function TokenIcon({ token }: { token: AppKitToken }) {
  return (
    <span
      aria-label={`${token.symbol} logo`}
      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#1e293b] bg-[#0d1527] text-xs font-bold text-white"
      role="img"
      style={token.logoUri ? { backgroundImage: `url("${token.logoUri}")`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}
    >
      {token.logoUri ? <span className="sr-only">{token.symbol}</span> : token.symbol.slice(0, 1)}
    </span>
  );
}

export default function CustomSwapModal({ activeWalletAddress, onClose }: CustomSwapModalProps) {
  const [view, setView] = useState<ModalView>("convert");
  const [selectorSide, setSelectorSide] = useState<TokenSide | null>(null);
  const [search, setSearch] = useState("");
  const [fromToken, setFromToken] = useState<AppKitToken>();
  const [toToken, setToToken] = useState<AppKitToken>();
  const [fromAmount, setFromAmount] = useState("");
  const [controllerState, setControllerState] = useState<SwapControllerState>(() => ({
    ...SwapController.state,
  }));
  const [tokenLoadError, setTokenLoadError] = useState("");
  const [openingSwap, setOpeningSwap] = useState(false);

  const { open } = useAppKit();
  const { address: connectedAddress, isConnected } = useAppKitAccount();

  useEffect(() => {
    let active = true;
    const unsubscribe = SwapController.subscribe((state) => {
      if (active) {
        setControllerState({
          ...state,
          tokens: state.tokens ? [...state.tokens] : undefined,
          myTokensWithBalance: state.myTokensWithBalance ? [...state.myTokensWithBalance] : undefined,
        });
      }
    });

    const loadSwapAssets = async () => {
      setTokenLoadError("");
      try {
        await SwapController.getTokenList();
        if (
          isConnected &&
          connectedAddress &&
          activeWalletAddress &&
          connectedAddress.toLowerCase() === activeWalletAddress.toLowerCase()
        ) {
          await SwapController.getMyTokensWithBalance();
        }
      } catch (error) {
        console.error("Unable to load Reown swap assets:", error);
        if (active) setTokenLoadError("Unable to load assets from Reown AppKit. Please try again.");
      }
    };

    void loadSwapAssets();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [activeWalletAddress, connectedAddress, isConnected]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (selectorSide) setSelectorSide(null);
      else onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, selectorSide]);

  const tokens = useMemo(() => {
    const availableTokens = [
      ...(controllerState.tokens ?? []),
      ...(controllerState.myTokensWithBalance ?? []),
    ];
    const uniqueTokens = new Map<string, AppKitToken>();
    for (const token of availableTokens) {
      if (!token?.address || !token.symbol) continue;
      const key = token.address.toLowerCase();
      const current = uniqueTokens.get(key);
      if (!current || (Number(current.quantity?.numeric ?? 0) === 0 && Number(token.quantity?.numeric ?? 0) > 0)) {
        uniqueTokens.set(key, token);
      }
    }

    return [...uniqueTokens.values()].sort((first, second) => {
      const firstHasBalance = Number(first.quantity?.numeric ?? 0) > 0;
      const secondHasBalance = Number(second.quantity?.numeric ?? 0) > 0;
      if (firstHasBalance !== secondHasBalance) return firstHasBalance ? -1 : 1;
      return first.symbol.localeCompare(second.symbol);
    });
  }, [controllerState.myTokensWithBalance, controllerState.tokens]);

  const selectedFromToken = fromToken
    ? tokens.find((token) => token.address === fromToken.address) ?? fromToken
    : tokens.find((token) => token.symbol === controllerState.networkTokenSymbol)
      ?? tokens.find((token) => token.symbol === "ETH")
      ?? tokens.find((token) => token.symbol === "WETH")
      ?? tokens[0];
  const selectedToToken = toToken
    ? tokens.find((token) => token.address === toToken.address) ?? toToken
    : tokens.find((token) => token.symbol === "RTR" && token.address !== selectedFromToken?.address)
      ?? tokens.find((token) => token.symbol === "USDC" && token.address !== selectedFromToken?.address)
      ?? tokens.find((token) => token.address !== selectedFromToken?.address);

  const filteredTokens = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return tokens;
    return tokens.filter((token) =>
      token.symbol.toLowerCase().includes(normalized)
      || token.name.toLowerCase().includes(normalized)
      || token.address.toLowerCase().includes(normalized),
    );
  }, [search, tokens]);

  const balanceForToken = (token?: AppKitToken) => {
    if (!token) return "0.00";
    const balance = controllerState.myTokensWithBalance?.find(
      (candidate) => candidate.address.toLowerCase() === token.address.toLowerCase(),
    );
    return formatBalance(balance?.quantity.numeric);
  };

  const selectToken = (token: AppKitToken) => {
    if (selectorSide === "spend") {
      if (token.address.toLowerCase() === selectedToToken?.address.toLowerCase()) {
        setToToken(selectedFromToken);
      }
      setFromToken(token);
    } else {
      if (token.address.toLowerCase() === selectedFromToken?.address.toLowerCase()) {
        setFromToken(selectedToToken);
      }
      setToToken(token);
    }
    setFromAmount("");
    setSelectorSide(null);
  };

  const handlePreview = async () => {
    if (!selectedFromToken || !selectedToToken || !fromAmount || !Number.isFinite(Number(fromAmount)) || Number(fromAmount) <= 0) {
      return;
    }
    setOpeningSwap(true);
    try {
      await open({
        view: "Swap",
        arguments: {
          fromToken: selectedFromToken.symbol,
          toToken: selectedToToken.symbol,
          amount: fromAmount,
        },
      });
      onClose();
    } catch (error) {
      console.error("Unable to open the Reown swap view:", error);
      setTokenLoadError("Unable to open the secure Reown swap view. Please try again.");
    } finally {
      setOpeningSwap(false);
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

  return (
    <div
      className="fixed inset-0 z-[50] flex items-start justify-center bg-[#0d1527]/95 p-0 backdrop-blur-md sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
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
              className="whitespace-nowrap rounded-xl border border-[#3b82f6] bg-[#16223f] px-3 py-2 text-sm font-semibold text-white sm:px-4"
              onClick={() => setView("convert")}
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
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
            {controllerState.networkTokenSymbol ? `${controllerState.networkTokenSymbol} Network` : "Reown Swap"}
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">Convert Tokens</h2>
          <p className="mt-1 text-sm text-[#94a3b8]">Choose assets and review your trade securely in Reown AppKit.</p>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-[#1e293b] bg-[#16223f] p-4 transition-colors focus-within:border-[#3b82f6] sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-white">Spend</span>
              <span className="truncate text-right text-xs text-[#94a3b8]">
                Available: {balanceForToken(selectedFromToken)} {selectedFromToken?.symbol ?? ""}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                aria-label={`Select spend token${selectedFromToken ? `, currently ${selectedFromToken.symbol}` : ""}`}
                className="flex shrink-0 items-center gap-2 rounded-xl border border-[#1e293b] bg-[#0d1527] px-3 py-2.5 text-white transition-colors hover:border-[#3b82f6] disabled:opacity-50"
                disabled={!tokens.length}
                onClick={() => {
                  setSearch("");
                  setSelectorSide("spend");
                }}
                type="button"
              >
                {selectedFromToken && <TokenIcon token={selectedFromToken} />}
                <span className="font-semibold">{selectedFromToken?.symbol ?? "Loading"}</span>
                <ChevronDown aria-hidden="true" className="text-[#94a3b8]" size={16} />
              </button>
              <input
                aria-label="Spend amount"
                className="min-w-0 flex-1 bg-transparent text-right text-2xl font-semibold text-white outline-none placeholder:text-slate-500 sm:text-3xl"
                inputMode="decimal"
                onChange={(event) => {
                  if (/^\d*\.?\d*$/.test(event.target.value)) setFromAmount(event.target.value);
                }}
                placeholder="0.00"
                value={fromAmount}
              />
            </div>
            <div className="mt-3 flex justify-end">
              <button
                className="text-xs font-semibold text-[#94a3b8] transition-colors hover:text-white disabled:opacity-50"
                disabled={!selectedFromToken || !Number(selectedFromToken.quantity.numeric)}
                onClick={() => setFromAmount(selectedFromToken ? selectedFromToken.quantity.numeric : "")}
                type="button"
              >
                Max
              </button>
            </div>
          </div>

          <div className="relative z-10 -my-1 flex justify-center">
            <button
              aria-label="Invert spend and receive tokens"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#1e293b] bg-[#16223f] text-[#3b82f6] transition-colors hover:border-[#3b82f6] hover:text-white"
              onClick={() => {
                setFromToken(selectedToToken);
                setToToken(selectedFromToken);
                setFromAmount("");
              }}
              type="button"
            >
              <ArrowDownUp size={19} />
            </button>
          </div>

          <div className="rounded-2xl border border-[#1e293b] bg-[#16223f] p-4 transition-colors focus-within:border-[#3b82f6] sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-white">Receive</span>
              <span className="truncate text-right text-xs text-[#94a3b8]">
                Available: {balanceForToken(selectedToToken)} {selectedToToken?.symbol ?? ""}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                aria-label={`Select receive token${selectedToToken ? `, currently ${selectedToToken.symbol}` : ""}`}
                className="flex shrink-0 items-center gap-2 rounded-xl border border-[#1e293b] bg-[#0d1527] px-3 py-2.5 text-white transition-colors hover:border-[#3b82f6] disabled:opacity-50"
                disabled={!tokens.length}
                onClick={() => {
                  setSearch("");
                  setSelectorSide("receive");
                }}
                type="button"
              >
                {selectedToToken && <TokenIcon token={selectedToToken} />}
                <span className="font-semibold">{selectedToToken?.symbol ?? "Loading"}</span>
                <ChevronDown aria-hidden="true" className="text-[#94a3b8]" size={16} />
              </button>
              <div aria-label="Estimated receive amount shown in AppKit" className="min-w-0 flex-1 text-right text-2xl font-semibold text-slate-500 sm:text-3xl">
                0.00
              </div>
            </div>
          </div>

          {tokenLoadError && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" role="alert">
              {tokenLoadError}
            </p>
          )}
          {controllerState.tokensLoading && (
            <p className="flex items-center gap-2 px-1 text-xs text-[#94a3b8]" role="status">
              <LoaderCircle className="animate-spin" size={14} /> Loading Reown-supported assets...
            </p>
          )}
          {!controllerState.tokensLoading && !tokens.length && (
            <p className="rounded-xl border border-[#1e293b] bg-[#16223f] p-3 text-sm text-[#94a3b8]" role="status">
              No assets are currently available from Reown AppKit for this network.
            </p>
          )}
          {!activeWalletAddress && (
            <p className="rounded-xl border border-[#1e293b] bg-[#16223f] p-3 text-sm text-[#94a3b8]">
              Connect a wallet to view available balances and trade.
            </p>
          )}
          {activeWalletAddress && (!isConnected || !connectedAddress || connectedAddress.toLowerCase() !== activeWalletAddress.toLowerCase()) && (
            <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200">
              Connect the active wallet in Reown AppKit to use its balances.
            </p>
          )}

          <button
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-blue-400/30 bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3.5 font-bold text-white shadow-lg shadow-blue-900/20 transition hover:from-blue-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!selectedFromToken || !selectedToToken || !fromAmount || !Number.isFinite(Number(fromAmount)) || Number(fromAmount) <= 0 || openingSwap}
            onClick={() => void handlePreview()}
            type="button"
          >
            {openingSwap && <LoaderCircle className="animate-spin" size={17} />}
            {openingSwap ? "Opening secure swap..." : "Preview"}
          </button>
        </div>

        {selectorSide && (
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
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-white">Select a token</h2>
                  <p className="text-xs text-[#94a3b8]">Assets available in Reown AppKit</p>
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

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
                {filteredTokens.map((token) => {
                  const selectedToken = selectorSide === "spend" ? selectedFromToken : selectedToToken;
                  const selected = token.address.toLowerCase() === selectedToken?.address.toLowerCase();
                  const balance = balanceForToken(token);
                  return (
                    <button
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                        selected
                          ? "border-[#3b82f6] bg-[#16223f]"
                          : "border-[#1e293b] bg-[#16223f] hover:border-[#3b82f6]"
                      }`}
                      key={token.address}
                      onClick={() => selectToken(token)}
                      type="button"
                    >
                      <TokenIcon token={token} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-white">{token.symbol}</span>
                        <span className="block truncate text-xs text-[#94a3b8]">{token.name}</span>
                      </span>
                      <span className="text-right text-xs text-[#94a3b8]">
                        <span className="block">Available</span>
                        <span className="text-white">{balance}</span>
                      </span>
                    </button>
                  );
                })}
                {!filteredTokens.length && (
                  <p className="py-8 text-center text-sm text-[#94a3b8]">
                    {controllerState.tokensLoading ? "Loading assets..." : "No supported assets match that search."}
                  </p>
                )}
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
