export type TransactionType = "deposit" | "withdrawal" | "swap";
export type TransactionPlatform = "Meld" | "Native";
export type TransactionStatus = "pending" | "completed";

interface CreateTransactionInput {
  transactionType: TransactionType;
  status: TransactionStatus;
  platform: TransactionPlatform;
}

async function getResponseError(response: Response, fallback: string) {
  const body: unknown = await response.json().catch(() => null);
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }
  return fallback;
}

export async function createProfileTransaction(input: CreateTransactionInput) {
  const response = await fetch("/api/profile/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await getResponseError(response, "Unable to record this transaction."));
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("logged" in body) ||
    body.logged !== true
  ) {
    throw new Error("The transaction logging response was invalid.");
  }
}
