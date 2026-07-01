import "dotenv/config";
import { PublicKey } from "@solana/web3.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value.trim();
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function boolEnv(name: string, defaultValue: boolean): boolean {
  const value = optional(name);
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === "true";
}

function numberEnv(name: string, defaultValue: number): number {
  const value = optional(name);
  if (value === undefined) return defaultValue;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number env ${name}: ${value}`);
  }
  return parsed;
}

export const config = {
  rpcUrl: required("RPC_URL"),
  privateKeyBase58: optional("PRIVATE_KEY_BASE58"),
  keypairPath: optional("KEYPAIR_PATH"),

  pair: {
    tokenMint: new PublicKey(required("TOKEN_MINT")),
    pumpPool: new PublicKey(required("PUMP_POOL")),
    dlmmPair: new PublicKey(required("DLMM_PAIR")),
  },

  inputSol: numberEnv("INPUT_SOL", 0.0001),
  slippageBps: numberEnv("SLIPPAGE_BPS", 300),
  sendTx: boolEnv("SEND_TX", false),
};
