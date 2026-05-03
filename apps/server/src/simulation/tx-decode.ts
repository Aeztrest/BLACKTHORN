import { VersionedTransaction } from "@solana/web3.js";

export function decodeVersionedTransactionBase64(
  transactionBase64: string,
): VersionedTransaction {
  const buf = Buffer.from(transactionBase64, "base64");
  return VersionedTransaction.deserialize(buf);
}
