export type Tab = "progress" | "shelf" | "manage";

const TABS: { id: Tab; label: string }[] = [
  { id: "progress", label: "Progresso" },
  { id: "shelf", label: "Estante" },
  { id: "manage", label: "Gerenciar" },
];

export function Tabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="tabs">
      {TABS.map((t) => (
        <button key={t.id} className={tab === t.id ? "tab on" : "tab"} aria-current={tab === t.id ? "page" : undefined} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
