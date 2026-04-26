import { useEffect, useState } from "react";
import { api, type AuthUser } from "../api";
import type { GameConfig } from "@aetheria/shared";

interface ShopItem {
  id: string;
  name: string;
  slot: string;
  rarity: string;
  defaultBuyPrice: number;
  defaultSellPrice: number;
  buyPrice: number;
  sellPrice: number;
}

interface QuestRow {
  id: string;
  title: string;
  description: string;
  objective: { kind?: string; target?: string; count?: number };
  reward: { xp?: number; gold?: number; itemId?: string; itemQty?: number };
  isActive: boolean;
}

interface Props {
  user: AuthUser;
  onLeave: () => void;
}

export function AdminScreen({ user, onLeave }: Props) {
  const [config, setConfigState] = useState<GameConfig | null>(null);
  const [defaults, setDefaults] = useState<GameConfig | null>(null);
  const [shop, setShop] = useState<ShopItem[]>([]);
  const [quests, setQuests] = useState<QuestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [c, s, q] = await Promise.all([api.adminConfig(), api.adminShop(), api.adminQuests()]);
      setConfigState(c.config);
      setDefaults(c.defaults);
      setShop(s.items);
      setQuests(q.quests);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  if (loading) {
    return (
      <Page user={user} onLeave={onLeave}>
        <p className="text-stone-400">Loading…</p>
      </Page>
    );
  }
  if (error) {
    return (
      <Page user={user} onLeave={onLeave}>
        <div className="panel p-4">
          <div className="text-aether-danger mb-2">Error: {error}</div>
          <button className="btn" onClick={reload}>Retry</button>
        </div>
      </Page>
    );
  }

  return (
    <Page user={user} onLeave={onLeave}>
      <ConfigSection config={config!} defaults={defaults!} onSaved={reload} />
      <ShopSection items={shop} onSaved={reload} />
      <QuestSection quests={quests} onSaved={reload} />
    </Page>
  );
}

function Page({
  user,
  onLeave,
  children,
}: {
  user: AuthUser;
  onLeave: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full p-4 sm:p-8 bg-aether-bg">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl text-aether-accent">🛠 Aetheria · Admin</h1>
            <div className="text-xs text-stone-400">
              Signed in as <span className="font-mono">{user.username}</span>
            </div>
          </div>
          <button className="btn-danger" onClick={onLeave}>Back to game</button>
        </div>
        <div className="space-y-6">{children}</div>
      </div>
    </div>
  );
}

