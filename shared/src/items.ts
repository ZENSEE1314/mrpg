export type EquipSlot =
  | "head"
  | "chest"
  | "legs"
  | "gloves"
  | "mainHand"
  | "offHand"
  | "amulet"
  | "belt"
  | "ring1"
  | "ring2";

export type ItemSlot = EquipSlot | "consumable" | "material" | "twoHanded";

export type ItemRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type AffixStat =
  | "attack"
  | "defense"
  | "hp"
  | "mp"
  | "speed"
  | "crit"
  | "str"
  | "agi"
  | "luck"
  | "magic";

export interface Affix {
  stat: AffixStat;
  value: number;
}

export interface ItemDef {
  id: string;
  name: string;
  emoji: string;
  /** Logical slot: where the item lives when equipped, or "consumable"/"material"/"twoHanded". */
  slot: ItemSlot;
  rarity: ItemRarity;
  description: string;
  buyPrice: number;
  sellPrice: number;
  bonuses?: {
    attack?: number;
    defense?: number;
    hp?: number;
    mp?: number;
    speed?: number;
    crit?: number;
  };
  consumeEffect?: {
    healHp?: number;
    healMp?: number;
  };
  stackable: boolean;
  /** Grid footprint in inventory cells (default 1×1). */
  shape?: { w: number; h: number };
  /** Max sockets this item can roll with. 0 = no socket support. */
  maxSockets?: number;
  /** Min monster level to drop this base item. */
  minDropLevel?: number;
  /** Drop weight (relative). 0 = never naturally drops. */
  dropWeight?: number;
}

/**
 * An owned item instance — the same itemId can have multiple copies with
 * different rolled affixes / sockets / qty / position.
 */
export interface InventoryItem {
  uid: string;
  itemId: string;
  qty: number;
  /** Top-left cell in the 6×6 inventory grid. */
  x: number;
  y: number;
  affixes: Affix[];
  /** Filled-in gem in each socket; null = empty socket. Length = number of sockets. */
  sockets: (string | null)[];
}

export interface EquippedSlots {
  head: string | null;
  chest: string | null;
  legs: string | null;
  gloves: string | null;
  mainHand: string | null;
  offHand: string | null;
  amulet: string | null;
  belt: string | null;
  ring1: string | null;
  ring2: string | null;
}

export const EMPTY_EQUIPPED: EquippedSlots = {
  head: null,
  chest: null,
  legs: null,
  gloves: null,
  mainHand: null,
  offHand: null,
  amulet: null,
  belt: null,
  ring1: null,
  ring2: null,
};

export const EQUIP_SLOT_ORDER: EquipSlot[] = [
  "head",
  "amulet",
  "chest",
  "belt",
  "legs",
  "gloves",
  "mainHand",
  "offHand",
  "ring1",
  "ring2",
];

export const EQUIP_SLOT_LABEL: Record<EquipSlot, string> = {
  head: "Head",
  chest: "Chest",
  legs: "Legs",
  gloves: "Gloves",
  mainHand: "Main Hand",
  offHand: "Off Hand",
  amulet: "Amulet",
  belt: "Belt",
  ring1: "Ring I",
  ring2: "Ring II",
};

export interface FloorItem {
  uid: string;
  itemId: string;
  qty: number;
  affixes: Affix[];
  sockets: (string | null)[];
  x: number;
  y: number;
  zone: string;
  despawnAt: number;
}

export const INVENTORY_COLS = 6;
export const INVENTORY_ROWS = 6;

const DEFAULT_SHAPE = { w: 1, h: 1 };

export function itemShape(def: ItemDef): { w: number; h: number } {
  return def.shape ?? DEFAULT_SHAPE;
}

