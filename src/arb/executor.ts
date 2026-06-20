import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import type { TokenPairConfig } from "../types.js";
import { buildPumpBuyIxs } from "../dex/pump.js";
import { buildDlmmSellIxs } from "../dex/meteora.js";
import { solToLamports } from "../utils/amount.js";
import { printInstructions } from "../utils/log.js";
import {
  buildCloseWsolIx,
  buildWrapSolIxs,
  createAtaIdempotentIx,
  ata,
} from "../wallet/wallet.js";

export interface ExecuteArbParams {
  connection: Connection;
  wallet: Keypair;
  pair: TokenPairConfig;
  inputSol: number;
  slippageBps: number;
  sendTx: boolean;
}

export async function executeArb(params: ExecuteArbParams): Promise<void> {
  const user = params.wallet.publicKey;
  const inputLamports = solToLamports(params.inputSol);

  console.log("\n=== MVP params ===");
  console.log(`tokenMint = ${params.pair.tokenMint.toBase58()}`);
  console.log(`pumpPool  = ${params.pair.pumpPool.toBase58()}`);
  console.log(`dlmmPair  = ${params.pair.dlmmPair.toBase58()}`);
  console.log(`inputSOL  = ${params.inputSol}`);
  console.log(`slippage  = ${params.slippageBps} bps`);

  const setupIxs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }),
    ...buildWrapSolIxs({
      owner: user,
      payer: user,
      lamports: inputLamports,
    }),
    createAtaIdempotentIx({
      payer: user,
      owner: user,
      mint: params.pair.tokenMint,
    }),
  ];

  const pump = await buildPumpBuyIxs({
    connection: params.connection,
    user,
    tokenMint: params.pair.tokenMint,
    pumpPool: params.pair.pumpPool,
    inputLamports,
    slippageBps: params.slippageBps,
  });

  console.log("\n=== Pump quote ===");
  console.log(pump.quote);

  const dlmm = await buildDlmmSellIxs({
    connection: params.connection,
    user,
    tokenMint: params.pair.tokenMint,
    dlmmPair: params.pair.dlmmPair,
    inputTokenAmount: pump.quote.expectedOutAmount,
    slippageBps: params.slippageBps,
  });

  console.log("\n=== DLMM quote ===");
  console.log(dlmm.quote);

  printInstructions("setup", setupIxs);
  printInstructions("pump", pump.instructions);
  printInstructions("meteora", dlmm.instructions);

  const tx = new Transaction();
  tx.add(
    ...setupIxs,
    ...pump.instructions,
    ...dlmm.instructions,
    buildCloseWsolIx(user),
  );

  tx.feePayer = user;
  const latest = await params.connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latest.blockhash;
  tx.sign(params.wallet);

  console.log("\n=== Simulating transaction ===");
  const sim = await params.connection.simulateTransaction(tx);
  console.log("err =", JSON.stringify(sim.value.err));
  console.log("unitsConsumed =", sim.value.unitsConsumed);
  console.log("logs =");
  console.log(sim.value.logs?.join("\n"));

  if (sim.value.err) {
    throw new Error("Simulation failed. Fill Pump/Meteora TODOs or inspect logs above.");
  }

  if (!params.sendTx) {
    console.log("\nSEND_TX=false, simulation passed but transaction was not sent.");
    return;
  }

  console.log("\n=== Sending transaction ===");
  const sig = await sendAndConfirmTransaction(params.connection, tx, [params.wallet], {
    commitment: "confirmed",
  });

  console.log(`signature = ${sig}`);
  console.log(`WSOL ATA = ${ata(user, NATIVE_MINT).toBase58()}`);
}
