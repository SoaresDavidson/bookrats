import { useCallback, useState } from "react";
import "./App.css";
import { Dashboard } from "./Dashboard";
import { Manage } from "./Manage";

const KEY = "bookrats.token";

function readToken(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export default function App() {
  const [token, setToken] = useState(readToken);
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<"progress" | "manage">("progress");

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setToken("");
  }, []);

  if (!token) {
    return (
      <main className="shell">
        <h1 className="brand">Bookrats</h1>
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            const t = draft.trim();
            if (!t) return;
            try {
              localStorage.setItem(KEY, t);
            } catch {
              /* ignore */
            }
            setToken(t);
          }}
        >
          <label className="field">
            <span>Cole seu token</span>
            <input type="password" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} />
          </label>
          <button className="btn primary" type="submit">Entrar</button>
        </form>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="top">
        <h1 className="brand">Bookrats</h1>
        <nav className="tabs">
          <button className={tab === "progress" ? "tab on" : "tab"} onClick={() => setTab("progress")}>Progresso</button>
          <button className={tab === "manage" ? "tab on" : "tab"} onClick={() => setTab("manage")}>Gerenciar</button>
        </nav>
      </header>
      {tab === "progress" ? (
        <Dashboard token={token} onAuthError={logout} />
      ) : (
        <Manage token={token} onAuthError={logout} />
      )}
      <button className="link" onClick={logout}>Sair</button>
    </main>
  );
}
