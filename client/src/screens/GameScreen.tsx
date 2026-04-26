import { useEffect, useRef, useState } from "react";
import { api, type AuthUser, type CharacterSummary } from "../api";
import { authenticateSocket, disconnectSocket, getSocket } from "../socket";
import { useGameStore } from "../store";
import { startPhaser, stopPhaser } from "../game/PhaserGame";
import { HUD } from "../ui/HUD";
import { ChatPanel } from "../ui/ChatPanel";
import { InventoryPanel } from "../ui/InventoryPanel";
import { ShopPanel } from "../ui/ShopPanel";
import { AgentPanel } from "../ui/AgentPanel";
import { TravelPanel } from "../ui/TravelPanel";
import { SkillBar } from "../ui/SkillBar";

interface Props {
  user: AuthUser;
  character: CharacterSummary;
  onLeave: () => void;
}

export function GameScreen({ user, character, onLeave }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<"none" | "inventory" | "shop" | "agent" | "travel" | "chat">("none");
  const reset = useGameStore((s) => s.reset);

  useEffect(() => {
    const token = api.getToken();
    if (!token) {
      onLeave();
      return;
    }
    let mounted = true;

    (async () => {
      const ack = await authenticateSocket(token, character.id);
      if (!mounted) return;
      if (!ack.ok) {
        setError(ack.error);
        return;
      }
      if (containerRef.current) {
        startPhaser(containerRef.current);
      }
    })();

    return () => {
      mounted = false;
      stopPhaser();
      disconnectSocket();
      reset();
    };
  }, [character.id, onLeave, reset]);

  if (error) {
    return (
      <div className="min-h-full flex items-center justify-center p-8">
        <div className="panel p-6 max-w-sm">
          <h2 className="font-display text-xl text-aether-danger mb-2">Connection failed</h2>
          <p className="text-sm text-stone-400 mb-4">{error}</p>
          <button className="btn-primary" onClick={onLeave}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <div ref={containerRef} className="absolute inset-0" />

      <HUD user={user} onLeave={onLeave} onOpenPanel={setActivePanel} />
      <SkillBar onOpenPanel={setActivePanel} />

      {activePanel === "inventory" && <InventoryPanel onClose={() => setActivePanel("none")} />}
      {activePanel === "shop" && <ShopPanel onClose={() => setActivePanel("none")} />}
      {activePanel === "agent" && <AgentPanel onClose={() => setActivePanel("none")} />}
      {activePanel === "travel" && <TravelPanel onClose={() => setActivePanel("none")} />}
      {activePanel === "chat" && <ChatPanel onClose={() => setActivePanel("none")} />}
    </div>
  );
}
