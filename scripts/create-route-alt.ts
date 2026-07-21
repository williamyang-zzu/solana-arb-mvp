#!/usr/bin/env tsx
import "dotenv/config";
import {
  AddressLookupTableProgram,
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { config } from "../src/config/index.js";
import { buildPumpBuyIxs } from "../src/dex/pump.js";
import { buildDlmmSellIxs } from "../src/dex/meteora.js";
import { solToLamports } from "../src/utils/amount.js";
import {
  buildCloseWsolIx,
  buildWrapSolIxs,
  createAtaIdempotentIx,
  getTokenProgramIdForMint,
  loadKeypair,
} from "../src/wallet/wallet.js";

const METEORA_MAINNET_ALT = new PublicKey(
  "JA5F83HUK9L78Y12TRLCsJZbu3Tv8pCK1GfK8mVNp1sz",
);
const EXTEND_CHUNK_SIZE = 20;
const PUMP_SAMPLE_COUNT = Number(process.env.ALT_PUMP_SAMPLE_COUNT ?? "32");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addInstructionAddresses(
  addresses: Map<string, PublicKey>,
  instruction: TransactionInstruction,
): void {
  addresses.set(instruction.programId.toBase58(), instruction.programId);

  for (const key of instruction.keys) {
    if (!key.isSigner) {
      addresses.set(key.pubkey.toBase58(), key.pubkey);
    }
  }
}

async function collectRouteAddresses(params: {
  connection: Connection;
  user: PublicKey;
}): Promise<PublicKey[]> {
  const inputLamports = solToLamports(config.inputSol);
  const tokenProgramId = await getTokenProgramIdForMint(
    params.connection,
    config.pair.tokenMint,
  );
  const addresses = new Map<string, PublicKey>();

  const setupIxs = [
    ...buildWrapSolIxs({
      owner: params.user,
      payer: params.user,
      lamports: inputLamports,
    }),
    createAtaIdempotentIx({
      payer: params.user,
      owner: params.user,
      mint: config.pair.tokenMint,
      tokenProgramId,
    }),
  ];
  for (const ix of setupIxs) addInstructionAddresses(addresses, ix);

  let pumpMinOutAmount: bigint | undefined;
  const sampleCount = Math.max(1, PUMP_SAMPLE_COUNT);
  for (let i = 0; i < sampleCount; i += 1) {
    const pump = await buildPumpBuyIxs({
      connection: params.connection,
      user: params.user,
      tokenMint: config.pair.tokenMint,
      pumpPool: config.pair.pumpPool,
      inputLamports,
      slippageBps: config.slippageBps,
    });

    pumpMinOutAmount ??= pump.quote.minOutAmount;
    for (const ix of pump.instructions) addInstructionAddresses(addresses, ix);
  }

  if (pumpMinOutAmount === undefined) {
    throw new Error("Unable to build Pump instructions for ALT collection");
  }

  const dlmm = await buildDlmmSellIxs({
    connection: params.connection,
    user: params.user,
    tokenMint: config.pair.tokenMint,
    dlmmPair: config.pair.dlmmPair,
    inputTokenAmount: pumpMinOutAmount,
    slippageBps: config.slippageBps,
  });
  for (const ix of dlmm.instructions) addInstructionAddresses(addresses, ix);
  addInstructionAddresses(addresses, buildCloseWsolIx(params.user));

  addresses.delete(params.user.toBase58());
  addresses.delete(PublicKey.default.toBase58());
  addresses.delete(METEORA_MAINNET_ALT.toBase58());

  return [...addresses.values()];
}

async function waitForLookupTable(
  connection: Connection,
  lookupTable: PublicKey,
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const table = await connection.getAddressLookupTable(lookupTable);
    if (table.value) return;
    await sleep(1_000);
  }

  throw new Error(`Timed out waiting for ALT: ${lookupTable.toBase58()}`);
}

async function main(): Promise<void> {
  const connection = new Connection(config.rpcUrl, "confirmed");
  const wallet = loadKeypair({
    privateKeyBase58: config.privateKeyBase58,
    keypairPath: config.keypairPath,
  });
  const user = wallet.publicKey;

  console.log("wallet =", user.toBase58());
  console.log("route tokenMint =", config.pair.tokenMint.toBase58());
  console.log("route pumpPool  =", config.pair.pumpPool.toBase58());
  console.log("route dlmmPair  =", config.pair.dlmmPair.toBase58());
  console.log("pump samples =", Math.max(1, PUMP_SAMPLE_COUNT));

  const addresses = await collectRouteAddresses({ connection, user });
  console.log("collected route addresses =", addresses.length);

  const recentSlot = await connection.getSlot("finalized");
  const [createIx, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
    authority: user,
    payer: user,
    recentSlot,
  });

  console.log("creating ALT =", lookupTableAddress.toBase58());
  const createTx = new Transaction().add(createIx);
  const createSig = await sendAndConfirmTransaction(connection, createTx, [wallet], {
    commitment: "confirmed",
  });
  console.log("create signature =", createSig);

  await waitForLookupTable(connection, lookupTableAddress);

  for (let i = 0; i < addresses.length; i += EXTEND_CHUNK_SIZE) {
    const chunk = addresses.slice(i, i + EXTEND_CHUNK_SIZE);
    const extendIx = AddressLookupTableProgram.extendLookupTable({
      authority: user,
      payer: user,
      lookupTable: lookupTableAddress,
      addresses: chunk,
    });
    const extendTx = new Transaction().add(extendIx);
    const sig = await sendAndConfirmTransaction(connection, extendTx, [wallet], {
      commitment: "confirmed",
    });
    console.log(
      `extend ${i + 1}-${i + chunk.length}/${addresses.length} signature = ${sig}`,
    );
  }

  console.log("\nALT ready:");
  console.log(`ADDRESS_LOOKUP_TABLES=${lookupTableAddress.toBase58()}`);
  console.log(
    "\nPut that line in .env, wait a short moment for the lookup table to warm up, then rerun npm run dev.",
  );
  console.log(
    `Meteora public ALT ${METEORA_MAINNET_ALT.toBase58()} is still loaded automatically by executor.ts.`,
  );
}

main().catch((err) => {
  console.error("\nFatal error:");
  console.error(err);
  process.exit(1);
});
