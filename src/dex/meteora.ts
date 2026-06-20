import type { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { BuildSwapIxResult, QuoteResult } from "../types.js";
import { applySlippageBps } from "../utils/amount.js";

export interface BuildDlmmSellParams {
  connection: Connection;
  user: PublicKey;
  tokenMint: PublicKey;
  dlmmPair: PublicKey;
  inputTokenAmount: bigint;
  slippageBps: number;
}

export async function getDlmmSellQuote(params: BuildDlmmSellParams): Promise<QuoteResult> {
  void params;

  // TODO:
  // 1. 使用 @meteora-ag/dlmm 加载 DLMM pair
  // 2. 根据 inputTokenAmount 计算 Token -> SOL quote
  // 3. minOutAmount = expectedOutAmount 扣 slippage
  //
  // 注意：这里的 inputTokenAmount 来自 Pump quote 的 expectedOutAmount。
  const expectedOutAmount = 0n;

  return {
    dex: "meteora",
    inputAmount: params.inputTokenAmount,
    expectedOutAmount,
    minOutAmount: applySlippageBps(expectedOutAmount, params.slippageBps),
  };
}

export async function buildDlmmSellIxs(
  params: BuildDlmmSellParams,
): Promise<BuildSwapIxResult> {
  const quote = await getDlmmSellQuote(params);

  const instructions: TransactionInstruction[] = [];

  // TODO:
  // 在这里用 @meteora-ag/dlmm 构造 swap instruction。
  // 需要关注：
  // - lbPair
  // - reserveX / reserveY
  // - binArrayBitmapExtension
  // - oracle
  // - user token in/out ATA
  // - tokenX/tokenY mint
  // - active bin arrays
  // - amountIn / minAmountOut
  //
  // instructions.push(dlmmSellIx);

  return {
    dex: "meteora",
    quote,
    instructions,
  };
}
