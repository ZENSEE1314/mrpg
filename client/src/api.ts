import type { ItemDef, GameConfig as GameConfigT } from "@aetheria/shared";

const API_BASE = "/api";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  isAdmin?: boolean;
}

export interface CharacterSummary {
  id: string;
  name: string;
  class_id: string;
  level: number;
  xp: number;
  gold: number;
}

function getToken(): string | null {
  return localStorage.getItem("aetheria.token");
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  async register(email: string, username: string, password: string) {
    const data = await jsonFetch<{ token: string; user: AuthUser }>(`${API_BASE}/auth/register`, {
      method: "POST",
      body: JSON.stringify({ email, username, password }),
    });
    localStorage.setItem("aetheria.token", data.token);
    return data;
  },

  async login(emailOrUsername: string, password: string) {
    const data = await jsonFetch<{ token: string; user: AuthUser }>(`${API_BASE}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ emailOrUsername, password }),
    });
    localStorage.setItem("aetheria.token", data.token);
    return data;
  },

  async me() {
    return jsonFetch<{ user: AuthUser }>(`${API_BASE}/auth/me`);
  },

  async listCharacters() {
    return jsonFetch<{ characters: CharacterSummary[] }>(`${API_BASE}/auth/characters`);
  },

  async createCharacter(name: string, classId: string) {
    return jsonFetch<{ character: CharacterSummary }>(`${API_BASE}/auth/characters`, {
      method: "POST",
      body: JSON.stringify({ name, classId }),
    });
  },

  async deleteCharacter(id: string) {
    return jsonFetch<{ ok: boolean }>(`${API_BASE}/auth/characters/${id}`, { method: "DELETE" });
  },

  async shop() {
    return jsonFetch<{ items: ItemDef[] }>(`${API_BASE}/shop`);
  },

  // --- admin ---
  async adminConfig() {
    return jsonFetch<{ config: GameConfigT; defaults: GameConfigT }>(`${API_BASE}/admin/config`);
  },
  async adminUpdateConfig(patch: Partial<GameConfigT>) {
    return jsonFetch<{ config: GameConfigT }>(`${API_BASE}/admin/config`, {
      method: "POST",
      body: JSON.stringify(patch),
    });
  },
  async adminShop() {
    return jsonFetch<{
      items: Array<{
        id: string;
        name: string;
        slot: string;
        rarity: string;
        defaultBuyPrice: number;
        defaultSellPrice: number;
        buyPrice: number;
        sellPrice: number;
      }>;
    }>(`${API_BASE}/admin/shop`);
  },
  async adminUpdateShopItem(id: string, prices: { buyPrice?: number; sellPrice?: number }) {
    return jsonFetch<{ overrides: Record<string, { buyPrice?: number; sellPrice?: number }> }>(
      `${API_BASE}/admin/shop`,
      { method: "POST", body: JSON.stringify({ id, ...prices }) },
    );
  },
  async adminQuests() {
    return jsonFetch<{
      quests: Array<{
        id: string;
        title: string;
        description: string;
        objective: { kind?: string; target?: string; count?: number };
        reward: { xp?: number; gold?: number; itemId?: string; itemQty?: number };
        isActive: boolean;
      }>;
    }>(`${API_BASE}/admin/quests`);
  },
  async adminCreateQuest(payload: {
    title: string;
    description: string;
    objective?: { kind?: string; target?: string; count?: number };
    reward?: { xp?: number; gold?: number; itemId?: string; itemQty?: number };
    isActive?: boolean;
  }) {
    return jsonFetch<{ id: string }>(`${API_BASE}/admin/quests`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  async adminDeleteQuest(id: string) {
    return jsonFetch<{ ok: boolean }>(`${API_BASE}/admin/quests/${id}`, { method: "DELETE" });
  },

  logout() {
    localStorage.removeItem("aetheria.token");
    localStorage.removeItem("aetheria.charId");
  },

  getToken,
  setActiveCharacter(id: string) {
    localStorage.setItem("aetheria.charId", id);
  },
  getActiveCharacter() {
    return localStorage.getItem("aetheria.charId");
  },
};
