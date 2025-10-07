export function getPremiumKey(): string | null {
  return localStorage.getItem("premium_key");
}
export function savePremiumKey(k: string) {
  localStorage.setItem("premium_key", k);
}
export function clearPremiumKey() {
  localStorage.removeItem("premium_key");
}
