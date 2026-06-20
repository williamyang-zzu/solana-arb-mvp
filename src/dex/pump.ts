import type { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { BuildSwapIxResult, QuoteResult } from "../types.js";
import { applySlippageBps } from "../utils/amount.js";

export interface BuildPumpBuyParams {
  connection: Connection;
  user: PublicKey;
  tokenMint: PublicKey;
  pumpPool: PublicKey;
  inputLamports: bigint;
  slippageBps: number;
}

export async function getPumpBuyQuote(params: BuildPumpBuyParams): Promise<QuoteResult> {
  void params;

  // TODO:
  // 1. 读取 Pumpfun AMM pool account
  // 2. 根据 pool reserve / fee 计算 SOL -> Token 的 expectedOutAmount
  // 3. minOutAmount = expectedOutAmount 扣 slippage
  //
  // 先返回假值，让主流程可以跑到 TODO 位置。
  const expectedOutAmount = 0n;

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
  const quote = await getPumpBuyQuote(params);

  const instructions: TransactionInstruction[] = [];

  // TODO:
  // 在这里构造 Pumpfun AMM buy/swap instruction。
  // 这一步最终应该填入：
  // - pool/globalConfig
  // - user quote token account，通常是 WSOL ATA
  // - user base token ATA
  // - pool base/quote vault
  // - protocol fee / event authority 等 Pump AMM 要求账户
  // - amount / minOut / maxIn 等 instruction data
  //
  // instructions.push(pumpBuyIx);

  return {
    dex: "pump",
    quote,
    instructions,
  };
}
