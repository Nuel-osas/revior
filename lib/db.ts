import { neon } from "@neondatabase/serverless";
import { cfg } from "./config.js";
let _sql: ReturnType<typeof neon> | null = null;
export const sql = (...args: Parameters<ReturnType<typeof neon>>) => (_sql ??= neon(cfg.db))(...args) as Promise<any[]>;
