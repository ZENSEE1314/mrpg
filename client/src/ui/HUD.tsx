import { useGameStore } from "../store";
import { CLASSES, ZONES, xpForLevel, type ClassId } from "@aetheria/shared";
import type { AuthUser } from "../api";
import { useEffect, useState } from "react";

interface Props {
  user: AuthUser;
  onLeave: () => void;
  onOpenPanel: (panel: "inventory" | "shop" | "agent" | "travel" | "chat" | "stats" | "bank") => void;
}

export function HUD({ user, onLeave, onOpenPanel }: Props) {
  const me = useGameStore((s) => s.me);
  const zone = useGameStore((s) => s.zone);
  const connected = useGameStore((s) => s.connected);
  const agentHints = useGameStore((s) => s.agentHints);
  const [latestHint, setLatestHint] = useState<string | null>(null);

  useEffect(() => {
    if (!agentHints.length) return;
    setLatestHint(agentHints[0]?.hint ?? null);
    const t = setTimeout(() => setLatestHint(null), 8000);
    return () => clearTimeout(t);
  }, [agentHints]);

  if (!me) {
    return (
      <div className="absolute top-3 left-3 panel px-3 py-2 text-xs text-stone-300">
        {connected ? "Loading hero..." : "Connecting..."}
      </div>
    );
  }

  const def = CLASSES[me.classId as ClassId];
  const xpNeeded = xpForLevel(me.level);
  const xpPct = Math.min(100, (me.xp / xpNeeded) * 100);
  const hpPct = (me.hp / me.maxHp) * 100;
  const mpPct = me.maxMp > 0 ? (me.mp / me.maxMp) * 100 : 0;
  const zoneDef = zone ? ZONES[zone] : null;

  return (
    <>
      <div className="absolute top-3 left-3 panel px-3 py-2 w-72 select-none">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-2xl">{def.emoji}</div>
          <div className="flex-1 min-w-0">
            <div className="font-display text-sm truncate">{me.name}</div>
            <div className="text-[10px] text-stone-400">
              Lv {me.level} {def.name} · {user.username}
            </div>
          </div>
          <div className="text-aether-accent font-bold text-sm">{me.gold}g</div>
        </div>
        <div className="space-y-1.5">
          <BarLabeled label="HP" value={`${me.hp}/${me.maxHp}`} pct={hpPct} color="#e05d5d" />
          <BarLabeled label="MP" value={`${me.mp}/${me.maxMp}`} pct={mpPct} color="#7d5cff" />
          <BarLabeled label="XP" value={`${me.xp}/${xpNeeded}`} pct={xpPct} color="#c9a14b" />
        </div>
      </div>

      <div className="absolute top-3 right-3 panel px-3 py-2 text-xs">
        <div className="font-display text-sm text-aether-accent">{zoneDef?.name ?? zone}</div>
        <div className="text-[10px] text-stone-400">{zoneDef?.description}</div>
        <div className="flex gap-1 mt-2 flex-wrap justify-end">
          <button className="btn !py-1 !px-2 !text-xs" onClick={() => onOpenPanel("stats")}>
            📊 Stats
            {me.unspentPoints > 0 && (
              <span className="ml-1 inline-block px-1 rounded bg-aether-accent text-stone-900 text-[10px] font-bold">
                {me.unspentPoints}
              </span>
            )}
          </button>
          <button className="btn !py-1 !px-2 !text-xs" onClick={() => onOpenPanel("inventory")}>
            🎒 Bag
          </button>
          <button className="btn !py-1 !px-2 !text-xs" onClick={() => onOpenPanel("shop")}>
            🛒 Shop
          </button>
          <button className="btn !py-1 !px-2 !text-xs" onClick={() => onOpenPanel("agent")}>
            🪶 Agent
          </button>
          <button className="btn !py-1 !px-2 !text-xs" onClick={() => onOpenPanel("travel")}>
            🗺️ Travel
          </button>
          <button className="btn !py-1 !px-2 !text-xs" onClick={() => onOpenPanel("chat")}>
            💬 Chat
          </button>
          {user.isAdmin && (
            <a
              className="btn !py-1 !px-2 !text-xs"
              href="/admin"
              target="_blank"
              rel="noreferrer"
              title="Open admin in a new tab"
            >
              🛠 Admin
            </a>
          )}
          <button className="btn-danger !py-1 !px-2 !text-xs" onClick={onLeave}>
            ⎋
          </button>
        </div>
      </div>

      {latestHint && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 panel px-4 py-2 max-w-md text-sm">
          <span className="text-aether-accent2">🪶 {me.agent.name}: </span>
          <span className="text-stone-200">{latestHint}</span>
        </div>
      )}
    </>
  );
}

function BarLabeled({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] text-stone-400">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="bar-shell">
        <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
