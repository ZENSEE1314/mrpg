import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config } from "./config.js";

const dbPath = resolve(process.cwd(), config.dbPath);
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT UNIQUE NOT NULL,
    class_id TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER NOT NULL DEFAULT 0,
    gold INTEGER NOT NULL DEFAULT 50,
    hp INTEGER NOT NULL,
    mp INTEGER NOT NULL,
    zone TEXT NOT NULL DEFAULT 'town',
    pos_x REAL NOT NULL DEFAULT 800,
    pos_y REAL NOT NULL DEFAULT 600,
    attr_str INTEGER NOT NULL DEFAULT 1,
    attr_agi INTEGER NOT NULL DEFAULT 1,
    attr_luck INTEGER NOT NULL DEFAULT 1,
    attr_magic INTEGER NOT NULL DEFAULT 1,
    unspent_points INTEGER NOT NULL DEFAULT 25,
    inventory_json TEXT NOT NULL DEFAULT '[]',
    equipped_json TEXT NOT NULL DEFAULT '{"weapon":null,"armor":null,"trinket":null}',
    agent_json TEXT NOT NULL DEFAULT '{"name":"Hermes","level":1,"xp":0,"loyalty":50,"hermesFedAt":0,"hermesLevel":1,"obsidianMemoryCount":0,"lastHint":null}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_characters_user ON characters(user_id);

  CREATE TABLE IF NOT EXISTS agent_memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_memories_char ON agent_memories(character_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS game_config (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quests (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    objective_json TEXT NOT NULL DEFAULT '{}',
    reward_json TEXT NOT NULL DEFAULT '{}',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

// --- One-shot migrations for already-deployed DBs ---
function ensureColumn(table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

ensureColumn("users", "is_admin", "is_admin INTEGER NOT NULL DEFAULT 0");
ensureColumn("characters", "attr_str", "attr_str INTEGER NOT NULL DEFAULT 1");
ensureColumn("characters", "attr_agi", "attr_agi INTEGER NOT NULL DEFAULT 1");
ensureColumn("characters", "attr_luck", "attr_luck INTEGER NOT NULL DEFAULT 1");
ensureColumn("characters", "attr_magic", "attr_magic INTEGER NOT NULL DEFAULT 1");
ensureColumn("characters", "unspent_points", "unspent_points INTEGER NOT NULL DEFAULT 25");

// First user with an account gets admin (so the existing zensee account is grandfathered).
db.exec(`
  UPDATE users SET is_admin = 1
  WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)
    AND NOT EXISTS (SELECT 1 FROM users WHERE is_admin = 1);
`);

export type UserRow = {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  is_admin: number;
  created_at: number;
};

export type CharacterRow = {
  id: string;
  user_id: string;
  name: string;
  class_id: string;
  level: number;
  xp: number;
  gold: number;
  hp: number;
  mp: number;
  zone: string;
  pos_x: number;
  pos_y: number;
  attr_str: number;
  attr_agi: number;
  attr_luck: number;
  attr_magic: number;
  unspent_points: number;
  inventory_json: string;
  equipped_json: string;
  agent_json: string;
  created_at: number;
  updated_at: number;
};

export type QuestRow = {
  id: string;
  title: string;
  description: string;
  objective_json: string;
  reward_json: string;
  is_active: number;
  created_at: number;
  updated_at: number;
};

// --- game_config helpers ---
export function getConfig<T>(key: string, fallback: T): T {
  const row = db
    .prepare("SELECT value_json FROM game_config WHERE key = ?")
    .get(key) as { value_json: string } | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

export function setConfig(key: string, value: unknown): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO game_config (key, value_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
  ).run(key, JSON.stringify(value), now);
}

export type MemoryRow = {
  id: number;
  character_id: string;
  kind: string;
  payload_json: string;
  created_at: number;
};
