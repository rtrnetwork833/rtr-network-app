export type TransactionType = "deposit" | "withdrawal" | "swap";
export type TransactionPlatform = "Meld" | "Native";
export type TransactionStatus = "pending" | "completed" | "failed";

interface CreateTransactionInput {
  type: TransactionType;
  status: TransactionStatus;
  platform: TransactionPlatform;
  amount: number;
  tokenSymbol: string;
}

interface UpdateTransactionInput {
  status: TransactionStatus;
  txHash?: string;
}

interface TransactionResponse {
  transaction?: { id: string };
  error?: string;
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

  const body = await response.json() as TransactionResponse;
  if (!body.transaction?.id) {
    throw new Error("The transaction logging response was invalid.");
  }
  return body.transaction.id;
}

export async function updateProfileTransaction(
  transactionId: string,
  input: UpdateTransactionInput,
) {
  const response = await fetch("/api/profile/transactions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactionId, ...input }),
  });
  if (!response.ok) {
    throw new Error(await getResponseError(response, "Unable to update transaction history."));
  }
}
