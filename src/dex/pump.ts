import { TransactionInstruction } from "@solana/web3.js";
import type { Connection, PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import type * as PumpSwapSdk from "@pump-fun/pump-swap-sdk";
import type { BuildSwapIxResult, QuoteResult } from "../types.js";
import { applySlippageBps } from "../utils/amount.js";

type PumpSwapModule = typeof PumpSwapSdk & {
  default?: Partial<typeof PumpSwapSdk>;
};

let pumpSwapSdkPromise: Promise<typeof PumpSwapSdk> | undefined;

async function loadPumpSwapSdk(): Promise<typeof PumpSwapSdk> {
  pumpSwapSdkPromise ??= import("@pump-fun/pump-swap-sdk").then((mod) => {
    const sdk = mod as PumpSwapModule;
    return { ...sdk.default, ...sdk } as typeof PumpSwapSdk;
  });

  return pumpSwapSdkPromise;
}

export interface BuildPumpBuyParams {
  connection: Connection;
  user: PublicKey;
  tokenMint: PublicKey;
  pumpPool: PublicKey;
  inputLamports: bigint;
  slippageBps: number;
}

function bnFromBigint(value: bigint): BN {
  return new BN(value.toString());
}

function bnToBigint(value: BN): bigint {
  return BigInt(value.toString());
}

function slippageBpsToPercent(slippageBps: number): number {
  return slippageBps / 100;
}

function encodeU64(value: BN): Buffer {
  return value.toArrayLike(Buffer, "le", 8);
}

function encodeBuyExactQuoteInData(params: {
  spendableQuoteIn: BN;
  minBaseAmountOut: BN;
  trackVolume: boolean;
}): Buffer {
  return Buffer.concat([
    Buffer.from([198, 46, 21, 82, 180, 217, 232, 112]),
    encodeU64(params.spendableQuoteIn),
    encodeU64(params.minBaseAmountOut),
    Buffer.from([params.trackVolume ? 1 : 0]),
  ]);
}

async function getPumpSwapState(params: BuildPumpBuyParams) {
  const { OnlinePumpAmmSdk } = await loadPumpSwapSdk();
  const sdk = new OnlinePumpAmmSdk(params.connection);
  const swapState = await sdk.swapSolanaState(params.pumpPool, params.user);

  if (!swapState.baseMint.equals(params.tokenMint)) {
    throw new Error(
      `Pump pool base mint mismatch: expected ${params.tokenMint.toBase58()}, got ${swapState.baseMint.toBase58()}`,
    );
  }

  if (!swapState.pool.quoteMint.equals(NATIVE_MINT)) {
    throw new Error(
      `Pump pool quote mint is not WSOL: ${swapState.pool.quoteMint.toBase58()}`,
    );
  }

  return swapState;
}

export async function getPumpBuyQuote(params: BuildPumpBuyParams): Promise<QuoteResult> {
  const { buyQuoteInput } = await loadPumpSwapSdk();
  const swapState = await getPumpSwapState(params);
  const quote = buyQuoteInput({
    quote: bnFromBigint(params.inputLamports),
    slippage: slippageBpsToPercent(params.slippageBps),
    baseReserve: swapState.poolBaseAmount,
    quoteReserve: swapState.poolQuoteAmount,
    virtualQuoteReserves: swapState.pool.virtualQuoteReserves,
    globalConfig: swapState.globalConfig,
    baseMintAccount: swapState.baseMintAccount,
    baseMint: swapState.baseMint,
    coinCreator: swapState.pool.coinCreator,
    creator: swapState.pool.creator,
    feeConfig: swapState.feeConfig,
  });

  const expectedOutAmount = bnToBigint(quote.base);

  return {
    dex: "pump",
    inputAmount: params.inputLamports,
    expectedOutAmount,
    minOutAmount: applySlippageBps(expectedOutAmount, params.slippageBps),
  };
}

export async function buildPumpBuyIxs(
  params: BuildPumpBuyParams,
): Promise<BuildSwapIxResult> {
  const { PUMP_AMM_PROGRAM_ID, PUMP_AMM_SDK, buyQuoteInput } =
    await loadPumpSwapSdk();
  const swapState = await getPumpSwapState(params);
  const sdkQuote = buyQuoteInput({
    quote: bnFromBigint(params.inputLamports),
    slippage: slippageBpsToPercent(params.slippageBps),
    baseReserve: swapState.poolBaseAmount,
    quoteReserve: swapState.poolQuoteAmount,
    virtualQuoteReserves: swapState.pool.virtualQuoteReserves,
    globalConfig: swapState.globalConfig,
    baseMintAccount: swapState.baseMintAccount,
    baseMint: swapState.baseMint,
    coinCreator: swapState.pool.coinCreator,
    creator: swapState.pool.creator,
    feeConfig: swapState.feeConfig,
  });

  const expectedOutAmount = bnToBigint(sdkQuote.base);
  const quote: QuoteResult = {
    dex: "pump",
    inputAmount: params.inputLamports,
    expectedOutAmount,
    minOutAmount: applySlippageBps(expectedOutAmount, params.slippageBps),
  };

  const templateInstructions = await PUMP_AMM_SDK.buyInstructions(
    swapState,
    sdkQuote.base,
    sdkQuote.maxQuote,
  );
  const buyTemplateIx = templateInstructions.find(
    (ix) => ix.programId.equals(PUMP_AMM_PROGRAM_ID) && ix.data.length > 8,
  );

  if (!buyTemplateIx) {
    throw new Error("Pump AMM buy instruction not found in SDK template");
  }

  const buyExactQuoteInData = encodeBuyExactQuoteInData({
    spendableQuoteIn: bnFromBigint(params.inputLamports),
    minBaseAmountOut: bnFromBigint(quote.minOutAmount),
    trackVolume: true,
  });

  const instructions = [
    new TransactionInstruction({
      programId: buyTemplateIx.programId,
      keys: buyTemplateIx.keys,
      data: buyExactQuoteInData,
    }),
  ];

  return {
    dex: "pump",
    quote,
    instructions,
  };
}
