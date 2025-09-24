// src/lib/api.ts
export type Engine = "poisson" | "dc";

export interface PredictPayload {
  league: string;
  home_team: string;
  away_team: string;
  engine?: Engine; // "poisson" | "dc"
  // si más adelante quieres calibrar con cuotas:
  // odds_1x2?: { "1": number; "X": number; "2": number };
  // odds_o25?: { O2_5: number; U2_5: number };
  // odds_btts?: { BTTS: number; NOBTTS: number };
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

const COLD_START_STATUSES = new Set([502, 503, 504, 522, 524]);
const DEFAULT_TIMEOUT_MS = 12000;

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function fetchJSON<T>(
  url: string,
  init: RequestInit = {},
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = 2,
    backoffMs = 1200,
  }: { timeoutMs?: number; retries?: number; backoffMs?: number } = {}
): Promise<T> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    if (!resp.ok) {
      // Reintenta ante fallos típicos de arranque/colapso del free tier
      if (COLD_START_STATUSES.has(resp.status) && retries > 0) {
        await sleep(backoffMs);
        return fetchJSON<T>(url, init, { timeoutMs, retries: retries - 1, backoffMs: backoffMs * 1.5 });
      }
      const text = await resp.text().catch(() => "");
      throw new Error(`HTTP ${resp.status} ${resp.statusText} ${text ? `- ${text}` : ""}`.trim());
    }
    return (await resp.json()) as T;
  } catch (err: any) {
    // Abort / Network → reintento
    const msg = String(err?.message || err);
    const isAbort = msg.includes("AbortError");
    const isNetwork = msg.includes("Failed to fetch") || msg.includes("NetworkError");
    if ((isAbort || isNetwork) && retries > 0) {
      await sleep(backoffMs);
      return fetchJSON<T>(url, init, { timeoutMs, retries: retries - 1, backoffMs: backoffMs * 1.5 });
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}

export function friendlyError(e: unknown): string {
  const msg = String((e as any)?.message || e);
  if (msg.includes("Failed to fetch")) return "No se pudo conectar con el servidor. Verifica tu red.";
  if (msg.includes("AbortError")) return "La solicitud tardó demasiado (timeout). Intenta de nuevo.";
  if (/HTTP 404/.test(msg)) return "Endpoint o recurso no encontrado (404).";
  if (/HTTP 400/.test(msg)) return "Solicitud inválida (400). Revisa los parámetros.";
  if (/HTTP 5\d{2}/.test(msg)) return "El servidor está ocupado o arrancando. Intentando de nuevo...";
  return msg;
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
