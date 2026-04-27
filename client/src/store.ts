import { create } from "zustand";
import type { FloorItem, MonsterState, PlayerState, ZoneId } from "@aetheria/shared";

export interface ChatLine {
  from: string;
  text: string;
  ts: number;
  system?: boolean;
  level?: "info" | "warn" | "error";
}

export interface FloatingNumber {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  ts: number;
}

export type PanelId = "none" | "inventory" | "shop" | "agent" | "travel" | "chat" | "stats" | "bank";

interface GameStore {
  connected: boolean;
  me: PlayerState | null;
  players: Map<string, PlayerState>;
  monsters: Map<string, MonsterState>;
  floorItems: Map<string, FloorItem>;
  zone: ZoneId | null;
  chat: ChatLine[];
  selectedTargetId: string | null;
  floatings: FloatingNumber[];
  agentHints: { hint: string; tag: string; ts: number }[];
  activePanel: PanelId;
  incomingAttackerId: string | null;

  setConnected: (v: boolean) => void;
  setMe: (p: PlayerState | null) => void;
  upsertPlayer: (p: PlayerState) => void;
  removePlayer: (id: string) => void;
  upsertMonster: (m: MonsterState) => void;
  removeMonster: (id: string) => void;
  upsertFloorItem: (f: FloorItem) => void;
  removeFloorItem: (uid: string) => void;
  setZone: (
    zone: ZoneId,
    players: PlayerState[],
    monsters: MonsterState[],
    floorItems: FloorItem[],
  ) => void;
  selectTarget: (id: string | null) => void;
  addChat: (l: ChatLine) => void;
  pushFloating: (f: Omit<FloatingNumber, "id" | "ts">) => void;
  clearOldFloatings: () => void;
  pushAgentHint: (h: { hint: string; tag: string }) => void;
  setActivePanel: (p: PanelId) => void;
  notifyAttackedBy: (sourceId: string) => void;
  clearIncomingAttacker: () => void;
  reset: () => void;
}

let floatingId = 0;

export const useGameStore = create<GameStore>((set) => ({
  connected: false,
  me: null,
  players: new Map(),
  monsters: new Map(),
  floorItems: new Map(),
  zone: null,
  chat: [],
  selectedTargetId: null,
  floatings: [],
  agentHints: [],
  activePanel: "none",
  incomingAttackerId: null,

  setConnected: (v) => set({ connected: v }),
  setMe: (p) => set({ me: p }),
  upsertPlayer: (p) =>
    set((s) => {
      const next = new Map(s.players);
      next.set(p.id, p);
      return { players: next };
    }),
  removePlayer: (id) =>
    set((s) => {
      const next = new Map(s.players);
      next.delete(id);
      return { players: next };
    }),
  upsertMonster: (m) =>
    set((s) => {
      const next = new Map(s.monsters);
      next.set(m.id, m);
      return { monsters: next };
    }),
  removeMonster: (id) =>
    set((s) => {
      const next = new Map(s.monsters);
      next.delete(id);
      return { monsters: next };
    }),
  upsertFloorItem: (f) =>
    set((s) => {
      const next = new Map(s.floorItems);
      next.set(f.uid, f);
      return { floorItems: next };
    }),
  removeFloorItem: (uid) =>
    set((s) => {
      const next = new Map(s.floorItems);
      next.delete(uid);
      return { floorItems: next };
    }),
  setZone: (zone, players, monsters, floorItems) =>
    set({
      zone,
      players: new Map(players.map((p) => [p.id, p])),
      monsters: new Map(monsters.map((m) => [m.id, m])),
      floorItems: new Map(floorItems.map((f) => [f.uid, f])),
      selectedTargetId: null,
    }),
  selectTarget: (id) => set({ selectedTargetId: id }),
  addChat: (l) =>
    set((s) => ({
      chat: [...s.chat.slice(-49), l],
    })),
  pushFloating: (f) =>
    set((s) => ({
      floatings: [...s.floatings, { ...f, id: ++floatingId, ts: Date.now() }],
    })),
  clearOldFloatings: () =>
    set((s) => ({
      floatings: s.floatings.filter((f) => Date.now() - f.ts < 1200),
    })),
  pushAgentHint: (h) =>
    set((s) => ({
      agentHints: [{ ...h, ts: Date.now() }, ...s.agentHints].slice(0, 5),
    })),
  setActivePanel: (p) => set({ activePanel: p }),
  notifyAttackedBy: (sourceId) => set({ incomingAttackerId: sourceId }),
  clearIncomingAttacker: () => set({ incomingAttackerId: null }),
  reset: () =>
    set({
      connected: false,
      me: null,
      players: new Map(),
      monsters: new Map(),
      floorItems: new Map(),
      zone: null,
      chat: [],
      selectedTargetId: null,
      floatings: [],
      agentHints: [],
      activePanel: "none",
      incomingAttackerId: null,
    }),
}));
