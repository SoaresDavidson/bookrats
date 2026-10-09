import React from "react";
import * as SecureStore from "expo-secure-store";
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { fetchSummary, type Outcome, type Summary } from "../api";
import { BookratsWidget } from "./BookratsWidget";
import { toWidgetState } from "./state";

export const KEYS = { url: "bookrats.url", token: "bookrats.token", last: "bookrats.last" };

export interface Loaded {
  outcome: Outcome;
  cached: Summary | null;
}

export async function load(): Promise<Loaded> {
  const [url, token] = await Promise.all([
    SecureStore.getItemAsync(KEYS.url),
    SecureStore.getItemAsync(KEYS.token),
  ]);
  const outcome: Outcome = url && token ? await fetchSummary(url, token) : { kind: "unconfigured" };
  if (outcome.kind === "ok") {
    await SecureStore.setItemAsync(KEYS.last, JSON.stringify(outcome.summary));
    return { outcome, cached: null };
  }
  // Cache is only needed (and only parsed) when the fetch did not succeed.
  let cached: Summary | null = null;
  try {
    const lastRaw = await SecureStore.getItemAsync(KEYS.last);
    cached = lastRaw ? (JSON.parse(lastRaw) as Summary) : null;
  } catch {
    cached = null;
  }
  return { outcome, cached };
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  switch (props.widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_UPDATE":
    case "WIDGET_RESIZED":
    case "WIDGET_CLICK": {
      if (props.widgetAction === "WIDGET_CLICK" && props.clickAction !== "REFRESH") return;
      const { outcome, cached } = await load();
      props.renderWidget(React.createElement(BookratsWidget, { state: toWidgetState(outcome, cached) }));
      return;
    }
    default:
      return;
  }
}