function ConfigSection({
  config,
  defaults,
  onSaved,
}: {
  config: GameConfig;
  defaults: GameConfig;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<GameConfig>(config);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await api.adminUpdateConfig(draft);
      setMsg("Saved");
      onSaved();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function field(key: keyof GameConfig, label: string, hint: string, step = 1) {
    return (
      <label className="block">
        <div className="flex items-baseline justify-between text-xs text-stone-400">
          <span>{label}</span>
          <span className="text-stone-500">default {defaults[key]}</span>
        </div>
        <input
          type="number"
          step={step}
          className="input w-full"
          value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
        />
        <div className="text-[10px] text-stone-500 mt-1">{hint}</div>
      </label>
    );
  }

  return (
    <section className="panel p-4">
      <h2 className="font-display text-lg text-aether-accent mb-3">Game balance</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {field("initialPoints", "Initial points at creation", "Points the hero gets to spend on first login.")}
        {field("pointsPerLevel", "Points per level up", "Granted automatically each level.")}
        {field("statCostBracketSize", "Stat cost bracket size", "Every N levels of a stat, cost goes up by 1.")}
        {field("statCostBase", "Base stat cost", "Cost in points for the very first upgrade.")}
        {field("xpBase", "XP base", "xpToNext = base × level^exp", 1)}
        {field("xpExp", "XP exponent", "Higher = harder leveling. 1.6 default.", 0.05)}
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button className="btn-primary" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save config"}
        </button>
        {msg && <span className="text-xs text-stone-400">{msg}</span>}
      </div>
    </section>
  );
}

function ShopSection({ items, onSaved }: { items: ShopItem[]; onSaved: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, { buy: string; sell: string }>>(() =>
    Object.fromEntries(items.map((i) => [i.id, { buy: String(i.buyPrice), sell: String(i.sellPrice) }])),
  );
  const [savingId, setSavingId] = useState<string | null>(null);

  async function save(id: string) {
    const d = drafts[id];
    if (!d) return;
    setSavingId(id);
    try {
      await api.adminUpdateShopItem(id, {
        buyPrice: Number(d.buy),
        sellPrice: Number(d.sell),
      });
      onSaved();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="panel p-4">
      <h2 className="font-display text-lg text-aether-accent mb-3">Shop prices</h2>
      <div className="space-y-2 max-h-[50vh] overflow-y-auto">
        {items.map((it) => {
          const d = drafts[it.id] ?? { buy: String(it.buyPrice), sell: String(it.sellPrice) };
          const overridden =
            it.buyPrice !== it.defaultBuyPrice || it.sellPrice !== it.defaultSellPrice;
          return (
            <div key={it.id} className="panel p-2 flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[180px]">
                <div className="text-sm font-medium">
                  {it.name}
                  {overridden && <span className="ml-2 text-[10px] text-aether-accent">overridden</span>}
                </div>
                <div className="text-[10px] text-stone-500">
                  {it.slot} · {it.rarity} · default buy {it.defaultBuyPrice} / sell {it.defaultSellPrice}
                </div>
              </div>
              <label className="text-[10px] text-stone-400">
                Buy
                <input
                  type="number"
                  className="input w-20 ml-1"
                  value={d.buy}
                  onChange={(e) => setDrafts({ ...drafts, [it.id]: { ...d, buy: e.target.value } })}
                />
              </label>
              <label className="text-[10px] text-stone-400">
                Sell
                <input
                  type="number"
                  className="input w-20 ml-1"
                  value={d.sell}
                  onChange={(e) => setDrafts({ ...drafts, [it.id]: { ...d, sell: e.target.value } })}
                />
              </label>
              <button
                className="btn !text-xs"
                disabled={savingId === it.id}
                onClick={() => save(it.id)}
              >
                {savingId === it.id ? "…" : "Save"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function QuestSection({ quests, onSaved }: { quests: QuestRow[]; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState("kill");
  const [target, setTarget] = useState("slime");
  const [count, setCount] = useState("5");
  const [xp, setXp] = useState("100");
  const [gold, setGold] = useState("50");
  const [creating, setCreating] = useState(false);

  async function create() {
    if (title.trim().length < 2 || description.trim().length < 2) return;
    setCreating(true);
    try {
      await api.adminCreateQuest({
        title: title.trim(),
        description: description.trim(),
        objective: { kind, target, count: Number(count) },
        reward: { xp: Number(xp), gold: Number(gold) },
        isActive: true,
      });
      setTitle("");
      setDescription("");
      onSaved();
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this quest?")) return;
    await api.adminDeleteQuest(id);
    onSaved();
  }

  return (
    <section className="panel p-4">
      <h2 className="font-display text-lg text-aether-accent mb-3">Quests</h2>

      <div className="panel p-3 mb-4">
        <div className="text-xs text-stone-400 mb-2">Add new quest</div>
        <input
          className="input w-full mb-2"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="input w-full mb-2"
          placeholder="Description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-2">
          <label className="text-[10px] text-stone-400">
            Objective
            <select className="input w-full" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="kill">kill</option>
              <option value="collect">collect</option>
              <option value="visit">visit</option>
            </select>
          </label>
          <label className="text-[10px] text-stone-400">
            Target
            <input className="input w-full" value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
          <label className="text-[10px] text-stone-400">
            Count
            <input className="input w-full" type="number" value={count} onChange={(e) => setCount(e.target.value)} />
          </label>
          <label className="text-[10px] text-stone-400">
            XP reward
            <input className="input w-full" type="number" value={xp} onChange={(e) => setXp(e.target.value)} />
          </label>
          <label className="text-[10px] text-stone-400">
            Gold reward
            <input className="input w-full" type="number" value={gold} onChange={(e) => setGold(e.target.value)} />
          </label>
        </div>
        <button className="btn-primary" onClick={create} disabled={creating}>
          {creating ? "Adding…" : "Add quest"}
        </button>
      </div>

      <div className="space-y-2 max-h-[40vh] overflow-y-auto">
        {quests.length === 0 && <div className="text-stone-500 italic text-sm">No quests yet.</div>}
        {quests.map((q) => (
          <div key={q.id} className="panel p-2 flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">
                {q.title}
                {!q.isActive && <span className="ml-2 text-[10px] text-stone-500">disabled</span>}
              </div>
              <div className="text-[11px] text-stone-400">{q.description}</div>
              <div className="text-[10px] text-stone-500 mt-1">
                {q.objective.kind ? `${q.objective.kind} ${q.objective.count ?? "?"}× ${q.objective.target ?? ""}` : "no objective"}
                {" · "}
                reward: {q.reward.xp ?? 0} XP / {q.reward.gold ?? 0} g
              </div>
            </div>
            <button className="btn-danger !text-xs" onClick={() => remove(q.id)}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
