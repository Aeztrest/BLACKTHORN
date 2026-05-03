import type { SimulatedTransactionResponse } from "@solana/web3.js";
import type { NormalizedSimulation, SimulationAccountState } from "../domain/simulation-normalized.js";

function mapAccount(
  a: NonNullable<SimulatedTransactionResponse["accounts"]>[number] | null | undefined,
): SimulationAccountState | null {
  if (!a) return null;
  const dataB64 = a.data?.[0] ?? "";
  return {
    pubkey: "", // filled by caller
    lamports: a.lamports,
    owner: a.owner,
    dataBase64: Buffer.from(dataB64, "base64").toString("base64"),
    executable: a.executable,
  };
}

export function normalizeSimulation(
  response: SimulatedTransactionResponse,
  orderedPubkeys: string[],
): NormalizedSimulation {
  const logs = response.logs ?? [];
  const err = response.err;
  const rawAccounts = response.accounts ?? [];
  const accounts: SimulationAccountState[] = [];
  for (let i = 0; i < orderedPubkeys.length; i++) {
    const mapped = mapAccount(rawAccounts[i] ?? null);
    if (mapped) {
      accounts.push({ ...mapped, pubkey: orderedPubkeys[i]! });
    } else {
      accounts.push({
        pubkey: orderedPubkeys[i]!,
        lamports: 0,
        owner: "11111111111111111111111111111111",
        dataBase64: "",
        executable: false,
      });
    }
  }

  const unitsConsumed =
    response.unitsConsumed !== undefined ? response.unitsConsumed : null;
  const returnData = response.returnData
    ? {
        programId: response.returnData.programId,
        data: Buffer.from(response.returnData.data[0], "base64").toString("base64"),
      }
    : null;

  if (err == null) {
    return {
      status: "success",
      logs,
      err: null,
      accounts,
      unitsConsumed,
      returnData,
    };
  }

  return {
    status: "failed",
    logs,
    err: typeof err === "string" ? err : JSON.stringify(err),
    accounts,
    unitsConsumed,
    returnData,
  };
}
