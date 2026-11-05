"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useBalance,
  useEstimateGas,
  useGasPrice,
  useReadContracts,
  useSendTransaction,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { useAppKit, useAppKitAccount, useAppKitNetwork } from "@reown/appkit/react";
import { BalanceUtil } from "@reown/appkit-controllers/utils";
import {
  encodeFunctionData,
  formatUnits,
  getAddress,
  isAddress,
  parseUnits,
  type Hash,
  type Address,
} from "viem";
import { base } from "wagmi/chains";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUpCircle,
  CheckCircle2,
  ChevronRight,
  Landmark,
  LoaderCircle,
  RefreshCw,
  UsersRound,
  X,
} from "lucide-react";

interface CustomSendModalProps {
  onClose: () => void;
}

type Screen = "methods" | "bank" | "onchain" | "internal" | "review" | "success";
type ReownBalance = Awaited<ReturnType<typeof BalanceUtil.getMyTokensWithBalance>>[number];
const emptyWalletTokens: ReownBalance[] = [];

interface WalletAsset {
  key: string;
  address: Address | null;
  symbol: string;
  name: string;
  decimals: number;
  logoUri?: string;
  isNative: boolean;
}

const erc20Abi = [
  {
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const nativeTokenAddress = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

function parseTokenAmount(value: string, decimals: number) {
  if (!value || !/^\d*\.?\d*$/.test(value) || value === "." || value === "") return null;
  try {
    return parseUnits(value, decimals);
  } catch {
    return null;
  }
}

function formatTokenAmount(value: bigint, decimals: number) {
  return formatUnits(value, decimals).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

function conciseAmount(value: bigint, decimals: number, precision = 6) {
  const formatted = formatTokenAmount(value, decimals);
  const [whole, fraction] = formatted.split(".");
  const visiblePrecision =
    fraction && !/[1-9]/.test(fraction.slice(0, precision)) && /[1-9]/.test(fraction.slice(precision))
      ? 12
      : precision;
  return fraction
    ? `${whole}.${fraction.slice(0, visiblePrecision)}`.replace(/0+$/, "").replace(/\.$/, "")
    : whole;
}

export default function CustomSendModal({ onClose }: CustomSendModalProps) {
  const { address, chainId, isConnected } = useAccount();
  const { address: appKitAddress, isConnected: isAppKitConnected } = useAppKitAccount();
  const { caipNetwork } = useAppKitNetwork();
  const { open } = useAppKit();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const { sendTransactionAsync, isPending: isNativePending, error: nativeError } = useSendTransaction();
  const { writeContractAsync, isPending: isTokenPending, error: tokenError } = useWriteContract();

  const [screen, setScreen] = useState<Screen>("methods");
  const [selectedTokenKey, setSelectedTokenKey] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [sendError, setSendError] = useState("");
  const [transactionHash, setTransactionHash] = useState("");
  const [assetSnapshot, setAssetSnapshot] = useState<{
    address: string;
    refreshCount: number;
    tokens: ReownBalance[];
    error?: string;
  } | null>(null);
  const [assetRefreshCount, setAssetRefreshCount] = useState(0);

  const walletAddress = address ?? (appKitAddress && isAddress(appKitAddress) ? getAddress(appKitAddress) : undefined);
  const walletSessionConnected = Boolean((isConnected || isAppKitConnected) && walletAddress);
  const balanceAddress = walletSessionConnected ? walletAddress : undefined;
  const isBaseNetwork = caipNetwork?.caipNetworkId === `eip155:${base.id}`;
  const snapshotMatchesWallet =
    Boolean(balanceAddress && assetSnapshot?.address === balanceAddress.toLowerCase());
  const assetListLoading = Boolean(
    balanceAddress &&
    isBaseNetwork &&
    (!snapshotMatchesWallet || assetSnapshot?.refreshCount !== assetRefreshCount),
  );
  const assetListError =
    snapshotMatchesWallet && assetSnapshot?.refreshCount === assetRefreshCount
      ? assetSnapshot.error ?? ""
      : "";
  const discoveredTokens =
    snapshotMatchesWallet && assetSnapshot?.refreshCount === assetRefreshCount
      ? assetSnapshot.tokens
      : emptyWalletTokens;

  useEffect(() => {
    let active = true;

    if (!walletSessionConnected || !balanceAddress || !caipNetwork || !isBaseNetwork) {
      return () => {
        active = false;
      };
    }

    const snapshotAddress = balanceAddress.toLowerCase();
    void BalanceUtil.getMyTokensWithBalance({
      address: balanceAddress,
      caipNetwork,
      forceUpdate: String(assetRefreshCount),
    })
      .then((tokens) => {
        if (active) {
          setAssetSnapshot({
            address: snapshotAddress,
            refreshCount: assetRefreshCount,
            tokens,
          });
        }
      })
      .catch((error: unknown) => {
        console.error("Unable to load wallet assets for sending:", error);
        if (active) {
          setAssetSnapshot({
            address: snapshotAddress,
            refreshCount: assetRefreshCount,
            tokens: [],
            error: "Unable to load wallet assets. Please refresh and try again.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [assetRefreshCount, balanceAddress, caipNetwork, isBaseNetwork, walletSessionConnected]);

  const assetCandidates = useMemo(() => {
    const uniqueAssets = new Map<string, WalletAsset>();
    for (const token of discoveredTokens) {
      const caipChainId = `eip155:${base.id}`;
      const caipPrefix = `${caipChainId}:`;
      if (token.chainId !== caipChainId) continue;
      const decimals = Number(token.quantity?.decimals);
      if (!Number.isInteger(decimals) || decimals < 0) continue;
      const reportedBalance = parseTokenAmount(token.quantity?.numeric ?? "", decimals);
      if (reportedBalance === null || reportedBalance <= BigInt(0)) continue;
      const rawAddress = token.address
        ? token.address.startsWith(caipPrefix)
          ? token.address.slice(caipPrefix.length)
          : token.address
        : nativeTokenAddress;
      if (!isAddress(rawAddress)) continue;
      const isNative = rawAddress.toLowerCase() === nativeTokenAddress;
      const key = `${caipPrefix}${rawAddress}`.toLowerCase();
      if (!uniqueAssets.has(key)) {
        uniqueAssets.set(key, {
          key,
          address: isNative ? null : getAddress(rawAddress),
          symbol: token.symbol,
          name: token.name,
          decimals,
          logoUri: token.iconUrl || undefined,
          isNative,
        });
      }
    }
    return [...uniqueAssets.values()];
  }, [discoveredTokens]);

  const nativeBalance = useBalance({
    address: balanceAddress,
    chainId: base.id,
    query: {
      enabled: Boolean(balanceAddress && assetCandidates.some((token) => token.isNative)),
      refetchInterval: 12_000,
    },
  });
  const erc20Assets = assetCandidates.filter(
    (token): token is WalletAsset & { address: Address } => !token.isNative && token.address !== null,
  );
  const erc20Balances = useReadContracts({
    contracts: balanceAddress
      ? erc20Assets.map((token) => ({
          address: token.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [balanceAddress],
          chainId: base.id,
        }))
      : [],
    query: {
      enabled: Boolean(balanceAddress && erc20Assets.length),
      refetchInterval: 12_000,
    },
  });

  const liveAssets = useMemo(() => {
    let erc20Index = 0;
    return assetCandidates.flatMap((token) => {
      const balance = token.isNative
        ? nativeBalance.data?.value
        : erc20Balances.data?.[erc20Index++]?.result;
      return typeof balance === "bigint" && balance > BigInt(0)
        ? [{ ...token, balance }]
        : [];
    });
  }, [assetCandidates, erc20Balances.data, nativeBalance.data?.value]);
  const selectedToken =
    liveAssets.find((token) => token.key === selectedTokenKey) ?? liveAssets[0];
  const amountValue = selectedToken ? parseTokenAmount(amount, selectedToken.decimals) : null;
  const destination = isAddress(destinationAddress) ? getAddress(destinationAddress) : undefined;
  const tokenBalance = selectedToken?.balance;
  const balanceKnown = Boolean(selectedToken && typeof tokenBalance === "bigint");
  const wagmiSessionMatches =
    Boolean(isConnected && address && walletAddress && address.toLowerCase() === walletAddress.toLowerCase());
  const assetBalanceLoading = Boolean(
    assetCandidates.length &&
    ((assetCandidates.some((token) => token.isNative) && nativeBalance.isPending) ||
      (erc20Assets.length > 0 && erc20Balances.isPending)),
  );
  const assetBalanceError =
    nativeBalance.isError ||
    Boolean(erc20Balances.data?.some((result) => result.status === "failure"));
  const insufficientBalance =
    balanceKnown && amountValue !== null && tokenBalance !== undefined && amountValue > tokenBalance;
  const amountIsPositive = amountValue !== null && amountValue > BigInt(0);
  const validForm = Boolean(
    walletSessionConnected &&
    selectedToken &&
    destination &&
    amountIsPositive &&
    balanceKnown &&
    !insufficientBalance &&
    (selectedToken.isNative || selectedToken.address),
  );
  const estimateReady = Boolean(
    screen === "review" &&
    validForm &&
    walletSessionConnected &&
    wagmiSessionMatches &&
    chainId === base.id,
  );

  const transferData =
    selectedToken && !selectedToken.isNative && destination && amountValue !== null
      ? encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [destination, amountValue],
        })
      : undefined;
  const gasEstimate = useEstimateGas({
    account: address,
    to: selectedToken?.isNative ? destination : selectedToken?.address,
    value: selectedToken?.isNative ? amountValue ?? undefined : undefined,
    data: selectedToken && !selectedToken.isNative ? transferData : undefined,
    chainId: base.id,
    query: { enabled: estimateReady, retry: false },
  });
  const gasPrice = useGasPrice({
    chainId: base.id,
    query: { enabled: estimateReady, retry: false },
  });
  const estimatedFee =
    gasEstimate.data !== undefined && gasPrice.data !== undefined
      ? gasEstimate.data * gasPrice.data
      : undefined;
  const transactionPending = isNativePending || isTokenPending;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const returnToMethods = () => {
    setScreen("methods");
    setSendError("");
  };

  const openReview = () => {
    setSendError("");
    setScreen("review");
  };

  const handleSend = async () => {
    setSendError("");
    if (!walletSessionConnected || !selectedToken || !destination || amountValue === null || !validForm) {
      setSendError("Check the destination, amount, and available balance before continuing.");
      return;
    }
    try {
      if (!wagmiSessionMatches) {
        await open();
        return;
      }
      if (chainId !== base.id) {
        setSendError("Switch your connected wallet to Base before sending.");
        return;
      }
      if (gasEstimate.data === undefined || gasPrice.data === undefined) {
        setSendError("A network fee estimate is required before sending.");
        return;
      }

      let hash: Hash;
      if (selectedToken.isNative) {
        hash = await sendTransactionAsync({
          to: destination,
          value: amountValue,
          chainId: base.id,
        });
      } else {
        if (!selectedToken.address) throw new Error("The selected token contract is unavailable.");
        hash = await writeContractAsync({
          address: selectedToken.address,
          abi: erc20Abi,
          functionName: "transfer",
          args: [destination, amountValue],
          chainId: base.id,
        });
      }
      setTransactionHash(hash);
      setScreen("success");
    } catch (error) {
      console.error("Transaction failed:", error);
      setSendError(error instanceof Error ? error.message : "Transaction failed. Please try again.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-[#0d1527] p-0 backdrop-blur-md sm:px-6 sm:pb-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="send-modal-title"
        aria-modal="true"
        className="send-modal-sheet relative min-h-dvh w-full max-w-lg border border-[#1e293b] bg-[#0d1527] p-5 pb-10 shadow-[0_24px_100px_rgba(0,0,0,0.55)] sm:min-h-0 sm:rounded-3xl sm:p-7"
        role="dialog"
      >
        <button
          aria-label="Close Send Crypto"
          className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-[#1e293b] bg-[#16223f] text-slate-400 transition-colors hover:border-[#3b82f6] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={19} />
        </button>

        <div className="send-modal-view" key={screen}>
          {screen === "methods" && (
            <>
              <div className="mb-7 pr-12">
                <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl" id="send-modal-title">
                  Select method
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#94a3b8]">
                  Choose how you would like to send your crypto.
                </p>
              </div>
              <div className="space-y-3">
                <button
                  className="group flex w-full items-center gap-4 rounded-2xl border border-[#1e293b] bg-[#16223f] p-4 text-left transition-all duration-200 hover:border-[#3b82f6] hover:bg-[#192949] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] sm:p-5"
                  onClick={() => setScreen("bank")}
                  type="button"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#1e293b] bg-[#0d1527] text-white transition-colors group-hover:border-blue-500/50">
                    <Landmark aria-hidden="true" size={23} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-white">Bank Withdrawal</span>
                    <span className="mt-1 block text-sm leading-5 text-[#94a3b8]">Send to bank account</span>
                  </span>
                  <ChevronRight aria-hidden="true" className="shrink-0 text-slate-500 transition-colors group-hover:text-[#3b82f6]" size={20} />
                </button>

                <button
                  className="group flex w-full items-center gap-4 rounded-2xl border border-[#1e293b] bg-[#16223f] p-4 text-left transition-all duration-200 hover:border-[#3b82f6] hover:bg-[#192949] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] sm:p-5"
                  onClick={() => setScreen("onchain")}
                  type="button"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#1e293b] bg-[#0d1527] text-white transition-colors group-hover:border-blue-500/50">
                    <ArrowUpCircle aria-hidden="true" size={23} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-white">On Chain</span>
                    <span className="mt-1 block text-sm leading-5 text-[#94a3b8]">
                      Send cryptocurrency to another exchange
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" className="shrink-0 text-slate-500 transition-colors group-hover:text-[#3b82f6]" size={20} />
                </button>

                <button
                  className="group flex w-full items-center gap-4 rounded-2xl border border-[#1e293b] bg-[#16223f] p-4 text-left transition-all duration-200 hover:border-[#3b82f6] hover:bg-[#192949] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] sm:p-5"
                  onClick={() => setScreen("internal")}
                  type="button"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#1e293b] bg-[#0d1527] text-white transition-colors group-hover:border-blue-500/50">
                    <UsersRound aria-hidden="true" size={23} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-white">Send to RTR users</span>
                    <span className="mt-1 block text-sm leading-5 text-[#94a3b8]">Send via phone or Email</span>
                  </span>
                  <ChevronRight aria-hidden="true" className="shrink-0 text-slate-500 transition-colors group-hover:text-[#3b82f6]" size={20} />
                </button>
              </div>
            </>
          )}

          {(screen === "bank" || screen === "internal" || screen === "onchain") && (
            <div className="mb-7 flex items-start gap-3 pr-12">
              <button
                aria-label="Back to select method"
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#1e293b] bg-[#16223f] text-slate-300 transition-colors hover:border-[#3b82f6] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]"
                onClick={returnToMethods}
                type="button"
              >
                <ArrowLeft aria-hidden="true" size={19} />
              </button>
              <h2 className="pt-1.5 text-xl font-bold tracking-tight text-white sm:text-2xl" id="send-modal-title">
                {screen === "bank" ? "Bank Withdrawal" : screen === "internal" ? "Send to RTR users" : "On-Chain Send"}
              </h2>
            </div>
          )}

          {screen === "bank" && (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-600 bg-[#16223f] px-6 py-10 text-center">
              <LoaderCircle aria-hidden="true" className="mb-5 animate-spin text-blue-400" size={34} />
              <p className="font-medium text-white">Connecting to Fonbnk Withdrawal Gateway...</p>
            </div>
          )}

          {screen === "internal" && (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-600 bg-[#16223f] px-6 py-10 text-center">
              <UsersRound aria-hidden="true" className="mb-5 text-blue-400" size={32} />
              <p className="font-medium text-white">Internal transfers</p>
              <p className="mt-2 max-w-xs text-sm leading-6 text-[#94a3b8]">
                Sending to RTR users by phone or email will be available here.
              </p>
            </div>
          )}

          {screen === "onchain" && (
            <div className="space-y-5">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="text-sm font-medium text-[#94a3b8]" htmlFor="send-asset">
                    Asset
                  </label>
                  <button
                    aria-label="Refresh wallet assets"
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-blue-300 transition-colors hover:bg-[#16223f] hover:text-white disabled:opacity-50"
                    disabled={assetListLoading || !walletSessionConnected || !isBaseNetwork}
                    onClick={() => {
                      void nativeBalance.refetch();
                      void erc20Balances.refetch();
                      setAssetRefreshCount((count) => count + 1);
                    }}
                    type="button"
                  >
                    <RefreshCw aria-hidden="true" className={assetListLoading ? "animate-spin" : ""} size={14} />
                    Refresh
                  </button>
                </div>
                <select
                  aria-busy={assetListLoading || assetBalanceLoading}
                  className="w-full rounded-xl border border-[#1e293b] bg-[#16223f] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!liveAssets.length}
                  id="send-asset"
                  onChange={(event) => {
                    setSelectedTokenKey(event.target.value);
                    setAmount("");
                    setSendError("");
                  }}
                  value={selectedToken?.key ?? ""}
                >
                  {liveAssets.length ? (
                    liveAssets.map((token) => (
                      <option key={token.key} value={token.key}>
                        {token.symbol} — {formatTokenAmount(token.balance, token.decimals)}
                      </option>
                    ))
                  ) : (
                    <option value="">
                      {assetListLoading || assetBalanceLoading
                        ? "Loading wallet assets..."
                        : "Select an asset"}
                    </option>
                  )}
                </select>
                {assetListError && (
                  <p className="mt-2 text-xs text-red-300" role="alert">{assetListError}</p>
                )}
                {!assetListLoading && !assetListError && !assetBalanceLoading && !assetBalanceError && !liveAssets.length && (
                  <p className="mt-2 text-xs text-[#94a3b8]">
                    {walletSessionConnected && isBaseNetwork
                      ? "No positive-balance Base assets found for the connected wallet."
                      : walletSessionConnected
                        ? "Switch to Base to view assets available for sending."
                        : "Connect a wallet to scan for assets."}
                  </p>
                )}
                {assetBalanceError && (
                  <p className="mt-2 text-xs text-red-300" role="alert">
                    Unable to verify one or more wallet balances. Refresh assets and try again.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#94a3b8]" htmlFor="send-destination">
                  Destination address
                </label>
                <input
                  autoComplete="off"
                  className="w-full rounded-xl border border-[#1e293b] bg-[#16223f] px-4 py-3 font-mono text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]"
                  id="send-destination"
                  onChange={(event) => setDestinationAddress(event.target.value.trim())}
                  placeholder="Enter destination wallet address"
                  spellCheck={false}
                  value={destinationAddress}
                />
                {destinationAddress && !destination && (
                  <p className="mt-2 text-xs text-red-300">Enter a valid wallet address.</p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#94a3b8]" htmlFor="send-amount">
                  Amount
                </label>
                <input
                  className="w-full rounded-xl border border-[#1e293b] bg-[#16223f] px-4 py-3 font-mono text-lg text-white outline-none transition-colors placeholder:text-slate-500 focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]"
                  id="send-amount"
                  inputMode="decimal"
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  type="text"
                  value={amount}
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-xs text-[#94a3b8]">
                    {selectedToken && tokenBalance !== undefined
                      ? `Available: ${formatTokenAmount(tokenBalance, selectedToken.decimals)} ${selectedToken.symbol}`
                      : assetBalanceLoading || assetListLoading
                        ? "Loading balance..."
                        : "Available: —"}
                  </p>
                  <button
                    className="rounded-lg border border-[#1e293b] bg-[#16223f] px-3 py-1.5 text-xs font-bold text-blue-300 transition-colors hover:border-[#3b82f6] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={tokenBalance === undefined}
                    onClick={() => {
                      if (selectedToken && tokenBalance !== undefined) {
                        setAmount(formatTokenAmount(tokenBalance, selectedToken.decimals));
                      }
                    }}
                    type="button"
                  >
                    Max
                  </button>
                </div>
                {assetBalanceError && (
                  <p className="mt-2 text-xs text-red-300" role="alert">
                    Unable to load the live balance. Refresh wallet assets and try again.
                  </p>
                )}
                {insufficientBalance && (
                  <p className="mt-2 text-xs font-medium text-red-400">Insufficient balance</p>
                )}
              </div>

              {sendError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" role="alert">
                  <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
                  <span>{sendError}</span>
                </div>
              )}

              <button
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b82f6] px-4 py-3.5 font-bold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!validForm}
                onClick={openReview}
                type="button"
              >
                Preview
                <ArrowRight aria-hidden="true" size={18} />
              </button>
            </div>
          )}

          {screen === "review" && (
            <>
              <div className="mb-6 flex items-start gap-3 pr-12">
                <button
                  aria-label="Back to on-chain send"
                  className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#1e293b] bg-[#16223f] text-slate-300 transition-colors hover:border-[#3b82f6] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]"
                  onClick={() => setScreen("onchain")}
                  type="button"
                >
                  <ArrowLeft aria-hidden="true" size={19} />
                </button>
                <h2 className="pt-1.5 text-xl font-bold tracking-tight text-white sm:text-2xl" id="send-modal-title">
                  Review transfer
                </h2>
              </div>

              <div className="space-y-3 rounded-2xl border border-[#1e293b] bg-[#16223f] p-4">
                <div className="flex justify-between gap-4 text-sm">
                  <span className="text-[#94a3b8]">You send</span>
                  <span className="font-semibold text-white">{amount} {selectedToken?.symbol}</span>
                </div>
                <div className="flex justify-between gap-4 text-sm">
                  <span className="text-[#94a3b8]">To</span>
                  <span className="max-w-[65%] break-all text-right font-mono text-xs text-white">{destinationAddress}</span>
                </div>
                <div className="border-t border-[#1e293b] pt-3">
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-[#94a3b8]">Estimated network fee</span>
                    <span className="text-right font-semibold text-white">
                      {gasEstimate.isFetching || gasPrice.isFetching
                        ? "Estimating..."
                        : estimatedFee !== undefined
                          ? `${conciseAmount(estimatedFee, 18, 8)} ETH`
                          : "Unavailable"}
                    </span>
                  </div>
                </div>
              </div>

              {!wagmiSessionMatches ? (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-200">
                  <span>Connect your active wallet to estimate fees and continue.</span>
                  <button
                    className="shrink-0 rounded-lg border border-amber-200/30 px-3 py-1.5 text-xs font-semibold hover:bg-amber-200/10"
                    onClick={() => {
                      setSendError("");
                      void open().catch((error: unknown) => {
                        setSendError(error instanceof Error ? error.message : "Unable to open wallet connection.");
                      });
                    }}
                    type="button"
                  >
                    Connect
                  </button>
                </div>
              ) : chainId !== base.id ? (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-200">
                  <span>Switch your connected wallet to Base to estimate fees and continue.</span>
                  <button
                    className="shrink-0 rounded-lg border border-amber-200/30 px-3 py-1.5 text-xs font-semibold hover:bg-amber-200/10 disabled:opacity-50"
                    disabled={isSwitchingChain}
                    onClick={() => {
                      void switchChainAsync({ chainId: base.id }).catch((error: unknown) => {
                        setSendError(error instanceof Error ? error.message : "Unable to switch to Base.");
                      });
                    }}
                    type="button"
                  >
                    {isSwitchingChain ? "Switching..." : "Switch"}
                  </button>
                </div>
              ) : null}

              {(gasEstimate.isError || gasPrice.isError || nativeError || tokenError || sendError) && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" role="alert">
                  <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
                  <span>
                    {sendError ||
                      (gasEstimate.isError || gasPrice.isError
                        ? "Unable to estimate the network fee. Check the address and wallet network, then try again."
                        : nativeError?.message || tokenError?.message)}
                  </span>
                </div>
              )}

              <button
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b82f6] px-4 py-3.5 font-bold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  !estimateReady ||
                  gasEstimate.isFetching ||
                  gasPrice.isFetching ||
                  estimatedFee === undefined ||
                  gasEstimate.isError ||
                  gasPrice.isError ||
                  transactionPending
                }
                onClick={handleSend}
                type="button"
              >
                {transactionPending ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="animate-spin" size={18} />
                    Sending...
                  </>
                ) : (
                  <>
                    Confirm and send
                    <ArrowRight aria-hidden="true" size={18} />
                  </>
                )}
              </button>
            </>
          )}

          {screen === "success" && (
            <div className="py-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                <CheckCircle2 aria-hidden="true" size={34} />
              </div>
              <h2 className="text-xl font-bold text-white" id="send-modal-title">Transaction submitted</h2>
              <p className="mt-2 text-sm leading-6 text-[#94a3b8]">
                Your transfer has been submitted to the Base network.
              </p>
              {transactionHash && (
                <p className="mt-4 break-all rounded-xl border border-[#1e293b] bg-[#16223f] p-3 font-mono text-xs text-[#94a3b8]">
                  {transactionHash}
                </p>
              )}
              <button
                className="mt-6 w-full rounded-xl bg-[#3b82f6] px-4 py-3 font-bold text-white transition-colors hover:bg-blue-500"
                onClick={onClose}
                type="button"
              >
                Close
              </button>
            </div>
          )}
        </div>
        <style>{`
          @keyframes sendModalViewIn {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .send-modal-view { animation: sendModalViewIn 180ms ease-out; }
          @media (prefers-reduced-motion: reduce) {
            .send-modal-view { animation: none; }
          }
        `}</style>
      </section>
    </div>
  );
}
