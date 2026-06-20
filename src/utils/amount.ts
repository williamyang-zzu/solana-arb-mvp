import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export function solToLamports(sol: number): bigint {
  return BigInt(Math.floor(sol * LAMPORTS_PER_SOL));
}

export function applySlippageBps(amount: bigint, slippageBps: number): bigint {
  if (slippageBps < 0 || slippageBps > 10_000) {
    throw new Error(`Invalid slippage bps: ${slippageBps}`);
  }
  return (amount * BigInt(10_000 - slippageBps)) / 10_000n;
}

export function bigintToString(value: bigint): string {
  return value.toString();
}
