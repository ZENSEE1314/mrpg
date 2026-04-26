import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db, getConfig, setConfig, type QuestRow } from "./db.js";
import { verifyToken } from "./auth.js";
import { DEFAULT_GAME_CONFIG, type GameConfig, ITEMS } from "@aetheria/shared";

interface AdminRequest extends Request {
  adminId?: string;
}

function requireAdmin(req: AdminRequest, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  const token = auth?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    res.status(401).json({ error: "Missing token" });
    return;
  }
  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  const row = db
    .prepare("SELECT is_admin FROM users WHERE id = ?")
    .get(decoded.uid) as { is_admin: number } | undefined;
  if (!row || row.is_admin !== 1) {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  req.adminId = decoded.uid;
  next();
}

export const adminRouter = Router();

adminRouter.use(requireAdmin);

// --- game config ---
adminRouter.get("/config", (_req, res) => {
  const cfg = getConfig<GameConfig>("gameConfig", DEFAULT_GAME_CONFIG);
  res.json({ config: cfg, defaults: DEFAULT_GAME_CONFIG });
});

const configSchema = z.object({
  initialPoints: z.number().int().min(0).max(500).optional(),
  pointsPerLevel: z.number().int().min(0).max(50).optional(),
  statCostBracketSize: z.number().int().min(1).max(50).optional(),
  statCostBase: z.number().int().min(1).max(20).optional(),
  xpBase: z.number().min(1).max(10000).optional(),
  xpExp: z.number().min(1).max(4).optional(),
});

adminRouter.post("/config", (req, res) => {
  const parsed = configSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Bad config" });
    return;
  }
  const current = getConfig<GameConfig>("gameConfig", DEFAULT_GAME_CONFIG);
  const next: GameConfig = { ...current, ...parsed.data };
  setConfig("gameConfig", next);
  res.json({ config: next });
});

// --- shop item price overrides ---
adminRouter.get("/shop", (_req, res) => {
  const overrides = getConfig<Record<string, { buyPrice?: number; sellPrice?: number }>>(
    "shopOverrides",
    {},
  );
  const items = Object.values(ITEMS).map((item) => {
    const override = overrides[item.id] ?? {};
    return {
      id: item.id,
      name: item.name,
      slot: item.slot,
      rarity: item.rarity,
      defaultBuyPrice: item.buyPrice,
      defaultSellPrice: item.sellPrice,
      buyPrice: override.buyPrice ?? item.buyPrice,
      sellPrice: override.sellPrice ?? item.sellPrice,
    };
  });
  res.json({ items, overrides });
});

const shopUpdateSchema = z.object({
  id: z.string(),
  buyPrice: z.number().int().min(0).optional(),
  sellPrice: z.number().int().min(0).optional(),
});

adminRouter.post("/shop", (req, res) => {
  const parsed = shopUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Bad payload" });
    return;
  }
  if (!ITEMS[parsed.data.id]) {
    res.status(404).json({ error: "Unknown item" });
    return;
  }
  const overrides = getConfig<Record<string, { buyPrice?: number; sellPrice?: number }>>(
    "shopOverrides",
    {},
  );
  const next = { ...overrides };
  next[parsed.data.id] = {
    ...(next[parsed.data.id] ?? {}),
    ...(parsed.data.buyPrice !== undefined ? { buyPrice: parsed.data.buyPrice } : {}),
    ...(parsed.data.sellPrice !== undefined ? { sellPrice: parsed.data.sellPrice } : {}),
  };
  setConfig("shopOverrides", next);
  res.json({ overrides: next });
});

// --- quests ---
adminRouter.get("/quests", (_req, res) => {
  const rows = db
    .prepare("SELECT * FROM quests ORDER BY created_at DESC")
    .all() as QuestRow[];
  res.json({
    quests: rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      objective: r.objective_json ? JSON.parse(r.objective_json) : {},
      reward: r.reward_json ? JSON.parse(r.reward_json) : {},
      isActive: r.is_active === 1,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

const questCreateSchema = z.object({
  title: z.string().min(2).max(80),
  description: z.string().min(2).max(500),
  objective: z
    .object({
      kind: z.enum(["kill", "collect", "visit"]).optional(),
      target: z.string().optional(),
      count: z.number().int().min(1).max(999).optional(),
    })
    .optional(),
  reward: z
    .object({
      xp: z.number().int().min(0).optional(),
      gold: z.number().int().min(0).optional(),
      itemId: z.string().optional(),
      itemQty: z.number().int().min(1).optional(),
    })
    .optional(),
  isActive: z.boolean().optional(),
});

adminRouter.post("/quests", (req, res) => {
  const parsed = questCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Bad quest" });
    return;
  }
  const id = nanoid(12);
  const now = Date.now();
  db.prepare(
    `INSERT INTO quests (id, title, description, objective_json, reward_json, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    parsed.data.title,
    parsed.data.description,
    JSON.stringify(parsed.data.objective ?? {}),
    JSON.stringify(parsed.data.reward ?? {}),
    parsed.data.isActive === false ? 0 : 1,
    now,
    now,
  );
  res.json({ id });
});

const questUpdateSchema = questCreateSchema.partial();

adminRouter.patch("/quests/:id", (req, res) => {
  const parsed = questUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Bad payload" });
    return;
  }
  const existing = db.prepare("SELECT * FROM quests WHERE id = ?").get(req.params.id) as QuestRow | undefined;
  if (!existing) {
    res.status(404).json({ error: "Quest not found" });
    return;
  }
  const now = Date.now();
  db.prepare(
    `UPDATE quests SET title = ?, description = ?, objective_json = ?, reward_json = ?, is_active = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    parsed.data.title ?? existing.title,
    parsed.data.description ?? existing.description,
    JSON.stringify(parsed.data.objective ?? JSON.parse(existing.objective_json)),
    JSON.stringify(parsed.data.reward ?? JSON.parse(existing.reward_json)),
    parsed.data.isActive === undefined ? existing.is_active : parsed.data.isActive ? 1 : 0,
    now,
    req.params.id,
  );
  res.json({ ok: true });
});

adminRouter.delete("/quests/:id", (req, res) => {
  const result = db.prepare("DELETE FROM quests WHERE id = ?").run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});
