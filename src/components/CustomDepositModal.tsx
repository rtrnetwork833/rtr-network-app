"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownCircle,
  ArrowLeft,
  Building2,
  Check,
  ChevronRight,
  Copy,
  CreditCard,
  LoaderCircle,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import Image from "next/image";
import QRCode from "qrcode";

interface CustomDepositModalProps {
  activeWalletAddress: `0x${string}` | null;
  onClose: () => void;
}

type DepositView = "methods" | "bank" | "onchain" | "checkout";
type CopyStatus = "idle" | "copied" | "error";

const placeholderWalletAddress = "0x284bEa823901923481239841239841D7F2";

export default function CustomDepositModal({ activeWalletAddress, onClose }: CustomDepositModalProps) {
  const [view, setView] = useState<DepositView>("methods");
  const [selectedAsset, setSelectedAsset] = useState("USDC");
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const depositAddress = activeWalletAddress ?? placeholderWalletAddress;

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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0d1527]/95 p-3 backdrop-blur-md sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <section
        aria-labelledby="deposit-modal-title"
        aria-modal="true"
        className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[#1e293b] bg-[#0d1527] p-5 shadow-[0_24px_100px_rgba(0,0,0,0.55)] sm:p-7"
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
                  className="group flex w-full items-center gap-4 rounded-2xl border border-[#1e293b] bg-[#16223f] p-4 text-left transition-all duration-200 hover:border-[#3b82f6] hover:bg-[#192949] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] sm:p-5"
                  onClick={() => setView("bank")}
                  type="button"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#1e293b] bg-[#0d1527] text-white transition-colors group-hover:border-blue-500/50">
                    <Building2 aria-hidden="true" size={22} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-white">Deposit</span>
                    <span className="mt-1 block text-sm leading-5 text-[#94a3b8]">
                      Deposit via bank transfer or top-ups wallets
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" className="shrink-0 text-slate-500 transition-colors group-hover:text-[#3b82f6]" size={20} />
                </button>

                <button
                  className="group flex w-full items-center gap-4 rounded-2xl border border-[#1e293b] bg-[#16223f] p-4 text-left transition-all duration-200 hover:border-[#3b82f6] hover:bg-[#192949] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] sm:p-5"
                  onClick={() => setView("onchain")}
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
                  onClick={() => setView("checkout")}
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
            </>
          )}

          {view === "bank" && (
            <>
              <div className="mb-7 flex items-start gap-3 pr-12">
                <button
                  aria-label="Back to select method"
                  className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#1e293b] bg-[#16223f] text-slate-300 transition-colors hover:border-[#3b82f6] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]"
                  onClick={() => setView("methods")}
                  type="button"
                >
                  <ArrowLeft aria-hidden="true" size={19} />
                </button>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
                    Bank transfer
                  </p>
                  <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl" id="deposit-modal-title">
                    Bank Transfer Deposit
                  </h2>
                </div>
              </div>

              <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#1e293b] bg-[#16223f] px-4 py-3.5">
                <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-[#94a3b8]" size={18} />
                <p className="text-sm leading-6 text-[#94a3b8]">
                  Asset to Receive: <span className="font-medium text-white">USDC (Polygon/EVM Network)</span>
                </p>
              </div>

              <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-600 bg-[#16223f] px-6 py-10 text-center">
                <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#1e293b] bg-[#0d1527] text-blue-400">
                  <LoaderCircle aria-hidden="true" className="animate-spin" size={27} />
                </span>
                <p className="font-medium text-white">Connecting to Fonbnk Secure Gateway...</p>
                <p className="mt-2 max-w-xs text-sm leading-6 text-[#94a3b8]">
                  The secure bank transfer experience will be available here.
                </p>
              </div>
            </>
          )}

          {view === "onchain" && (
            <>
              <div className="mb-5 flex items-start gap-3 pr-12">
                <button
                  aria-label="Back to select method"
                  className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#1e293b] bg-[#16223f] text-slate-300 transition-colors hover:border-[#3b82f6] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]"
                  onClick={() => setView("methods")}
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

              <label className="mb-2 block text-sm font-medium text-[#94a3b8]" htmlFor="deposit-asset">
                Select asset
              </label>
              <select
                className="mb-5 w-full appearance-none rounded-xl border border-[#1e293b] bg-[#16223f] px-4 py-3.5 text-sm font-semibold text-white outline-none transition-colors focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/20"
                id="deposit-asset"
                onChange={(event) => setSelectedAsset(event.target.value)}
                value={selectedAsset}
              >
                <option value="USDT">USDT</option>
                <option value="USDC">USDC</option>
                <option value="RTR">RTR</option>
              </select>

              <div className="mb-5 flex flex-col items-center rounded-2xl border border-[#1e293b] bg-[#16223f] px-5 py-5">
                <div className="flex h-44 w-44 items-center justify-center rounded-2xl bg-white p-2.5 shadow-lg shadow-black/20">
                  {qrCodeQuery.data ? (
                    <Image
                      alt={`${selectedAsset} deposit wallet QR code`}
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
              {!activeWalletAddress && (
                <p className="mt-2 text-xs text-amber-300">
                  Example address only. Connect a wallet to see your address.
                </p>
              )}

              <div className="mt-5 rounded-xl border border-[#1e293b] bg-[#16223f]/70 p-3.5">
                <p className="text-xs leading-5 text-[#94a3b8]">
                  Notice: Ensure you only send the selected asset to this address via the supported network. Transferring unsupported assets may result in permanent loss.
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
                  onClick={() => setView("methods")}
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
          @keyframes depositModalViewIn {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .deposit-modal-view { animation: depositModalViewIn 180ms ease-out; }
          @media (prefers-reduced-motion: reduce) {
            .deposit-modal-view { animation: none; }
          }
        `}</style>
      </section>
    </div>
  );
}
