import type { PlayerState, MonsterState, Vec2, ZoneId } from "./entities.js";

export interface ServerToClientEvents {
  hello: (data: { you: PlayerState; players: PlayerState[]; monsters: MonsterState[] }) => void;
  zoneSnapshot: (data: { zone: ZoneId; players: PlayerState[]; monsters: MonsterState[] }) => void;
  playerJoined: (data: { player: PlayerState }) => void;
  playerLeft: (data: { playerId: string }) => void;
  playerMoved: (data: { playerId: string; pos: Vec2; facing: number }) => void;
  playerStats: (data: { player: PlayerState }) => void;
  monsterSpawned: (data: { monster: MonsterState }) => void;
  monsterUpdated: (data: { monster: MonsterState }) => void;
  monsterDied: (data: { monsterId: string; killerId: string; xp: number; gold: number; loot: { itemId: string; qty: number }[] }) => void;
  damageDealt: (data: { sourceId: string; targetId: string; amount: number; crit: boolean; targetHp: number; isMonster: boolean }) => void;
  chat: (data: { from: string; text: string; ts: number }) => void;
  systemMessage: (data: { text: string; level: "info" | "warn" | "error" }) => void;
  agentHint: (data: { hint: string; tag: "hermes" | "obsidian" | "general" }) => void;
}

export interface ClientToServerEvents {
  authenticate: (data: { token: string; characterId: string }, ack: (resp: AckResp) => void) => void;
  move: (data: { pos: Vec2; facing: number }) => void;
  attack: (data: { targetId: string }) => void;
  useSkill: (data: { skillId: string; targetId?: string; pos?: Vec2 }) => void;
  useItem: (data: { itemId: string }) => void;
  travel: (data: { zone: ZoneId }, ack: (resp: AckResp) => void) => void;
  chat: (data: { text: string }) => void;
  agentAction: (data: { action: "feed" | "train" | "ask" | "rename"; payload?: unknown }, ack: (resp: AckResp) => void) => void;
}

export type AckResp = { ok: true; data?: unknown } | { ok: false; error: string };
