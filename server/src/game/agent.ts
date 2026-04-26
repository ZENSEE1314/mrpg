import { db, type CharacterRow, type MemoryRow } from "../db.js";
import type { AgentState, PlayerState } from "@aetheria/shared";

const HERMES_FEED_COOLDOWN_MS = 60 * 60 * 1000;
const TRAINING_XP_PER_ACTION = 5;

export interface AgentActionResult {
  ok: boolean;
  error?: string;
  agent?: AgentState;
  hint?: string;
}

export class AgentService {
  feed(charId: string, agent: AgentState): AgentActionResult {
    const now = Date.now();
    if (now - agent.hermesFedAt < HERMES_FEED_COOLDOWN_MS) {
      const minsLeft = Math.ceil((HERMES_FEED_COOLDOWN_MS - (now - agent.hermesFedAt)) / 60_000);
      return { ok: false, error: `Hermes is full. Try again in ${minsLeft}m.` };
    }
    const newAgent: AgentState = {
      ...agent,
      hermesFedAt: now,
      loyalty: Math.min(100, agent.loyalty + 5),
      xp: agent.xp + 10,
    };
    while (newAgent.xp >= xpForAgentLevel(newAgent.level)) {
      newAgent.xp -= xpForAgentLevel(newAgent.level);
      newAgent.level += 1;
      newAgent.hermesLevel = Math.min(10, newAgent.hermesLevel + (newAgent.level % 2 === 0 ? 1 : 0));
    }
    db.prepare(
      "INSERT INTO agent_memories (character_id, kind, payload_json, created_at) VALUES (?, ?, ?, ?)",
    ).run(charId, "fed", JSON.stringify({ ts: now }), now);
    return { ok: true, agent: newAgent };
  }

  train(charId: string, agent: AgentState, payload: { skill?: string }): AgentActionResult {
    const newAgent: AgentState = {
      ...agent,
      xp: agent.xp + TRAINING_XP_PER_ACTION,
      obsidianMemoryCount: agent.obsidianMemoryCount + 1,
    };
    while (newAgent.xp >= xpForAgentLevel(newAgent.level)) {
      newAgent.xp -= xpForAgentLevel(newAgent.level);
      newAgent.level += 1;
    }
    db.prepare(
      "INSERT INTO agent_memories (character_id, kind, payload_json, created_at) VALUES (?, ?, ?, ?)",
    ).run(charId, "train", JSON.stringify(payload ?? {}), Date.now());
    return { ok: true, agent: newAgent };
  }

  rename(_charId: string, agent: AgentState, payload: { name?: string }): AgentActionResult {
    const name = (payload.name ?? "").trim();
    if (name.length < 2 || name.length > 16 || !/^[a-zA-Z0-9 ]+$/.test(name)) {
      return { ok: false, error: "Name must be 2-16 letters/numbers." };
    }
    return { ok: true, agent: { ...agent, name } };
  }

  ask(charId: string, player: PlayerState): AgentActionResult {
    const memories = db
      .prepare(
        "SELECT * FROM agent_memories WHERE character_id = ? ORDER BY created_at DESC LIMIT 50",
      )
      .all(charId) as MemoryRow[];

    const killCounts: Record<string, number> = {};
    let totalKills = 0;
    for (const m of memories) {
      if (m.kind === "kill") {
        try {
          const p = JSON.parse(m.payload_json) as { monster: string };
          killCounts[p.monster] = (killCounts[p.monster] ?? 0) + 1;
          totalKills += 1;
        } catch { /* skip malformed */ }
      }
    }

    const hint = composeHint(player, killCounts, totalKills, player.agent.hermesLevel);
    const updated: AgentState = { ...player.agent, lastHint: hint };
    db.prepare(
      "INSERT INTO agent_memories (character_id, kind, payload_json, created_at) VALUES (?, ?, ?, ?)",
    ).run(charId, "ask", JSON.stringify({ hint }), Date.now());
    return { ok: true, agent: updated, hint };
  }

  loadAgent(charId: string): AgentState | null {
    const row = db.prepare("SELECT agent_json FROM characters WHERE id = ?").get(charId) as
      | Pick<CharacterRow, "agent_json">
      | undefined;
    if (!row) return null;
    return JSON.parse(row.agent_json) as AgentState;
  }
}

function xpForAgentLevel(level: number): number {
  return Math.floor(40 * Math.pow(level, 1.5));
}

function composeHint(
  player: PlayerState,
  killCounts: Record<string, number>,
  totalKills: number,
  hermesLevel: number,
): string {
  const lowHp = player.hp / player.maxHp < 0.3;
  const lowGold = player.gold < 30;
  const inventoryHasPotions = player.inventory.some((s) => s.itemId.startsWith("potion_hp"));
  const top = Object.entries(killCounts).sort((a, b) => b[1] - a[1])[0];

  const tips: string[] = [];

  if (lowHp) tips.push("Your HP is low. Use a potion or head back to town.");
  if (!inventoryHasPotions && player.zone !== "town") tips.push("You're out of healing potions. Risky.");
  if (lowGold && player.zone === "town") tips.push("Low on gold. Hunt some slimes — they're an easy income loop.");

  if (player.level >= 4 && player.zone === "meadow") tips.push("You've outgrown the meadow. Try the Whispering Forest.");
  if (player.level >= 8 && player.zone === "forest") tips.push("Crypt-level mobs would give you better XP now.");

  if (top && totalKills >= 5) {
    tips.push(`You've killed a lot of ${top[0]}s (${top[1]}). Hermes can fast-travel you to their zone.`);
  }

  if (hermesLevel >= 3) tips.push("Hermes is well-trained — selling materials in town gives a small bonus right now.");

  if (tips.length === 0) tips.push("All quiet. Maybe explore a new zone or try a tougher monster.");

  return tips.join(" ");
}
