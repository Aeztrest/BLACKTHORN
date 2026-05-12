import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { Buffer } from "buffer";

/**
 * Scenario IDs the showcase advertises. Each one produces a different tx
 * shape so BLACKTHORN's policy gate has something distinct to evaluate.
 */
export type ScenarioId =
  | "solswap-safe"
  | "solswap-danger"
  | "pixeldrop-safe"
  | "pixeldrop-danger"
  | "solyield-safe"
  | "solyield-warn"
  | "claimhub-safe"
  | "claimhub-danger"
  | "launchpad-safe"
  | "launchpad-danger";

const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const DEVNET_RPC = "https://api.devnet.solana.com";

function fakeProgramId(seedByte: number): PublicKey {
  const arr = new Uint8Array(32).fill(seedByte);
  arr[31] = 0xff;
  return new PublicKey(arr);
}

const UNKNOWN_DEX_PROGRAM = fakeProgramId(0xa1);
const UNKNOWN_DRAINER_PROGRAM = fakeProgramId(0xb2);
const UNKNOWN_STAKING_PROGRAM = fakeProgramId(0xc3);
const UNKNOWN_CLAIM_PROGRAM = fakeProgramId(0xd4);
const UNKNOWN_LAUNCH_PROGRAM = fakeProgramId(0xe5);

function u8(...bytes: number[]): Buffer { return Buffer.from(bytes); }

async function getRecentBlockhash(): Promise<string> {
  try {
    const conn = new Connection(DEVNET_RPC, "confirmed");
    const { blockhash } = await conn.getLatestBlockhash("finalized");
    return blockhash;
  } catch {
    return "11111111111111111111111111111111";
  }
}

/**
 * Build the inner instructions a particular scenario tries to execute.
 * The wallet decodes the resulting tx, extracts these, wraps them through
 * Swig, and runs them past the BLACKTHORN guard. The wallet — not the
 * showcase — produces the actual signed tx.
 */
function buildInnerInstructions(
  scenarioId: ScenarioId,
  walletAddress: PublicKey,
): TransactionInstruction[] {
  const recipient = Keypair.generate().publicKey;

  switch (scenarioId) {
    case "solswap-safe":
      return [SystemProgram.transfer({ fromPubkey: walletAddress, toPubkey: recipient, lamports: 10_000 })];

    case "solswap-danger":
      return [new TransactionInstruction({
        programId: UNKNOWN_DEX_PROGRAM,
        keys: [
          { pubkey: walletAddress, isSigner: true, isWritable: true },
          { pubkey: recipient, isSigner: false, isWritable: true },
        ],
        data: u8(0x01, 0x02, 0x00, 0x00, 0x00, 0x00, 0x20, 0x00),
      })];

    case "pixeldrop-safe":
      return [
        SystemProgram.transfer({ fromPubkey: walletAddress, toPubkey: recipient, lamports: 10_000 }),
        new TransactionInstruction({
          programId: TOKEN_PROGRAM,
          keys: [{ pubkey: walletAddress, isSigner: true, isWritable: false }],
          data: u8(0x07),
        }),
      ];

    case "pixeldrop-danger":
      return [new TransactionInstruction({
        programId: UNKNOWN_DRAINER_PROGRAM,
        keys: [
          { pubkey: walletAddress, isSigner: true, isWritable: true },
          { pubkey: recipient, isSigner: false, isWritable: true },
        ],
        data: u8(0x03, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff),
      })];

    case "solyield-safe":
      return [SystemProgram.transfer({ fromPubkey: walletAddress, toPubkey: recipient, lamports: 50_000_000 })];

    case "solyield-warn":
      return [
        SystemProgram.transfer({ fromPubkey: walletAddress, toPubkey: recipient, lamports: 100_000_000 }),
        new TransactionInstruction({
          programId: UNKNOWN_STAKING_PROGRAM,
          keys: [
            { pubkey: walletAddress, isSigner: true, isWritable: true },
            { pubkey: recipient, isSigner: false, isWritable: true },
          ],
          data: u8(0x01),
        }),
      ];

    case "claimhub-safe":
      return [SystemProgram.transfer({ fromPubkey: walletAddress, toPubkey: recipient, lamports: 5_000 })];

    case "claimhub-danger":
      return [new TransactionInstruction({
        programId: UNKNOWN_CLAIM_PROGRAM,
        keys: [
          { pubkey: walletAddress, isSigner: true, isWritable: true },
          { pubkey: recipient, isSigner: false, isWritable: true },
          { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
        ],
        data: u8(0x0a, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff),
      })];

    case "launchpad-safe":
      return [SystemProgram.transfer({ fromPubkey: walletAddress, toPubkey: recipient, lamports: 500_000_000 })];

    case "launchpad-danger":
      return [
        SystemProgram.transfer({ fromPubkey: walletAddress, toPubkey: recipient, lamports: 500_000_000 }),
        new TransactionInstruction({
          programId: UNKNOWN_LAUNCH_PROGRAM,
          keys: [
            { pubkey: walletAddress, isSigner: true, isWritable: true },
            { pubkey: recipient, isSigner: false, isWritable: true },
          ],
          data: u8(0x01, 0x00),
        }),
      ];
  }
}

/**
 * Wrap the scenario's inner instructions in a placeholder VersionedTransaction
 * that the BLACKTHORN wallet popup can decompile. The wallet replaces the
 * blockhash + feePayer when it re-builds the Swig-wrapped tx.
 */
export async function buildScenarioRequest(
  scenarioId: ScenarioId,
  walletAddress: PublicKey,
): Promise<VersionedTransaction> {
  const blockhash = await getRecentBlockhash();
  const instructions = buildInnerInstructions(scenarioId, walletAddress);
  const message = new TransactionMessage({
    payerKey: walletAddress,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();
  return new VersionedTransaction(message);
}
