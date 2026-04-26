import { useEffect, useState } from "react";
import { api, type AuthUser, type CharacterSummary } from "../api";
import { ALL_CLASSES, type ClassId } from "@aetheria/shared";

interface Props {
  user: AuthUser;
  onPlay: (character: CharacterSummary) => void;
  onLogout: () => void;
}

export function CharacterSelectScreen({ user, onPlay, onLogout }: Props) {
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [classId, setClassId] = useState<ClassId>("warrior");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const { characters } = await api.listCharacters();
      setCharacters(characters);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate() {
    setError(null);
    setBusy(true);
    try {
      await api.createCharacter(name, classId);
      setCreating(false);
      setName("");
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    try {
      await api.deleteCharacter(id);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="min-h-full w-full px-4 py-8 bg-gradient-to-b from-[#0a0a0f] via-[#13131c] to-[#0a0a0f]">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl text-aether-accent tracking-widest">AETHERIA</h1>
            <p className="text-stone-400 text-sm">Hello, {user.username}</p>
          </div>
          <button className="btn" onClick={onLogout}>
            Sign out
          </button>
        </div>

        {loading ? (
          <div className="text-stone-400">Loading…</div>
        ) : !creating ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {characters.map((c) => {
                const def = ALL_CLASSES.find((k) => k.id === c.class_id);
                return (
                  <div key={c.id} className="panel p-4 flex items-center gap-4">
                    <div className="text-4xl">{def?.emoji ?? "❓"}</div>
                    <div className="flex-1">
                      <div className="font-display text-xl">{c.name}</div>
                      <div className="text-sm text-stone-400">
                        Lv {c.level} {def?.name ?? c.class_id} · {c.gold}g
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button className="btn-primary" onClick={() => onPlay(c)}>
                        Play
                      </button>
                      <button className="btn-danger text-xs" onClick={() => handleDelete(c.id, c.name)}>
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {characters.length < 5 && (
              <button className="btn-primary" onClick={() => setCreating(true)}>
                + Create new hero
              </button>
            )}
          </>
        ) : (
          <div className="panel p-6">
            <h2 className="font-display text-2xl text-aether-accent mb-4">New Hero</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
              {ALL_CLASSES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setClassId(c.id)}
                  className={`p-3 rounded-lg border text-center transition ${
                    classId === c.id
                      ? "border-aether-accent bg-aether-accent/10"
                      : "border-aether-border hover:border-stone-500"
                  }`}
                >
                  <div className="text-3xl">{c.emoji}</div>
                  <div className="text-sm mt-1">{c.name}</div>
                </button>
              ))}
            </div>

            <div className="text-sm text-stone-400 mb-4 min-h-[3rem]">
              {ALL_CLASSES.find((c) => c.id === classId)?.description}
            </div>

            <div className="mb-4">
              <div className="label">Name (3-16 letters/numbers)</div>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={16}
              />
            </div>

            {error && <div className="text-aether-danger text-sm mb-3">{error}</div>}

            <div className="flex gap-2">
              <button className="btn" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button className="btn-primary" disabled={busy || name.length < 3} onClick={handleCreate}>
                {busy ? "..." : "Create"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
