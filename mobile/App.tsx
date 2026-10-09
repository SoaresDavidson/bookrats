import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { requestWidgetUpdate } from "react-native-android-widget";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { fetchSummary } from "./src/api";
import { BookratsWidget } from "./src/widget/BookratsWidget";
import { KEYS, load } from "./src/widget/handler";
import { toWidgetState } from "./src/widget/state";

const Button = memo(function Button({
  label,
  onPress,
  primary,
  disabled,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, primary ? styles.primary : styles.secondary, disabled && styles.disabled]}
    >
      <Text style={[styles.buttonText, primary && styles.primaryText]}>{label}</Text>
    </Pressable>
  );
});

const FAIL_MSG = "Não foi possível concluir. Tente de novo.";

export default function App() {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  // Latest field values for stable callbacks (avoids re-creating handlers on every keystroke).
  const fields = useRef({ url: "", token: "" });
  fields.current = { url, token };

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const [u, t] = await Promise.all([SecureStore.getItemAsync(KEYS.url), SecureStore.getItemAsync(KEYS.token)]);
        if (!mounted.current) return;
        setUrl(u ?? "");
        setToken(t ?? "");
      } catch {
        if (mounted.current) setMsg(FAIL_MSG);
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      const m = await fn();
      if (mounted.current) setMsg(m);
    } catch {
      if (mounted.current) setMsg(FAIL_MSG);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  const save = useCallback(
    () =>
      run(async () => {
        await Promise.all([
          SecureStore.setItemAsync(KEYS.url, fields.current.url.trim()),
          SecureStore.setItemAsync(KEYS.token, fields.current.token.trim()),
        ]);
        return "Salvo.";
      }),
    [run],
  );

  const test = useCallback(() => {
    setMsg("Testando…");
    return run(async () => {
      const o = await fetchSummary(fields.current.url.trim(), fields.current.token.trim());
      if (o.kind === "ok") return `Leitores: ${o.summary.readers.map((r) => r.name).join(", ") || "nenhum"}`;
      if (o.kind === "auth") return "Token inválido";
      return "Erro de conexão";
    });
  }, [run]);

  const refresh = useCallback(
    () =>
      run(async () => {
        await requestWidgetUpdate({
          widgetName: "Bookrats",
          renderWidget: async () => {
            const { outcome, cached } = await load();
            return <BookratsWidget state={toWidgetState(outcome, cached)} />;
          },
        });
        return "Widget atualizado.";
      }),
    [run],
  );

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.card}>
              <Text style={styles.title} accessibilityRole="header">
                Bookrats
              </Text>
              <Text style={styles.label}>Endereço do servidor</Text>
              <TextInput
                style={styles.input}
                value={url}
                onChangeText={setUrl}
                placeholder="https://bookrats.exemplo.com"
                accessibilityLabel="Endereço do servidor"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                textContentType="URL"
                returnKeyType="next"
              />
              <Text style={styles.label}>Token</Text>
              <TextInput
                style={styles.input}
                value={token}
                onChangeText={setToken}
                accessibilityLabel="Token"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                returnKeyType="done"
              />
              <Button label="Salvar" onPress={save} primary disabled={busy} />
              <Button label="Testar" onPress={test} disabled={busy} />
              <Button label="Atualizar widget" onPress={refresh} disabled={busy} />
              {msg ? (
                <Text style={styles.msg} accessibilityLiveRegion="polite">
                  {msg}
                </Text>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F4F5" },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, padding: 16, justifyContent: "center" },
  disabled: { opacity: 0.5 },
  primaryText: { color: "#FAFAFA" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 12, padding: 20, gap: 10, borderWidth: 1, borderColor: "#E4E4E7" },
  title: { fontSize: 22, fontWeight: "700", color: "#18181B", marginBottom: 4 },
  label: { fontSize: 13, color: "#52525B" },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#D4D4D8",
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    color: "#18181B",
  },
  button: { minHeight: 48, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  primary: { backgroundColor: "#18181B" },
  secondary: { backgroundColor: "#F4F4F5", borderWidth: 1, borderColor: "#D4D4D8" },
  buttonText: { fontSize: 16, fontWeight: "600", color: "#18181B" },
  msg: { fontSize: 14, color: "#3F3F46", marginTop: 4 },
});
