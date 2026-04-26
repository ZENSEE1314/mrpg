import { useGameStore } from "../store";
import {
  EQUIP_SLOT_LABEL,
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

const CELL = 38; // px per inventory grid cell

// Diablo-ish paper-doll layout. Each entry is a slot positioned in % of the
// 5×7 cell grid that wraps the body silhouette.
const PAPERDOLL_LAYOUT: Record<EquipSlot, { col: number; row: number }> = {
  head:     { col: 3, row: 1 },   // top center
  amulet:   { col: 4, row: 2 },   // upper right (neck)
  mainHand: { col: 1, row: 3 },   // left arm
  chest:    { col: 3, row: 3 },   // center body
  offHand:  { col: 5, row: 3 },   // right arm
  belt:     { col: 3, row: 4 },   // waist
  legs:     { col: 3, row: 5 },   // pelvis/legs
  gloves:   { col: 1, row: 4 },   // off-side hand bracer
  ring1:    { col: 2, row: 6 },   // boots area, left
  ring2:    { col: 4, row: 6 },   // boots area, right
};

export function InventoryPanel({ onClose }: Props) {
  const me = useGameStore((s) => s.me);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  if (!me) return null;
  const inTown = me.zone === "town";

  const equippedUids = new Set(
    Object.values(me.equipped).filter((v): v is string => typeof v === "string"),
  );

  // Items currently sitting in the bag grid (NOT equipped, NOT off-grid).
  const gridItems = me.inventory.filter(
    (it) => !equippedUids.has(it.uid) && it.x >= 0 && it.y >= 0,
  );

  const selected = selectedUid
    ? me.inventory.find((it) => it.uid === selectedUid) ?? null
    : null;
  const selectedDef = selected ? ITEMS[selected.itemId] : null;

  const used = gridItems.reduce((acc, it) => {
    const def = ITEMS[it.itemId];
    if (!def) return acc;
    const sh = itemShape(def);
    return acc + sh.w * sh.h;
  }, 0);
  const total = INVENTORY_COLS * INVENTORY_ROWS;

  return (
    <Modal title="Inventory" onClose={onClose}>
      <div className="text-xs text-stone-400 mb-3 flex justify-between">
        <span>
          Gold: <span className="text-aether-accent font-bold">{me.gold}</span>
        </span>
        <span>
          Bag: <span className="text-stone-200">{used}/{total}</span> cells
        </span>
      </div>

      {/* Diablo-style paper-doll */}
      <Paperdoll me={me} />

      {/* 6×6 inventory grid (equipped items hidden) */}
      <div
        className="relative panel p-1 mb-2 mx-auto mt-3"
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
        {gridItems.map((it) => {
          const def = ITEMS[it.itemId];
          if (!def) return null;
          const sh = itemShape(def);
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
              }}
              title={def.name}
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
            </button>
          );
        })}
      </div>

      {/* Detail / actions for selected item */}
      {selected && selectedDef && (
        <ItemDetail
          item={selected}
          def={selectedDef}
          isEquipped={false /* equipped items can't be selected from grid now */}
          inTown={inTown}
          onActed={() => setSelectedUid(null)}
        />
      )}

      <div className="text-[10px] text-stone-500 mt-2 text-center">
        Click a paper-doll slot to unequip. Bag full → drops land on the floor (90s despawn).
      </div>
    </Modal>
  );
}

// ---------- Paper-doll ----------

function Paperdoll({ me }: { me: NonNullable<ReturnType<typeof useGameStore.getState>["me"]> }) {
  // Render-grid container is 5 cols × 7 rows of CELL+gap.
  const SLOT = 52;
  const W = 5 * SLOT + 16;
  const H = 7 * SLOT + 16;

  return (
    <div className="relative mx-auto" style={{ width: W, height: H }}>
      {/* Body silhouette behind the slots. */}
      <BodySilhouette />

      {Object.entries(PAPERDOLL_LAYOUT).map(([slotKey, pos]) => {
        const slot = slotKey as EquipSlot;
        const uid = me.equipped[slot];
        const inst = uid ? me.inventory.find((it) => it.uid === uid) ?? null : null;
        const def = inst ? ITEMS[inst.itemId] ?? null : null;
        const left = (pos.col - 1) * SLOT + 8;
        const top = (pos.row - 1) * SLOT + 8;
        return (
          <PaperdollSlot
            key={slot}
            slot={slot}
            inst={inst}
            def={def}
            left={left}
            top={top}
            size={SLOT - 6}
          />
        );
      })}
    </div>
  );
}

