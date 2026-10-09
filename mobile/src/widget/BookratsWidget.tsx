import React from "react";
import { FlexWidget, TextWidget } from "react-native-android-widget";
import type { ReaderRow, WidgetState } from "./state";

// Widgets cannot reliably read the system theme, so we use one fixed dark
// neutral (zinc-900). #2F6FEB gives ~3.6:1 and #D9480F ~5:1 on it for the bars
// (non-text, needs 3:1); all text is near-white / light zinc (>= 7:1).
const BG = "#18181B";
const TRACK = "#3F3F46";
const FG = "#FAFAFA";
const MUTED = "#A1A1AA";

function Bar({ fill, color }: { fill: number; color: string }) {
  return (
    <FlexWidget style={{ flexDirection: "row", width: "match_parent", height: 8, borderRadius: 4, backgroundColor: TRACK }}>
      {fill > 0 && <FlexWidget style={{ flex: fill, height: "match_parent", borderRadius: 4, backgroundColor: color as `#${string}` }} />}
      {fill < 1 && <FlexWidget style={{ flex: 1 - fill, height: "match_parent" }} />}
    </FlexWidget>
  );
}

function Row({ r }: { r: ReaderRow }) {
  const detail = [r.session, r.ago].filter(Boolean).join(" · ");
  return (
    <FlexWidget style={{ width: "match_parent", flexDirection: "column", marginTop: 6 }}>
      <FlexWidget style={{ width: "match_parent", flexDirection: "row", justifyContent: "space-between" }}>
        <TextWidget text={r.name} maxLines={1} truncate="END" style={{ fontSize: 13, fontWeight: "bold", color: r.color as `#${string}` }} />
        <TextWidget text={r.pct} style={{ fontSize: 13, fontWeight: "bold", color: FG }} />
      </FlexWidget>
      <Bar fill={r.fill} color={r.color} />
      {detail ? <TextWidget text={detail} maxLines={1} truncate="END" style={{ fontSize: 11, color: MUTED }} /> : null}
    </FlexWidget>
  );
}

export function BookratsWidget({ state }: { state: WidgetState }) {
  return (
    <FlexWidget
      clickAction="REFRESH"
      style={{ height: "match_parent", width: "match_parent", backgroundColor: BG, borderRadius: 16, padding: 12, flexDirection: "column", justifyContent: "center" }}
    >
      {state.kind === "message" ? (
        <TextWidget text={state.text} style={{ fontSize: 14, color: FG, textAlign: "center" }} />
      ) : (
        <>
          <FlexWidget style={{ width: "match_parent", flexDirection: "row", justifyContent: "space-between" }}>
            <TextWidget text={state.title} maxLines={1} truncate="END" style={{ fontSize: 15, fontWeight: "bold", color: FG }} />
            {state.stale ? <TextWidget text="desatualizado" style={{ fontSize: 11, color: MUTED }} /> : null}
          </FlexWidget>
          {state.readers.map((r) => (
            <Row key={r.name} r={r} />
          ))}
        </>
      )}
    </FlexWidget>
  );
}
