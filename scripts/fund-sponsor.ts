// Move SUI from the Revior owner wallet to the gas sponsor:  pnpm tsx scripts/fund-sponsor.ts 0.06
import { readFileSync } from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
const read = (p: string) => Object.fromEntries(readFileSync(p, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const owner = Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(read(".env.owner").OWNER_SUI_PRIVATE_KEY).secretKey);
const to = read(".env").SPONSOR_ADDRESS;
const mist = BigInt(Math.round(Number(process.argv[2] ?? "0.06") * 1e9));
const sui = new SuiGrpcClient({ network: "mainnet", baseUrl: "https://fullnode.mainnet.sui.io:443" });
const tx = new Transaction();
const [c] = tx.splitCoins(tx.gas, [mist]);
tx.transferObjects([c], to);
const r: any = await sui.signAndExecuteTransaction({ signer: owner, transaction: tx });
console.log("from", owner.toSuiAddress(), "to", to, "mist", String(mist), "digest", r.Transaction?.digest ?? r.digest);
