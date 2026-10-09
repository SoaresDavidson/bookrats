export type Tab = "progress" | "shelf" | "manage";

const TABS: { id: Tab; label: string }[] = [
  { id: "progress", label: "Progresso" },
  { id: "shelf", label: "Estante" },
  { id: "manage", label: "Gerenciar" },
];

const tab =
  "flex-1 min-h-11 px-3.5 rounded-full bg-transparent text-sm cursor-pointer active:scale-98 motion-reduce:active:scale-100 max-[380px]:px-1.5 max-[380px]:text-xs";

export function Tabs({ tab: current, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="flex max-w-full bg-track rounded-full p-[3px]">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`${tab} ${current === t.id ? "bg-surface text-ink font-semibold shadow-tab" : "text-muted font-medium"}`}
          aria-current={current === t.id ? "page" : undefined}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
