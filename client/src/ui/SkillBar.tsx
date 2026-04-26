import { useEffect, useState } from "react";
import { useGameStore } from "../store";
import { CLASSES, type ClassId } from "@aetheria/shared";
import { emitItem, emitSkill } from "../socket";

interface Props {
  onOpenPanel: (panel: "inventory" | "shop" | "agent" | "travel" | "chat" | "stats") => void;
}

interface Cooldown {
  skillId: string;
  until: number;
}

export function SkillBar({ onOpenPanel }: Props) {
  const me = useGameStore((s) => s.me);
  const target = useGameStore((s) => s.selectedTargetId);
  const [cds, setCds] = useState<Cooldown[]>([]);
  const [, force] = useState(0);

  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 200);
    return () => clearInterval(t);
  }, []);

  if (!me) return null;
  const def = CLASSES[me.classId as ClassId];
  const now = Date.now();

  function castSkill(skillId: string, cooldownMs: number) {
    if (cds.find((c) => c.skillId === skillId && c.until > now)) return;
    emitSkill(skillId, target ?? undefined);
    setCds((prev) => [...prev.filter((c) => c.skillId !== skillId), { skillId, until: now + cooldownMs }]);
  }

  const hpPotion = me.inventory.find((s) => s.itemId === "potion_hp_s");
  const mpPotion = me.inventory.find((s) => s.itemId === "potion_mp_s");

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 panel p-2">
      {def.starterSkills.map((skill) => {
        const cd = cds.find((c) => c.skillId === skill.id);
        const remain = cd ? Math.max(0, cd.until - now) : 0;
        const onCd = remain > 0;
        const noMana = me.mp < skill.manaCost;
        return (
          <button
            key={skill.id}
            className="skill-btn"
            disabled={onCd || noMana}
            onClick={() => castSkill(skill.id, skill.cooldown)}
            title={`${skill.name} — ${skill.description} (${skill.manaCost} MP)`}
          >
            <span>{skill.emoji}</span>
            <span className="text-[9px] text-stone-300 mt-0.5">{skill.manaCost} MP</span>
            {onCd && <div className="cd-overlay">{(remain / 1000).toFixed(1)}s</div>}
          </button>
        );
      })}

      <div className="w-px h-10 bg-aether-border mx-1" />

      <button
        className="skill-btn"
        disabled={!hpPotion || hpPotion.qty <= 0 || me.hp >= me.maxHp}
        onClick={() => hpPotion && emitItem(hpPotion.uid)}
        title="Lesser Healing Potion (+50 HP)"
      >
        <span>🧪</span>
        <span className="text-[9px] text-stone-300 mt-0.5">{hpPotion?.qty ?? 0}</span>
      </button>
      <button
        className="skill-btn"
        disabled={!mpPotion || mpPotion.qty <= 0 || me.mp >= me.maxMp}
        onClick={() => mpPotion && emitItem(mpPotion.uid)}
        title="Lesser Mana Potion (+30 MP)"
      >
        <span>🔵</span>
        <span className="text-[9px] text-stone-300 mt-0.5">{mpPotion?.qty ?? 0}</span>
      </button>

      <div className="w-px h-10 bg-aether-border mx-1" />

      <button className="skill-btn" onClick={() => onOpenPanel("inventory")} title="Inventory">
        <span>🎒</span>
        <span className="text-[9px] text-stone-300 mt-0.5">Bag</span>
      </button>
    </div>
  );
}
