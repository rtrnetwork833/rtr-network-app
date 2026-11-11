"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppKit } from "@reown/appkit/react";
import {
  ArrowDownCircle,
  ArrowLeft,
  Building2,
  Check,
  ChevronRight,
  Copy,
  CreditCard,
  WalletCards,
  X,
} from "lucide-react";
import Image from "next/image";
import QRCode from "qrcode";

interface CustomDepositModalProps {
  userWalletAddress: string;
  walletProfileLoading: boolean;
  onClose: () => void;
}

type DepositView = "methods" | "bank" | "onchain" | "checkout";
type CopyStatus = "idle" | "copied" | "error";

const placeholderWalletAddress = "0x284bEa823901923481239841239841D7F2";
const depositModalStepKey = "rtr-deposit-modal-step";

function getStoredDepositView(): DepositView {
  if (typeof window === "undefined") return "methods";

  const savedStep = window.localStorage.getItem(depositModalStepKey);
  if (savedStep === "fonbnk") return "bank";
  if (savedStep === "onchain" || savedStep === "checkout") return savedStep;
  return "methods";
}

export default function CustomDepositModal({
  userWalletAddress,
  walletProfileLoading,
  onClose,
}: CustomDepositModalProps) {
  const [view, setView] = useState<DepositView>(getStoredDepositView);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [onrampError, setOnrampError] = useState("");
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const depositAddress = userWalletAddress || placeholderWalletAddress;
  const { open } = useAppKit();

  const updateView = (nextView: DepositView) => {
    setView(nextView);
    if (typeof window !== "undefined") {
      const savedStep = nextView === "methods" ? "menu" : nextView === "bank" ? "fonbnk" : nextView;
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
    enabled: view === "onchain",
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

  const openOnramp = async () => {
    setOnrampError("");
    try {
      await open({ view: "OnRampProviders" });
    } catch (error) {
      console.error("Failed to open Reown on-ramp:", error);
      setOnrampError(error instanceof Error ? error.message : "Unable to open the on-ramp.");
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-start justify-center bg-[#0d1527]/95 backdrop-blur-md ${
        view === "bank" ? "p-0" : "p-0 sm:p-6"
      }`}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <section
        aria-labelledby="deposit-modal-title"
        aria-modal="true"
        className={`deposit-modal-sheet relative w-full overflow-y-auto bg-[#0d1527] ${
          view === "bank"
            ? "h-[100dvh] max-h-[100dvh] max-w-none border-0 p-0 shadow-none"
            : "max-w-lg border border-[#1e293b] p-5 pb-24 shadow-[0_24px_100px_rgba(0,0,0,0.55)] sm:rounded-3xl sm:p-7 sm:pb-24"
        } ${
          view === "methods"
            ? "max-h-[92dvh] rounded-t-3xl rounded-b-none"
            : view === "bank"
              ? "rounded-none"
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

        <div key={view} className={`deposit-modal-view ${view === "bank" ? "flex h-full flex-col" : ""}`}>
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
                  className="group flex w-full items-center gap-4 rounded-2xl border border-[#1e293b] bg-[#16223f] p-4 text-left transition-all duration-200 hover:border-[#3b82f6] hover:bg-[#192949] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] sm:p-5"
                  onClick={() => updateView("bank")}
                  type="button"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#1e293b] bg-[#0d1527] text-white transition-colors group-hover:border-blue-500/50">
                    <Building2 aria-hidden="true" size={22} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-white">Quidax NGN Deposit</span>
                    <span className="mt-1 block text-sm leading-5 text-[#94a3b8]">
                      NGN bank transfers (Quidax Ramp setup required)
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" className="shrink-0 text-slate-500 transition-colors group-hover:text-[#3b82f6]" size={20} />
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
                      Deposit crypto from other exchanges or wallets
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" className="shrink-0 text-slate-500 transition-colors group-hover:text-[#3b82f6]" size={20} />
                </button>

                <button
                  className="group flex w-full items-center gap-4 rounded-2xl border border-[#1e293b] bg-[#16223f] p-4 text-left transition-all duration-200 hover:border-[#3b82f6] hover:bg-[#192949] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] sm:p-5"
                  onClick={() => void openOnramp()}
                  type="button"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#1e293b] bg-[#0d1527] text-white transition-colors group-hover:border-blue-500/50">
                    <WalletCards aria-hidden="true" size={23} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-white">Buy with wallets</span>
                    <span className="mt-1 block text-sm leading-5 text-[#94a3b8]">
                      Buy via Apple Pay, card, Google Pay, and more
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

          {view === "bank" && (
            <>
              <div className="flex shrink-0 items-start gap-3 pr-12">
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
                    Quidax NGN deposit
                  </p>
                  <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl" id="deposit-modal-title">
                    NGN Bank Transfer
                  </h2>
                </div>
              </div>

              {walletProfileLoading ? (
                <div
                  className="flex min-h-[80vh] w-full flex-1 flex-col items-center justify-center gap-4 text-sm"
                  role="status"
                >
                  <span
                    aria-hidden="true"
                    className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-blue-400"
                  />
                  <span>Initializing secure transaction rails...</span>
                </div>
              ) : (
                <div
                  className="flex min-h-[80vh] w-full flex-1 flex-col items-center justify-center px-6 text-center"
                >
                  <Building2 aria-hidden="true" className="mb-4 text-blue-400" size={34} />
                  <p className="font-semibold text-white">Quidax NGN deposits are not configured</p>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-[#94a3b8]">
                    This flow requires Quidax Ramp merchant access. The current Exchange API credentials cannot create Ramp virtual bank accounts.
                  </p>
                </div>
              )}
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
                      {qrCodeQuery.isError ? "Unable to generate QR code" : "Generating QR code..."}
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
                  {depositAddress}
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
              {!userWalletAddress && (
                <p className="mt-2 text-xs text-amber-300">
                  Example address only. Connect a wallet to see your address.
                </p>
              )}

              <div className="mt-5 rounded-xl border border-[#1e293b] bg-[#16223f]/70 p-3.5">
                <p className="text-xs leading-5 text-[#94a3b8]">
                  Notice: Ensure you only send supported crypto assets to this address using the Base Network. Transferring funds via any other network will result in permanent loss.
                </p>
              </div>
            </>
          )}

          {view === "checkout" && (
            <>
              <div className="mb-7 flex items-start gap-3 pr-12">
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
                    Card checkout
                  </p>
                  <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl" id="deposit-modal-title">
                    Buy with wallets
                  </h2>
                </div>
              </div>

              <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-600 bg-[#16223f] px-6 py-10 text-center">
                <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#1e293b] bg-[#0d1527] text-blue-400">
                  <CreditCard aria-hidden="true" size={25} strokeWidth={1.8} />
                </span>
                <p className="font-medium text-white">Secure checkout gateway</p>
                <p className="mt-2 max-w-xs text-sm leading-6 text-[#94a3b8]">
                  Apple Pay, Google Pay, and card payments will be available here.
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
