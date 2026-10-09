import React, { useEffect, useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { requestWidgetUpdate } from "react-native-android-widget";
import { fetchSummary } from "./src/api";
import { BookratsWidget } from "./src/widget/BookratsWidget";
import { KEYS, load } from "./src/widget/handler";
import { toWidgetState } from "./src/widget/state";

function Button({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.button, primary ? styles.primary : styles.secondary]}
    >
      <Text style={[styles.buttonText, primary && { color: "#FAFAFA" }]}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      setUrl((await SecureStore.getItemAsync(KEYS.url)) ?? "");
      setToken((await SecureStore.getItemAsync(KEYS.token)) ?? "");
    })();
  }, []);

  const save = async () => {
    await SecureStore.setItemAsync(KEYS.url, url.trim());
    await SecureStore.setItemAsync(KEYS.token, token.trim());
    setMsg("Salvo.");
  };

  const test = async () => {
    setMsg("Testando…");
    const o = await fetchSummary(url.trim(), token.trim());
    if (o.kind === "ok") setMsg(`Leitores: ${o.summary.readers.map((r) => r.name).join(", ") || "nenhum"}`);
    else if (o.kind === "auth") setMsg("Token inválido");
    else setMsg("Erro de conexão");
  };

  const refresh = async () => {
    await requestWidgetUpdate({
      widgetName: "Bookrats",
      renderWidget: async () => {
        const { outcome, cached } = await load();
        return <BookratsWidget state={toWidgetState(outcome, cached)} />;
      },
    });
    setMsg("Widget atualizado.");
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.card}>
        <Text style={styles.title}>Bookrats</Text>
        <Text style={styles.label}>Endereço do servidor</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="https://bookrats.exemplo.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={styles.label}>Token</Text>
        <TextInput
          style={styles.input}
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <Button label="Salvar" onPress={save} primary />
        <Button label="Testar" onPress={test} />
        <Button label="Atualizar widget" onPress={refresh} />
        {msg ? <Text style={styles.msg}>{msg}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F4F5", padding: 16, justifyContent: "center" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 12, padding: 20, gap: 10, borderWidth: 1, borderColor: "#E4E4E7" },
  title: { fontSize: 22, fontWeight: "700", color: "#18181B", marginBottom: 4 },
  label: { fontSize: 13, color: "#52525B" },
  input: { minHeight: 48, borderWidth: 1, borderColor: "#D4D4D8", borderRadius: 8, paddingHorizontal: 12, fontSize: 16, color: "#18181B" },
  button: { minHeight: 48, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  primary: { backgroundColor: "#18181B" },
  secondary: { backgroundColor: "#F4F4F5", borderWidth: 1, borderColor: "#D4D4D8" },
  buttonText: { fontSize: 16, fontWeight: "600", color: "#18181B" },
  msg: { fontSize: 14, color: "#3F3F46", marginTop: 4 },
});
