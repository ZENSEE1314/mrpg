import type { ItemDef } from "@aetheria/shared";

const API_BASE = "/api";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
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
