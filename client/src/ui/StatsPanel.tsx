import { useGameStore } from "../store";
import {
  CLASSES,
  DEFAULT_GAME_CONFIG,
  attributeUpgradeCost,
  bonusFromAttributes,
  type AttributeId,
  type ClassId,
} from "@aetheria/shared";
import { emitAllocateStat } from "../socket";
import { Modal } from "./InventoryPanel";

interface Props {
  onClose: () => void;
}

const ATTR_META: Array<{
  id: AttributeId;
  name: string;
  emoji: string;
  blurb: string;
}> = [
  { id: "str", name: "Strength", emoji: "💪", blurb: "+2 attack · +5 max HP · +0.5 defense (per point)" },
  { id: "agi", name: "Agility", emoji: "🏃", blurb: "+2 speed · +0.4 crit · +0.25 defense (per point)" },
  { id: "luck", name: "Luck", emoji: "🍀", blurb: "+0.6 crit (per point) · loot luck" },
  { id: "magic", name: "Magic", emoji: "🔮", blurb: "+4 max MP (per point) · spell power" },
];

export function StatsPanel({ onClose }: Props) {
  const me = useGameStore((s) => s.me);
  if (!me) return null;
  const def = CLASSES[me.classId as ClassId];
  const cfg = DEFAULT_GAME_CONFIG; // client uses default cost-curve display; server enforces real cost.
  const bonus = bonusFromAttributes(me.attrs);

  return (
    <Modal title="Stats & Attributes" onClose={onClose}>
      <div className="text-xs text-stone-400 mb-3">
        <span className="text-aether-accent font-bold">{me.name}</span> · Lv {me.level} {def.name}
      </div>

      <div className="panel p-2 mb-3 grid grid-cols-3 gap-2 text-[11px]">
        <Stat label="ATK" value={me.stats.attack} />
        <Stat label="DEF" value={me.stats.defense} />
        <Stat label="SPD" value={me.stats.speed} />
        <Stat label="CRIT" value={`${me.stats.crit}%`} />
        <Stat label="HP" value={`${me.hp}/${me.maxHp}`} />
        <Stat label="MP" value={`${me.mp}/${me.maxMp}`} />
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="text-sm">
          Unspent points:{" "}
          <span className="text-aether-accent font-bold">{me.unspentPoints}</span>
        </div>
        <div className="text-[10px] text-stone-500">+{cfg.pointsPerLevel} per level</div>
      </div>

      <div className="space-y-2">
        {ATTR_META.map((meta) => {
          const value = me.attrs[meta.id];
          const cost = attributeUpgradeCost(value, cfg);
          const canAfford = me.unspentPoints >= cost;
          return (
            <div key={meta.id} className="panel p-2 flex items-center gap-3">
              <div className="text-xl w-7 text-center">{meta.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium">{meta.name}</span>
                  <span className="text-aether-accent font-bold">{value}</span>
                </div>
                <div className="text-[10px] text-stone-400 truncate">{meta.blurb}</div>
              </div>
              <button
                className="btn !py-1 !px-2 !text-xs"
                disabled={!canAfford}
                onClick={() => emitAllocateStat(meta.id)}
                title={`Costs ${cost} pts`}
              >
                +1 ({cost})
              </button>
            </div>
          );
        })}
      </div>

      <div className="text-[10px] text-stone-500 mt-3 leading-relaxed">
        Bonus from attributes — ATK +{bonus.attack}, DEF +{bonus.defense}, SPD +{bonus.speed},
        CRIT +{bonus.crit}, HP +{bonus.hp}, MP +{bonus.mp}.
        Cost rises every {cfg.statCostBracketSize} points.
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="panel p-1 text-center">
      <div className="text-[9px] text-stone-500 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
