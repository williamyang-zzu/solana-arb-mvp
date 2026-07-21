import { createRequire } from "node:module";
import type { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { ComputeBudgetProgram } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import type { BuildSwapIxResult, QuoteResult } from "../types.js";

interface DlmmSwapQuote {
  outAmount: BN;
  minOutAmount: BN;
  binArraysPubkey: PublicKey[];
}

interface DlmmPool {
  tokenX: { publicKey: PublicKey };
  tokenY: { publicKey: PublicKey };
  getBinArrayForSwap(swapForY: boolean): Promise<unknown[]>;
  swapQuote(
    inAmount: BN,
    swapForY: boolean,
    allowedSlippage: BN,
    binArrays: unknown[],
  ): DlmmSwapQuote;
  swap(params: {
    inToken: PublicKey;
    outToken: PublicKey;
    inAmount: BN;
    minOutAmount: BN;
    lbPair: PublicKey;
    user: PublicKey;
    binArraysPubkey: PublicKey[];
  }): Promise<Transaction>;
}

interface DlmmStatic {
  create(
    connection: Connection,
    dlmm: PublicKey,
    opt?: { skipSolWrappingOperation?: boolean },
  ): Promise<DlmmPool>;
}

type DlmmModule = {
  default?: DlmmStatic;
  create?: DlmmStatic["create"];
};

let dlmmPromise: Promise<DlmmStatic> | undefined;
const require = createRequire(import.meta.url);

async function loadDlmm(): Promise<DlmmStatic> {
  dlmmPromise ??= Promise.resolve().then(() => {
    const dlmmModule = require("@meteora-ag/dlmm") as DlmmModule;
    const dlmm = dlmmModule.default ?? dlmmModule;

    if (!dlmm.create) {
      throw new Error("Meteora DLMM SDK create() export not found");
    }

    return dlmm as DlmmStatic;
  });

  return dlmmPromise;
}

export interface BuildDlmmSellParams {
  connection: Connection;
  user: PublicKey;
  tokenMint: PublicKey;
  dlmmPair: PublicKey;
  inputTokenAmount: bigint;
  slippageBps: number;
}

function bnFromBigint(value: bigint): BN {
  return new BN(value.toString());
}

function bnToBigint(value: BN): bigint {
  return BigInt(value.toString());
}

async function getDlmmSellContext(params: BuildDlmmSellParams) {
  const DLMM = await loadDlmm();
  const dlmmPool = await DLMM.create(params.connection, params.dlmmPair, {
    skipSolWrappingOperation: true,
  });
  const tokenX = dlmmPool.tokenX.publicKey;
  const tokenY = dlmmPool.tokenY.publicKey;

  let swapForY: boolean;
  let inToken: PublicKey;
  let outToken: PublicKey;

  if (tokenX.equals(params.tokenMint) && tokenY.equals(NATIVE_MINT)) {
    swapForY = true;
    inToken = tokenX;
    outToken = tokenY;
  } else if (tokenY.equals(params.tokenMint) && tokenX.equals(NATIVE_MINT)) {
    swapForY = false;
    inToken = tokenY;
    outToken = tokenX;
  } else {
    throw new Error(
      `DLMM pair does not match token -> WSOL sell route. tokenX=${tokenX.toBase58()}, tokenY=${tokenY.toBase58()}, tokenMint=${params.tokenMint.toBase58()}`,
    );
  }

  return {
    dlmmPool,
    swapForY,
    inToken,
    outToken,
  };
}

function isSdkWrapperInstruction(ix: TransactionInstruction): boolean {
  return (
    ix.programId.equals(ComputeBudgetProgram.programId) ||
    ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)
  );
}

export async function getDlmmSellQuote(params: BuildDlmmSellParams): Promise<QuoteResult> {
  const { dlmmPool, swapForY } = await getDlmmSellContext(params);
  const binArrays = await dlmmPool.getBinArrayForSwap(swapForY);
  const quote = dlmmPool.swapQuote(
    bnFromBigint(params.inputTokenAmount),
    swapForY,
    new BN(params.slippageBps),
    binArrays,
  );

  const expectedOutAmount = bnToBigint(quote.outAmount);

  return {
    dex: "meteora",
    inputAmount: params.inputTokenAmount,
    expectedOutAmount,
    minOutAmount: bnToBigint(quote.minOutAmount),
  };
}

export async function buildDlmmSellIxs(
  params: BuildDlmmSellParams,
): Promise<BuildSwapIxResult> {
  const { dlmmPool, inToken, outToken, swapForY } =
    await getDlmmSellContext(params);
  const inAmount = bnFromBigint(params.inputTokenAmount);
  const binArrays = await dlmmPool.getBinArrayForSwap(swapForY);
  const swapQuote = dlmmPool.swapQuote(
    inAmount,
    swapForY,
    new BN(params.slippageBps),
    binArrays,
  );

  const expectedOutAmount = bnToBigint(swapQuote.outAmount);
  const quote: QuoteResult = {
    dex: "meteora",
    inputAmount: params.inputTokenAmount,
    expectedOutAmount,
    minOutAmount: bnToBigint(swapQuote.minOutAmount),
  };

  const swapTx = await dlmmPool.swap({
    inToken,
    outToken,
    inAmount,
    minOutAmount: swapQuote.minOutAmount,
    lbPair: params.dlmmPair,
    user: params.user,
    binArraysPubkey: swapQuote.binArraysPubkey,
  });

  const instructions: TransactionInstruction[] =
    swapTx.instructions.filter((ix) => !isSdkWrapperInstruction(ix));

  return {
    dex: "meteora",
    quote,
    instructions,
  };
}