export const ITEMS: Record<string, ItemDef> = {
  // ---------- Consumables ----------
  potion_hp_s: { id: "potion_hp_s", name: "Lesser Healing Potion", emoji: "🧪", slot: "consumable", rarity: "common", description: "Restores 50 HP.", buyPrice: 20, sellPrice: 6, consumeEffect: { healHp: 50 }, stackable: true },
  potion_hp_m: { id: "potion_hp_m", name: "Healing Potion", emoji: "🧪", slot: "consumable", rarity: "uncommon", description: "Restores 150 HP.", buyPrice: 60, sellPrice: 18, consumeEffect: { healHp: 150 }, stackable: true },
  potion_mp_s: { id: "potion_mp_s", name: "Lesser Mana Potion", emoji: "🔵", slot: "consumable", rarity: "common", description: "Restores 30 MP.", buyPrice: 20, sellPrice: 6, consumeEffect: { healMp: 30 }, stackable: true },
  potion_mp_m: { id: "potion_mp_m", name: "Mana Potion", emoji: "🔵", slot: "consumable", rarity: "uncommon", description: "Restores 90 MP.", buyPrice: 60, sellPrice: 18, consumeEffect: { healMp: 90 }, stackable: true },

  // ---------- Main hand (1×3) ----------
  sword_iron: { id: "sword_iron", name: "Iron Sword", emoji: "🗡️", slot: "mainHand", rarity: "common", description: "+5 Attack.", buyPrice: 120, sellPrice: 40, bonuses: { attack: 5 }, stackable: false, shape: { w: 1, h: 3 }, maxSockets: 1, minDropLevel: 1, dropWeight: 18 },
  sword_steel: { id: "sword_steel", name: "Steel Sword", emoji: "⚔️", slot: "mainHand", rarity: "uncommon", description: "+12 Attack.", buyPrice: 380, sellPrice: 120, bonuses: { attack: 12 }, stackable: false, shape: { w: 1, h: 3 }, maxSockets: 2, minDropLevel: 4, dropWeight: 8 },
  dagger_jagged: { id: "dagger_jagged", name: "Jagged Dagger", emoji: "🔪", slot: "mainHand", rarity: "common", description: "+3 Attack, +4 Crit.", buyPrice: 90, sellPrice: 30, bonuses: { attack: 3, crit: 4 }, stackable: false, shape: { w: 1, h: 2 }, maxSockets: 1, minDropLevel: 1, dropWeight: 14 },
  bow_oak: { id: "bow_oak", name: "Oak Bow", emoji: "🏹", slot: "mainHand", rarity: "common", description: "+5 Attack, +3 Crit.", buyPrice: 130, sellPrice: 42, bonuses: { attack: 5, crit: 3 }, stackable: false, shape: { w: 1, h: 3 }, maxSockets: 1, minDropLevel: 1, dropWeight: 12 },
  staff_apprentice: { id: "staff_apprentice", name: "Apprentice Staff", emoji: "🪄", slot: "mainHand", rarity: "common", description: "+4 Attack, +20 MP.", buyPrice: 130, sellPrice: 42, bonuses: { attack: 4, mp: 20 }, stackable: false, shape: { w: 1, h: 3 }, maxSockets: 1, minDropLevel: 1, dropWeight: 12 },

  // ---------- Two-handed (1×4) — equip into mainHand, locks offHand ----------
  greatsword: { id: "greatsword", name: "Greatsword", emoji: "🗡️", slot: "twoHanded", rarity: "uncommon", description: "+18 Attack. Two-handed.", buyPrice: 520, sellPrice: 160, bonuses: { attack: 18 }, stackable: false, shape: { w: 1, h: 4 }, maxSockets: 2, minDropLevel: 5, dropWeight: 6 },
  bow_war: { id: "bow_war", name: "Warbow", emoji: "🏹", slot: "twoHanded", rarity: "uncommon", description: "+12 Attack, +8 Crit. Two-handed.", buyPrice: 520, sellPrice: 160, bonuses: { attack: 12, crit: 8 }, stackable: false, shape: { w: 1, h: 4 }, maxSockets: 2, minDropLevel: 5, dropWeight: 6 },
  staff_arch: { id: "staff_arch", name: "Archmage Staff", emoji: "🪄", slot: "twoHanded", rarity: "uncommon", description: "+10 Attack, +60 MP. Two-handed.", buyPrice: 520, sellPrice: 160, bonuses: { attack: 10, mp: 60 }, stackable: false, shape: { w: 1, h: 4 }, maxSockets: 2, minDropLevel: 5, dropWeight: 6 },

  // ---------- Off-hand (2×2 / 1×2) ----------
  shield_buckler: { id: "shield_buckler", name: "Buckler", emoji: "🛡️", slot: "offHand", rarity: "common", description: "+3 Defense.", buyPrice: 90, sellPrice: 30, bonuses: { defense: 3 }, stackable: false, shape: { w: 2, h: 2 }, maxSockets: 1, minDropLevel: 1, dropWeight: 12 },
  shield_kite: { id: "shield_kite", name: "Kite Shield", emoji: "🛡️", slot: "offHand", rarity: "uncommon", description: "+8 Defense.", buyPrice: 280, sellPrice: 90, bonuses: { defense: 8 }, stackable: false, shape: { w: 2, h: 2 }, maxSockets: 2, minDropLevel: 4, dropWeight: 7 },
  quiver_basic: { id: "quiver_basic", name: "Hunter's Quiver", emoji: "🏹", slot: "offHand", rarity: "common", description: "+3 Crit.", buyPrice: 110, sellPrice: 35, bonuses: { crit: 3 }, stackable: false, shape: { w: 1, h: 2 }, maxSockets: 1, minDropLevel: 1, dropWeight: 8 },

  // ---------- Head (2×2) ----------
  cap_leather: { id: "cap_leather", name: "Leather Cap", emoji: "🎩", slot: "head", rarity: "common", description: "+2 Defense.", buyPrice: 70, sellPrice: 22, bonuses: { defense: 2 }, stackable: false, shape: { w: 2, h: 2 }, maxSockets: 1, minDropLevel: 1, dropWeight: 16 },
  helm_iron: { id: "helm_iron", name: "Iron Helm", emoji: "⛑️", slot: "head", rarity: "uncommon", description: "+6 Defense.", buyPrice: 240, sellPrice: 76, bonuses: { defense: 6 }, stackable: false, shape: { w: 2, h: 2 }, maxSockets: 2, minDropLevel: 3, dropWeight: 8 },
  hood_ranger: { id: "hood_ranger", name: "Ranger Hood", emoji: "🧢", slot: "head", rarity: "common", description: "+1 Defense, +2 Crit.", buyPrice: 90, sellPrice: 28, bonuses: { defense: 1, crit: 2 }, stackable: false, shape: { w: 2, h: 2 }, maxSockets: 1, minDropLevel: 1, dropWeight: 12 },

  // ---------- Chest (2×3) ----------
  armor_leather: { id: "armor_leather", name: "Leather Armor", emoji: "🦺", slot: "chest", rarity: "common", description: "+4 Defense.", buyPrice: 100, sellPrice: 32, bonuses: { defense: 4 }, stackable: false, shape: { w: 2, h: 3 }, maxSockets: 2, minDropLevel: 1, dropWeight: 14 },
  armor_chain: { id: "armor_chain", name: "Chainmail", emoji: "🥋", slot: "chest", rarity: "uncommon", description: "+10 Defense, -5 Speed.", buyPrice: 320, sellPrice: 100, bonuses: { defense: 10, speed: -5 }, stackable: false, shape: { w: 2, h: 3 }, maxSockets: 3, minDropLevel: 4, dropWeight: 7 },
  robe_cloth: { id: "robe_cloth", name: "Cloth Robe", emoji: "🧥", slot: "chest", rarity: "common", description: "+2 Defense, +30 MP.", buyPrice: 110, sellPrice: 35, bonuses: { defense: 2, mp: 30 }, stackable: false, shape: { w: 2, h: 3 }, maxSockets: 2, minDropLevel: 1, dropWeight: 10 },

  // ---------- Legs (2×2) ----------
  pants_leather: { id: "pants_leather", name: "Leather Leggings", emoji: "👖", slot: "legs", rarity: "common", description: "+2 Defense, +5 Speed.", buyPrice: 80, sellPrice: 26, bonuses: { defense: 2, speed: 5 }, stackable: false, shape: { w: 2, h: 2 }, maxSockets: 1, minDropLevel: 1, dropWeight: 14 },
  greaves_iron: { id: "greaves_iron", name: "Iron Greaves", emoji: "👖", slot: "legs", rarity: "uncommon", description: "+6 Defense.", buyPrice: 220, sellPrice: 70, bonuses: { defense: 6 }, stackable: false, shape: { w: 2, h: 2 }, maxSockets: 2, minDropLevel: 4, dropWeight: 8 },

  // ---------- Gloves (1×1) ----------
  gloves_leather: { id: "gloves_leather", name: "Leather Gloves", emoji: "🧤", slot: "gloves", rarity: "common", description: "+1 Defense, +2 Crit.", buyPrice: 50, sellPrice: 16, bonuses: { defense: 1, crit: 2 }, stackable: false, shape: { w: 1, h: 1 }, maxSockets: 1, minDropLevel: 1, dropWeight: 14 },
  gauntlets_iron: { id: "gauntlets_iron", name: "Iron Gauntlets", emoji: "🥊", slot: "gloves", rarity: "uncommon", description: "+4 Defense, +2 Attack.", buyPrice: 200, sellPrice: 60, bonuses: { defense: 4, attack: 2 }, stackable: false, shape: { w: 1, h: 1 }, maxSockets: 1, minDropLevel: 4, dropWeight: 7 },

  // ---------- Belt (2×1) ----------
  belt_rope: { id: "belt_rope", name: "Rope Belt", emoji: "🎗️", slot: "belt", rarity: "common", description: "+1 Defense.", buyPrice: 40, sellPrice: 12, bonuses: { defense: 1 }, stackable: false, shape: { w: 2, h: 1 }, minDropLevel: 1, dropWeight: 12 },
  belt_studded: { id: "belt_studded", name: "Studded Belt", emoji: "💎", slot: "belt", rarity: "uncommon", description: "+3 Defense, +5 HP.", buyPrice: 180, sellPrice: 56, bonuses: { defense: 3, hp: 5 }, stackable: false, shape: { w: 2, h: 1 }, maxSockets: 1, minDropLevel: 3, dropWeight: 8 },

  // ---------- Amulet & Rings (1×1) ----------
  amulet_swift: { id: "amulet_swift", name: "Amulet of Swiftness", emoji: "📿", slot: "amulet", rarity: "uncommon", description: "+15 Speed.", buyPrice: 280, sellPrice: 90, bonuses: { speed: 15 }, stackable: false, shape: { w: 1, h: 1 }, maxSockets: 1, minDropLevel: 3, dropWeight: 6 },
  amulet_vigor: { id: "amulet_vigor", name: "Amulet of Vigor", emoji: "📿", slot: "amulet", rarity: "uncommon", description: "+20 HP.", buyPrice: 280, sellPrice: 90, bonuses: { hp: 20 }, stackable: false, shape: { w: 1, h: 1 }, maxSockets: 1, minDropLevel: 3, dropWeight: 6 },
  ring_focus: { id: "ring_focus", name: "Ring of Focus", emoji: "💍", slot: "ring1", rarity: "uncommon", description: "+5 Crit.", buyPrice: 280, sellPrice: 90, bonuses: { crit: 5 }, stackable: false, shape: { w: 1, h: 1 }, maxSockets: 1, minDropLevel: 2, dropWeight: 8 },
  ring_might: { id: "ring_might", name: "Ring of Might", emoji: "💍", slot: "ring1", rarity: "uncommon", description: "+3 Attack.", buyPrice: 280, sellPrice: 90, bonuses: { attack: 3 }, stackable: false, shape: { w: 1, h: 1 }, maxSockets: 1, minDropLevel: 2, dropWeight: 8 },

  // ---------- Materials (1×1, stackable) ----------
  mat_slime_gel: { id: "mat_slime_gel", name: "Slime Gel", emoji: "🟢", slot: "material", rarity: "common", description: "Sticky and squishy. Forge fodder.", buyPrice: 0, sellPrice: 3, stackable: true },
  mat_wolf_pelt: { id: "mat_wolf_pelt", name: "Wolf Pelt", emoji: "🐾", slot: "material", rarity: "common", description: "Used for crafting armor.", buyPrice: 0, sellPrice: 12, stackable: true },
  mat_bone: { id: "mat_bone", name: "Old Bone", emoji: "🦴", slot: "material", rarity: "common", description: "Used in dark crafts.", buyPrice: 0, sellPrice: 8, stackable: true },
  mat_iron_ore: { id: "mat_iron_ore", name: "Iron Ore", emoji: "⛏️", slot: "material", rarity: "common", description: "Smelt at the forge.", buyPrice: 30, sellPrice: 8, stackable: true, dropWeight: 10, minDropLevel: 2 },
  mat_wood_log: { id: "mat_wood_log", name: "Oak Log", emoji: "🪵", slot: "material", rarity: "common", description: "Burns hot. Forge fuel.", buyPrice: 20, sellPrice: 5, stackable: true, dropWeight: 8, minDropLevel: 1 },

  // ---------- Seeds (consumable but planted from the garden panel) ----------
  seed_apple: { id: "seed_apple", name: "Apple Seed", emoji: "🌱", slot: "consumable", rarity: "common", description: "Grows into an apple. ~60s to ripen.", buyPrice: 25, sellPrice: 4, stackable: true },
  seed_berry: { id: "seed_berry", name: "Berry Seed", emoji: "🌱", slot: "consumable", rarity: "common", description: "Grows into a manaberry. ~40s to ripen.", buyPrice: 25, sellPrice: 4, stackable: true },

  // ---------- Garden produce ----------
  fruit_apple: { id: "fruit_apple", name: "Apple", emoji: "🍎", slot: "consumable", rarity: "common", description: "Restores 80 HP.", buyPrice: 0, sellPrice: 8, consumeEffect: { healHp: 80 }, stackable: true },
  fruit_berry: { id: "fruit_berry", name: "Manaberry", emoji: "🫐", slot: "consumable", rarity: "common", description: "Restores 60 MP.", buyPrice: 0, sellPrice: 8, consumeEffect: { healMp: 60 }, stackable: true },
};

