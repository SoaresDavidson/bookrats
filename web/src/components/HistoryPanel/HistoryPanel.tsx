import { useId, useState } from "react";
import type { SessionOut } from "../../api/types";
import { ago, sessionText } from "../../lib/format";

export function HistoryPanel({ name, style, sessions }: { name: string; style: React.CSSProperties; sessions: SessionOut[] }) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const uid = useId();
  const bid = `${uid}-btn`;
  const pid = `${uid}-panel`;
  const row = (s: SessionOut) => (
    <li key={s.started_at}>
      <span>{sessionText(s)}</span>
      <span className="muted xs">{ago(s.ended_at)}</span>
    </li>
  );
  return (
    <div className="history">
      <button type="button" id={bid} className="history-toggle" aria-expanded={open} aria-controls={pid} onClick={() => setOpen((v) => !v)}>
        <span className="dot" style={style} />Histórico de {name}
        <svg className="chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div id={pid} role="region" aria-labelledby={bid} className={`collapse${open ? " open" : ""}`}>
        <div className="collapse-inner" inert={!open}>
          {sessions.length === 0 ? (
            <p className="muted">Sem sessões ainda.</p>
          ) : (
            <>
              <ul className="list">{sessions.slice(0, 5).map(row)}</ul>
              {sessions.length > 5 && (
                <>
                  <div className={`collapse more${all ? " open" : ""}`} inert={!all}>
                    <div className="collapse-inner"><ul className="list">{sessions.slice(5).map(row)}</ul></div>
                  </div>
                  <button className="link" type="button" onClick={() => setAll((v) => !v)}>
                    {all ? "Ver menos" : "Ver todas"}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
