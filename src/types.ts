import type { PublicKey, TransactionInstruction } from "@solana/web3.js";

export type DexSide = "pump" | "meteora";

export interface QuoteResult {
  dex: DexSide;
  inputAmount: bigint;
  expectedOutAmount: bigint;
  minOutAmount: bigint;
}

export interface BuildSwapIxResult {
  dex: DexSide;
  quote: QuoteResult;
  instructions: TransactionInstruction[];
}

export interface TokenPairConfig {
  tokenMint: PublicKey;
  pumpPool: PublicKey;
  dlmmPair: PublicKey;
}
