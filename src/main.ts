import { Connection } from "@solana/web3.js";
import { config } from "./config/index.js";
import { executeArb } from "./arb/executor.js";
import { loadKeypair, printWalletSummary } from "./wallet/wallet.js";

async function main(): Promise<void> {
  console.log("inside main start");
  const connection = new Connection(config.rpcUrl, "confirmed");
  const wallet = loadKeypair({
    privateKeyBase58: config.privateKeyBase58,
    keypairPath: config.keypairPath,
  });

  await printWalletSummary(connection, wallet.publicKey);

  await executeArb({
    connection,
    wallet,
    pair: config.pair,
    inputSol: config.inputSol,
    slippageBps: config.slippageBps,
    sendTx: config.sendTx,
  });
}
console.log("before main()");
main().catch((err) => {
  console.error("\nFatal error:");
  console.error(err);
  process.exit(1);
});
console.log("after main()");
