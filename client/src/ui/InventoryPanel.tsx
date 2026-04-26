import { useGameStore } from "../store";
import {
  EQUIP_SLOT_LABEL,
  EQUIP_SLOT_ORDER,
  INVENTORY_COLS,
  INVENTORY_ROWS,
  ITEMS,
  isTwoHanded,
  itemShape,
  type EquipSlot,
  type InventoryItem,
  type ItemDef,
  type ItemRarity,
} from "@aetheria/shared";
import { emitItem, emitSell, emitUnequip } from "../socket";
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

const CELL = 40;        // px per grid cell in the inventory panel

export function InventoryPanel({ onClose }: Props) {
  const me = useGameStore((s) => s.me);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  if (!me) return null;
  const inTown = me.zone === "town";

  const equippedUids = new Set(
    Object.values(me.equipped).filter((v): v is string => typeof v === "string"),
  );
  const selected = selectedUid ? me.inventory.find((it) => it.uid === selectedUid) ?? null : null;
  const selectedDef = selected ? ITEMS[selected.itemId] : null;

  return (
    <Modal title="Inventory" onClose={onClose}>
      <div className="text-xs text-stone-400 mb-3">
        Gold: <span className="text-aether-accent font-bold">{me.gold}</span>
      </div>

      {/* Equipment paper-doll */}
      <div className="grid grid-cols-5 gap-1.5 mb-3">
        {EQUIP_SLOT_ORDER.map((slot) => {
          const uid = me.equipped[slot];
          const inst = uid ? me.inventory.find((it) => it.uid === uid) ?? null : null;
          const def = inst ? ITEMS[inst.itemId] : null;
          return (
            <button
              key={slot}
              className="panel p-1 text-left h-14 flex flex-col justify-between hover:border-aether-accent transition"
              onClick={() => uid && emitUnequip(slot)}
              title={def ? `${def.name} — click to unequip` : EQUIP_SLOT_LABEL[slot]}
            >
              <div className="text-[9px] text-stone-500 leading-none">
                {EQUIP_SLOT_LABEL[slot]}
              </div>
              {def ? (
                <div className="text-base">
                  <span>{def.emoji}</span>
                </div>
              ) : (
                <div className="text-[10px] text-stone-600">—</div>
              )}
            </button>
          );
        })}
      </div>

      {/* 6×6 grid */}
      <div
        className="relative panel p-1 mb-2 mx-auto"
        style={{
          width: INVENTORY_COLS * CELL + 8,
          height: INVENTORY_ROWS * CELL + 8,
        }}
      >
        {/* Grid lines */}
        <div
          className="absolute inset-1"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: `${CELL}px ${CELL}px`,
          }}
        />
        {me.inventory.map((it) => {
          const def = ITEMS[it.itemId];
          if (!def) return null;
          const sh = itemShape(def);
          const isEquipped = equippedUids.has(it.uid);
          const isSelected = selectedUid === it.uid;
          const color = RARITY_COLOR[def.rarity];
          return (
            <button
              key={it.uid}
              onClick={() => setSelectedUid(isSelected ? null : it.uid)}
              className="absolute panel flex flex-col items-center justify-center hover:brightness-125 transition"
              style={{
                left: 4 + it.x * CELL,
                top: 4 + it.y * CELL,
                width: sh.w * CELL - 4,
                height: sh.h * CELL - 4,
                borderColor: color,
                outline: isSelected ? `2px solid ${color}` : undefined,
                opacity: isEquipped ? 0.55 : 1,
              }}
              title={`${def.name}${isEquipped ? " (equipped)" : ""}`}
            >
              <div className="text-xl leading-none">{def.emoji}</div>
              {it.qty > 1 && (
                <div className="absolute bottom-0 right-1 text-[9px] text-stone-200 font-bold">
                  ×{it.qty}
                </div>
              )}
              {it.sockets.length > 0 && (
                <div className="absolute top-0 left-0.5 flex gap-0.5">
                  {it.sockets.map((g, i) => (
                    <span
                      key={i}
                      className="block w-1.5 h-1.5 rounded-full"
                      style={{ background: g ? "#5dc88a" : "rgba(255,255,255,0.4)" }}
                    />
                  ))}
                </div>
              )}
              {isEquipped && (
                <div className="absolute top-0 right-0.5 text-[8px] text-aether-accent font-bold">E</div>
              )}
            </button>
          );
        })}
      </div>

      {/* Detail / actions for selected item */}
      {selected && selectedDef && (
        <ItemDetail
          item={selected}
          def={selectedDef}
          isEquipped={equippedUids.has(selected.uid)}
          inTown={inTown}
          onActed={() => setSelectedUid(null)}
        />
      )}

      <div className="text-[10px] text-stone-500 mt-2 text-center">
        {me.inventory.length} item{me.inventory.length === 1 ? "" : "s"} — bag full → drops land
        on the floor and vanish in 90s.
      </div>
    </Modal>
  );
}

function ItemDetail({
  item,
  def,
  isEquipped,
  inTown,
  onActed,
}: {
  item: InventoryItem;
  def: ItemDef;
  isEquipped: boolean;
  inTown: boolean;
  onActed: () => void;
}) {
  const color = RARITY_COLOR[def.rarity];
  return (
    <div className="panel p-3" style={{ borderColor: color }}>
      <div className="flex items-center gap-2">
        <div className="text-2xl">{def.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium" style={{ color }}>
            {def.name}
            {isTwoHanded(def) && (
              <span className="ml-2 text-[10px] text-stone-400">(Two-handed)</span>
            )}
          </div>
          <div className="text-[10px] text-stone-500 capitalize">
            {def.rarity} · {def.slot}
          </div>
        </div>
        <div className="flex gap-1">
          {def.slot === "consumable" && (
            <button className="btn !py-1 !px-2 !text-xs" onClick={() => { emitItem(item.uid); onActed(); }}>
              Use
            </button>
          )}
          {(def.slot === "head" || def.slot === "chest" || def.slot === "legs" ||
            def.slot === "gloves" || def.slot === "mainHand" || def.slot === "offHand" ||
            def.slot === "amulet" || def.slot === "belt" || def.slot === "ring1" ||
            def.slot === "twoHanded") && (
            <button
              className="btn !py-1 !px-2 !text-xs"
              disabled={isEquipped}
              onClick={() => { emitItem(item.uid); onActed(); }}
            >
              {isEquipped ? "Equipped" : "Equip"}
            </button>
          )}
          {inTown && def.sellPrice > 0 && !isEquipped && (
            <button
              className="btn-warning !py-1 !px-2 !text-xs"
              onClick={() => { emitSell(item.uid); onActed(); }}
            >
              Sell {def.sellPrice}g
            </button>
          )}
        </div>
      </div>
      <div className="text-[11px] text-stone-400 mt-1">{def.description}</div>
      {item.affixes.length > 0 && (
        <ul className="text-[11px] mt-2 space-y-0.5">
          {item.affixes.map((aff, i) => (
            <li key={i} className="text-aether-accent2">
              + {aff.value} {aff.stat.toUpperCase()}
            </li>
          ))}
        </ul>
      )}
      {item.sockets.length > 0 && (
        <div className="text-[10px] text-stone-500 mt-2">
          Sockets:{" "}
          {item.sockets.map((g, i) => (
            <span
              key={i}
              className="inline-block w-2 h-2 rounded-full mx-0.5"
              style={{ background: g ? "#5dc88a" : "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.4)" }}
            />
          ))}
        </div>
      )}
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
      <div className="panel p-5 w-full max-w-md max-h-[90vh] overflow-y-auto">
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
