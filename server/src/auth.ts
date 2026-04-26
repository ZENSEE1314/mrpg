import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db, type UserRow, type CharacterRow } from "./db.js";
import { config } from "./config.js";
import {
  CLASSES,
  type ClassId,
  STARTER_INVENTORY,
  statsForLevel,
} from "@aetheria/shared";

const SALT_ROUNDS = 10;
const TOKEN_TTL = "7d";

const registerSchema = z.object({
  email: z.string().email().max(120),
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(120),
});

const loginSchema = z.object({
  emailOrUsername: z.string().min(3).max(120),
  password: z.string().min(1).max(120),
});

const createCharSchema = z.object({
  name: z.string().min(3).max(16).regex(/^[a-zA-Z0-9]+$/),
  classId: z.enum(["warrior", "archer", "mage", "healer", "thief"]),
});

export function signToken(userId: string): string {
  return jwt.sign({ uid: userId }, config.jwtSecret, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): { uid: string } | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (typeof decoded === "object" && decoded && "uid" in decoded) {
      return { uid: String((decoded as { uid: unknown }).uid) };
    }
    return null;
  } catch {
    return null;
  }
}

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
  }
  const { email, username, password } = parsed.data;

  const existing = db
    .prepare("SELECT id FROM users WHERE email = ? OR username = ?")
    .get(email.toLowerCase(), username) as { id: string } | undefined;
  if (existing) {
    return res.status(409).json({ error: "Email or username already taken" });
  }

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const id = nanoid(16);
  const now = Date.now();
  db.prepare(
    "INSERT INTO users (id, email, username, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, email.toLowerCase(), username, hash, now);

  const token = signToken(id);
  res.json({ token, user: { id, email: email.toLowerCase(), username } });
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }
  const { emailOrUsername, password } = parsed.data;

  const user = db
    .prepare("SELECT * FROM users WHERE email = ? OR username = ?")
    .get(emailOrUsername.toLowerCase(), emailOrUsername) as UserRow | undefined;

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = signToken(user.id);
  res.json({ token, user: { id: user.id, email: user.email, username: user.username } });
});

authRouter.get("/me", (req, res) => {
  const token = extractToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Missing token" });
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: "Invalid token" });
  const user = db.prepare("SELECT id, email, username FROM users WHERE id = ?").get(decoded.uid) as
    | { id: string; email: string; username: string }
    | undefined;
  if (!user) return res.status(401).json({ error: "User not found" });
  res.json({ user });
});

authRouter.get("/characters", (req, res) => {
  const token = extractToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Missing token" });
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: "Invalid token" });

  const rows = db
    .prepare(
      "SELECT id, name, class_id, level, xp, gold FROM characters WHERE user_id = ? ORDER BY created_at ASC",
    )
    .all(decoded.uid) as Array<Pick<CharacterRow, "id" | "name" | "class_id" | "level" | "xp" | "gold">>;
  res.json({ characters: rows });
});

authRouter.post("/characters", (req, res) => {
  const token = extractToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Missing token" });
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: "Invalid token" });

  const parsed = createCharSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
  const { name, classId } = parsed.data;

  const existing = db.prepare("SELECT id FROM characters WHERE name = ?").get(name) as { id: string } | undefined;
  if (existing) return res.status(409).json({ error: "Name taken" });

  const charCount = db.prepare("SELECT COUNT(*) as c FROM characters WHERE user_id = ?").get(decoded.uid) as {
    c: number;
  };
  if (charCount.c >= 5) return res.status(400).json({ error: "Max 5 characters per account" });

  const stats = statsForLevel(classId as ClassId, 1);
  const id = nanoid(16);
  const now = Date.now();
  db.prepare(
    `INSERT INTO characters
      (id, user_id, name, class_id, level, xp, gold, hp, mp, zone, pos_x, pos_y, inventory_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, 0, 80, ?, ?, 'town', 800, 600, ?, ?, ?)`,
  ).run(
    id,
    decoded.uid,
    name,
    classId,
    stats.hp,
    stats.mp,
    JSON.stringify(STARTER_INVENTORY),
    now,
    now,
  );

  res.json({
    character: {
      id,
      name,
      class_id: classId,
      level: 1,
      xp: 0,
      gold: 80,
    },
  });
});

authRouter.delete("/characters/:id", (req, res) => {
  const token = extractToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Missing token" });
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: "Invalid token" });
  const { id } = req.params;
  const result = db
    .prepare("DELETE FROM characters WHERE id = ? AND user_id = ?")
    .run(id, decoded.uid);
  if (result.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

function extractToken(header: string | undefined): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export const charClassDef = (id: ClassId) => CLASSES[id];
