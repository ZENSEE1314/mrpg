import { nanoid } from "nanoid";
import {
  CLASSES,
  DEFAULT_GAME_CONFIG,
  EMPTY_EQUIPPED,
  INVENTORY_COLS,
  INVENTORY_ROWS,
  ITEMS,
  MONSTERS,
  RARITY_AFFIX_COUNT,
  ZONES,
  attributeUpgradeCost,
  bonusFromAttributes,
  equipSlotFor,
  findFreeSlot,
  isTwoHanded,
  itemShape,
  pickDropItemId,
  rollAffixes,
  rollRarity,
  statsForLevel,
  type Affix,
  type AgentState,
  type AttributeId,
  type Attributes,
  type ClassId,
  type EquipSlot,
  type EquippedSlots,
  type FloorItem,
  type GameConfig,
  type InventoryItem,
  type ItemDef,
  type MonsterState,
  type MonsterType,
  type PlayerState,
  type Vec2,
  type ZoneId,
} from "@aetheria/shared";
import { db, getConfig, type CharacterRow } from "../db.js";

function effectiveConfig(): GameConfig {
  return getConfig<GameConfig>("gameConfig", DEFAULT_GAME_CONFIG);
}

function xpForLevelDynamic(level: number, cfg: GameConfig = effectiveConfig()): number {
  return Math.floor(cfg.xpBase * Math.pow(level, cfg.xpExp));
}

interface Connection {
  socketId: string;
  player: PlayerState;
  lastAttackAt: number;
  skillCooldowns: Record<string, number>;
  lastSavedAt: number;
}

interface Zone {
  id: ZoneId;
  players: Map<string, Connection>;
  monsters: Map<string, MonsterState>;
  floorItems: Map<string, FloorItem>;
}

const FLOOR_DESPAWN_MS = 90_000;
const PICKUP_RADIUS = 48;

export type Broadcast = (zone: ZoneId, event: string, payload: unknown) => void;
export type DirectSend = (socketId: string, event: string, payload: unknown) => void;

const COMBAT_TIMEOUT_MS = 5000;
const REGEN_TICK_MS = 1000;

// Where the player lands when entering a zone, keyed by source zone.
// All entries put you NEXT TO the entrance, not at the center.
const ENTRY_POINTS: Partial<Record<ZoneId, Partial<Record<ZoneId | "*", Vec2>>>> = {
  town: {
    house: { x: 560, y: 500 },   // arrive at house door (south face of house)
    meadow: { x: 360, y: 780 },  // next to meadow portal in town
    forest: { x: 1280, y: 470 }, // next to forest portal in town
    crypt: { x: 800, y: 1080 },  // next to crypt portal in town
  },
  house: {
    "*": { x: 120, y: 440 },     // inside, just stepping past the front door
    town: { x: 120, y: 440 },
  },
  meadow: { town: { x: 200, y: 600 } },
  forest: { town: { x: 200, y: 380 } },
  crypt: { town: { x: 200, y: 600 } },
};

function entryPoint(toZone: ZoneId, fromZone: ZoneId): Vec2 {
  const map = ENTRY_POINTS[toZone];
  if (map) {
    const exact = map[fromZone] ?? map["*"];
    if (exact) return { ...exact };
  }
  const z = ZONES[toZone];
  return { ...z.spawnPos };
}

export class World {
  private zones: Map<ZoneId, Zone> = new Map();
  private playerBySocket: Map<string, Connection> = new Map();
  private playerByCharId: Map<string, Connection> = new Map();
  private nextMonsterTickAt = 0;
  private nextRegenAt = 0;
  private combatUntil: Map<string, number> = new Map();

  constructor(private broadcast: Broadcast, private direct: DirectSend) {
    for (const z of Object.values(ZONES)) {
      this.zones.set(z.id, {
        id: z.id,
        players: new Map(),
        monsters: new Map(),
        floorItems: new Map(),
      });
    }
  }

  private markInCombat(playerId: string): void {
    this.combatUntil.set(playerId, Date.now() + COMBAT_TIMEOUT_MS);
  }

  private isInCombat(playerId: string, now: number): boolean {
    return (this.combatUntil.get(playerId) ?? 0) > now;
  }

  private mitigatedDamage(rawAttack: number, defense: number): number {
    const mitigated = (rawAttack * 100) / (100 + Math.max(0, defense));
    return Math.max(1, Math.round(mitigated));
  }

  // ---------- character (de)serialization ----------

