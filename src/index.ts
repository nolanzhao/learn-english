import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { drizzle } from "drizzle-orm/d1";
import { and, eq } from "drizzle-orm";
import { createAuth, enabledProviders } from "./auth";
import type { Env } from "./env";
import * as app from "./db/app-schema";

type Vars = { userId: string | null; user: any };
const api = new Hono<{ Bindings: Env; Variables: Vars }>();

/* ---------- 认证 (Better Auth 接管 /api/auth/*) ---------- */
api.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));
api.get("/api/auth-config", (c) => c.json({ providers: enabledProviders(c.env), email: !!c.env.RESEND_API_KEY, appName: c.env.APP_NAME }));

/* 会话 → c.var.userId */
api.use("/api/*", async (c, next) => {
  if (c.req.path.startsWith("/api/auth")) return next();
  const s = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  c.set("userId", s?.user?.id ?? null); c.set("user", s?.user ?? null);
  await next();
});
api.get("/api/me", (c) => c.json({ user: c.var.user ? { id: c.var.user.id, email: c.var.user.email, name: c.var.user.name, image: c.var.user.image } : null }));

const requireUser = (c: any) => { if (!c.var.userId) throw new HTTPException(401, { message: "未登录" }); return c.var.userId as string; };
const badReq = (msg: string) => new HTTPException(400, { message: msg });
const key = (deck: string, idx: number) => `${deck}:${idx}`;
const validDeck = (d: unknown): d is string => typeof d === "string" && /^[a-z0-9_-]{1,64}$/i.test(d);

/* ---------- 进度快照: 与页面内存结构同形 {rec, fav, daily, ui} ---------- */
api.get("/api/progress", async (c) => {
  const uid = requireUser(c); const db = drizzle(c.env.DB);
  const [rows, favs, days, pref] = await Promise.all([
    db.select().from(app.progress).where(eq(app.progress.userId, uid)),
    db.select().from(app.favorite).where(eq(app.favorite.userId, uid)),
    db.select().from(app.daily).where(eq(app.daily.userId, uid)),
    db.select().from(app.userPref).where(eq(app.userPref.userId, uid)).get(),
  ]);
  const rec: Record<string, any> = {}; for (const r of rows) rec[key(r.deck, r.idx)] = { c: r.c, w: r.w, streak: r.streak, last: r.last };
  const fav: Record<string, boolean> = {}; for (const f of favs) fav[key(f.deck, f.idx)] = true;
  const daily: Record<string, any> = {}; for (const d of days) daily[d.day] = { n: d.n, c: d.c };
  let ui = {}; try { ui = JSON.parse(pref?.ui || "{}"); } catch {}
  return c.json({ rec, fav, daily, ui });
});

/* ---------- 事件流: [{deck, idx, ok, ts, day}] ---------- */
api.post("/api/progress/events", async (c) => {
  const uid = requireUser(c);
  const body = await c.req.json().catch(() => null);
  const events: any[] = Array.isArray(body?.events) ? body.events : [];
  if (!events.length) return c.json({ ok: true, applied: 0 });
  if (events.length > 500) throw badReq("一次最多 500 条");
  const D = c.env.DB; let applied = 0;
  const upsert = D.prepare(`INSERT INTO progress (user_id, deck, idx, c, w, streak, last) VALUES (?1, ?2, ?3, ?4, ?5, ?4, ?6)
      ON CONFLICT(user_id, deck, idx) DO UPDATE SET c = c + ?4, w = w + ?5, streak = CASE WHEN ?4 = 1 THEN streak + 1 ELSE 0 END, last = ?6 WHERE last < ?6`);
  const bump = D.prepare(`INSERT INTO daily (user_id, day, n, c) VALUES (?1, ?2, 1, ?3) ON CONFLICT(user_id, day) DO UPDATE SET n = n + 1, c = c + ?3`);
  const stmts: D1PreparedStatement[] = [];
  for (const e of events) {
    if (!validDeck(e.deck) || !Number.isInteger(e.idx) || e.idx < 0 || typeof e.ts !== "number") continue;
    const ok = e.ok ? 1 : 0, day = typeof e.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.day) ? e.day : new Date(e.ts).toISOString().slice(0, 10);
    // 同一时间戳的重复事件(网络重发)不重复计数: last >= ts 时跳过
    stmts.push(upsert.bind(uid, e.deck, e.idx, ok, 1 - ok, e.ts), bump.bind(uid, day, ok));
    applied++;
  }
  if (stmts.length) await D.batch(stmts);   // 同一事务
  return c.json({ ok: true, applied });
});

