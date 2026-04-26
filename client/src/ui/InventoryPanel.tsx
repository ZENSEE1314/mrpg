import { useGameStore } from "../store";
import { ITEMS } from "@aetheria/shared";
import { emitItem, emitSell } from "../socket";

interface Props {
  onClose: () => void;
}

export function InventoryPanel({ onClose }: Props) {
  const me = useGameStore((s) => s.me);
  if (!me) return null;
  const inTown = me.zone === "town";

  return (
    <Modal title="Inventory" onClose={onClose}>
      <div className="text-xs text-stone-400 mb-3">
        Gold: <span className="text-aether-accent font-bold">{me.gold}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        <SlotCard label="Weapon" itemId={me.equipped.weapon} />
        <SlotCard label="Armor" itemId={me.equipped.armor} />
        <SlotCard label="Trinket" itemId={me.equipped.trinket} />
      </div>

      {me.inventory.length === 0 ? (
        <div className="text-stone-500 italic text-sm">Your bag is empty.</div>
      ) : (
        <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
          {me.inventory.map((slot) => {
            const def = ITEMS[slot.itemId];
            if (!def) return null;
            return (
              <div key={slot.itemId} className="flex items-center gap-2 panel p-2">
                <div className="text-2xl">{def.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {def.name} {slot.qty > 1 && <span className="text-stone-400">×{slot.qty}</span>}
                  </div>
                  <div className="text-[11px] text-stone-400 truncate">{def.description}</div>
                </div>
                <div className="flex gap-1">
                  {def.slot === "consumable" && (
                    <button className="btn !py-1 !px-2 !text-xs" onClick={() => emitItem(slot.itemId)}>
                      Use
                    </button>
                  )}
                  {(def.slot === "weapon" || def.slot === "armor" || def.slot === "trinket") && (
                    <button className="btn !py-1 !px-2 !text-xs" onClick={() => emitItem(slot.itemId)}>
                      Equip
                    </button>
                  )}
                  {inTown && def.sellPrice > 0 && (
                    <button
                      className="btn !py-1 !px-2 !text-xs text-aether-accent"
                      onClick={() => emitSell(slot.itemId)}
                    >
                      Sell {def.sellPrice}g
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function SlotCard({ label, itemId }: { label: string; itemId: string | null }) {
  const def = itemId ? ITEMS[itemId] : null;
  return (
    <div className="panel p-2 text-xs">
      <div className="text-stone-400">{label}</div>
      <div className="flex items-center gap-1 mt-1">
        <span className="text-xl">{def?.emoji ?? "—"}</span>
        <span className="truncate">{def?.name ?? "Empty"}</span>
      </div>
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-30 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="panel p-5 w-full max-w-md">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl text-aether-accent">{title}</h2>
          <button className="btn !py-1 !px-2" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
