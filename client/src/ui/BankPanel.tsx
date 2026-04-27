import { useGameStore } from "../store";
import {
  INVENTORY_COLS,
  INVENTORY_ROWS,
  ITEMS,
  itemShape,
  type InventoryItem,
  type ItemRarity,
} from "@aetheria/shared";
import { emitBankTransfer } from "../socket";
import { Modal } from "./InventoryPanel";
import { useState } from "react";

interface Props {
  onClose: () => void;
}

const RARITY_COLOR: Record<ItemRarity, string> = {
  common: "#cbd5e1",
  uncommon: "#5dc88a",
  rare: "#5b8aff",
  epic: "#bd5fff",
  legendary: "#ffd54f",
};

const CELL = 36;

export function BankPanel({ onClose }: Props) {
  const me = useGameStore((s) => s.me);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;

  const equippedUids = new Set(
    Object.values(me.equipped).filter((v): v is string => typeof v === "string"),
  );

  const bag = me.inventory.filter(
    (it) => !equippedUids.has(it.uid) && it.x >= 0 && it.y >= 0,
  );
  const bank = me.bank ?? [];

  const totalCells = INVENTORY_COLS * INVENTORY_ROWS;
  const usedBag = bag.reduce((acc, it) => {
    const def = ITEMS[it.itemId];
    if (!def) return acc;
    const sh = itemShape(def);
    return acc + sh.w * sh.h;
  }, 0);
  const usedBank = bank.reduce((acc, it) => {
    const def = ITEMS[it.itemId];
    if (!def) return acc;
    const sh = itemShape(def);
    return acc + sh.w * sh.h;
  }, 0);

  async function transfer(uid: string, direction: "toBank" | "toBag") {
    if (busyUid) return;
    setBusyUid(uid);
    setError(null);
    const ack = await emitBankTransfer(uid, direction);
    if (!ack.ok) setError(ack.error ?? "Transfer failed");
    setBusyUid(null);
  }

  return (
    <Modal title="🏛 Bank Vault" onClose={onClose}>
      <div className="text-[11px] text-stone-400 mb-3">
        Click an item to send it across. Equipped items must be unequipped first.
      </div>

      {error && (
        <div className="text-[11px] text-aether-danger panel p-2 mb-3 border-aether-danger/40">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Side
          title="Bag"
          subtitle={`${usedBag}/${totalCells}`}
          items={bag}
          busyUid={busyUid}
          onClickItem={(uid) => transfer(uid, "toBank")}
          actionLabel="→ Bank"
        />
        <Side
          title="Bank"
          subtitle={`${usedBank}/${totalCells}`}
          items={bank}
          busyUid={busyUid}
          onClickItem={(uid) => transfer(uid, "toBag")}
          actionLabel="← Bag"
        />
      </div>

      <div className="text-[10px] text-stone-500 mt-3 text-center">
        Bank is per-character and persists across sessions.
      </div>
    </Modal>
  );
}

function Side({
  title,
  subtitle,
  items,
  busyUid,
  onClickItem,
  actionLabel,
}: {
  title: string;
  subtitle: string;
  items: InventoryItem[];
  busyUid: string | null;
  onClickItem: (uid: string) => void;
  actionLabel: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-stone-300 font-medium">{title}</span>
        <span className="text-[10px] text-stone-500">{subtitle}</span>
      </div>
      <div
        className="relative panel p-1"
        style={{
          width: INVENTORY_COLS * CELL + 8,
          height: INVENTORY_ROWS * CELL + 8,
        }}
      >
        <div
          className="absolute inset-1"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: `${CELL}px ${CELL}px`,
          }}
        />
        {items.map((it) => {
          const def = ITEMS[it.itemId];
          if (!def) return null;
          const sh = itemShape(def);
          const color = RARITY_COLOR[def.rarity];
          const busy = busyUid === it.uid;
          return (
            <button
              key={it.uid}
              onClick={() => onClickItem(it.uid)}
              disabled={busy}
              className="absolute panel flex flex-col items-center justify-center hover:brightness-125 transition disabled:opacity-50"
              style={{
                left: 4 + Math.max(0, it.x) * CELL,
                top: 4 + Math.max(0, it.y) * CELL,
                width: sh.w * CELL - 4,
                height: sh.h * CELL - 4,
                borderColor: color,
              }}
              title={`${def.name} — ${actionLabel}`}
            >
              <div className="text-lg leading-none">{def.emoji}</div>
              {it.qty > 1 && (
                <div className="absolute bottom-0 right-1 text-[9px] text-stone-200 font-bold">
                  ×{it.qty}
                </div>
              )}
              {it.affixes.length > 0 && (
                <div className="absolute top-0 right-0.5 text-[8px] text-aether-accent2 font-bold">
                  +{it.affixes.length}
                </div>
              )}
              {it.sockets.length > 0 && (
                <div className="absolute top-0 left-0.5 flex gap-0.5">
                  {it.sockets.map((g, i) => (
                    <span
                      key={i}
                      className="block w-1 h-1 rounded-full"
                      style={{ background: g ? "#5dc88a" : "rgba(255,255,255,0.4)" }}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
        {items.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-stone-600 italic">
            empty
          </div>
        )}
      </div>
    </div>
  );
}
