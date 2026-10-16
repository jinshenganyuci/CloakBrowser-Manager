import { useSyncExternalStore } from "react";
import { appZh } from "./translations/app";
import { profileZh } from "./translations/profile";
import { viewerZh } from "./translations/viewer";

export type Language = "zh-CN" | "en";
type Values = Record<string, string | number>;
const STORAGE_KEY = "cloakbrowser-manager-language";
const messages: Record<string, string> = { ...appZh, ...profileZh, ...viewerZh };
const listeners = new Set<() => void>();

function isLanguage(value: unknown): value is Language {
  return value === "zh-CN" || value === "en";
}

function savedLanguage(): Language {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    // The interface still works when browser storage is unavailable.
  }
  return "zh-CN";
}

let language = savedLanguage();

function updateDocument() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language;
  document.title = language === "zh-CN" ? "CloakBrowser 管理器" : "CloakBrowser Manager";
}

updateDocument();

export function getLanguage(): Language {
  return language;
}

export function setLanguage(next: Language) {
  language = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Persistence is optional; changing the current interface is not.
  }
  updateDocument();
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    language = savedLanguage();
    updateDocument();
    listeners.forEach((listener) => listener());
  });
}

export function translate(message: string, values: Values = {}): string {
  const text = language === "zh-CN" ? messages[message] ?? message : message;
  return text.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    values[key] === undefined ? placeholder : String(values[key]),
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useI18n() {
  const current = useSyncExternalStore(subscribe, getLanguage, () => "zh-CN" as const);
  return { language: current, setLanguage, t: translate };
}
