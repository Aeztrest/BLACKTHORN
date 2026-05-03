export const API_KEY_STORAGE = "deltag-demo-api-key";

export function loadApiKey(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(API_KEY_STORAGE) ?? "";
}

export function saveApiKey(key: string): void {
  const t = key.trim();
  if (t) localStorage.setItem(API_KEY_STORAGE, t);
  else localStorage.removeItem(API_KEY_STORAGE);
}
