import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
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
  getTokenProgramIdForMint,
  ata,
} from "../wallet/wallet.js";

const METEORA_MAINNET_ALT = new PublicKey(
  "JA5F83HUK9L78Y12TRLCsJZbu3Tv8pCK1GfK8mVNp1sz",
);

export interface ExecuteArbParams {
  connection: Connection;
  wallet: Keypair;
  pair: TokenPairConfig;
  inputSol: number;
  slippageBps: number;
  addressLookupTables: PublicKey[];
  sendTx: boolean;
}

async function loadAddressLookupTables(
  connection: Connection,
  lookupTableAddresses: PublicKey[],
): Promise<AddressLookupTableAccount[]> {
  const uniqueAddresses = [
    ...new Map(
      lookupTableAddresses.map((address) => [address.toBase58(), address]),
    ).values(),
  ];

  const lookupTables = await Promise.all(
    uniqueAddresses.map(async (address) => {
      const table = await connection.getAddressLookupTable(address);
      if (!table.value) {
        throw new Error(`Address lookup table not found: ${address.toBase58()}`);
      }
      return table.value;
    }),
  );

  return lookupTables;
}

function explainVersionedTxSizeError(err: unknown): Error {
  if (err instanceof RangeError && err.message.includes("encoding overruns")) {
    return new Error(
      [
        "Versioned transaction is still too large after loading available ALTs.",
        "Meteora's public ALT is loaded automatically, but this Pump+Meteora atomic route also needs a custom route ALT containing Pump AMM and route-specific accounts.",
        "Create/extend a lookup table for this route, then set ADDRESS_LOOKUP_TABLES=<your_alt_address> in .env and rerun.",
      ].join(" "),
    );
  }

  return err instanceof Error ? err : new Error(String(err));
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

  const tokenProgramId = await getTokenProgramIdForMint(
    params.connection,
    params.pair.tokenMint,
  );

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
      tokenProgramId,
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
    inputTokenAmount: pump.quote.minOutAmount,
    slippageBps: params.slippageBps,
  });

  console.log("\n=== DLMM quote ===");
  console.log(dlmm.quote);

  printInstructions("setup", setupIxs);
  printInstructions("pump", pump.instructions);
  printInstructions("meteora", dlmm.instructions);

  const instructions = [
    ...setupIxs,
    ...pump.instructions,
    ...dlmm.instructions,
    buildCloseWsolIx(user),
  ];
  const latest = await params.connection.getLatestBlockhash("confirmed");
  const lookupTables = await loadAddressLookupTables(params.connection, [
    METEORA_MAINNET_ALT,
    ...params.addressLookupTables,
  ]);

  const message = new TransactionMessage({
    payerKey: user,
    recentBlockhash: latest.blockhash,
    instructions,
  }).compileToV0Message(lookupTables);

  const tx = new VersionedTransaction(message);
  try {
    tx.sign([params.wallet]);
  } catch (err) {
    throw explainVersionedTxSizeError(err);
  }

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
  const sig = await params.connection.sendTransaction(tx, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  await params.connection.confirmTransaction({
    signature: sig,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  });

  console.log(`signature = ${sig}`);
  console.log(`WSOL ATA = ${ata(user, NATIVE_MINT).toBase58()}`);
}
