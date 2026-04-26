import express from "express";
import cors from "cors";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { Server } from "socket.io";
import { z } from "zod";
import { config } from "./config.js";
import { authRouter, verifyToken } from "./auth.js";
import { db } from "./db.js";
import { World } from "./game/world.js";
import { AgentService } from "./game/agent.js";
import { ITEMS, SHOP_INVENTORY, ZONES, type ZoneId } from "@aetheria/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors({ origin: config.corsOrigin === "*" ? true : config.corsOrigin }));
app.use(express.json({ limit: "32kb" }));

app.use("/api/auth", authRouter);

app.get("/api/shop", (_req, res) => {
  res.json({
    items: SHOP_INVENTORY.map((id) => ITEMS[id]).filter(Boolean),
  });
});

app.get("/api/zones", (_req, res) => {
  res.json({ zones: ZONES });
});

app.get("/api/health", (_req, res) => res.json({ ok: true, time: Date.now() }));

if (config.serveClient) {
  const distPath = path.resolve(__dirname, config.clientDistPath);
  if (existsSync(distPath)) {
    console.log(`[aetheria] serving static client from ${distPath}`);
    app.use(express.static(distPath, { maxAge: "1h", index: false }));
    app.get(/^\/(?!api|socket\.io).*/, (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    console.warn(`[aetheria] CLIENT_DIST_PATH not found at ${distPath} — skipping static`);
  }
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.corsOrigin === "*" ? true : config.corsOrigin,
    credentials: true,
  },
});

const broadcast = (zone: ZoneId, event: string, payload: unknown) => {
  io.to(`zone:${zone}`).emit(event, payload);
};
const direct = (socketId: string, event: string, payload: unknown) => {
  io.to(socketId).emit(event, payload);
};

const world = new World(broadcast, direct);
const agents = new AgentService();

const authSchema = z.object({ token: z.string(), characterId: z.string() });
const moveSchema = z.object({ pos: z.object({ x: z.number(), y: z.number() }), facing: z.number() });
const attackSchema = z.object({ targetId: z.string() });
const skillSchema = z.object({ skillId: z.string(), targetId: z.string().optional() });
const itemSchema = z.object({ itemId: z.string() });
const travelSchema = z.object({ zone: z.enum(["town", "meadow", "forest", "crypt", "house"]) });
const chatSchema = z.object({ text: z.string().min(1).max(200) });
const agentSchema = z.object({
  action: z.enum(["feed", "train", "ask", "rename"]),
  payload: z.unknown().optional(),
});