// ---------- Garden / Forge ----------

export interface SeedDef {
  id: string;
  name: string;
  emoji: string;
  growMs: number;
  /** itemId produced when harvested. */
  yields: string;
  yieldQty: number;
}

export const SEEDS: Record<string, SeedDef> = {
  seed_apple: { id: "seed_apple", name: "Apple Seed", emoji: "🌱", growMs: 60_000, yields: "fruit_apple", yieldQty: 2 },
  seed_berry: { id: "seed_berry", name: "Berry Seed", emoji: "🌱", growMs: 40_000, yields: "fruit_berry", yieldQty: 2 },
};

export const GARDEN_PLOTS = 4;

export interface GardenPlot {
  seedId: string;
  startedAt: number;
  readyAt: number;
}

export type GardenState = (GardenPlot | null)[];

export const FORGE_BURN_MS = 45_000;

export interface ForgeJob {
  monsterDropId: string;
  oreId: string;
  fuelId: string;
  startedAt: number;
  finishesAt: number;
}

export type ForgeState = ForgeJob | null;

export const FORGE_INPUT_VALID = {
  monsterDrop: ["mat_slime_gel", "mat_wolf_pelt", "mat_bone"],
  ore: ["mat_iron_ore"],
  fuel: ["mat_wood_log"],
};

