import { getAddress, isAddress, type Address } from "viem";

export const profileWalletQueryKey = (userId: string) => ["profile-wallet", userId] as const;

export async function fetchProfileWalletAddress(): Promise<Address | null> {
  const response = await fetch("/api/profile/wallet", { cache: "no-store" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Unable to load the profile wallet address.");

  const body = await response.json() as { walletAddress?: unknown };
  return typeof body.walletAddress === "string" && isAddress(body.walletAddress)
    ? getAddress(body.walletAddress)
    : null;
}