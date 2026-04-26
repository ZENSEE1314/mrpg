import { useEffect, useState } from "react";
import { useGameStore } from "../store";
import { api } from "../api";
import { emitBuy } from "../socket";
import type { ItemDef } from "@aetheria/shared";
import { Modal } from "./InventoryPanel";

interface Props {
  onClose: () => void;
}

export function ShopPanel({ onClose }: Props) {
  const me = useGameStore((s) => s.me);
  const [items, setItems] = useState<ItemDef[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .shop()
      .then((d) => setItems(d.items))
      .catch((err) => setError((err as Error).message));
  }, []);

  if (!me) return null;
  if (me.zone !== "town") {
    return (
      <Modal title="Shop" onClose={onClose}>
        <div className="text-stone-400 text-sm">The shop is only open in town.</div>
      </Modal>
    );
  }

  async function buy(id: string) {
    setError(null);
    const resp = await emitBuy(id);
    if (!resp.ok) setError(resp.error);
  }

  return (
    <Modal title="Shop" onClose={onClose}>
      <div className="text-xs text-stone-400 mb-3">
        Gold: <span className="text-aether-accent font-bold">{me.gold}</span>
      </div>
      {error && <div className="text-aether-danger text-sm mb-2">{error}</div>}
      <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
        {items.map((item) => {
          const canAfford = me.gold >= item.buyPrice;
          return (
            <div key={item.id} className="flex items-center gap-2 panel p-2">
              <div className="text-2xl">{item.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate flex items-center gap-1">
                  {item.name}
                  <RarityTag rarity={item.rarity} />
                </div>
                <div className="text-[11px] text-stone-400 truncate">{item.description}</div>
              </div>
              <button
                className="btn-primary !py-1 !px-3 !text-xs"
                disabled={!canAfford}
                onClick={() => buy(item.id)}
              >
                {item.buyPrice}g
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function RarityTag({ rarity }: { rarity: ItemDef["rarity"] }) {
  const colors: Record<ItemDef["rarity"], string> = {
    common: "text-stone-400",
    uncommon: "text-emerald-400",
    rare: "text-blue-400",
    epic: "text-purple-400",
    legendary: "text-amber-400",
  };
  return <span className={`text-[9px] uppercase ${colors[rarity]}`}>{rarity}</span>;
}