export const SHOP_INVENTORY: string[] = [
  "potion_hp_s", "potion_hp_m", "potion_mp_s", "potion_mp_m",
  "sword_iron", "sword_steel", "dagger_jagged", "bow_oak", "staff_apprentice",
  "shield_buckler", "shield_kite", "quiver_basic",
  "cap_leather", "helm_iron", "hood_ranger",
  "armor_leather", "armor_chain", "robe_cloth",
  "pants_leather", "gloves_leather", "belt_rope",
  "amulet_swift", "ring_focus",
  "seed_apple", "seed_berry", "mat_iron_ore", "mat_wood_log",
];

export const STARTER_INVENTORY: { itemId: string; qty: number }[] = [
  { itemId: "potion_hp_s", qty: 3 },
  { itemId: "potion_mp_s", qty: 2 },
];

/** Determine which equip slot an item goes in (twoHanded → mainHand). */
export function equipSlotFor(def: ItemDef): EquipSlot | null {
  if (def.slot === "twoHanded") return "mainHand";
  if (def.slot === "consumable" || def.slot === "material") return null;
  if (def.slot === "ring1") return "ring1";
  return def.slot;
}

export function isTwoHanded(def: ItemDef): boolean {
  return def.slot === "twoHanded";
}

// ---------- Affix rolling ----------

