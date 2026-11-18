"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppKit, useAppKitAccount, useAppKitState } from "@reown/appkit/react";
import { resolveProfileWalletAddress } from "@/lib/profile-wallet";
import { createProfileTransaction, updateProfileTransaction } from "@/lib/profile-transactions";
import {
  ArrowDownCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  LoaderCircle,
  WalletCards,
  X,
} from "lucide-react";
import Image from "next/image";
import QRCode from "qrcode";

interface CustomDepositModalProps {
  userWalletAddress: string;
  onClose: () => void;
}

type DepositView = "methods" | "fiat" | "onchain";
type CopyStatus = "idle" | "copied" | "error";

const depositModalStepKey = "rtr-deposit-modal-step";

function getStoredDepositView(): DepositView {
  if (typeof window === "undefined") return "methods";

  const savedStep = window.localStorage.getItem(depositModalStepKey);
  if (savedStep === "onchain") return savedStep;
  return "methods";
}

export default function CustomDepositModal({
  userWalletAddress,
  onClose,
}: CustomDepositModalProps) {
  const [view, setView] = useState<DepositView>(getStoredDepositView);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [onrampError, setOnrampError] = useState("");
  const [paymentWalletAddress, setPaymentWalletAddress] = useState("");
  const [isVerifyingWallet, setIsVerifyingWallet] = useState(false);
  const [isLoggingPayment, setIsLoggingPayment] = useState(false);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectModalWasOpened = useRef(false);
  const walletVerificationRequest = useRef(0);
  const depositAddress = userWalletAddress;
  const { open } = useAppKit();
  const { address: appKitAddress, isConnected, status } = useAppKitAccount();
  const {
    initialized: appKitInitialized,
    loading: appKitLoading,
    open: isAppKitModalOpen,
  } = useAppKitState();
  const isAppKitInitializing = !appKitInitialized || appKitLoading;
  const isWalletSessionPending = status === "connecting" || status === "reconnecting";

  const updateView = (nextView: DepositView) => {
    setView(nextView);
    if (typeof window !== "undefined") {
      const savedStep = nextView === "onchain" ? "onchain" : "menu";
      window.localStorage.setItem(depositModalStepKey, savedStep);
    }
  };

  const qrCodeQuery = useQuery({
    queryKey: ["deposit-wallet-qr", depositAddress],
    queryFn: () =>
      QRCode.toDataURL(depositAddress, {
        width: 160,
        margin: 2,
        errorCorrectionLevel: "M",
      }),
    enabled: view === "onchain" && Boolean(depositAddress),
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (!isConnected || !appKitAddress) return;

    let active = true;
    void resolveProfileWalletAddress(appKitAddress)
      .then((profileAddress) => {
        if (!active) return;
        if (
          profileAddress &&
          profileAddress.toLowerCase() !== appKitAddress.toLowerCase()
        ) {
          setOnrampError("Your connected wallet does not match the wallet saved to your profile.");
          return;
        }
        setPaymentWalletAddress(profileAddress ?? "");
      })
      .catch((error: unknown) => {
        console.error("Unable to sync the connected wallet to the profile:", error);
        if (active) {
          setOnrampError(
            error instanceof Error ? error.message : "Unable to save your connected wallet.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, [appKitAddress, isConnected]);

  useEffect(() => {
    if (!isVerifyingWallet) return;

    if (isAppKitModalOpen) {
      connectModalWasOpened.current = true;
      return;
    }

    if (connectModalWasOpened.current && !isConnected) {
      connectModalWasOpened.current = false;
      setIsVerifyingWallet(false);
      setOnrampError("Wallet verification was cancelled. Try again to continue with your deposit.");
    }
  }, [isAppKitModalOpen, isConnected, isVerifyingWallet]);

  useEffect(() => {
    if (!isVerifyingWallet || !isConnected || !appKitAddress) return;

    let active = true;
    const requestId = ++walletVerificationRequest.current;
    void resolveProfileWalletAddress(appKitAddress)
      .then((profileAddress) => {
        if (!active || requestId !== walletVerificationRequest.current) return;
        if (!profileAddress) {
          throw new Error("Unable to resolve a wallet address for this deposit.");
        }
        if (
          profileAddress.toLowerCase() !== appKitAddress.toLowerCase() ||
          (userWalletAddress &&
            userWalletAddress.toLowerCase() !== appKitAddress.toLowerCase())
        ) {
          throw new Error("The connected wallet does not match the wallet saved to your profile.");
        }

        connectModalWasOpened.current = false;
        setPaymentWalletAddress(profileAddress);
        updateView("fiat");
        setIsVerifyingWallet(false);
      })
      .catch((error: unknown) => {
        if (!active || requestId !== walletVerificationRequest.current) return;
        console.error("Unable to verify the connected wallet for deposit:", error);
        connectModalWasOpened.current = false;
        setOnrampError(error instanceof Error ? error.message : "Unable to verify your wallet.");
        setIsVerifyingWallet(false);
      });

    return () => {
      active = false;
    };
  }, [appKitAddress, isConnected, isVerifyingWallet, userWalletAddress]);

  useEffect(
    () => () => {
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
    },
    [],
  );

  const handleCopyAddress = async () => {
    if (copyTimeout.current) clearTimeout(copyTimeout.current);

    try {
      await navigator.clipboard.writeText(depositAddress);
      setCopyStatus("copied");
    } catch (error) {
      console.error("Failed to copy deposit address:", error);
      setCopyStatus("error");
    }

    copyTimeout.current = setTimeout(() => setCopyStatus("idle"), 2000);
  };

  const closeModal = () => {
    if (copyTimeout.current) clearTimeout(copyTimeout.current);
    onClose();
  };

  const openFiatDeposit = async () => {
    setOnrampError("");
    if (isAppKitInitializing) {
      setOnrampError("The secure payment terminal is still initializing. Please try again shortly.");
      return;
    }
    if (isWalletSessionPending) {
      setOnrampError("Your secure wallet session is still connecting. Please wait a moment.");
      return;
    }

    setIsVerifyingWallet(true);
    if (isConnected && appKitAddress) return;

    try {
      await open({ view: "Connect" });
    } catch (error) {
      console.error("Failed to open AppKit wallet verification:", error);
      setOnrampError(error instanceof Error ? error.message : "Unable to verify your wallet.");
      setIsVerifyingWallet(false);
    }
  };

  const continueToOnramp = async () => {
    setOnrampError("");
    if (!isConnected || !appKitAddress) {
      updateView("methods");
      setOnrampError("Your wallet session needs verification. Select Fiat Deposit to reconnect securely.");
      return;
    }

    let profileAddress: string | null;
    try {
      profileAddress = await resolveProfileWalletAddress(appKitAddress);
      if (
        profileAddress &&
        appKitAddress &&
        profileAddress.toLowerCase() !== appKitAddress.toLowerCase()
      ) {
        throw new Error("Your connected wallet does not match the wallet saved to your profile.");
      }
      if (!profileAddress) {
        throw new Error("Unable to resolve a wallet address for this deposit.");
      }
      setPaymentWalletAddress(profileAddress);
    } catch (error) {
      console.error("Unable to resolve the profile wallet for on-ramp:", error);
      setOnrampError(error instanceof Error ? error.message : "Unable to load your profile wallet.");
      return;
    }

    setIsLoggingPayment(true);
    let transactionId: string | undefined;
    try {
      transactionId = await createProfileTransaction({
        type: "deposit",
        status: "pending",
        platform: "Meld",
        amount: 0,
        tokenSymbol: "FIAT",
      });
      await open({ view: "OnRampProviders" });
    } catch (error) {
      if (transactionId) {
        try {
          await updateProfileTransaction(transactionId, { status: "failed" });
        } catch (updateError) {
          console.error("Unable to mark the failed deposit intent:", updateError);
        }
      }
      console.error("Failed to open Reown on-ramp:", error);
      setOnrampError(error instanceof Error ? error.message : "Unable to open the on-ramp.");
    } finally {
      setIsLoggingPayment(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-[#0d1527]/95 p-0 backdrop-blur-md sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <section
        aria-labelledby="deposit-modal-title"
        aria-modal="true"
        className={`deposit-modal-sheet relative w-full overflow-y-auto bg-[#0d1527] max-w-lg border border-[#1e293b] p-5 pb-24 shadow-[0_24px_100px_rgba(0,0,0,0.55)] sm:rounded-3xl sm:p-7 sm:pb-24 ${
          view === "methods"
            ? "max-h-[92dvh] rounded-t-3xl rounded-b-none"
            : "max-h-[100dvh] min-h-[100dvh] rounded-none sm:max-h-[92dvh] sm:min-h-0"
        }`}
        role="dialog"
      >
        <button
          aria-label="Close deposit"
          className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-[#1e293b] bg-[#16223f] text-slate-400 transition-colors hover:border-blue-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          onClick={closeModal}
          type="button"
        >
          <X aria-hidden="true" size={19} />
        </button>

        <div key={view} className="deposit-modal-view">
          {view === "methods" && (
            <>
              <div className="mb-7 pr-12">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
                  Add funds
                </p>
                <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl" id="deposit-modal-title">
                  Select Method
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#94a3b8]">
                  Choose how you would like to add funds to your wallet.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  className="group flex w-full items-center gap-4 rounded-2xl border border-[#1e293b] bg-[#16223f] p-4 text-left transition-all duration-200 hover:border-[#3b82f6] hover:bg-[#192949] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] disabled:cursor-not-allowed disabled:opacity-70 sm:p-5"
                  disabled={isVerifyingWallet || isAppKitInitializing || isWalletSessionPending}
                  onClick={() => void openFiatDeposit()}
                  type="button"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#1e293b] bg-[#0d1527] text-white transition-colors group-hover:border-blue-500/50">
                    {isVerifyingWallet || isAppKitInitializing || isWalletSessionPending ? (
                      <LoaderCircle aria-hidden="true" className="animate-spin text-blue-300" size={23} />
                    ) : (
                      <WalletCards aria-hidden="true" size={23} strokeWidth={1.8} />
                    )}
                  </span>
                  <span aria-live="polite" className="min-w-0 flex-1">
                    <span className="block font-semibold text-white">Fiat Deposit</span>
                    <span className="mt-1 block text-sm leading-5 text-[#94a3b8]">
                      {isVerifyingWallet
                        ? "Verifying secure wallet gateway..."
                        : isAppKitInitializing
                          ? "Initializing secure payment terminal..."
                          : isWalletSessionPending
                            ? "Restoring your secure wallet session..."
                            : isConnected
                              ? "Pay via Bank Transfer, Card, Google Pay, Apple Pay and more"
                              : "Continue with email, social sign-in, or a connected wallet"}
                    </span>
                  </span>
                  {isVerifyingWallet || isAppKitInitializing || isWalletSessionPending ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin text-blue-300" size={20} />
                  ) : (
                    <ChevronRight aria-hidden="true" className="shrink-0 text-slate-500 transition-colors group-hover:text-[#3b82f6]" size={20} />
                  )}
                </button>

                <button
                  className="group flex w-full items-center gap-4 rounded-2xl border border-[#1e293b] bg-[#16223f] p-4 text-left transition-all duration-200 hover:border-[#3b82f6] hover:bg-[#192949] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] sm:p-5"
                  onClick={() => updateView("onchain")}
                  type="button"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#1e293b] bg-[#0d1527] text-white transition-colors group-hover:border-blue-500/50">
                    <ArrowDownCircle aria-hidden="true" size={23} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-white">Onchain Deposit</span>
                    <span className="mt-1 block text-sm leading-5 text-[#94a3b8]">
                      Deposit crypto from other exchanges
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" className="shrink-0 text-slate-500 transition-colors group-hover:text-[#3b82f6]" size={20} />
                </button>
              </div>
              {onrampError && (
                <p className="mt-3 text-sm text-red-300" role="alert">
                  {onrampError}
                </p>
              )}
            </>
          )}

          {view === "fiat" && (
            <>
              <div className="mb-6 flex items-start gap-3 pr-12">
                <button
                  aria-label="Back to select method"
                  className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#1e293b] bg-[#16223f] text-slate-300 transition-colors hover:border-[#3b82f6] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]"
                  onClick={() => updateView("methods")}
                  type="button"
                >
                  <ArrowLeft aria-hidden="true" size={19} />
                </button>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
                    Fiat deposit
                  </p>
                  <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl" id="deposit-modal-title">
                    Payment details
                  </h2>
                </div>
              </div>

              <div className="space-y-5">
                {paymentWalletAddress && (
                  <p className="rounded-xl border border-[#1e293b] bg-[#16223f]/70 p-3 text-xs leading-5 text-[#94a3b8]">
                    Funds will be sent to your connected wallet{" "}
                    <span className="font-mono text-slate-200">
                      {paymentWalletAddress}
                    </span>
                    . No address entry is needed.
                  </p>
                )}

                {onrampError && (
                  <p className="text-sm text-red-300" role="alert">
                    {onrampError}
                  </p>
                )}

                <button
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b82f6] px-4 py-3.5 font-bold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isLoggingPayment}
                  onClick={() => void continueToOnramp()}
                  type="button"
                >
                  {isLoggingPayment ? "Preparing secure payment..." : "Continue to payment"}
                  {isLoggingPayment ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" size={18} />
                  ) : (
                    <ChevronRight aria-hidden="true" size={18} />
                  )}
                </button>
              </div>
            </>
          )}

          {view === "onchain" && (
            <>
              <div className="mb-5 flex items-start gap-3 pr-12">
                <button
                  aria-label="Back to select method"
                  className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#1e293b] bg-[#16223f] text-slate-300 transition-colors hover:border-[#3b82f6] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]"
                  onClick={() => updateView("methods")}
                  type="button"
                >
                  <ArrowLeft aria-hidden="true" size={19} />
                </button>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
                    Wallet transfer
                  </p>
                  <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl" id="deposit-modal-title">
                    On-Chain Deposit
                  </h2>
                </div>
              </div>

              <div className="mb-5 flex flex-col items-center rounded-2xl border border-[#1e293b] bg-[#16223f] px-5 py-5">
                <div className="flex h-44 w-44 items-center justify-center rounded-2xl bg-white p-2.5 shadow-lg shadow-black/20">
                  {qrCodeQuery.data ? (
                    <Image
                      alt="Deposit wallet QR code"
                      className="h-40 w-40"
                      height={160}
                      src={qrCodeQuery.data}
                      unoptimized
                      width={160}
                    />
                  ) : (
                    <div className="flex h-40 w-40 items-center justify-center px-3 text-center text-xs text-slate-600">
                      {!depositAddress
                        ? "Link a wallet to receive crypto"
                        : qrCodeQuery.isError
                          ? "Unable to generate QR code"
                          : "Generating QR code..."}
                    </div>
                  )}
                </div>
                <p className="mt-3 text-xs text-[#94a3b8]">
                  Scan to copy your wallet address
                </p>
              </div>

              <p className="mb-2 text-sm font-medium text-[#94a3b8]">Deposit address</p>
              <div className="flex items-center gap-2 rounded-xl border border-[#1e293b] bg-[#16223f] p-2.5 sm:p-3">
                <span className="min-w-0 flex-1 break-all font-mono text-xs leading-5 text-white sm:text-sm">
                  {depositAddress || "No profile wallet is linked"}
                </span>
                <button
                  aria-label={copyStatus === "copied" ? "Address copied" : "Copy deposit address"}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] ${
                    copyStatus === "copied"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : copyStatus === "error"
                        ? "border-red-500/30 bg-red-500/10 text-red-300"
                        : "border-[#1e293b] bg-[#0d1527] text-white hover:border-[#3b82f6]"
                  }`}
                  disabled={!depositAddress || copyStatus === "copied"}
                  onClick={handleCopyAddress}
                  type="button"
                >
                  {copyStatus === "copied" ? (
                    <Check aria-hidden="true" size={15} />
                  ) : (
                    <Copy aria-hidden="true" size={15} />
                  )}
                  {copyStatus === "copied" ? "Copied!" : copyStatus === "error" ? "Failed" : "Copy"}
                </button>
              </div>
              <div className="mt-5 rounded-xl border border-[#1e293b] bg-[#16223f]/70 p-3.5">
                <p className="text-xs leading-5 text-[#94a3b8]">
                  Notice: Ensure you only send supported crypto assets to this address using the Base Network. Transferring funds via any other network will result in permanent loss.
                </p>
              </div>
            </>
          )}

        </div>
        <style>{`
          @keyframes depositModalSheetIn {
            from { opacity: 0.96; transform: translateY(100%); }
            to { opacity: 1; transform: translateY(0); }
          }
          .deposit-modal-sheet { animation: depositModalSheetIn 320ms cubic-bezier(0.22, 1, 0.36, 1); }
          @keyframes depositModalViewIn {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .deposit-modal-view { animation: depositModalViewIn 180ms ease-out; }
          @media (prefers-reduced-motion: reduce) {
            .deposit-modal-sheet,
            .deposit-modal-view { animation: none; }
          }
        `}</style>
      </section>
    </div>
  );
}
