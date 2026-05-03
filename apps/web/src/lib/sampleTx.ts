import {
  Connection,
  Keypair,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

export type SampleTxResult = { base64: string; feePayer: string };

/** İmzasız örnek işlem — simülasyon çoğu zaman başarısız olur; pipeline / demo için. */
export async function generateUnsignedDevnetSampleTx(): Promise<SampleTxResult> {
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  const { blockhash } = await conn.getLatestBlockhash();
  const kp = Keypair.generate();
  const msg = new TransactionMessage({
    payerKey: kp.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      SystemProgram.transfer({
        fromPubkey: kp.publicKey,
        toPubkey: kp.publicKey,
        lamports: 0,
      }),
    ],
  }).compileToV0Message();
  const vtx = new VersionedTransaction(msg);
  const raw = vtx.serialize();
  const b64 = btoa(String.fromCharCode(...raw));
  return { base64: b64, feePayer: kp.publicKey.toBase58() };
}
