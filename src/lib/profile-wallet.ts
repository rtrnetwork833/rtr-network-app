import { getAddress, isAddress, type Address } from "viem";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(payload: unknown, fallback: string) {
  return isRecord(payload) && typeof payload.error === "string" ? payload.error : fallback;
}

export async function resolveProfileWalletAddress(
  appKitAddress?: string,
): Promise<Address | null> {
  const response = await fetch("/api/profile/wallet", { cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getErrorMessage(payload, "Unable to load your profile wallet."));
  }
  if (!isRecord(payload) || !("walletAddress" in payload)) {
    throw new Error("The profile wallet response was invalid.");
  }

  const profileAddress = payload.walletAddress;
  if (profileAddress !== null) {
    if (typeof profileAddress !== "string" || !isAddress(profileAddress)) {
      throw new Error("Your profile contains an invalid wallet address.");
    }
    return getAddress(profileAddress);
  }

  if (!appKitAddress || !isAddress(appKitAddress)) return null;

  const updateResponse = await fetch("/api/profile/wallet", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: appKitAddress }),
  });
  const updatePayload: unknown = await updateResponse.json().catch(() => null);
  if (!updateResponse.ok) {
    throw new Error(getErrorMessage(updatePayload, "Unable to save your connected wallet."));
  }

  return getAddress(appKitAddress);
}