export interface AffixPool {
  stat: AffixStat;
  range: [number, number];
  weight: number;
}

export const AFFIX_POOLS: AffixPool[] = [
  { stat: "attack", range: [1, 5], weight: 18 },
  { stat: "defense", range: [1, 4], weight: 18 },
  { stat: "hp", range: [3, 12], weight: 14 },
  { stat: "mp", range: [3, 12], weight: 12 },
  { stat: "speed", range: [2, 8], weight: 10 },
  { stat: "crit", range: [1, 4], weight: 10 },
  { stat: "str", range: [1, 2], weight: 6 },
  { stat: "agi", range: [1, 2], weight: 6 },
  { stat: "luck", range: [1, 2], weight: 4 },
  { stat: "magic", range: [1, 2], weight: 4 },
];

export const RARITY_AFFIX_COUNT: Record<ItemRarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
};

// ---------- Inventory grid helpers ----------

/** Returns true if the rectangle (x..x+w, y..y+h) is fully inside the grid AND empty. */
export function gridSlotFree(
  inventory: InventoryItem[],
  x: number,
  y: number,
  w: number,
  h: number,
  ignoreUid?: string,
): boolean {
  if (x < 0 || y < 0 || x + w > INVENTORY_COLS || y + h > INVENTORY_ROWS) return false;
  for (const it of inventory) {
    if (ignoreUid && it.uid === ignoreUid) continue;
    // Items with negative position are equipped / off-grid and don't occupy cells.
    if (it.x < 0 || it.y < 0) continue;
    const def = ITEMS[it.itemId];
    if (!def) continue;
    const sh = itemShape(def);
    if (x + w <= it.x) continue;
    if (it.x + sh.w <= x) continue;
    if (y + h <= it.y) continue;
    if (it.y + sh.h <= y) continue;
    return false;
  }
  return true;
}

