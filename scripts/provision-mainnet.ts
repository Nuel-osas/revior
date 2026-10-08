// One-time: create Revior's dedicated MemWal account on Mainnet and register the app's delegate key.
// Reads the owner key from .env.owner (never deployed); writes MEMWAL_ACCOUNT_ID + MEMWAL_DELEGATE_KEY into .env.
import { readFileSync, writeFileSync } from "node:fs";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { addDelegateKey, createAccount, generateDelegateKey } from "@mysten-incubation/memwal/account";

const read = (p: string) => Object.fromEntries(readFileSync(p, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const owner = read(".env.owner");
const env = read(".env");
if (env.MEMWAL_ACCOUNT_ID) throw new Error("MEMWAL_ACCOUNT_ID already set; refusing to create a second account");

const cfg: any = await (await fetch("https://relayer.memory.walrus.xyz/config")).json();
if (cfg.network !== "mainnet") throw new Error(`relayer reports ${cfg.network}`);
const sui = new SuiGrpcClient({ network: "mainnet", baseUrl: "https://fullnode.mainnet.sui.io:443" });
const base = {
  packageId: cfg.packageId,
  registryId: "0x8bf82c9e09e36b8d1c38298f68b7cb68e7b8762887e7592add9986d5e9cf199f",
  suiPrivateKey: owner.OWNER_SUI_PRIVATE_KEY,
  suiNetwork: "mainnet",
  suiClient: sui,
} as const;

const acct = await createAccount({ ...base });
console.log(`account ${acct.accountId} (tx ${acct.digest})`);
const d = await generateDelegateKey();
const add = await addDelegateKey({ ...base, accountId: acct.accountId, publicKey: d.publicKey, label: "revior-app" });
console.log(`delegate ${d.suiAddress} (tx ${add.digest})`);

let text = readFileSync(".env", "utf8");
text = text.replace(/^MEMWAL_ACCOUNT_ID=.*$/m, `MEMWAL_ACCOUNT_ID=${acct.accountId}`).replace(/^MEMWAL_DELEGATE_KEY=.*$/m, `MEMWAL_DELEGATE_KEY=${d.privateKey}`);
writeFileSync(".env", text, { mode: 0o600 });
console.log("saved to .env");
