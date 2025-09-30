// src/lib/stake.ts
export type RiskLevel = "Bajo" | "Medio" | "Alto";

export function kelly(p: number, o: number) {
  // p en [0..1], o = cuota decimal (>1)
  const num = p * (o - 1) - (1 - p);
  const den = o - 1;
  if (den <= 0) return 0;
  return Math.max(0, num / den);
}

export function riskLabelFromProbEV(prob01: number, ev?: number): RiskLevel {
  let lvl: RiskLevel = prob01 >= 0.6 ? "Bajo" : prob01 >= 0.5 ? "Medio" : "Alto";
  if (ev !== undefined && ev >= 0.12 && lvl !== "Bajo") lvl = "Medio";
  return lvl;
}

export function ev(prob01: number, odd: number) {
  return prob01 * odd - 1; // EV por unidad apostada
}

export function impliedFromOdd(odd?: number) {
  return odd && odd > 1 ? 1 / odd : undefined;
}

// ======= Storage ligero (localStorage) =======
export type SavedBet = {
  id: string;
  created_at: string;
  match: string;
  market: string;
  selection: string;
  prob01: number;
  odd: number;
  stake: number;
  kellyUsed: number; // fracción 1.0 / 0.5 / 0.25…
  note?: string;
  status?: "pending" | "win" | "lose" | "void";
};

const BETS_KEY = "fm_bets";
const BANK_KEY = "fm_bank";

export function loadBank(): number {
  const n = Number(localStorage.getItem(BANK_KEY));
  return Number.isFinite(n) && n > 0 ? n : 100; // default 100 u
}
export function saveBank(n: number) {
  localStorage.setItem(BANK_KEY, String(Math.max(0, n)));
}

export function loadBets(): SavedBet[] {
  try {
    const raw = localStorage.getItem(BETS_KEY);
    if (!raw) return [];
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}
export function saveBets(list: SavedBet[]) {
  localStorage.setItem(BETS_KEY, JSON.stringify(list));
}
export function addBet(b: SavedBet) {
  const list = loadBets();
  list.unshift(b);
  saveBets(list);
}
export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
