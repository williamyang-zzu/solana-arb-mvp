import type { TransactionInstruction } from "@solana/web3.js";

export function printInstruction(label: string, ix: TransactionInstruction): void {
  console.log(`\n[${label}] programId = ${ix.programId.toBase58()}`);
  console.table(
    ix.keys.map((key, index) => ({
      index,
      pubkey: key.pubkey.toBase58(),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
  );
  console.log(`[${label}] data(hex) = ${Buffer.from(ix.data).toString("hex")}`);
}

export function printInstructions(label: string, ixs: TransactionInstruction[]): void {
  ixs.forEach((ix, index) => printInstruction(`${label}#${index}`, ix));
}
