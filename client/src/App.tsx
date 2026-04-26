import { useEffect, useState } from "react";
import { api, type AuthUser, type CharacterSummary } from "./api";
import { AuthScreen } from "./screens/AuthScreen";
import { CharacterSelectScreen } from "./screens/CharacterSelectScreen";
import { GameScreen } from "./screens/GameScreen";
import { AdminScreen } from "./screens/AdminScreen";

type View =
  | { kind: "loading" }
  | { kind: "auth" }
  | { kind: "admin"; user: AuthUser }
  | { kind: "select"; user: AuthUser }
  | { kind: "play"; user: AuthUser; character: CharacterSummary };

export function App() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const isAdminPath = typeof window !== "undefined" && window.location.pathname.startsWith("/admin");

  useEffect(() => {
    const token = api.getToken();
    if (!token) {
      setView({ kind: "auth" });
      return;
    }
    api
      .me()
      .then(({ user }) => {
        if (isAdminPath && user.isAdmin) {
          setView({ kind: "admin", user });
        } else {
          setView({ kind: "select", user });
        }
      })
      .catch(() => {
        api.logout();
        setView({ kind: "auth" });
      });
  }, [isAdminPath]);

  if (view.kind === "loading") {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-aether-accent font-display text-2xl tracking-widest">AETHERIA</div>
      </div>
    );
  }

  if (view.kind === "auth") {
    return <AuthScreen onAuthed={(user) => setView({ kind: "select", user })} />;
  }

  if (view.kind === "admin") {
    return (
      <AdminScreen
        user={view.user}
        onLeave={() => {
          window.history.replaceState(null, "", "/");
          setView({ kind: "select", user: view.user });
        }}
      />
    );
  }

  if (view.kind === "select") {
    return (
      <CharacterSelectScreen
        user={view.user}
        onPlay={(character) => {
          api.setActiveCharacter(character.id);
          setView({ kind: "play", user: view.user, character });
        }}
        onLogout={() => {
          api.logout();
          setView({ kind: "auth" });
        }}
      />
    );
  }

  return (
    <GameScreen
      user={view.user}
      character={view.character}
      onLeave={() => setView({ kind: "select", user: view.user })}
    />
  );
}
