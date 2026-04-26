import { useState } from "react";
import { useGameStore } from "../store";
import { ZONES, type ZoneId } from "@aetheria/shared";
import { emitTravel } from "../socket";
import { Modal } from "./InventoryPanel";

interface Props {
  onClose: () => void;
}

export function TravelPanel({ onClose }: Props) {
  const me = useGameStore((s) => s.me);
  const [busy, setBusy] = useState<ZoneId | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!me) return null;

  async function travel(zone: ZoneId) {
    setError(null);
    setBusy(zone);
    const resp = await emitTravel(zone);
    setBusy(null);
    if (resp.ok) onClose();
    else setError(resp.error);
  }

  const ALL_ZONES: { id: ZoneId; recommendedLv: number }[] = [
    { id: "town", recommendedLv: 1 },
    { id: "house", recommendedLv: 1 },
    { id: "meadow", recommendedLv: 1 },
    { id: "forest", recommendedLv: 4 },
    { id: "crypt", recommendedLv: 8 },
  ];

  return (
    <Modal title="Travel" onClose={onClose}>
      <div className="text-xs text-stone-400 mb-3">
        From: <span className="text-aether-accent">{ZONES[me.zone].name}</span>
      </div>
      {error && <div className="text-aether-danger text-sm mb-2">{error}</div>}
      <div className="space-y-2">
        {ALL_ZONES.map((z) => {
          const def = ZONES[z.id];
          const isCurrent = z.id === me.zone;
          const onlyFromTown = z.id === "house" && me.zone !== "town";
          const tooLow = me.level < z.recommendedLv;
          return (
            <button
              key={z.id}
              className={`w-full panel p-3 text-left transition ${
                isCurrent
                  ? "opacity-50"
                  : "hover:border-aether-accent"
              }`}
              disabled={isCurrent || onlyFromTown || busy !== null}
              onClick={() => travel(z.id)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-display text-base">{def.name}</div>
                  <div className="text-[11px] text-stone-400">{def.description}</div>
                </div>
                <div className="text-xs">
                  {isCurrent ? (
                    <span className="text-aether-accent">Here</span>
                  ) : tooLow ? (
                    <span className="text-aether-danger">Lv {z.recommendedLv}+</span>
                  ) : onlyFromTown ? (
                    <span className="text-stone-500">From town only</span>
                  ) : busy === z.id ? (
                    "..."
                  ) : (
                    <span className="text-aether-accent">Go →</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
