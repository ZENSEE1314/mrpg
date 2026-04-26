import { io, type Socket } from "socket.io-client";
import { useGameStore } from "./store";
import type { AckResp, AttributeId, ZoneId } from "@aetheria/shared";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      autoConnect: true,
      transports: ["websocket"],
    });
    wireGlobalListeners(socket);
  }
  return socket;
}

function wireGlobalListeners(s: Socket): void {
  const store = useGameStore.getState;

  s.on("connect", () => store().setConnected(true));
  s.on("disconnect", () => store().setConnected(false));

  s.on("hello", (data) => {
    store().setMe(data.you);
    store().setZone(data.you.zone, data.players, data.monsters);
  });

  s.on("zoneSnapshot", (data) => {
    const me = store().me;
    if (me) {
      const updated = data.players.find((p: { id: string }) => p.id === me.id);
      if (updated) store().setMe(updated);
    }
    store().setZone(data.zone, data.players, data.monsters);
  });

  s.on("playerJoined", (data) => {
    const me = store().me;
    if (data.player.id === me?.id) {
      store().setMe(data.player);
    }
    store().upsertPlayer(data.player);
  });

  s.on("playerLeft", (data) => {
    store().removePlayer(data.playerId);
  });

  s.on("playerMoved", (data) => {
    const player = store().players.get(data.playerId);
    if (!player) return;
    store().upsertPlayer({ ...player, pos: data.pos, facing: data.facing });
  });

  s.on("playerStats", (data) => {
    const me = store().me;
    if (data.player.id === me?.id) store().setMe(data.player);
    store().upsertPlayer(data.player);
  });

  s.on("monsterSpawned", (data) => store().upsertMonster(data.monster));
  s.on("monsterUpdated", (data) => store().upsertMonster(data.monster));
  s.on("monsterDied", (data) => {
    store().removeMonster(data.monsterId);
    const me = store().me;
    if (me && me.id === data.killerId) {
      store().pushFloating({
        x: me.pos.x,
        y: me.pos.y - 30,
        text: `+${data.xp} XP, +${data.gold} g`,
        color: "#ffd54f",
      });
    }
  });

  s.on("damageDealt", (data) => {
    const target = data.isMonster
      ? store().monsters.get(data.targetId)
      : store().players.get(data.targetId);
    if (!target) return;
    const text = data.amount < 0 ? `+${-data.amount}` : `${data.amount}`;
    const color = data.amount < 0 ? "#5dc88a" : data.crit ? "#ffb84d" : "#ff7a7a";
    store().pushFloating({
      x: target.pos.x,
      y: target.pos.y - 20,
      text: data.crit ? `${text}!` : text,
      color,
    });
    // Auto-retaliate hook: if a monster just hit me and I'm not already
    // attacking, the world scene picks this up and engages.
    const me = store().me;
    if (
      !data.isMonster &&
      data.amount > 0 &&
      me &&
      data.targetId === me.id &&
      data.sourceId !== me.id
    ) {
      store().notifyAttackedBy(data.sourceId);
    }
  });

  s.on("chat", (data) => {
    store().addChat({ from: data.from, text: data.text, ts: data.ts });
  });

  s.on("systemMessage", (data) => {
    store().addChat({ from: "System", text: data.text, ts: Date.now(), system: true, level: data.level });
  });

  s.on("agentHint", (data) => {
    store().pushAgentHint({ hint: data.hint, tag: data.tag });
  });
}

export function authenticateSocket(token: string, characterId: string): Promise<AckResp> {
  return new Promise((resolve) => {
    getSocket().emit("authenticate", { token, characterId }, (ack: AckResp) => resolve(ack));
  });
}

export function emitMove(pos: { x: number; y: number }, facing: number): void {
  getSocket().emit("move", { pos, facing });
}
export function emitAttack(targetId: string): void {
  getSocket().emit("attack", { targetId });
}
export function emitSkill(skillId: string, targetId?: string): void {
  getSocket().emit("useSkill", { skillId, targetId });
}
export function emitItem(itemId: string): void {
  getSocket().emit("useItem", { itemId });
}
export function emitTravel(zone: ZoneId): Promise<AckResp> {
  return new Promise((resolve) => {
    getSocket().emit("travel", { zone }, (ack: AckResp) => resolve(ack));
  });
}
export function emitBuy(itemId: string): Promise<AckResp> {
  return new Promise((resolve) => {
    getSocket().emit("buyItem", { itemId }, (ack: AckResp) => resolve(ack));
  });
}
export function emitSell(itemId: string): Promise<AckResp> {
  return new Promise((resolve) => {
    getSocket().emit("sellItem", { itemId }, (ack: AckResp) => resolve(ack));
  });
}
export function emitChat(text: string): void {
  getSocket().emit("chat", { text });
}
export function emitAllocateStat(stat: AttributeId): Promise<AckResp> {
  return new Promise((resolve) => {
    getSocket().emit("allocateStat", { stat }, (ack: AckResp) => resolve(ack));
  });
}
export function emitAgent(action: "feed" | "train" | "ask" | "rename", payload?: unknown): Promise<AckResp> {
  return new Promise((resolve) => {
    getSocket().emit("agentAction", { action, payload }, (ack: AckResp) => resolve(ack));
  });
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
