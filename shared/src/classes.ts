export type ClassId = "warrior" | "archer" | "mage" | "healer" | "thief";

export interface ClassDefinition {
  id: ClassId;
  name: string;
  emoji: string;
  color: number;
  description: string;
  baseStats: BaseStats;
  growthPerLevel: BaseStats;
  starterSkills: SkillDefinition[];
  attackRange: number;
  attackInterval: number;
}

export interface BaseStats {
  hp: number;
  mp: number;
  attack: number;
  defense: number;
  speed: number;
  crit: number;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  manaCost: number;
  cooldown: number;
  damageMultiplier: number;
  emoji: string;
}

export const CLASSES: Record<ClassId, ClassDefinition> = {
  warrior: {
    id: "warrior",
    name: "Warrior",
    emoji: "⚔️",
    color: 0xc94c4c,
    description: "Heavy armor, melee. Soaks damage, hits like a truck.",
    baseStats: { hp: 120, mp: 20, attack: 14, defense: 10, speed: 110, crit: 5 },
    growthPerLevel: { hp: 18, mp: 2, attack: 3, defense: 2, speed: 1, crit: 0 },
    attackRange: 60,
    attackInterval: 800,
    starterSkills: [
      { id: "cleave", name: "Cleave", description: "Hits all enemies in front of you.", manaCost: 8, cooldown: 4000, damageMultiplier: 1.4, emoji: "🪓" },
      { id: "shieldwall", name: "Shield Wall", description: "Cuts incoming damage in half for 5s.", manaCost: 10, cooldown: 12000, damageMultiplier: 0, emoji: "🛡️" },
    ],
  },
  archer: {
    id: "archer",
    name: "Archer",
    emoji: "🏹",
    color: 0x4caf50,
    description: "Long range, high crit, fragile.",
    baseStats: { hp: 85, mp: 35, attack: 13, defense: 5, speed: 140, crit: 18 },
    growthPerLevel: { hp: 10, mp: 3, attack: 3, defense: 1, speed: 2, crit: 1 },
    attackRange: 220,
    attackInterval: 700,
    starterSkills: [
      { id: "pierce", name: "Piercing Shot", description: "Arrow that ignores defense.", manaCost: 10, cooldown: 5000, damageMultiplier: 1.6, emoji: "➹" },
      { id: "rain", name: "Rain of Arrows", description: "Volley over an area.", manaCost: 18, cooldown: 14000, damageMultiplier: 0.7, emoji: "🌧️" },
    ],
  },
  mage: {
    id: "mage",
    name: "Mage",
    emoji: "🔮",
    color: 0x6a5acd,
    description: "Glass cannon. Burst spells, big mana pool.",
    baseStats: { hp: 70, mp: 80, attack: 16, defense: 4, speed: 115, crit: 10 },
    growthPerLevel: { hp: 8, mp: 8, attack: 4, defense: 1, speed: 1, crit: 1 },
    attackRange: 200,
    attackInterval: 1000,
    starterSkills: [
      { id: "fireball", name: "Fireball", description: "Big single-target burst.", manaCost: 15, cooldown: 4000, damageMultiplier: 2.0, emoji: "🔥" },
      { id: "frost", name: "Frost Nova", description: "Freezes nearby enemies.", manaCost: 22, cooldown: 16000, damageMultiplier: 0.8, emoji: "❄️" },
    ],
  },
  healer: {
    id: "healer",
    name: "Healer",
    emoji: "✨",
    color: 0xffd54f,
    description: "Holy magic. Heals self and party, shields allies.",
    baseStats: { hp: 90, mp: 70, attack: 9, defense: 6, speed: 120, crit: 8 },
    growthPerLevel: { hp: 12, mp: 6, attack: 2, defense: 2, speed: 1, crit: 1 },
    attackRange: 160,
    attackInterval: 900,
    starterSkills: [
      { id: "heal", name: "Heal", description: "Restore HP to self or ally.", manaCost: 12, cooldown: 3000, damageMultiplier: -1.5, emoji: "💚" },
      { id: "smite", name: "Smite", description: "Holy bolt — extra damage vs undead.", manaCost: 14, cooldown: 5000, damageMultiplier: 1.5, emoji: "⚡" },
    ],
  },
  thief: {
    id: "thief",
    name: "Thief",
    emoji: "🗡️",
    color: 0x8b8b8b,
    description: "Fast and sneaky. Crits and steals gold from enemies.",
    baseStats: { hp: 80, mp: 30, attack: 12, defense: 5, speed: 160, crit: 22 },
    growthPerLevel: { hp: 9, mp: 2, attack: 3, defense: 1, speed: 3, crit: 2 },
    attackRange: 70,
    attackInterval: 500,
    starterSkills: [
      { id: "backstab", name: "Backstab", description: "Massive damage when behind target.", manaCost: 10, cooldown: 6000, damageMultiplier: 2.5, emoji: "🗡️" },
      { id: "steal", name: "Pickpocket", description: "Steal gold from an enemy.", manaCost: 8, cooldown: 8000, damageMultiplier: 0.3, emoji: "💰" },
    ],
  },
};

export const ALL_CLASSES: ClassDefinition[] = Object.values(CLASSES);

export function statsForLevel(classId: ClassId, level: number): BaseStats {
  const def = CLASSES[classId];
  const lv = Math.max(1, level) - 1;
  return {
    hp: def.baseStats.hp + def.growthPerLevel.hp * lv,
    mp: def.baseStats.mp + def.growthPerLevel.mp * lv,
    attack: def.baseStats.attack + def.growthPerLevel.attack * lv,
    defense: def.baseStats.defense + def.growthPerLevel.defense * lv,
    speed: def.baseStats.speed + def.growthPerLevel.speed * lv,
    crit: def.baseStats.crit + def.growthPerLevel.crit * lv,
  };
}

export function xpForLevel(level: number): number {
  return Math.floor(50 * Math.pow(level, 1.6));
}
