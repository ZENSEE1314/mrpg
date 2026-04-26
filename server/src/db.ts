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
`);

export type UserRow = {
  id: string;
  email: string;
  username: string;
  password_hash: string;
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
  inventory_json: string;
  equipped_json: string;
  agent_json: string;
  created_at: number;
  updated_at: number;
};

export type MemoryRow = {
  id: number;
  character_id: string;
  kind: string;
  payload_json: string;
  created_at: number;
};
