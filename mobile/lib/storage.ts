import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// expo-secure-store wraps the iOS Keychain / Android Keystore, neither of
// which exists in a browser — its web implementation is incomplete and
// throws ("getValueWithKeyAsync is not a function") as soon as it's called.
// This wrapper keeps the rest of the app (services/api.ts) platform-agnostic:
// SecureStore on native, localStorage on web. localStorage is not as secure
// as the Keychain/Keystore, but it's adequate for local development in a
// browser; native builds (the ones that matter for real usage) still get
// the secure, encrypted storage.
export async function getItemAsync(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
  }
  return SecureStore.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}