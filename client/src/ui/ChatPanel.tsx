import { useEffect, useRef, useState, type FormEvent } from "react";
import { useGameStore } from "../store";
import { emitChat } from "../socket";
import { Modal } from "./InventoryPanel";

interface Props {
  onClose: () => void;
}

export function ChatPanel({ onClose }: Props) {
  const chat = useGameStore((s) => s.chat);
  const me = useGameStore((s) => s.me);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.length]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    emitChat(text.trim());
    setText("");
  }

  return (
    <Modal title="Chat (zone)" onClose={onClose}>
      <div ref={scrollRef} className="h-72 overflow-y-auto panel p-2 space-y-1 text-sm mb-3">
        {chat.length === 0 ? (
          <div className="text-stone-500 italic">No messages yet.</div>
        ) : (
          chat.map((m, i) => {
            const isMe = m.from === me?.name;
            const isSystem = m.system;
            return (
              <div key={i} className={isSystem ? "text-aether-accent2" : ""}>
                <span
                  className={
                    isSystem
                      ? "text-aether-accent2 font-bold"
                      : isMe
                      ? "text-aether-accent font-bold"
                      : "text-stone-300 font-bold"
                  }
                >
                  {m.from}:
                </span>{" "}
                <span className={isSystem ? "" : "text-stone-200"}>{m.text}</span>
              </div>
            );
          })
        )}
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type to all in this zone..."
          maxLength={200}
        />
        <button className="btn-primary" type="submit">
          Send
        </button>
      </form>
    </Modal>
  );
}
