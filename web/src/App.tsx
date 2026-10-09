import { useCallback, useState } from "react";
import { LogoutButton } from "./components/LogoutButton/LogoutButton";
import { Tabs, type Tab } from "./components/Tabs/Tabs";
import { Dashboard } from "./pages/Dashboard/Dashboard";
import { Manage } from "./pages/Manage/Manage";
import { Shelf } from "./pages/Shelf/Shelf";

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
  const [tab, setTab] = useState<Tab>("progress");

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
        <p className="brand">Bookrats</p>
        <h1 className="sr-only">Entrar no Bookrats</h1>
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
        <p className="brand">Bookrats</p>
        <Tabs tab={tab} onChange={setTab} />
      </header>
      {tab === "progress" ? (
        <Dashboard token={token} onAuthError={logout} onGoManage={() => setTab("manage")} />
      ) : tab === "shelf" ? (
        <Shelf token={token} onAuthError={logout} />
      ) : (
        <Manage token={token} onAuthError={logout} />
      )}
      <LogoutButton onClick={logout} />
    </main>
  );
}
