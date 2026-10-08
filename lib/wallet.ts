// Zentos-style custodial wallet for each Google user, and a MemWal account the user's wallet owns.
//   first consent -> mint Ed25519 wallet + delegate key -> AES-GCM encrypt -> Postgres (keyed by user, i.e. Google sub)
//   -> sponsored create_account (sender = user, gas = revior-sponsor) -> sponsored add_delegate_key
// Users pay 0 SUI and see 0 popups. The sponsor only ever co-signs transactions built here, with two fixed
// Move targets (an allowlist by construction): it never signs a client-supplied transaction.
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { MemWal } from "@mysten-incubation/memwal";
import { generateDelegateKey } from "@mysten-incubation/memwal/account";
import { cfg } from "./config.js";
import { open, seal } from "./crypto.js";
import { sql } from "./db.js";

const REGISTRY = process.env.MEMWAL_REGISTRY_ID ?? "0x8bf82c9e09e36b8d1c38298f68b7cb68e7b8762887e7592add9986d5e9cf199f";
const CLOCK = "0x6";
let _sui: SuiGrpcClient | null = null;
const sui = () => (_sui ??= new SuiGrpcClient({ network: "mainnet", baseUrl: "https://fullnode.mainnet.sui.io:443" }));
const kp = (suiprivkey: string) => Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(suiprivkey).secretKey);
const sponsor = () => kp(process.env.SPONSOR_SUI_PRIVATE_KEY ?? (() => { throw new Error("missing env SPONSOR_SUI_PRIVATE_KEY"); })());

let _pkg: string | null = null;
async function packageId() {
  if (_pkg) return _pkg;
  const c: any = await (await fetch(`${cfg.memwal.url}/config`)).json();
  if (c.network !== "mainnet") throw new Error(`relayer is ${c.network}, expected mainnet`);
  return (_pkg = c.packageId as string);
}

// Sender = user, gas owner = sponsor; both sign the same bytes.
async function sponsored(user: Ed25519Keypair, build: (tx: Transaction, pkg: string) => void) {
  const tx = new Transaction();
  build(tx, await packageId());
  tx.setSender(user.toSuiAddress());
  tx.setGasOwner(sponsor().toSuiAddress());
  const bytes = await tx.build({ client: sui() });
  const [u, s] = await Promise.all([user.signTransaction(bytes), sponsor().signTransaction(bytes)]);
  const r: any = await sui().executeTransaction({ transaction: bytes, signatures: [u.signature, s.signature], include: { effects: true, objectTypes: true } });
  const t = r.Transaction ?? r.FailedTransaction ?? r;
  if (!t?.status?.success) throw new Error(`transaction ${t?.digest ?? "?"} failed: ${JSON.stringify(t?.status?.error ?? t?.status)}`);
  await sui().waitForTransaction({ digest: t.digest });
  return t;
}

export async function provisionWallet(userId: string) {
  const [w] = await sql`select * from user_wallets where user_id = ${userId}`;
  if (w?.status === "ready") return publicView(w);

  let wallet: Ed25519Keypair, delegate: { privateKey: string; publicKey: Uint8Array | string; suiAddress: string };
  if (w) {
    wallet = kp(open<string>(w.wallet_ct));
    const d = open<{ privateKey: string; publicKey: string }>(w.delegate_ct);
    delegate = { ...d, suiAddress: w.delegate_address };
  } else {
    wallet = Ed25519Keypair.generate();
    const d = await generateDelegateKey();
    delegate = { privateKey: d.privateKey, publicKey: Buffer.from(d.publicKey).toString("hex"), suiAddress: d.suiAddress };
    await sql`insert into user_wallets (user_id, address, wallet_ct, delegate_ct, delegate_address)
              values (${userId}, ${wallet.toSuiAddress()}, ${seal(wallet.getSecretKey())}, ${seal({ privateKey: d.privateKey, publicKey: delegate.publicKey })}, ${d.suiAddress})
              on conflict (user_id) do nothing`;
  }

  try {
    let accountId: string | null = w?.memwal_account_id ?? null;
    if (!accountId) {
      const t = await sponsored(wallet, (tx, pkg) => tx.moveCall({ target: `${pkg}::account::create_account`, arguments: [tx.object(REGISTRY), tx.object(CLOCK)] }));
      const types: Record<string, string> = t.objectTypes ?? {};
      accountId = Object.keys(types).find((id) => types[id].endsWith("::account::MemWalAccount")) ?? null;
      if (!accountId) throw new Error(`created no MemWalAccount (tx ${t.digest})`);
      await sql`update user_wallets set memwal_account_id = ${accountId}, create_digest = ${t.digest} where user_id = ${userId}`;
    }
    const pk = Buffer.from(String(delegate.publicKey), "hex");
    const t2 = await sponsored(wallet, (tx, pkg) =>
      tx.moveCall({ target: `${pkg}::account::add_delegate_key`, arguments: [tx.object(accountId!), tx.object(REGISTRY), tx.pure.vector("u8", Array.from(pk)), tx.pure.string("revior"), tx.object(CLOCK)] }),
    );
    const [ready] = await sql`update user_wallets set status = 'ready', delegate_digest = ${t2.digest}, last_error = null where user_id = ${userId} returning *`;
    return publicView(ready);
  } catch (e: any) {
    await sql`update user_wallets set status = 'failed', last_error = ${String(e?.message ?? e).slice(0, 500)} where user_id = ${userId}`;
    throw e;
  }
}

export function publicView(w: any) {
  return w ? { address: w.address, memwal_account_id: w.memwal_account_id, status: w.status, create_digest: w.create_digest, delegate_digest: w.delegate_digest, exported: !!w.exported_at } : null;
}

export async function walletFor(userId: string) {
  const [w] = await sql`select * from user_wallets where user_id = ${userId}`;
  return w ?? null;
}

// The user's own MemWal client: their delegate key, their account. Memories are owned by their wallet address.
const clients = new Map<string, MemWal>();
export async function memwalFor(userId: string): Promise<MemWal | null> {
  if (clients.has(userId)) return clients.get(userId)!;
  const w = await walletFor(userId);
  if (!w || w.status !== "ready") return null;
  const d = open<{ privateKey: string }>(w.delegate_ct);
  const c = MemWal.create({ key: d.privateKey, accountId: w.memwal_account_id, serverUrl: cfg.memwal.url });
  clients.set(userId, c);
  return c;
}

// Self-custody escape hatch: the user can take their wallet (and with it, ownership of their memory) anywhere.
export async function exportWallet(userId: string) {
  const w = await walletFor(userId);
  if (!w) throw new Error("no wallet yet");
  await sql`update user_wallets set exported_at = now() where user_id = ${userId}`;
  return { address: w.address, suiprivkey: open<string>(w.wallet_ct), memwal_account_id: w.memwal_account_id };
}