  private hydratePlayer(charId: string, socketId: string): Connection {
    const row = db.prepare("SELECT * FROM characters WHERE id = ?").get(charId) as CharacterRow | undefined;
    if (!row) throw new Error("Character not found");
    const classId = row.class_id as ClassId;
    const equipped = migrateEquipped(JSON.parse(row.equipped_json));
    const inventory = migrateInventory(JSON.parse(row.inventory_json));
    const agent: AgentState = JSON.parse(row.agent_json);
    const attrs: Attributes = {
      str: row.attr_str,
      agi: row.attr_agi,
      luck: row.attr_luck,
      magic: row.attr_magic,
    };
    const stats = deriveStats(classId, row.level, attrs, equipped, inventory);

    const player: PlayerState = {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      classId,
      level: row.level,
      xp: row.xp,
      gold: row.gold,
      hp: clampInt(row.hp, 1, stats.hp),
      maxHp: stats.hp,
      mp: clampInt(row.mp, 0, stats.mp),
      maxMp: stats.mp,
      stats,
      attrs,
      unspentPoints: row.unspent_points,
      pos: { x: row.pos_x, y: row.pos_y },
      facing: 0,
      zone: row.zone as ZoneId,
      inventory,
      equipped,
      agent,
    };

    return {
      socketId,
      player,
      lastAttackAt: 0,
      skillCooldowns: {},
      lastSavedAt: Date.now(),
    };
  }