api.post("/api/progress/fav", async (c) => {
  const uid = requireUser(c); const b = await c.req.json().catch(() => ({}));
  if (!validDeck(b.deck) || !Number.isInteger(b.idx)) throw badReq("参数不对");
  const db = drizzle(c.env.DB);
  if (b.on) await db.insert(app.favorite).values({ userId: uid, deck: b.deck, idx: b.idx, createdAt: Date.now() }).onConflictDoNothing();
  else await db.delete(app.favorite).where(and(eq(app.favorite.userId, uid), eq(app.favorite.deck, b.deck), eq(app.favorite.idx, b.idx)));
  return c.json({ ok: true });
});

api.put("/api/progress/ui", async (c) => {
  const uid = requireUser(c); const b = await c.req.json().catch(() => null);
  if (!b || typeof b.ui !== "object") throw badReq("参数不对");
  const ui = JSON.stringify(b.ui); if (ui.length > 200_000) throw badReq("ui 太大");
  const db = drizzle(c.env.DB);
  await db.insert(app.userPref).values({ userId: uid, ui, updatedAt: Date.now() }).onConflictDoUpdate({ target: app.userPref.userId, set: { ui, updatedAt: Date.now() } });
  return c.json({ ok: true });
});

api.delete("/api/progress/deck/:deck", async (c) => {
  const uid = requireUser(c); const deck = c.req.param("deck"); if (!validDeck(deck)) throw badReq("参数不对");
  await drizzle(c.env.DB).delete(app.progress).where(and(eq(app.progress.userId, uid), eq(app.progress.deck, deck)));
  return c.json({ ok: true });
});

/* 一次性导入本地 progress.json(或浏览器缓存): 同条目取次数大的那份 */
api.post("/api/progress/import", async (c) => {
  const uid = requireUser(c); const b = await c.req.json().catch(() => null);
  if (!b || typeof b.rec !== "object") throw badReq("格式不对");
  const D = c.env.DB; const stmts: D1PreparedStatement[] = []; let n = 0;
  const up = D.prepare(`INSERT INTO progress (user_id, deck, idx, c, w, streak, last) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      ON CONFLICT(user_id, deck, idx) DO UPDATE SET c = MAX(c, ?4), w = MAX(w, ?5), streak = CASE WHEN ?7 > last THEN ?6 ELSE streak END, last = MAX(last, ?7)`);
  const fv = D.prepare(`INSERT OR IGNORE INTO favorite (user_id, deck, idx, created_at) VALUES (?1, ?2, ?3, ?4)`);
  const dy = D.prepare(`INSERT INTO daily (user_id, day, n, c) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(user_id, day) DO UPDATE SET n = MAX(n, ?3), c = MAX(c, ?4)`);
  for (const [k, v] of Object.entries<any>(b.rec)) {
    const m = /^([a-z0-9_-]+):(\d+)$/i.exec(k); if (!m || !v) continue;
    stmts.push(up.bind(uid, m[1], +m[2], +v.c || 0, +v.w || 0, +v.streak || 0, +v.last || 0)); n++;
  }
  for (const k of Object.keys(b.fav || {})) { const m = /^([a-z0-9_-]+):(\d+)$/i.exec(k); if (m && b.fav[k]) stmts.push(fv.bind(uid, m[1], +m[2], Date.now())); }
  for (const [day, d] of Object.entries<any>(b.daily || {})) if (/^\d{4}-\d{2}-\d{2}$/.test(day)) stmts.push(dy.bind(uid, day, +d.n || 0, +d.c || 0));
  for (let i = 0; i < stmts.length; i += 100) await D.batch(stmts.slice(i, i + 100));
  return c.json({ ok: true, items: n });
});

api.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: (err as Error).message || "server error" }, 500);
});
api.notFound((c) => c.json({ error: "not found" }, 404));

export default {
  fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return api.fetch(req, env, ctx);
    return env.ASSETS.fetch(req);   // 页面与词库都是静态资源
  },
};
