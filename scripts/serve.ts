// Local server: same router and rewrites as Vercel.  pnpm dev  ->  http://localhost:3000
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import router from "../api/router.js";

const PORT = Number(process.env.PORT ?? 3000);
createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  let path: string | null = null;
  if (url.pathname === "/auth/google/start") path = "auth/start";
  else if (url.pathname === "/auth/google/callback") path = "auth/callback";
  else if (url.pathname.startsWith("/api/")) path = url.pathname.slice(5);
  if (path === null) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(readFileSync(new URL("../public/index.html", import.meta.url)));
  }
  let raw = "";
  for await (const c of req) raw += c;
  const query: Record<string, string> = Object.fromEntries(url.searchParams);
  query.path = path;
  const vreq = Object.assign(req, { query, body: raw ? JSON.parse(raw) : {} });
  const vres = Object.assign(res, {
    status(code: number) { res.statusCode = code; return vres; },
    json(o: unknown) { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); return vres; },
    redirect(code: number, loc: string) { res.writeHead(code, { location: loc }); res.end(); return vres; },
  });
  await router(vreq as any, vres as any);
}).listen(PORT, () => console.log(`Revoir on http://localhost:${PORT}`));
