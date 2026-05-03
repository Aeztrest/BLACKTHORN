import { AccountLayout, MintLayout } from "@solana/spl-token";
import { AccountInfo, PublicKey } from "@solana/web3.js";
import type { EstimatedChanges } from "../domain/estimated-changes.js";
import type { NormalizedSimulation } from "../domain/simulation-normalized.js";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

export type PreAccounts = Map<string, AccountInfo<Buffer> | null>;

export function buildPreAccountsMap(
  pubkeys: string[],
  infos: (AccountInfo<Buffer> | null)[],
): PreAccounts {
  const m: PreAccounts = new Map();
  for (let i = 0; i < pubkeys.length; i++) {
    m.set(pubkeys[i]!, infos[i] ?? null);
  }
  return m;
}

export function extractEstimatedChanges(
  pre: PreAccounts,
  simulation: NormalizedSimulation,
  userWallet: PublicKey | null,
): EstimatedChanges {
  const sol: EstimatedChanges["sol"] = [];
  const tokens: EstimatedChanges["tokens"] = [];
  const approvals: EstimatedChanges["approvals"] = [];
  const delegates: EstimatedChanges["delegates"] = [];

  for (const post of simulation.accounts) {
    const pk = post.pubkey;
    const preInfo = pre.get(pk) ?? null;
    const preLamports = preInfo?.lamports ?? null;
    const postLamports = post.lamports;
    const deltaLamports =
      preLamports != null ? postLamports - preLamports : null;

    sol.push({
      account: pk,
      preLamports,
      postLamports,
      deltaLamports,
    });

    const ownerPk = new PublicKey(post.owner);
    const isTokenAccount =
      ownerPk.equals(TOKEN_PROGRAM_ID) || ownerPk.equals(TOKEN_2022_PROGRAM_ID);

    if (!isTokenAccount) continue;

    const postData = Buffer.from(post.dataBase64, "base64");
    const preData = preInfo?.data ? Buffer.from(preInfo.data) : null;

    if (postData.length < AccountLayout.span) continue;

    let postDecoded;
    let preDecoded;
    try {
      postDecoded = AccountLayout.decode(postData);
      preDecoded = preData && preData.length >= AccountLayout.span
        ? AccountLayout.decode(preData)
        : null;
    } catch {
      continue;
    }

    const preAmount = preDecoded?.amount?.toString() ?? "0";
    const postAmount = postDecoded.amount.toString();
    const delta = (BigInt(postAmount) - BigInt(preAmount)).toString();

    const mint = new PublicKey(postDecoded.mint).toBase58();
    const ownerStr = new PublicKey(postDecoded.owner).toBase58();
    const decimals = null;

    if (userWallet && ownerStr !== userWallet.toBase58()) {
      /* only attribute user-owned token accounts when wallet context matches */
    }

    tokens.push({
      account: pk,
      mint,
      owner: ownerStr,
      preAmount,
      postAmount,
      delta,
      decimals,
    });

    const preDelegate = preDecoded?.delegateOption === 1 && preDecoded.delegate
      ? new PublicKey(preDecoded.delegate).toBase58()
      : null;
    const postDelegate =
      postDecoded.delegateOption === 1 && postDecoded.delegate
        ? new PublicKey(postDecoded.delegate).toBase58()
        : null;

    if (preDelegate !== postDelegate) {
      delegates.push({
        kind: "spl_token_delegate",
        tokenAccount: pk,
        mint,
        delegate: postDelegate,
        message: "Token account delegate field changed in simulation",
      });
    }

    if (preDelegate == null && postDelegate != null) {
      approvals.push({
        kind: "spl_token_approval",
        tokenAccount: pk,
        mint,
        delegate: postDelegate,
        message: "New SPL token delegate set after simulation",
      });
    }
  }

  return { sol, tokens, approvals, delegates };
}

/** Resolve decimals from mint account when present in pre/post maps */
export function enrichTokenDecimals(
  changes: EstimatedChanges,
  pre: PreAccounts,
  simulation: NormalizedSimulation,
): void {
  const dataByPubkey = new Map<string, Buffer>();
  for (const [pk, info] of pre) {
    if (info?.data) dataByPubkey.set(pk, Buffer.from(info.data));
  }
  for (const a of simulation.accounts) {
    dataByPubkey.set(a.pubkey, Buffer.from(a.dataBase64, "base64"));
  }

  for (const t of changes.tokens) {
    const buf = dataByPubkey.get(t.mint);
    if (!buf || buf.length !== MintLayout.span) continue;
    try {
      const m = MintLayout.decode(buf);
      t.decimals = m.decimals;
    } catch {
      /* ignore */
    }
  }
}
