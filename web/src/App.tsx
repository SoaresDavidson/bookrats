import { useCallback, useState } from "react";
import { LogoutButton } from "./components/LogoutButton/LogoutButton";
import { type Tab, Tabs } from "./components/Tabs/Tabs";
import { ui } from "./lib/ui";
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
      <main className="w-full min-w-0 max-w-120 mx-auto px-4 pt-5 pb-12 flex flex-col gap-5">
        <p className="text-md font-bold tracking-tight">Bookrats</p>
        <h1 className="sr-only">Entrar no Bookrats</h1>
        <form
          className={`${ui.card} ${ui.stack}`}
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
          <label className={ui.field}>
            <span>Cole seu token</span>
            <input
              className={ui.input}
              type="password"
              autoComplete="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <button className={`${ui.btn} ${ui.btnPrimary}`} type="submit">
            Entrar
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="w-full min-w-0 max-w-120 mx-auto px-4 pt-5 pb-12 flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3 pt-[env(safe-area-inset-top)]">
        <p className="text-md font-bold tracking-tight">Bookrats</p>
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
