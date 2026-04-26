import { useState } from "react";
import { useGameStore } from "../store";
import { emitAgent } from "../socket";
import { Modal } from "./InventoryPanel";

interface Props {
  onClose: () => void;
}

export function AgentPanel({ onClose }: Props) {
  const me = useGameStore((s) => s.me);
  const hints = useGameStore((s) => s.agentHints);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");

  if (!me) return null;
  const a = me.agent;

  async function call(action: "feed" | "train" | "ask" | "rename", payload?: unknown) {
    setError(null);
    setBusy(action);
    const resp = await emitAgent(action, payload);
    setBusy(null);
    if (!resp.ok) setError(resp.error);
  }

  const hermesCdLeft = Math.max(0, 60 * 60 * 1000 - (Date.now() - a.hermesFedAt));
  const hermesReady = hermesCdLeft <= 0;
  const hermesMins = Math.ceil(hermesCdLeft / 60_000);

  const xpForNext = Math.floor(40 * Math.pow(a.level, 1.5));
  const xpPct = Math.min(100, (a.xp / xpForNext) * 100);

  return (
    <Modal title={`${a.name} — Companion`} onClose={onClose}>
      <div className="panel p-3 mb-3 bg-gradient-to-br from-aether-accent2/10 to-transparent">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-3xl">🪶</div>
          <div className="flex-1">
            {renaming ? (
              <div className="flex gap-1">
                <input
                  className="input !py-1 !text-xs"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={16}
                />
                <button
                  className="btn !py-1 !px-2 !text-xs"
                  onClick={async () => {
                    await call("rename", { name: newName });
                    setRenaming(false);
                  }}
                >
                  Save
                </button>
              </div>
            ) : (
              <>
                <div className="font-display text-lg">{a.name}</div>
                <div className="text-xs text-stone-400">
                  Lv {a.level} · Loyalty {a.loyalty}/100
                </div>
              </>
            )}
          </div>
          {!renaming && (
            <button
              className="btn !py-1 !px-2 !text-xs"
              onClick={() => {
                setRenaming(true);
                setNewName(a.name);
              }}
            >
              Rename
            </button>
          )}
        </div>
        <div className="bar-shell">
          <div className="bar-fill" style={{ width: `${xpPct}%`, background: "#7d5cff" }} />
        </div>
        <div className="text-[10px] text-stone-400 mt-1">
          {a.xp}/{xpForNext} XP to level {a.level + 1}
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <SkillRow
          icon="🪽"
          name="Hermes"
          subtitle={`Tier ${a.hermesLevel} · ${hermesReady ? "Hungry — feed me" : `Full for ${hermesMins}m`}`}
          desc="Auto-suggests trades, fast-travel hints, and routes that earn you gold."
        />
        <SkillRow
          icon="🪨"
          name="Obsidian Memory"
          subtitle={`${a.obsidianMemoryCount} memories stored`}
          desc="Remembers what you do — kills, deaths, purchases — and adapts hints to your playstyle."
        />
      </div>

      {error && <div className="text-aether-danger text-sm mb-2">{error}</div>}

      <div className="grid grid-cols-3 gap-2">
        <button
          className="btn-primary !py-2 !text-xs"
          disabled={busy === "feed" || !hermesReady}
          onClick={() => call("feed")}
        >
          {busy === "feed" ? "..." : hermesReady ? "🍎 Feed" : `${hermesMins}m`}
        </button>
        <button className="btn !text-xs" disabled={busy === "train"} onClick={() => call("train")}>
          {busy === "train" ? "..." : "🎯 Train"}
        </button>
        <button className="btn !text-xs" disabled={busy === "ask"} onClick={() => call("ask")}>
          {busy === "ask" ? "..." : "💭 Ask"}
        </button>
      </div>

      <div className="mt-4">
        <div className="label">Recent hints</div>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {hints.length === 0 ? (
            <div className="text-stone-500 italic text-xs">No hints yet. Press "Ask".</div>
          ) : (
            hints.map((h, i) => (
              <div key={i} className="text-xs text-stone-300 panel p-2">
                <span className="text-aether-accent2">[{h.tag}]</span> {h.hint}
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

function SkillRow({
  icon,
  name,
  subtitle,
  desc,
}: {
  icon: string;
  name: string;
  subtitle: string;
  desc: string;
}) {
  return (
    <div className="panel p-2">
      <div className="flex items-center gap-2">
        <div className="text-xl">{icon}</div>
        <div className="flex-1">
          <div className="text-sm font-medium">{name}</div>
          <div className="text-[11px] text-stone-400">{subtitle}</div>
        </div>
      </div>
      <div className="text-[11px] text-stone-300 mt-1">{desc}</div>
    </div>
  );
}