io.on("connection", (socket) => {
  let authedCharId: string | null = null;

  socket.on("authenticate", (raw, ack) => {
    const parsed = authSchema.safeParse(raw);
    if (!parsed.success) return ack?.({ ok: false, error: "Bad payload" });
    const decoded = verifyToken(parsed.data.token);
    if (!decoded) return ack?.({ ok: false, error: "Bad token" });

    const owner = db
      .prepare("SELECT user_id FROM characters WHERE id = ?")
      .get(parsed.data.characterId) as { user_id: string } | undefined;
    if (!owner || owner.user_id !== decoded.uid) return ack?.({ ok: false, error: "Not your character" });

    try {
      const conn = world.enter(parsed.data.characterId, socket.id);
      authedCharId = conn.player.id;
      socket.join(`zone:${conn.player.zone}`);
      socket.emit("hello", {
        you: conn.player,
        ...world.zoneSnapshot(conn.player.zone),
      });
      ack?.({ ok: true });
    } catch (err) {
      ack?.({ ok: false, error: (err as Error).message });
    }
  });

  socket.on("move", (raw) => {
    if (!authedCharId) return;
    const parsed = moveSchema.safeParse(raw);
    if (!parsed.success) return;
    world.move(socket.id, parsed.data.pos, parsed.data.facing);
  });

  socket.on("attack", (raw) => {
    if (!authedCharId) return;
    const parsed = attackSchema.safeParse(raw);
    if (!parsed.success) return;
    world.attack(socket.id, parsed.data.targetId);
  });

  socket.on("useSkill", (raw) => {
    if (!authedCharId) return;
    const parsed = skillSchema.safeParse(raw);
    if (!parsed.success) return;
    world.useSkill(socket.id, parsed.data.skillId, parsed.data.targetId);
  });

  socket.on("useItem", (raw) => {
    if (!authedCharId) return;
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) return;
    world.useItem(socket.id, parsed.data.itemId);
  });

  socket.on("travel", (raw, ack) => {
    if (!authedCharId) return ack?.({ ok: false, error: "Not authed" });
    const parsed = travelSchema.safeParse(raw);
    if (!parsed.success) return ack?.({ ok: false, error: "Bad zone" });
    const conn = world.getConn(socket.id);
    if (!conn) return ack?.({ ok: false, error: "Not connected" });
    socket.leave(`zone:${conn.player.zone}`);
    const ok = world.travel(socket.id, parsed.data.zone as ZoneId);
    if (ok) {
      socket.join(`zone:${parsed.data.zone}`);
      ack?.({ ok: true });
    } else {
      socket.join(`zone:${conn.player.zone}`);
      ack?.({ ok: false, error: "Cannot travel there" });
    }
  });

  socket.on("buyItem", (raw, ack) => {
    if (!authedCharId) return ack?.({ ok: false, error: "Not authed" });
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) return ack?.({ ok: false, error: "Bad item" });
    const result = world.buyFromShop(socket.id, parsed.data.itemId);
    ack?.(result.ok ? { ok: true } : { ok: false, error: result.error ?? "fail" });
  });

  socket.on("sellItem", (raw, ack) => {
    if (!authedCharId) return ack?.({ ok: false, error: "Not authed" });
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) return ack?.({ ok: false, error: "Bad item" });
    const result = world.sellToShop(socket.id, parsed.data.itemId);
    ack?.(result.ok ? { ok: true } : { ok: false, error: result.error ?? "fail" });
  });

  socket.on("chat", (raw) => {
    if (!authedCharId) return;
    const parsed = chatSchema.safeParse(raw);
    if (!parsed.success) return;
    const conn = world.getConn(socket.id);
    if (!conn) return;
    broadcast(conn.player.zone, "chat", {
      from: conn.player.name,
      text: parsed.data.text,
      ts: Date.now(),
    });
  });

  socket.on("agentAction", (raw, ack) => {
    if (!authedCharId) return ack?.({ ok: false, error: "Not authed" });
    const parsed = agentSchema.safeParse(raw);
    if (!parsed.success) return ack?.({ ok: false, error: "Bad payload" });
    const conn = world.getConn(socket.id);
    if (!conn) return ack?.({ ok: false, error: "Not connected" });
    const charId = conn.player.id;

    let result;
    if (parsed.data.action === "feed") result = agents.feed(charId, conn.player.agent);
    else if (parsed.data.action === "train")
      result = agents.train(charId, conn.player.agent, (parsed.data.payload as { skill?: string }) ?? {});
    else if (parsed.data.action === "rename")
      result = agents.rename(charId, conn.player.agent, (parsed.data.payload as { name?: string }) ?? {});
    else result = agents.ask(charId, conn.player);

    if (!result.ok) return ack?.({ ok: false, error: result.error ?? "fail" });
    if (result.agent) conn.player.agent = result.agent;
    direct(socket.id, "playerStats", { player: conn.player });
    if (result.hint) {
      direct(socket.id, "agentHint", {
        hint: result.hint,
        tag: parsed.data.action === "ask" ? "obsidian" : "general",
      });
    }
    ack?.({ ok: true });
  });

  socket.on("disconnect", () => {
    if (authedCharId) world.exit(socket.id);
  });
});

const tickIntervalMs = 1000 / config.tickRateHz;
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = now - lastTick;
  lastTick = now;
  world.tick(dt);
}, tickIntervalMs);

server.listen(config.port, () => {
  console.log(`[aetheria] server listening on http://localhost:${config.port}`);
  console.log(`[aetheria] CORS origin: ${config.corsOrigin}`);
  console.log(`[aetheria] Tick rate: ${config.tickRateHz} Hz`);
});
