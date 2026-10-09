import { buildWidgetTree } from "react-native-android-widget/src/api/build-widget-tree";
import { BookratsWidget } from "./BookratsWidget";
import type { WidgetState } from "./state";

// The native renderer only accepts library widgets: building the tree catches React.Fragment and similar.
test("data state builds a native widget tree", () => {
  const state: WidgetState = {
    kind: "data",
    title: "Duna",
    author: "Frank Herbert",
    stale: true,
    readers: [{ name: "ana", color: "#2F6FEB", pct: "41%", fill: 0.414, session: "34% → 41%", ago: "há 5 min", leader: false }],
  };
  expect(() => buildWidgetTree(<BookratsWidget state={state} />)).not.toThrow();
});