function PaperdollSlot({
  slot,
  inst,
  def,
  left,
  top,
  size,
}: {
  slot: EquipSlot;
  inst: InventoryItem | null;
  def: ItemDef | null;
  left: number;
  top: number;
  size: number;
}) {
  const filled = !!def;
  const color = def ? RARITY_COLOR[def.rarity] : undefined;
  return (
    <button
      className="absolute panel flex flex-col items-center justify-center transition hover:brightness-125"
      style={{
        left,
        top,
        width: size,
        height: size,
        borderColor: color,
        outline: filled ? `1px solid ${color}` : undefined,
        background: filled ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.35)",
      }}
      onClick={() => filled && emitUnequip(slot)}
      title={def ? `${def.name} — click to unequip` : EQUIP_SLOT_LABEL[slot]}
    >
      {filled ? (
        <>
          <div className="text-lg leading-none">{def.emoji}</div>
          {inst && inst.affixes.length > 0 && (
            <div className="absolute bottom-0 right-1 text-[8px] text-aether-accent2 font-bold">
              +{inst.affixes.length}
            </div>
          )}
          {inst && inst.sockets.length > 0 && (
            <div className="absolute top-0 left-0.5 flex gap-0.5">
              {inst.sockets.map((g, i) => (
                <span
                  key={i}
                  className="block w-1 h-1 rounded-full"
                  style={{ background: g ? "#5dc88a" : "rgba(255,255,255,0.4)" }}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="text-[8px] text-stone-500 uppercase tracking-wider leading-none text-center">
          {EQUIP_SLOT_LABEL[slot].replace(" ", "\n")}
        </div>
      )}
    </button>
  );
}

function BodySilhouette() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 140"
      preserveAspectRatio="none"
      style={{ opacity: 0.13 }}
    >
      {/* Head */}
      <circle cx="50" cy="20" r="11" fill="#fff" />
      {/* Neck */}
      <rect x="46" y="29" width="8" height="6" fill="#fff" />
      {/* Shoulders + torso */}
      <path
        d="M28 38 Q50 33 72 38 L70 78 Q70 82 66 84 L60 82 L58 100 L42 100 L40 82 L34 84 Q30 82 30 78 Z"
        fill="#fff"
      />
      {/* Arms */}
      <path d="M22 40 Q14 60 18 78 L24 78 Q26 60 30 42 Z" fill="#fff" />
      <path d="M78 40 Q86 60 82 78 L76 78 Q74 60 70 42 Z" fill="#fff" />
      {/* Belt accent */}
      <rect x="38" y="82" width="24" height="4" fill="#fff" opacity="0.6" />
      {/* Legs */}
      <path d="M40 88 L38 130 L46 132 L48 100 Z" fill="#fff" />
      <path d="M60 88 L62 130 L54 132 L52 100 Z" fill="#fff" />
    </svg>
  );
}

// ---------- Item detail card ----------

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
    <div className="panel p-3 mt-2" style={{ borderColor: color }}>
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
            <button
              className="btn !py-1 !px-2 !text-xs"
              onClick={() => {
                emitItem(item.uid);
                onActed();
              }}
            >
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
              onClick={() => {
                emitItem(item.uid);
                onActed();
              }}
            >
              {isEquipped ? "Equipped" : "Equip"}
            </button>
          )}
          {inTown && def.sellPrice > 0 && !isEquipped && (
            <button
              className="btn-warning !py-1 !px-2 !text-xs"
              onClick={() => {
                emitSell(item.uid);
                onActed();
              }}
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
              style={{
                background: g ? "#5dc88a" : "rgba(255,255,255,0.3)",
                border: "1px solid rgba(255,255,255,0.4)",
              }}
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
