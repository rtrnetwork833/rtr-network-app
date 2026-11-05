"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useBalance,
  useEstimateGas,
  useGasPrice,
  useReadContract,
  useSendTransaction,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { useAppKit } from "@reown/appkit/react";
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
  UsersRound,
  X,
} from "lucide-react";

interface CustomSendModalProps {
  activeWalletAddress: Address | null;
  onClose: () => void;
}

type Screen = "methods" | "bank" | "onchain" | "internal" | "review" | "success";
type Token = "ETH" | "RTR";

const rtrTokenAbi = [
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

const configuredRtrAddress = process.env.NEXT_PUBLIC_RTR_TOKEN_ADDRESS;
const rtrTokenAddress =
  configuredRtrAddress && isAddress(configuredRtrAddress)
    ? getAddress(configuredRtrAddress)
    : undefined;
const zeroAddress = "0x0000000000000000000000000000000000000000";

function parseTokenAmount(value: string) {
  if (!value || !/^\d*\.?\d*$/.test(value) || value === "." || value === "") return null;
  try {
    return parseUnits(value, 18);
  } catch {
    return null;
  }
}

function formatTokenAmount(value: bigint) {
  return formatUnits(value, 18).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

function conciseAmount(value: bigint, precision = 6) {
  const formatted = formatTokenAmount(value);
  const [whole, fraction] = formatted.split(".");
  const visiblePrecision =
    fraction && !/[1-9]/.test(fraction.slice(0, precision)) && /[1-9]/.test(fraction.slice(precision))
      ? 12
      : precision;
  return fraction
    ? `${whole}.${fraction.slice(0, visiblePrecision)}`.replace(/0+$/, "").replace(/\.$/, "")
    : whole;
}

export default function CustomSendModal({ activeWalletAddress, onClose }: CustomSendModalProps) {
  const { address, chainId, isConnected } = useAccount();
  const { open } = useAppKit();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const { sendTransactionAsync, isPending: isNativePending, error: nativeError } = useSendTransaction();
  const { writeContractAsync, isPending: isTokenPending, error: tokenError } = useWriteContract();

  const [screen, setScreen] = useState<Screen>("methods");
  const [selectedToken, setSelectedToken] = useState<Token>("ETH");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [sendError, setSendError] = useState("");
  const [transactionHash, setTransactionHash] = useState("");

  const ethBalance = useBalance({
    address: activeWalletAddress ?? undefined,
    query: { enabled: Boolean(activeWalletAddress) },
  });
  const rtrBalance = useReadContract({
    address: rtrTokenAddress ?? zeroAddress,
    abi: rtrTokenAbi,
    functionName: "balanceOf",
    args: activeWalletAddress && rtrTokenAddress ? [activeWalletAddress] : undefined,
    query: { enabled: Boolean(activeWalletAddress && rtrTokenAddress) },
  });

  const amountValue = parseTokenAmount(amount);
  const destination = isAddress(destinationAddress) ? getAddress(destinationAddress) : undefined;
  const tokenBalance = selectedToken === "ETH" ? ethBalance.data?.value : rtrBalance.data;
  const balanceKnown = selectedToken === "ETH"
    ? Boolean(ethBalance.data)
    : typeof rtrBalance.data === "bigint";
  const insufficientBalance =
    balanceKnown && amountValue !== null && tokenBalance !== undefined && amountValue > tokenBalance;
  const amountIsPositive = amountValue !== null && amountValue > BigInt(0);
  const validForm = Boolean(
    activeWalletAddress &&
    destination &&
    amountIsPositive &&
    balanceKnown &&
    !insufficientBalance &&
    (selectedToken === "ETH" || rtrTokenAddress),
  );
  const connectedToActiveWallet =
    Boolean(address && activeWalletAddress && address.toLowerCase() === activeWalletAddress.toLowerCase());
  const estimateReady = Boolean(
    screen === "review" &&
    validForm &&
    isConnected &&
    connectedToActiveWallet &&
    chainId === base.id,
  );

  const transferData =
    selectedToken === "RTR" && destination && amountValue !== null
      ? encodeFunctionData({
          abi: rtrTokenAbi,
          functionName: "transfer",
          args: [destination, amountValue],
        })
      : undefined;
  const gasEstimate = useEstimateGas({
    account: address,
    to: selectedToken === "ETH" ? destination : rtrTokenAddress ?? zeroAddress,
    value: selectedToken === "ETH" ? amountValue ?? undefined : undefined,
    data: selectedToken === "RTR" ? transferData : undefined,
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
    if (!activeWalletAddress || !destination || amountValue === null || !validForm) {
      setSendError("Check the destination, amount, and available balance before continuing.");
      return;
    }
    try {
      if (!isConnected || !connectedToActiveWallet) {
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
      if (selectedToken === "ETH") {
        hash = await sendTransactionAsync({
          to: destination,
          value: amountValue,
          chainId: base.id,
        });
      } else {
        if (!rtrTokenAddress) throw new Error("RTR token contract is not configured.");
        hash = await writeContractAsync({
          address: rtrTokenAddress,
          abi: rtrTokenAbi,
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
              {!activeWalletAddress && (
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
                  Link a wallet to your profile to view balances and send crypto.
                </div>
              )}

              <div>
                <p className="mb-2 text-sm font-medium text-[#94a3b8]">Asset</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["ETH", "RTR"] as const).map((token) => (
                    <button
                      aria-pressed={selectedToken === token}
                      className={`rounded-xl border px-4 py-3 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] ${
                        selectedToken === token
                          ? "border-[#3b82f6] bg-blue-500/10 text-white"
                          : "border-[#1e293b] bg-[#16223f] text-slate-400 hover:border-[#3b82f6]"
                      }`}
                      disabled={token === "RTR" && !rtrTokenAddress}
                      key={token}
                      onClick={() => {
                        setSelectedToken(token);
                        setSendError("");
                      }}
                      type="button"
                    >
                      {token}
                    </button>
                  ))}
                </div>
                {selectedToken === "RTR" && !rtrTokenAddress && (
                  <p className="mt-2 text-xs text-amber-200">RTR transfers are unavailable because the token contract is not configured.</p>
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
                  type="number"
                  min="0"
                  step="any"
                  value={amount}
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-xs text-[#94a3b8]">
                    {tokenBalance !== undefined
                      ? `Available: ${conciseAmount(tokenBalance)} ${selectedToken}`
                      : (selectedToken === "ETH" ? ethBalance.isError : rtrBalance.isError)
                        ? "Balance unavailable"
                        : activeWalletAddress
                          ? "Loading balance..."
                          : `Available: 0 ${selectedToken}`}
                  </p>
                  <button
                    className="rounded-lg border border-[#1e293b] bg-[#16223f] px-3 py-1.5 text-xs font-bold text-blue-300 transition-colors hover:border-[#3b82f6] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={tokenBalance === undefined}
                    onClick={() => {
                      if (tokenBalance !== undefined) setAmount(formatTokenAmount(tokenBalance));
                    }}
                    type="button"
                  >
                    Max
                  </button>
                </div>
                {(selectedToken === "ETH" ? ethBalance.isError : rtrBalance.isError) && (
                  <p className="mt-2 text-xs text-red-300" role="alert">
                    Unable to load your {selectedToken} balance. Refresh the wallet connection and try again.
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
                  <span className="font-semibold text-white">{amount} {selectedToken}</span>
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
                          ? `${conciseAmount(estimatedFee, 8)} ETH`
                          : "Unavailable"}
                    </span>
                  </div>
                </div>
              </div>

              {!isConnected || !connectedToActiveWallet ? (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-200">
                  <span>Connect the wallet linked to this profile to estimate fees and continue.</span>
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