  private persist(conn: Connection): void {
    const p = conn.player;
    db.prepare(
      `UPDATE characters SET
        level = ?, xp = ?, gold = ?, hp = ?, mp = ?, zone = ?, pos_x = ?, pos_y = ?,
        attr_str = ?, attr_agi = ?, attr_luck = ?, attr_magic = ?, unspent_points = ?,
        inventory_json = ?, equipped_json = ?, agent_json = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      p.level,
      p.xp,
      p.gold,
      p.hp,
      p.mp,
      p.zone,
      p.pos.x,
      p.pos.y,
      p.attrs.str,
      p.attrs.agi,
      p.attrs.luck,
      p.attrs.magic,
      p.unspentPoints,
      JSON.stringify(p.inventory),
      JSON.stringify(p.equipped),
      JSON.stringify(p.agent),
      Date.now(),
      p.id,
    );
    conn.lastSavedAt = Date.now();
  }

  // ---------- attribute allocation ----------

  allocateStat(socketId: string, stat: AttributeId): { ok: boolean; error?: string } {
    const conn = this.playerBySocket.get(socketId);
    if (!conn) return { ok: false, error: "Not connected" };
    const cfg = effectiveConfig();
    const current = conn.player.attrs[stat];
    const cost = attributeUpgradeCost(current, cfg);
    if (conn.player.unspentPoints < cost) {
      return { ok: false, error: `Need ${cost} points (have ${conn.player.unspentPoints})` };
    }
    conn.player.attrs[stat] = current + 1;
    conn.player.unspentPoints -= cost;
    // Re-derive combat stats (HP/MP caps may shift; preserve current/max ratio).
    const before = { hp: conn.player.hp, mp: conn.player.mp, maxHp: conn.player.maxHp, maxMp: conn.player.maxMp };
    const fresh = deriveStats(
      conn.player.classId,
      conn.player.level,
      conn.player.attrs,
      conn.player.equipped,
      conn.player.inventory,
    );
    conn.player.stats = fresh;
    conn.player.maxHp = fresh.hp;
    conn.player.maxMp = fresh.mp;
    conn.player.hp = Math.min(fresh.hp, before.hp + (fresh.hp - before.maxHp));
    conn.player.mp = Math.min(fresh.mp, before.mp + (fresh.mp - before.maxMp));
    if (conn.player.hp < 1) conn.player.hp = 1;
    if (conn.player.mp < 0) conn.player.mp = 0;

    this.direct(socketId, "playerStats", { player: conn.player });
    this.persist(conn);
    return { ok: true };
  }

  // ---------- connection lifecycle ----------

  enter(charId: string, socketId: string): Connection {
    const existing = this.playerByCharId.get(charId);
    if (existing) {
      this.exit(existing.socketId);
    }
    const conn = this.hydratePlayer(charId, socketId);
    const zone = this.zones.get(conn.player.zone)!;
    zone.players.set(conn.player.id, conn);
    this.playerBySocket.set(socketId, conn);
    this.playerByCharId.set(conn.player.id, conn);

    this.broadcast(conn.player.zone, "playerJoined", { player: conn.player });
    return conn;
  }

  exit(socketId: string): void {
    const conn = this.playerBySocket.get(socketId);
    if (!conn) return;
    this.persist(conn);
    const zone = this.zones.get(conn.player.zone)!;
    zone.players.delete(conn.player.id);
    this.playerBySocket.delete(socketId);
    this.playerByCharId.delete(conn.player.id);
    this.broadcast(conn.player.zone, "playerLeft", { playerId: conn.player.id });
  }

  // ---------- snapshots ----------

  zoneSnapshot(zoneId: ZoneId): {
    players: PlayerState[];
    monsters: MonsterState[];
    floorItems: FloorItem[];
  } {
    const z = this.zones.get(zoneId)!;
    return {
      players: [...z.players.values()].map((c) => c.player),
      monsters: [...z.monsters.values()],
      floorItems: [...z.floorItems.values()],
    };
  }

  // ---------- player actions ----------

  move(socketId: string, pos: Vec2, facing: number): void {
    const conn = this.playerBySocket.get(socketId);
    if (!conn) return;
    const zone = ZONES[conn.player.zone];
    pos.x = clamp(pos.x, 16, zone.width - 16);
    pos.y = clamp(pos.y, 16, zone.height - 16);

    const dx = pos.x - conn.player.pos.x;
    const dy = pos.y - conn.player.pos.y;
    const dist = Math.hypot(dx, dy);
    const maxDist = (conn.player.stats.speed / 60) * 0.2 + 30;
    if (dist > maxDist * 4) {
      conn.player.pos = { ...conn.player.pos };
      this.direct(socketId, "playerStats", { player: conn.player });
      return;
    }
    conn.player.pos = pos;
    conn.player.facing = facing;
    this.broadcast(conn.player.zone, "playerMoved", {
      playerId: conn.player.id,
      pos,
      facing,
    });
  }

  attack(socketId: string, targetId: string): void {
    const conn = this.playerBySocket.get(socketId);
    if (!conn) return;
    const def = CLASSES[conn.player.classId];
    const now = Date.now();
    if (now - conn.lastAttackAt < def.attackInterval) return;

    const z = this.zones.get(conn.player.zone)!;
    const monster = z.monsters.get(targetId);
    if (!monster) return;
    const dist = Math.hypot(monster.pos.x - conn.player.pos.x, monster.pos.y - conn.player.pos.y);
    if (dist > def.attackRange + 10) return;

    conn.lastAttackAt = now;
    this.markInCombat(conn.player.id);
    const isCrit = Math.random() * 100 < conn.player.stats.crit;
    const baseDmg = this.mitigatedDamage(conn.player.stats.attack, MONSTERS[monster.type].baseDefense);
    const dmg = Math.max(1, Math.round(baseDmg * (isCrit ? 1.8 : 1) * (0.85 + Math.random() * 0.3)));
    monster.hp = Math.max(0, monster.hp - dmg);
    monster.aggroOn = conn.player.id;

    this.broadcast(conn.player.zone, "damageDealt", {
      sourceId: conn.player.id,
      targetId: monster.id,
      amount: dmg,
      crit: isCrit,
      targetHp: monster.hp,
      isMonster: true,
    });

    if (monster.hp <= 0) {
      this.killMonster(conn, monster);
    } else {
      this.broadcast(conn.player.zone, "monsterUpdated", { monster });
    }
  }

  useSkill(socketId: string, skillId: string, targetId?: string): void {
    const conn = this.playerBySocket.get(socketId);
    if (!conn) return;
    const def = CLASSES[conn.player.classId];
    const skill = def.starterSkills.find((s) => s.id === skillId);
    if (!skill) return;

    const now = Date.now();
    const ready = conn.skillCooldowns[skillId] ?? 0;
    if (now < ready) return;
    if (conn.player.mp < skill.manaCost) return;

    conn.player.mp -= skill.manaCost;
    conn.skillCooldowns[skillId] = now + skill.cooldown;

    if (skill.damageMultiplier < 0) {
      const heal = Math.round(-skill.damageMultiplier * (conn.player.stats.attack + 5));
      conn.player.hp = Math.min(conn.player.maxHp, conn.player.hp + heal);
      this.broadcast(conn.player.zone, "damageDealt", {
        sourceId: conn.player.id,
        targetId: conn.player.id,
        amount: -heal,
        crit: false,
        targetHp: conn.player.hp,
        isMonster: false,
      });
    } else if (targetId) {
      const z = this.zones.get(conn.player.zone)!;
      const monster = z.monsters.get(targetId);
      if (!monster) {
        this.direct(socketId, "playerStats", { player: conn.player });
        return;
      }
      const dist = Math.hypot(monster.pos.x - conn.player.pos.x, monster.pos.y - conn.player.pos.y);
      if (dist > def.attackRange + 60) {
        this.direct(socketId, "playerStats", { player: conn.player });
        return;
      }
      this.markInCombat(conn.player.id);
      const baseDmg = this.mitigatedDamage(conn.player.stats.attack, MONSTERS[monster.type].baseDefense);
      const dmg = Math.max(1, Math.round(baseDmg * skill.damageMultiplier));
      monster.hp = Math.max(0, monster.hp - dmg);
      monster.aggroOn = conn.player.id;
      this.broadcast(conn.player.zone, "damageDealt", {
        sourceId: conn.player.id,
        targetId: monster.id,
        amount: dmg,
        crit: false,
        targetHp: monster.hp,
        isMonster: true,
      });
      if (monster.hp <= 0) this.killMonster(conn, monster);
      else this.broadcast(conn.player.zone, "monsterUpdated", { monster });
    }

    this.direct(socketId, "playerStats", { player: conn.player });
  }

  useItem(socketId: string, uid: string): void {
    const conn = this.playerBySocket.get(socketId);
    if (!conn) return;
    const inst = conn.player.inventory.find((s) => s.uid === uid);
    if (!inst || inst.qty <= 0) return;
    const def = ITEMS[inst.itemId];
    if (!def) return;

    if (def.slot === "consumable" && def.consumeEffect) {
      if (def.consumeEffect.healHp) {
        conn.player.hp = Math.min(conn.player.maxHp, conn.player.hp + def.consumeEffect.healHp);
      }
      if (def.consumeEffect.healMp) {
        conn.player.mp = Math.min(conn.player.maxMp, conn.player.mp + def.consumeEffect.healMp);
      }
      inst.qty -= 1;
      if (inst.qty <= 0) {
        conn.player.inventory = conn.player.inventory.filter((s) => s.uid !== uid);
      }
      this.direct(socketId, "playerStats", { player: conn.player });
      return;
    }

    // Equip path.
    const target = equipSlotFor(def);
    if (!target) {
      this.direct(socketId, "playerStats", { player: conn.player });
      return;
    }
    this.equipUid(conn, uid, target);
    this.direct(socketId, "playerStats", { player: conn.player });
  }

  unequipSlot(socketId: string, slot: EquipSlot): { ok: boolean; error?: string } {
    const conn = this.playerBySocket.get(socketId);
    if (!conn) return { ok: false, error: "Not connected" };
    const uid = conn.player.equipped[slot];
    if (!uid) return { ok: false, error: "Empty" };
    const inst = conn.player.inventory.find((s) => s.uid === uid);
    if (!inst) {
      // Equipped uid not in inventory — clear it (legacy state) and fall through.
      conn.player.equipped[slot] = null;
    } else {
      const def = ITEMS[inst.itemId]!;
      const sh = itemShape(def);
      // Need to "place" the item back in inventory grid; it's already there with x/y so fine.
      // But if we never want to enforce that equipped items are absent from grid, we keep them in grid.
      // For now: equipped items live in inventory with x/y; unequip just clears the equipped pointer.
      void sh;
    }
    conn.player.equipped[slot] = null;
    // If unequipping a 2-handed weapon's mainHand, the offHand was already null — nothing else to do.
    this.recomputeStats(conn);
    this.direct(socketId, "playerStats", { player: conn.player });
    this.persist(conn);
    return { ok: true };
  }

  /** Equip the item with the given uid into the target slot. */
  private equipUid(conn: Connection, uid: string, target: EquipSlot): void {
    const inst = conn.player.inventory.find((s) => s.uid === uid);
    if (!inst) return;
    const def = ITEMS[inst.itemId];
    if (!def) return;

    if (isTwoHanded(def)) {
      // 2H weapons go in mainHand and lock offHand. Move offHand item back to grid pointer.
      conn.player.equipped.offHand = null;
      conn.player.equipped.mainHand = inst.uid;
    } else if (target === "mainHand" || target === "offHand") {
      // Equipping a 1-handed thing while a 2H is equipped clears the 2H.
      const mainUid = conn.player.equipped.mainHand;
      if (mainUid) {
        const mainInst = conn.player.inventory.find((s) => s.uid === mainUid);
        if (mainInst && isTwoHanded(ITEMS[mainInst.itemId]!)) {
          conn.player.equipped.mainHand = null;
        }
      }
      conn.player.equipped[target] = inst.uid;
    } else {
      conn.player.equipped[target] = inst.uid;
    }
    this.recomputeStats(conn);
  }

  private recomputeStats(conn: Connection): void {
    const fresh = deriveStats(
      conn.player.classId,
      conn.player.level,
      conn.player.attrs,
      conn.player.equipped,
      conn.player.inventory,
    );
    conn.player.stats = fresh;
    conn.player.maxHp = fresh.hp;
    conn.player.maxMp = fresh.mp;
    conn.player.hp = Math.min(conn.player.hp, fresh.hp);
    conn.player.mp = Math.min(conn.player.mp, fresh.mp);
    if (conn.player.hp < 1) conn.player.hp = 1;
  }

  travel(socketId: string, zoneId: ZoneId): boolean {
    const conn = this.playerBySocket.get(socketId);
    if (!conn) return false;
    const target = ZONES[zoneId];
    if (!target) return false;
    if (zoneId === conn.player.zone) return false;

    if (zoneId === "house" && conn.player.zone !== "town") return false;

    const fromZone = conn.player.zone;
    const oldZone = this.zones.get(fromZone)!;
    oldZone.players.delete(conn.player.id);
    this.broadcast(fromZone, "playerLeft", { playerId: conn.player.id });

    conn.player.zone = zoneId;
    conn.player.pos = entryPoint(zoneId, fromZone);

    const newZone = this.zones.get(zoneId)!;
    newZone.players.set(conn.player.id, conn);
    this.broadcast(zoneId, "playerJoined", { player: conn.player });

    const snap = this.zoneSnapshot(zoneId);
    this.direct(socketId, "zoneSnapshot", { zone: zoneId, ...snap });
    this.persist(conn);
    return true;
  }

  buyFromShop(socketId: string, itemId: string): { ok: boolean; error?: string } {
    const conn = this.playerBySocket.get(socketId);
    if (!conn) return { ok: false, error: "Not connected" };
    if (conn.player.zone !== "town") return { ok: false, error: "Shop only in town" };
    const def = ITEMS[itemId];
    if (!def) return { ok: false, error: "Unknown item" };
    const overrides = getConfig<Record<string, { buyPrice?: number; sellPrice?: number }>>("shopOverrides", {});
    const price = overrides[itemId]?.buyPrice ?? def.buyPrice;
    if (price <= 0) return { ok: false, error: "Not for sale" };
    if (conn.player.gold < price) return { ok: false, error: "Not enough gold" };
    const placed = addToInventory(conn.player.inventory, itemId, 1);
    if (!placed) return { ok: false, error: "Bag is full" };
    conn.player.gold -= price;
    this.direct(socketId, "playerStats", { player: conn.player });
    return { ok: true };
  }

  sellToShop(socketId: string, uid: string): { ok: boolean; error?: string } {
    const conn = this.playerBySocket.get(socketId);
    if (!conn) return { ok: false, error: "Not connected" };
    if (conn.player.zone !== "town") return { ok: false, error: "Shop only in town" };
    const inst = conn.player.inventory.find((s) => s.uid === uid);
    if (!inst || inst.qty <= 0) return { ok: false, error: "Don't have it" };
    const def = ITEMS[inst.itemId];
    if (!def) return { ok: false, error: "Unknown item" };
    // Refuse to sell items currently equipped.
    for (const k of Object.keys(conn.player.equipped) as Array<keyof EquippedSlots>) {
      if (conn.player.equipped[k] === uid) return { ok: false, error: "Unequip first" };
    }
    inst.qty -= 1;
    if (inst.qty <= 0) {
      conn.player.inventory = conn.player.inventory.filter((s) => s.uid !== uid);
    }
    const overrides = getConfig<Record<string, { buyPrice?: number; sellPrice?: number }>>("shopOverrides", {});
    const price = overrides[inst.itemId]?.sellPrice ?? def.sellPrice;
    conn.player.gold += price;
    this.direct(socketId, "playerStats", { player: conn.player });
    return { ok: true };
  }

  // ---------- monsters ----------

  private spawnMonster(zoneId: ZoneId, type: MonsterType): MonsterState {
    const def = MONSTERS[type];
    const z = ZONES[zoneId];
    const id = nanoid(8);
    const level = def.minLevel + Math.floor(Math.random() * 3);
    const hpScale = 1 + (level - def.minLevel) * 0.25;
    const maxHp = Math.round(def.baseHp * hpScale);
    const monster: MonsterState = {
      id,
      type,
      level,
      hp: maxHp,
      maxHp,
      pos: {
        x: 100 + Math.random() * (z.width - 200),
        y: 100 + Math.random() * (z.height - 200),
      },
      zone: zoneId,
      aggroOn: null,
    };
    this.zones.get(zoneId)!.monsters.set(id, monster);
    this.broadcast(zoneId, "monsterSpawned", { monster });
    return monster;
  }

  /** Try to add an item to the killer's bag; if it doesn't fit, drop it on the floor. */
  private giveOrDrop(
    killer: Connection,
    zoneId: ZoneId,
    pos: Vec2,
    itemId: string,
    qty: number,
    affixes: Affix[],
    sockets: (string | null)[],
  ): void {
    const placed = addToInventory(killer.player.inventory, itemId, qty, affixes, sockets);
    if (placed) {
      this.direct(killer.socketId, "playerStats", { player: killer.player });
      return;
    }
    this.dropFloorItem(zoneId, pos, itemId, qty, affixes, sockets);
  }

  private dropFloorItem(
    zoneId: ZoneId,
    pos: Vec2,
    itemId: string,
    qty: number,
    affixes: Affix[],
    sockets: (string | null)[],
  ): void {
    const z = this.zones.get(zoneId);
    if (!z) return;
    // Slight scatter so multiple drops aren't stacked exactly on top of each other.
    const fx = pos.x + (Math.random() - 0.5) * 32;
    const fy = pos.y + (Math.random() - 0.5) * 32;
    const item: FloorItem = {
      uid: nanoid(10),
      itemId,
      qty,
      affixes,
      sockets,
      x: fx,
      y: fy,
      zone: zoneId,
      despawnAt: Date.now() + FLOOR_DESPAWN_MS,
    };
    z.floorItems.set(item.uid, item);
    this.broadcast(zoneId, "floorItemSpawned", { item });
  }

  private tickFloorPickups(now: number): void {
    for (const z of this.zones.values()) {
      for (const [uid, item] of z.floorItems) {
        if (item.despawnAt <= now) {
          z.floorItems.delete(uid);
          this.broadcast(z.id, "floorItemDespawned", { uid });
          continue;
        }
        // First player within radius with room picks it up.
        for (const conn of z.players.values()) {
          const dx = conn.player.pos.x - item.x;
          const dy = conn.player.pos.y - item.y;
          if (dx * dx + dy * dy > PICKUP_RADIUS * PICKUP_RADIUS) continue;
          const placed = addToInventory(
            conn.player.inventory,
            item.itemId,
            item.qty,
            item.affixes,
            item.sockets,
          );
          if (placed) {
            z.floorItems.delete(uid);
            this.broadcast(z.id, "floorItemDespawned", { uid });
            this.direct(conn.socketId, "systemMessage", {
              text: `Picked up ${ITEMS[item.itemId]?.name ?? item.itemId}`,
              level: "info",
            });
            this.direct(conn.socketId, "playerStats", { player: conn.player });
            break;
          }
        }
      }
    }
  }

  private killMonster(killer: Connection, monster: MonsterState): void {
    const z = this.zones.get(monster.zone)!;
    z.monsters.delete(monster.id);
    const def = MONSTERS[monster.type];
    const xp = Math.round(def.xpReward * (1 + (monster.level - def.minLevel) * 0.2));
    const gold = randInt(def.goldRange[0], def.goldRange[1]) + monster.level;

    killer.player.xp += xp;
    killer.player.gold += gold;

    const loot: { itemId: string; qty: number }[] = [];
    const lootTable: Record<MonsterType, string | null> = {
      slime: "mat_slime_gel",
      goblin: null,
      wolf: "mat_wolf_pelt",
      skeleton: "mat_bone",
      wraith: "mat_bone",
    };
    const matId = lootTable[monster.type];
    if (matId && Math.random() < 0.5) {
      this.giveOrDrop(killer, monster.zone, monster.pos, matId, 1, [], []);
      loot.push({ itemId: matId, qty: 1 });
    }
    if (Math.random() < 0.08) {
      const drops = ["potion_hp_s", "potion_mp_s"];
      const pick = drops[Math.floor(Math.random() * drops.length)]!;
      this.giveOrDrop(killer, monster.zone, monster.pos, pick, 1, [], []);
      loot.push({ itemId: pick, qty: 1 });
    }
    // Equipment drop with rolled affixes + sockets.
    if (Math.random() < 0.18) {
      const rolled = rollItemDrop(monster.level);
      if (rolled) {
        this.giveOrDrop(killer, monster.zone, monster.pos, rolled.itemId, 1, rolled.affixes, rolled.sockets);
        loot.push({ itemId: rolled.itemId, qty: 1 });
      }
    }

    const cfg = effectiveConfig();
    while (killer.player.xp >= xpForLevelDynamic(killer.player.level, cfg)) {
      killer.player.xp -= xpForLevelDynamic(killer.player.level, cfg);
      killer.player.level += 1;
      killer.player.unspentPoints += cfg.pointsPerLevel;
      const newStats = deriveStats(
        killer.player.classId,
        killer.player.level,
        killer.player.attrs,
        killer.player.equipped,
        killer.player.inventory,
      );
      killer.player.stats = newStats;
      killer.player.maxHp = newStats.hp;
      killer.player.maxMp = newStats.mp;
      killer.player.hp = newStats.hp;
      killer.player.mp = newStats.mp;
    }

    this.broadcast(monster.zone, "monsterDied", {
      monsterId: monster.id,
      killerId: killer.player.id,
      xp,
      gold,
      loot,
    });
    this.direct(killer.socketId, "playerStats", { player: killer.player });

    db.prepare(
      "INSERT INTO agent_memories (character_id, kind, payload_json, created_at) VALUES (?, ?, ?, ?)",
    ).run(
      killer.player.id,
      "kill",
      JSON.stringify({ monster: monster.type, level: monster.level, zone: monster.zone, xp, gold }),
      Date.now(),
    );
  }

  // ---------- game tick ----------

  tick(dtMs: number): void {
    const now = Date.now();
    for (const z of this.zones.values()) {
      const zoneDef = ZONES[z.id];
      if (zoneDef.monsters.length > 0 && z.monsters.size < zoneDef.monsterCap && now > this.nextMonsterTickAt) {
        const type = zoneDef.monsters[Math.floor(Math.random() * zoneDef.monsters.length)]!;
        if (z.players.size > 0) this.spawnMonster(z.id, type);
      }

      for (const monster of z.monsters.values()) {
        const def = MONSTERS[monster.type];
        let target: Connection | null = null;
        let bestDist = Infinity;
        for (const conn of z.players.values()) {
          const d = Math.hypot(conn.player.pos.x - monster.pos.x, conn.player.pos.y - monster.pos.y);
          if (d < def.aggroRange && d < bestDist) {
            bestDist = d;
            target = conn;
          }
        }
        if (target) {
          monster.aggroOn = target.player.id;
          const dx = target.player.pos.x - monster.pos.x;
          const dy = target.player.pos.y - monster.pos.y;
          const dist = Math.hypot(dx, dy);
          if (dist > def.attackRange) {
            const step = (def.speed * dtMs) / 1000;
            monster.pos.x += (dx / dist) * step;
            monster.pos.y += (dy / dist) * step;
            this.broadcast(z.id, "monsterUpdated", { monster });
          } else {
            const lastKey = `mAtk_${monster.id}`;
            const last = target.skillCooldowns[lastKey] ?? 0;
            if (now - last >= def.attackInterval) {
              target.skillCooldowns[lastKey] = now;
              const baseDmg = this.mitigatedDamage(def.baseAttack, target.player.stats.defense);
              const dmg = Math.max(1, Math.round(baseDmg * (0.85 + Math.random() * 0.3)));
              target.player.hp = Math.max(0, target.player.hp - dmg);
              this.markInCombat(target.player.id);
              this.broadcast(z.id, "damageDealt", {
                sourceId: monster.id,
                targetId: target.player.id,
                amount: dmg,
                crit: false,
                targetHp: target.player.hp,
                isMonster: false,
              });
              if (target.player.hp <= 0) this.respawn(target);
              else this.direct(target.socketId, "playerStats", { player: target.player });
            }
          }
        } else if (monster.aggroOn) {
          monster.aggroOn = null;
        }
      }

    }

    if (now >= this.nextRegenAt) {
      this.nextRegenAt = now + REGEN_TICK_MS;
      for (const z of this.zones.values()) {
        for (const conn of z.players.values()) {
          if (this.isInCombat(conn.player.id, now)) continue;
          const hpRegen = Math.max(2, Math.round(conn.player.maxHp * 0.04));
          const mpRegen = Math.max(1, Math.round(conn.player.maxMp * 0.05));
          let changed = false;
          if (conn.player.hp < conn.player.maxHp) {
            conn.player.hp = Math.min(conn.player.maxHp, conn.player.hp + hpRegen);
            changed = true;
          }
          if (conn.player.mp < conn.player.maxMp) {
            conn.player.mp = Math.min(conn.player.maxMp, conn.player.mp + mpRegen);
            changed = true;
          }
          if (changed) this.direct(conn.socketId, "playerStats", { player: conn.player });
        }
      }
    }

    if (now > this.nextMonsterTickAt) this.nextMonsterTickAt = now + 4000;

    this.tickFloorPickups(now);

    for (const conn of this.playerBySocket.values()) {
      if (now - conn.lastSavedAt > 15_000) this.persist(conn);
    }
  }

  private respawn(conn: Connection): void {
    conn.player.hp = Math.round(conn.player.maxHp * 0.5);
    conn.player.mp = Math.round(conn.player.maxMp * 0.5);
    const goldLost = Math.min(conn.player.gold, Math.round(conn.player.gold * 0.1));
    conn.player.gold -= goldLost;
    const town = ZONES.town;
    const oldZone = conn.player.zone;
    if (oldZone !== "town") {
      this.zones.get(oldZone)!.players.delete(conn.player.id);
      this.broadcast(oldZone, "playerLeft", { playerId: conn.player.id });
      conn.player.zone = "town";
      this.zones.get("town")!.players.set(conn.player.id, conn);
      this.broadcast("town", "playerJoined", { player: conn.player });
    }
    conn.player.pos = { ...town.spawnPos };
    this.direct(conn.socketId, "zoneSnapshot", { zone: "town", ...this.zoneSnapshot("town") });
    this.direct(conn.socketId, "systemMessage", {
      text: `You died. Lost ${goldLost} gold. Respawned in town.`,
      level: "warn",
    });
  }

  getConn(socketId: string): Connection | undefined {
    return this.playerBySocket.get(socketId);
  }
}

function applyEquipBonuses(
  base: ReturnType<typeof statsForLevel>,
  equipped: EquippedSlots,
  inventory: InventoryItem[],
): ReturnType<typeof statsForLevel> {
  const out = { ...base };
  const byUid = new Map(inventory.map((it) => [it.uid, it] as const));
  // Plus any items that exist as bare references (not actually possible after migrate, but safe).
  const slots: Array<keyof EquippedSlots> = [
    "head", "chest", "legs", "gloves", "mainHand", "offHand", "amulet", "belt", "ring1", "ring2",
  ];
  for (const slot of slots) {
    const uid = equipped[slot];
    if (!uid) continue;
    const inst = byUid.get(uid);
    const def = inst ? ITEMS[inst.itemId] : ITEMS[uid]; // legacy fallback
    if (!def) continue;
    if (def.bonuses) {
      if (def.bonuses.attack) out.attack += def.bonuses.attack;
      if (def.bonuses.defense) out.defense += def.bonuses.defense;
      if (def.bonuses.hp) out.hp += def.bonuses.hp;
      if (def.bonuses.mp) out.mp += def.bonuses.mp;
      if (def.bonuses.speed) out.speed += def.bonuses.speed;
      if (def.bonuses.crit) out.crit += def.bonuses.crit;
    }
    if (inst) {
      for (const aff of inst.affixes) {
        if (aff.stat === "attack") out.attack += aff.value;
        else if (aff.stat === "defense") out.defense += aff.value;
        else if (aff.stat === "hp") out.hp += aff.value;
        else if (aff.stat === "mp") out.mp += aff.value;
        else if (aff.stat === "speed") out.speed += aff.value;
        else if (aff.stat === "crit") out.crit += aff.value;
      }
    }
  }
  return out;
}

function deriveStats(
  classId: ClassId,
  level: number,
  attrs: Attributes,
  equipped: EquippedSlots,
  inventory: InventoryItem[],
): ReturnType<typeof statsForLevel> {
  const base = statsForLevel(classId, level);
  // Affix str/agi/luck/magic stack on top of stat-allocated attrs.
  const bonusAttrs: Attributes = { ...attrs };
  const byUid = new Map(inventory.map((it) => [it.uid, it] as const));
  const slots: Array<keyof EquippedSlots> = [
    "head", "chest", "legs", "gloves", "mainHand", "offHand", "amulet", "belt", "ring1", "ring2",
  ];
  for (const slot of slots) {
    const uid = equipped[slot];
    if (!uid) continue;
    const inst = byUid.get(uid);
    if (!inst) continue;
    for (const aff of inst.affixes) {
      if (aff.stat === "str") bonusAttrs.str += aff.value;
      else if (aff.stat === "agi") bonusAttrs.agi += aff.value;
      else if (aff.stat === "luck") bonusAttrs.luck += aff.value;
      else if (aff.stat === "magic") bonusAttrs.magic += aff.value;
    }
  }
  const bonus = bonusFromAttributes(bonusAttrs);
  const summed = {
    hp: base.hp + bonus.hp,
    mp: base.mp + bonus.mp,
    attack: base.attack + bonus.attack,
    defense: base.defense + bonus.defense,
    speed: base.speed + bonus.speed,
    crit: base.crit + bonus.crit,
  };
  return applyEquipBonuses(summed, equipped, inventory);
}

function migrateEquipped(raw: unknown): EquippedSlots {
  const next: EquippedSlots = { ...EMPTY_EQUIPPED };
  if (!raw || typeof raw !== "object") return next;
  const r = raw as Record<string, unknown>;
  // Already-new shape — copy known keys.
  for (const k of Object.keys(EMPTY_EQUIPPED) as Array<keyof EquippedSlots>) {
    if (typeof r[k] === "string") next[k] = r[k] as string;
  }
  // Legacy fields {weapon, armor, trinket} → ignore (uids would be raw item IDs that don't
  // match any inventory uid). Safer to clear rather than re-equip into wrong slot.
  return next;
}

function migrateInventory(raw: unknown): InventoryItem[] {
  if (!Array.isArray(raw)) return [];
  const out: InventoryItem[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    if (typeof o.itemId !== "string") continue;
    const def = ITEMS[o.itemId];
    if (!def) continue;
    const item: InventoryItem = {
      uid: typeof o.uid === "string" ? o.uid : nanoid(10),
      itemId: o.itemId,
      qty: Math.max(1, Number(o.qty ?? 1)),
      x: Number.isFinite(o.x) ? Math.max(0, Math.floor(o.x as number)) : -1,
      y: Number.isFinite(o.y) ? Math.max(0, Math.floor(o.y as number)) : -1,
      affixes: Array.isArray(o.affixes) ? (o.affixes as Affix[]) : [],
      sockets: Array.isArray(o.sockets) ? (o.sockets as (string | null)[]) : [],
    };
    out.push(item);
  }
  // Auto-pack: assign positions to any items that don't have valid ones, evicting overlaps.
  const positioned: InventoryItem[] = [];
  for (const it of out) {
    const def = ITEMS[it.itemId]!;
    const sh = itemShape(def);
    if (it.x < 0 || it.y < 0) {
      const slot = findFreeSlot(positioned, sh.w, sh.h);
      if (!slot) continue; // grid full — drop
      it.x = slot.x;
      it.y = slot.y;
    }
    positioned.push(it);
  }
  return positioned;
}

/** Adds qty of itemId, stacking onto an existing stack if possible, else placing in first free slot. */
function addToInventory(
  inv: InventoryItem[],
  itemId: string,
  qty: number,
  affixes: Affix[] = [],
  sockets: (string | null)[] = [],
): InventoryItem | null {
  const def = ITEMS[itemId];
  if (!def) return null;
  if (def.stackable) {
    const existing = inv.find((s) => s.itemId === itemId && s.affixes.length === 0);
    if (existing) {
      existing.qty += qty;
      return existing;
    }
  }
  const sh = itemShape(def);
  const slot = findFreeSlot(inv, sh.w, sh.h);
  if (!slot) return null;
  const item: InventoryItem = {
    uid: nanoid(10),
    itemId,
    qty,
    x: slot.x,
    y: slot.y,
    affixes,
    sockets,
  };
  inv.push(item);
  return item;
}

/** Roll a complete drop instance (rarity → affix count → affixes → sockets). */
function rollItemDrop(monsterLevel: number): {
  itemId: string;
  affixes: Affix[];
  sockets: (string | null)[];
} | null {
  const itemId = pickDropItemId(monsterLevel);
  if (!itemId) return null;
  const def = ITEMS[itemId]!;
  const rarity = rollRarity();
  const affixCount = def.slot === "consumable" || def.slot === "material" ? 0 : RARITY_AFFIX_COUNT[rarity];
  const affixes = rollAffixes(affixCount);
  const maxS = def.maxSockets ?? 0;
  const socketCount = maxS > 0 ? Math.floor(Math.random() * (maxS + 1)) : 0;
  const sockets: (string | null)[] = Array.from({ length: socketCount }, () => null);
  return { itemId, affixes, sockets };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function randInt(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}
