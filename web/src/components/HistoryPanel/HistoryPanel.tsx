import { useId, useState } from "react";
import type { SessionOut } from "../../api/types";
import { ago, sessionText } from "../../lib/format";
import { ui } from "../../lib/ui";

export function HistoryPanel({
  name,
  style,
  sessions,
}: {
  name: string;
  style: React.CSSProperties;
  sessions: SessionOut[];
}) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const uid = useId();
  const bid = `${uid}-btn`;
  const pid = `${uid}-panel`;
  const row = (s: SessionOut) => (
    <li key={s.started_at} className="flex justify-between items-center gap-3 py-2 text-sm">
      <span className="tabular-nums">{sessionText(s)}</span>
      <span className={`${ui.mutedXs} tabular-nums`}>{ago(s.ended_at)}</span>
    </li>
  );
  return (
    <div className="border-t border-line pt-1">
      <button
        type="button"
        id={bid}
        className="group flex items-center w-full min-h-11 p-0 bg-transparent border-0 text-left text-sm font-medium text-muted-strong cursor-pointer focus-visible:rounded-control"
        aria-expanded={open}
        aria-controls={pid}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={ui.dot} style={style} />
        Histórico de {name}
        <svg
          className="ml-auto text-muted transition-transform duration-200 ease-soft group-aria-expanded:rotate-180 motion-reduce:transition-none"
          viewBox="0 0 12 12"
          width="12"
          height="12"
          aria-hidden="true"
        >
          <path
            d="M3 4.5 6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <section id={pid} aria-labelledby={bid} className={`history-panel${open ? " open" : ""}`}>
        <div className="overflow-hidden p-1.5 -m-1.5 min-h-0 flex flex-col" inert={!open}>
          {sessions.length === 0 ? (
            <p className={ui.muted}>Sem sessões ainda.</p>
          ) : (
            <>
              <ul>{sessions.slice(0, 5).map(row)}</ul>
              {sessions.length > 5 && (
                <>
                  <div className={`history-panel history-more${all ? " open" : ""}`} inert={!all}>
                    <div className="overflow-hidden p-1.5 -m-1.5 min-h-0 flex flex-col">
                      <ul>{sessions.slice(5).map(row)}</ul>
                    </div>
                  </div>
                  <button className={`${ui.link} self-start p-0`} type="button" onClick={() => setAll((v) => !v)}>
                    {all ? "Ver menos" : "Ver todas"}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