/** Find first free top-left cell that fits an item of (w, h). Null if no space. */
export function findFreeSlot(
  inventory: InventoryItem[],
  w: number,
  h: number,
): { x: number; y: number } | null {
  for (let y = 0; y <= INVENTORY_ROWS - h; y += 1) {
    for (let x = 0; x <= INVENTORY_COLS - w; x += 1) {
      if (gridSlotFree(inventory, x, y, w, h)) return { x, y };
    }
  }
  return null;
}

// ---------- Affix rolling ----------

function pickFromWeights<T extends { weight: number }>(pool: T[], rng: () => number): T | null {
  const total = pool.reduce((a, b) => a + b.weight, 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const p of pool) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return pool[pool.length - 1] ?? null;
}

export function rollAffixes(count: number, rng: () => number = Math.random): Affix[] {
  const out: Affix[] = [];
  const used = new Set<AffixStat>();
  for (let i = 0; i < count; i += 1) {
    const candidates = AFFIX_POOLS.filter((p) => !used.has(p.stat));
    const pick = pickFromWeights(candidates, rng);
    if (!pick) break;
    used.add(pick.stat);
    const v = Math.max(1, Math.round(pick.range[0] + rng() * (pick.range[1] - pick.range[0])));
    out.push({ stat: pick.stat, value: v });
  }
  return out;
}

/** Drops an item base picked by drop weight + level eligibility. */
export function pickDropItemId(monsterLevel: number, rng: () => number = Math.random): string | null {
  const candidates = Object.values(ITEMS).filter(
    (i) => (i.dropWeight ?? 0) > 0 && (i.minDropLevel ?? 1) <= monsterLevel,
  );
  if (candidates.length === 0) return null;
  const pick = pickFromWeights(
    candidates.map((c) => ({ ...c, weight: c.dropWeight ?? 0 })),
    rng,
  );
  return pick?.id ?? null;
}

/** Returns rarity tier and number of affixes from a single roll. */
export function rollRarity(rng: () => number = Math.random): ItemRarity {
  const r = rng();
  if (r < 0.6) return "common";
  if (r < 0.86) return "uncommon";
  if (r < 0.97) return "rare";
  if (r < 0.998) return "epic";
  return "legendary";
}
