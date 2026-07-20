#!/usr/bin/env tsx
import 'dotenv/config';
import { Connection, PublicKey } from '@solana/web3.js';

const sig = process.argv[2];
if (!sig) {
  console.error('Usage: tsx scripts/inspect-tx.ts <SIGNATURE>');
  process.exit(1);
}

const rpc = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const conn = new Connection(rpc, 'confirmed');

async function main() {
  const tx = await conn.getParsedTransaction(sig, 'confirmed');
  if (!tx) {
    console.error('Transaction not found');
    process.exit(2);
  }

  const meta = tx.meta;
  const msg = tx.transaction.message;

  console.log('signature =', sig);
  console.log('slot =', tx.slot);
  console.log('blockTime =', tx.blockTime);
  console.log('fee (meta.fee) =', meta?.fee ?? 'N/A');

  if (meta) {
    const pre = meta.preBalances ?? [];
    const post = meta.postBalances ?? [];
    const totalPre = pre.reduce((a, b) => a + BigInt(b), 0n);
    const totalPost = post.reduce((a, b) => a + BigInt(b), 0n);
    console.log('totalPre lamports =', totalPre.toString());
    console.log('totalPost lamports =', totalPost.toString());
    console.log('total delta (pre - post) lamports =', (totalPre - totalPost).toString());

    // payer is accountKeys[0]
    const payerKey = msg.accountKeys[0]?.toString();
    const payerPre = pre[0] ?? 0;
    const payerPost = post[0] ?? 0;
    console.log('payer =', payerKey);
    console.log('payer preBalance =', payerPre);
    console.log('payer postBalance =', payerPost);
    console.log('payer delta (pre - post) =', (BigInt(payerPre) - BigInt(payerPost)).toString());

    // find newly created accounts (pre === 0 && post > 0)
    const created: Array<{index:number; pubkey:string; post:number}> = [];
    for (let i = 0; i < (msg.accountKeys.length); i++) {
      const preB = pre[i] ?? 0;
      const postB = post[i] ?? 0;
      if (preB === 0 && postB > 0) {
        created.push({ index: i, pubkey: msg.accountKeys[i].toString(), post: postB });
      }
    }
    console.log('created accounts (pre===0 && post>0):', created);

    console.log('preTokenBalances:', JSON.stringify(meta.preTokenBalances ?? [], null, 2));
    console.log('postTokenBalances:', JSON.stringify(meta.postTokenBalances ?? [], null, 2));
    console.log('innerInstructions:', JSON.stringify(meta.innerInstructions ?? [], null, 2));
  }

  // print account keys
  console.log('accountKeys:');
  msg.accountKeys.forEach((k, i) => console.log(i, k.toString()));
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
