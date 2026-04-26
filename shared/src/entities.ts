import type { ClassId, BaseStats } from "./classes.js";

export interface Vec2 {
  x: number;
  y: number;
}

export interface PlayerState {
  id: string;
  userId: string;
  name: string;
  classId: ClassId;
  level: number;
  xp: number;
  gold: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  stats: BaseStats;
  pos: Vec2;
  facing: number;
  zone: ZoneId;
  inventory: InventorySlot[];
  equipped: EquippedSlots;
  agent: AgentState;
}

export interface AgentState {
  name: string;
  level: number;
  xp: number;
  loyalty: number;
  hermesFedAt: number;
  hermesLevel: number;
  obsidianMemoryCount: number;
  lastHint: string | null;
}

export interface InventorySlot {
  itemId: string;
  qty: number;
}

export interface EquippedSlots {
  weapon: string | null;
  armor: string | null;
  trinket: string | null;
}

export interface MonsterState {
  id: string;
  type: MonsterType;
  level: number;
  hp: number;
  maxHp: number;
  pos: Vec2;
  zone: ZoneId;
  aggroOn: string | null;
}

export type MonsterType = "slime" | "goblin" | "wolf" | "skeleton" | "wraith";

export type ZoneId = "town" | "meadow" | "forest" | "crypt" | "house";

export interface MonsterDef {
  type: MonsterType;
  name: string;
  emoji: string;
  baseHp: number;
  baseAttack: number;
  baseDefense: number;
  speed: number;
  xpReward: number;
  goldRange: [number, number];
  aggroRange: number;
  attackRange: number;
  attackInterval: number;
  zones: ZoneId[];
  minLevel: number;
}

export const MONSTERS: Record<MonsterType, MonsterDef> = {
  slime: { type: "slime", name: "Slime", emoji: "🟢", baseHp: 30, baseAttack: 4, baseDefense: 1, speed: 50, xpReward: 8, goldRange: [1, 4], aggroRange: 120, attackRange: 40, attackInterval: 1500, zones: ["meadow"], minLevel: 1 },
  goblin: { type: "goblin", name: "Goblin", emoji: "👺", baseHp: 55, baseAttack: 7, baseDefense: 3, speed: 90, xpReward: 18, goldRange: [3, 9], aggroRange: 180, attackRange: 50, attackInterval: 1100, zones: ["meadow", "forest"], minLevel: 2 },
  wolf: { type: "wolf", name: "Wolf", emoji: "🐺", baseHp: 75, baseAttack: 11, baseDefense: 4, speed: 140, xpReward: 30, goldRange: [4, 12], aggroRange: 250, attackRange: 50, attackInterval: 900, zones: ["forest"], minLevel: 4 },
  skeleton: { type: "skeleton", name: "Skeleton", emoji: "💀", baseHp: 110, baseAttack: 14, baseDefense: 6, speed: 80, xpReward: 50, goldRange: [8, 20], aggroRange: 200, attackRange: 60, attackInterval: 1200, zones: ["crypt"], minLevel: 6 },
  wraith: { type: "wraith", name: "Wraith", emoji: "👻", baseHp: 160, baseAttack: 20, baseDefense: 4, speed: 110, xpReward: 90, goldRange: [15, 35], aggroRange: 250, attackRange: 80, attackInterval: 1300, zones: ["crypt"], minLevel: 9 },
};

export interface ZoneDef {
  id: ZoneId;
  name: string;
  description: string;
  width: number;
  height: number;
  spawnPos: Vec2;
  monsters: MonsterType[];
  monsterCap: number;
  bg: number;
  music?: string;
  pvp: boolean;
}

export const ZONES: Record<ZoneId, ZoneDef> = {
  town: { id: "town", name: "Aetheria Town", description: "Safe haven. Shop, bank, portals.", width: 1600, height: 1200, spawnPos: { x: 800, y: 600 }, monsters: [], monsterCap: 0, bg: 0x4a6741, pvp: false },
  meadow: { id: "meadow", name: "Greenleaf Meadow", description: "Gentle slopes and slow slimes.", width: 2000, height: 1500, spawnPos: { x: 200, y: 750 }, monsters: ["slime", "goblin"], monsterCap: 12, bg: 0x6b8e23, pvp: false },
  forest: { id: "forest", name: "Whispering Forest", description: "Wolves and goblins lurk here.", width: 2400, height: 1800, spawnPos: { x: 200, y: 900 }, monsters: ["goblin", "wolf"], monsterCap: 16, bg: 0x2d5a2b, pvp: false },
  crypt: { id: "crypt", name: "Forsaken Crypt", description: "The dead do not rest.", width: 2400, height: 1800, spawnPos: { x: 200, y: 900 }, monsters: ["skeleton", "wraith"], monsterCap: 14, bg: 0x2c2540, pvp: false },
  house: { id: "house", name: "Your Home", description: "Decorate, farm, rest.", width: 800, height: 600, spawnPos: { x: 400, y: 300 }, monsters: [], monsterCap: 0, bg: 0x6e4a2b, pvp: false },
};
