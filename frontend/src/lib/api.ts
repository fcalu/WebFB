// src/lib/api.ts
export type Engine = "poisson" | "dc";

export interface PredictPayload {
  league: string;
  home_team: string;
  away_team: string;
  engine?: Engine;
}

export interface PredictResponse {
  engine: Engine;
  league: string;
  home_team: string;
  away_team: string;
  probs: {
    home_win_pct: number;
    draw_pct: number;
    away_win_pct: number;
    over_2_5_pct: number;
    btts_pct: number;
    o25_mlp_pct: number;
  };
  poisson: {
    home_lambda: number;
    away_lambda: number;
    top_scorelines: Array<{ score: string; pct: number }>;
    rows?: string[];
    cols?: string[];
    matrix?: number[][];
  };
  averages: {
    total_yellow_cards_avg: number;
    total_corners_avg: number;
    corners_mlp_pred: number;
  };
  best_pick: {
    market: string;
    selection: string;
    prob_pct: number;
    confidence: number;
    reasons: string[];
    summary: string;
  };
  summary: string;
}

const API = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

// Render free puede tardar en “despertar”
const COLD_START_STATUSES = new Set([502, 503, 504, 522, 524]);
const DEFAULT_TIMEOUT_MS = 30000; // 30s
const DEFAULT_RETRIES = 3;

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function fetchJSON<T>(
  url: string,
  init: RequestInit = {},
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    backoffMs = 1500,
  }: { timeoutMs?: number; retries?: number; backoffMs?: number } = {}
): Promise<T> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    if (!resp.ok) {
      if (COLD_START_STATUSES.has(resp.status) && retries > 0) {
        await sleep(backoffMs);
        return fetchJSON<T>(url, init, { timeoutMs, retries: retries - 1, backoffMs: backoffMs * 1.6 });
      }
      const text = await resp.text().catch(() => "");
      throw new Error(`HTTP ${resp.status} ${resp.statusText}${text ? ` - ${text}` : ""}`);
    }
    return (await resp.json()) as T;
  } catch (err: any) {
    const msg = String(err?.message || err);
    // “signal is aborted without reason”, “AbortError”, “The user aborted…”
    const aborted = /abort/i.test(msg);
    const network = /Failed to fetch|NetworkError/i.test(msg);
    if ((aborted || network) && retries > 0) {
      await sleep(backoffMs);
      return fetchJSON<T>(url, init, { timeoutMs, retries: retries - 1, backoffMs: backoffMs * 1.6 });
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}

export function friendlyError(e: unknown): string {
  const msg = String((e as any)?.message || e);
  if (/Failed to fetch|NetworkError/i.test(msg)) return "No se pudo conectar con el servidor. Revisa tu red.";
  if (/abort/i.test(msg)) return "La solicitud tardó demasiado y fue cancelada. Intenta de nuevo.";
  if (/HTTP 404/.test(msg)) return "Recurso no encontrado (404).";
  if (/HTTP 400/.test(msg)) return "Solicitud inválida (400).";
  if (/HTTP 5\d{2}/.test(msg)) return "El servidor está iniciando o ocupado. Reintentando…";
  return msg;
}

export async function warmup(): Promise<void> {
  try { await fetchJSON(`${API}/health`, { method: "GET" }, { timeoutMs: 10000, retries: 1 }); } catch {}
}

export async function getLeagues(): Promise<{ leagues: string[] }> {
  return fetchJSON(`${API}/leagues`, { method: "GET" });
}

export async function getTeams(league: string): Promise<{ league: string; teams: string[] }> {
  const q = new URLSearchParams({ league });
  return fetchJSON(`${API}/teams?${q.toString()}`, { method: "GET" });
}

export async function predict(payload: PredictPayload): Promise<PredictResponse> {
  return fetchJSON(`${API}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
