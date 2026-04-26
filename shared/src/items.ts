export type ItemSlot = "weapon" | "armor" | "trinket" | "consumable" | "material";
export type ItemRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface ItemDef {
  id: string;
  name: string;
  emoji: string;
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
}

export const ITEMS: Record<string, ItemDef> = {
  potion_hp_s: { id: "potion_hp_s", name: "Lesser Healing Potion", emoji: "🧪", slot: "consumable", rarity: "common", description: "Restores 50 HP.", buyPrice: 20, sellPrice: 6, consumeEffect: { healHp: 50 }, stackable: true },
  potion_hp_m: { id: "potion_hp_m", name: "Healing Potion", emoji: "🧪", slot: "consumable", rarity: "uncommon", description: "Restores 150 HP.", buyPrice: 60, sellPrice: 18, consumeEffect: { healHp: 150 }, stackable: true },
  potion_mp_s: { id: "potion_mp_s", name: "Lesser Mana Potion", emoji: "🔵", slot: "consumable", rarity: "common", description: "Restores 30 MP.", buyPrice: 20, sellPrice: 6, consumeEffect: { healMp: 30 }, stackable: true },
  potion_mp_m: { id: "potion_mp_m", name: "Mana Potion", emoji: "🔵", slot: "consumable", rarity: "uncommon", description: "Restores 90 MP.", buyPrice: 60, sellPrice: 18, consumeEffect: { healMp: 90 }, stackable: true },

  sword_iron: { id: "sword_iron", name: "Iron Sword", emoji: "🗡️", slot: "weapon", rarity: "common", description: "+5 Attack.", buyPrice: 120, sellPrice: 40, bonuses: { attack: 5 }, stackable: false },
  sword_steel: { id: "sword_steel", name: "Steel Sword", emoji: "⚔️", slot: "weapon", rarity: "uncommon", description: "+12 Attack.", buyPrice: 380, sellPrice: 120, bonuses: { attack: 12 }, stackable: false },
  bow_oak: { id: "bow_oak", name: "Oak Bow", emoji: "🏹", slot: "weapon", rarity: "common", description: "+5 Attack, +3 Crit.", buyPrice: 130, sellPrice: 42, bonuses: { attack: 5, crit: 3 }, stackable: false },
  staff_apprentice: { id: "staff_apprentice", name: "Apprentice Staff", emoji: "🪄", slot: "weapon", rarity: "common", description: "+4 Attack, +20 MP.", buyPrice: 130, sellPrice: 42, bonuses: { attack: 4, mp: 20 }, stackable: false },

  armor_leather: { id: "armor_leather", name: "Leather Armor", emoji: "🦺", slot: "armor", rarity: "common", description: "+4 Defense.", buyPrice: 100, sellPrice: 32, bonuses: { defense: 4 }, stackable: false },
  armor_chain: { id: "armor_chain", name: "Chainmail", emoji: "🥋", slot: "armor", rarity: "uncommon", description: "+10 Defense, -5 Speed.", buyPrice: 320, sellPrice: 100, bonuses: { defense: 10, speed: -5 }, stackable: false },
  robe_cloth: { id: "robe_cloth", name: "Cloth Robe", emoji: "🧥", slot: "armor", rarity: "common", description: "+2 Defense, +30 MP.", buyPrice: 110, sellPrice: 35, bonuses: { defense: 2, mp: 30 }, stackable: false },

  amulet_swift: { id: "amulet_swift", name: "Amulet of Swiftness", emoji: "📿", slot: "trinket", rarity: "uncommon", description: "+15 Speed.", buyPrice: 280, sellPrice: 90, bonuses: { speed: 15 }, stackable: false },
  ring_focus: { id: "ring_focus", name: "Ring of Focus", emoji: "💍", slot: "trinket", rarity: "uncommon", description: "+5 Crit.", buyPrice: 280, sellPrice: 90, bonuses: { crit: 5 }, stackable: false },

  mat_slime_gel: { id: "mat_slime_gel", name: "Slime Gel", emoji: "🟢", slot: "material", rarity: "common", description: "Sticky and squishy.", buyPrice: 0, sellPrice: 3, stackable: true },
  mat_wolf_pelt: { id: "mat_wolf_pelt", name: "Wolf Pelt", emoji: "🐾", slot: "material", rarity: "common", description: "Used for crafting armor.", buyPrice: 0, sellPrice: 12, stackable: true },
  mat_bone: { id: "mat_bone", name: "Old Bone", emoji: "🦴", slot: "material", rarity: "common", description: "Used in dark crafts.", buyPrice: 0, sellPrice: 8, stackable: true },
};

export const SHOP_INVENTORY: string[] = [
  "potion_hp_s", "potion_hp_m", "potion_mp_s", "potion_mp_m",
  "sword_iron", "sword_steel", "bow_oak", "staff_apprentice",
  "armor_leather", "armor_chain", "robe_cloth",
  "amulet_swift", "ring_focus",
];

export const STARTER_INVENTORY: { itemId: string; qty: number }[] = [
  { itemId: "potion_hp_s", qty: 3 },
  { itemId: "potion_mp_s", qty: 2 },
];
