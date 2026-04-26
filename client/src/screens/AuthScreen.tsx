import { useState, type FormEvent } from "react";
import { api, type AuthUser } from "../api";

interface Props {
  onAuthed: (user: AuthUser) => void;
}

export function AuthScreen({ onAuthed }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const { user } = await api.login(emailOrUsername, password);
        onAuthed(user);
      } else {
        const { user } = await api.register(email, username, password);
        onAuthed(user);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full w-full flex items-center justify-center px-4 py-8 bg-gradient-to-b from-[#0a0a0f] via-[#13131c] to-[#0a0a0f]">
      <div className="w-full max-w-md panel p-8">
        <h1 className="font-display text-4xl text-aether-accent text-center tracking-widest mb-1">AETHERIA</h1>
        <p className="text-center text-stone-400 text-sm mb-8">
          {mode === "login" ? "Welcome back, traveler." : "Forge a new fate."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" ? (
            <>
              <div>
                <div className="label">Email</div>
                <input
                  className="input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div>
                <div className="label">Username</div>
                <input
                  className="input"
                  type="text"
                  required
                  minLength={3}
                  maxLength={20}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>
            </>
          ) : (
            <div>
              <div className="label">Email or username</div>
              <input
                className="input"
                type="text"
                required
                value={emailOrUsername}
                onChange={(e) => setEmailOrUsername(e.target.value)}
                autoComplete="username"
              />
            </div>
          )}

          <div>
            <div className="label">Password</div>
            <input
              className="input"
              type="password"
              required
              minLength={mode === "register" ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
          </div>

          {error && <div className="text-aether-danger text-sm">{error}</div>}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? "..." : mode === "login" ? "Enter Aetheria" : "Begin Adventure"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-stone-400">
          {mode === "login" ? (
            <>
              No account?{" "}
              <button className="text-aether-accent hover:underline" onClick={() => setMode("register")}>
                Create one
              </button>
            </>
          ) : (
            <>
              Already have one?{" "}
              <button className="text-aether-accent hover:underline" onClick={() => setMode("login")}>
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
