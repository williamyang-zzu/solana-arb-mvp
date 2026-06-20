import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bs58 from "bs58";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

export function loadKeypair(params: {
  privateKeyBase58?: string;
  keypairPath?: string;
}): Keypair {
  if (params.privateKeyBase58) {
    return Keypair.fromSecretKey(bs58.decode(params.privateKeyBase58));
  }

  if (params.keypairPath) {
    const expanded = params.keypairPath.startsWith("~")
      ? path.join(os.homedir(), params.keypairPath.slice(1))
      : params.keypairPath;

    const raw = JSON.parse(fs.readFileSync(expanded, "utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }

  throw new Error("Set PRIVATE_KEY_BASE58 or KEYPAIR_PATH in .env");
}

export function ata(owner: PublicKey, mint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID);
}

export function createAtaIdempotentIx(params: {
  payer: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
}): TransactionInstruction {
  return createAssociatedTokenAccountIdempotentInstruction(
    params.payer,
    ata(params.owner, params.mint),
    params.owner,
    params.mint,
  );
}

export function buildWrapSolIxs(params: {
  owner: PublicKey;
  payer: PublicKey;
  lamports: bigint;
}): TransactionInstruction[] {
  const wsolAta = ata(params.owner, NATIVE_MINT);

  return [
    createAssociatedTokenAccountIdempotentInstruction(
      params.payer,
      wsolAta,
      params.owner,
      NATIVE_MINT,
    ),
    SystemProgram.transfer({
      fromPubkey: params.payer,
      toPubkey: wsolAta,
      lamports: Number(params.lamports),
    }),
    createSyncNativeInstruction(wsolAta),
  ];
}

export function buildCloseWsolIx(owner: PublicKey): TransactionInstruction {
  return createCloseAccountInstruction(ata(owner, NATIVE_MINT), owner, owner);
}

export async function printWalletSummary(connection: Connection, owner: PublicKey): Promise<void> {
  const sol = await connection.getBalance(owner, "confirmed");
  console.log(`wallet = ${owner.toBase58()}`);
  console.log(`SOL lamports = ${sol}`);
}
