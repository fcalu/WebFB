import React, { useEffect, useMemo, useState } from "react";

/* ===== Tipos ===== */
type Odds = { "1"?: number; X?: number; "2"?: number; O2_5?: number; BTTS_YES?: number };

type PredictResponse = {
  league: string;
  home_team: string;
  away_team: string;
  probs: {
    home_win_pct: number;
    draw_pct: number;
    away_win_pct: number;
    over_2_5_pct: number;
    btts_pct: number;
    o25_mlp_pct?: number;
  };
  poisson?: {
    home_lambda: number;
    away_lambda: number;
    top_scorelines?: { score: string; pct: number }[];
  };
  best_pick?: {
    market: "1X2" | "Over 2.5" | "BTTS" | string;
    selection: "1" | "X" | "2" | "Sí" | "No" | string;
    prob_pct: number;
    confidence?: number;
    reasons?: string[];
  };
  summary?: string;
  debug?: Record<string, unknown>;
};

/* ===== Helpers ===== */
const pct = (n?: number) => (n == null || Number.isNaN(n) ? "—" : `${(+n).toFixed(2)}%`);

async function fetchJSON<T>(
  url: string,
  opts: RequestInit & { premiumKey?: string } = {}
): Promise<T> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 20000);
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    };
    if ((opts as any).premiumKey) {
      (headers as Record<string, string>)["X-Premium-Key"] = (opts as any).premiumKey as string;
    }
    const res = await fetch(url, { ...opts, headers, signal: controller.signal });
    if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(id);
  }
}

/* ===== Estilos rápidos ===== */
const pill = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.12)",
  color: "#d1d5db",
  fontSize: 13,
} as React.CSSProperties;

const inputCss: React.CSSProperties = {
  width: "100%",
  background: "#0f172a",
  color: "white",
  border: "1px solid rgba(255,255,255,.18)",
  borderRadius: 12,
  padding: "12px 14px",
  outline: "none",
};

const card: React.CSSProperties = {
  marginTop: 12,
  padding: 14,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,.10)",
  background: "rgba(255,255,255,.04)",
};

const rightPct: React.CSSProperties = { marginLeft: "auto", fontWeight: 900, fontSize: 22 };

/* ===== Componente ===== */
export default function IABootDrawer({
  open,
  onClose,
  API_BASE,
  league,
  home,
  away,
  odds,
  premiumKey,
}: {
  open: boolean;
  onClose: () => void;
  API_BASE: string;
  league: string;
  home: string;
  away: string;
  odds: Odds;
  premiumKey: string;
}) {
  const [homeText, setHomeText] = useState(home);
  const [awayText, setAwayText] = useState(away);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState<PredictResponse | null>(null);

  // Sincroniza inputs con selección del App
  useEffect(() => setHomeText(home), [home]);
  useEffect(() => setAwayText(away), [away]);

  const canRun = !!(league && homeText && awayText && homeText !== awayText);

  async function run() {
    if (!canRun || loading) return;
    setLoading(true);
    setErr("");
    setData(null);
    try {
      const body: any = { league, home_team: homeText, away_team: awayText };
      if (odds["1"] || odds.X || odds["2"] || odds.O2_5 || odds.BTTS_YES) body.odds = odds;

      const json = await fetchJSON<PredictResponse>(`${API_BASE}/predict`, {
        method: "POST",
        body: JSON.stringify(body),
        premiumKey,
      });
      setData(json);
    } catch (e: any) {
      setErr(e?.message || "No se pudo generar el análisis.");
    } finally {
      setLoading(false);
    }
  }

  // Picks estilo bet365
  const picks = useMemo(() => {
    if (!data) return [];
    const P = data.probs || ({} as PredictResponse["probs"]);
    const scTop = data.poisson?.top_scorelines || [];
    const fav = (P.home_win_pct ?? 0) >= (P.away_win_pct ?? 0) ? ("home" as const) : ("away" as const);

    const items: Array<{ tier: "Estándar" | "Conservador" | "Arriesgado"; label: string; prob?: number; note: string; odd?: number; }> = [];

    // Estándar — best_pick
    if (data.best_pick?.market && data.best_pick?.selection) {
      const bp = data.best_pick;
      const labelMarket = bp.market === "1X2" ? "1X2" : bp.market === "Over 2.5" ? "Over 2.5" : bp.market === "BTTS" ? "BTTS" : bp.market;
      const labelSel =
        bp.market === "1X2"
          ? bp.selection === "1"
            ? `Gana ${data.home_team}`
            : bp.selection === "2"
            ? `Gana ${data.away_team}`
            : "Empate"
          : bp.market === "Over 2.5"
          ? "Más de 2.5"
          : bp.market === "BTTS"
          ? bp.selection
          : bp.selection;

      let odd: number | undefined;
      if (bp.market === "1X2") odd = bp.selection === "1" ? odds["1"] : bp.selection === "2" ? odds["2"] : odds["X"];
      else if (bp.market === "Over 2.5") odd = odds.O2_5;
      else if (bp.market === "BTTS") odd = odds.BTTS_YES;

      items.push({ tier: "Estándar", label: `${labelMarket} — ${labelSel}`, prob: bp.prob_pct, note: "Selección de valor según el modelo.", odd });
    }

    // Conservador — Doble oportunidad
    const dcFav = fav === "home" ? `1X (${data.home_team} o Empate)` : `X2 (${data.away_team} o Empate)`;
    const dcProb = fav === "home" ? (P.home_win_pct ?? 0) + (P.draw_pct ?? 0) : (P.away_win_pct ?? 0) + (P.draw_pct ?? 0);
    items.push({ tier: "Conservador", label: `Doble oportunidad — ${dcFav}`, prob: dcProb, note: "Protege contra el empate." });

    // Conservador — DNB
    const dnbLabel = fav === "home" ? `DNB (${data.home_team})` : `DNB (${data.away_team})`;
    const dnbProb =
      (fav === "home" ? P.home_win_pct : P.away_win_pct) /
      ((P.home_win_pct ?? 0) + (P.away_win_pct ?? 0)) *
      100;
    items.push({ tier: "Conservador", label: `DNB (Empate no válida) — ${dnbLabel}`, prob: isFinite(dnbProb) ? dnbProb : undefined, note: "Si empata, devuelve stake." });

    // BTTS — Sí
    items.push({ tier: "Estándar", label: "BTTS — Sí", prob: P.btts_pct, note: "Probabilidad de que ambos marquen.", odd: odds.BTTS_YES });

    // Over 2.5
    items.push({ tier: "Estándar", label: "Over 2.5 — Más de 2.5", prob: P.over_2_5_pct, note: "Tendencia a partido con goles.", odd: odds.O2_5 });

    // Correct score (Top 3) — Arriesgado
    for (let i = 0; i < Math.min(3, scTop.length); i++) {
      const sc = scTop[i];
      if (!sc) break;
      items.push({ tier: "Arriesgado", label: `Correct score — ${sc.score}`, prob: sc.pct, note: "Marcador exacto entre los más probables (alta varianza)." });
    }

    return items;
  }, [data, odds]);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(10,14,26,.65)", backdropFilter: "blur(4px)", zIndex: 60, display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ width: "min(1100px, 96vw)", maxHeight: "90vh", overflow: "auto", borderRadius: 16, border: "1px solid rgba(255,255,255,.12)", background: "linear-gradient(180deg,#0b1327,#0c1326)", color: "#e5e7eb", boxShadow: "0 30px 70px rgba(0,0,0,.45)", padding: 18 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 26, fontWeight: 900 }}>🤖 Predicción IA Boot</div>
          <button onClick={onClose} style={{ marginLeft: "auto", padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)", color: "#d1d5db", cursor: "pointer", fontWeight: 700 }}>
            Cerrar ✕
          </button>
        </div>

        {/* Inputs (como en tu captura) */}
        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13, opacity: 0.9, marginBottom: 6 }}>Equipo local</div>
            <input style={inputCss} placeholder="—" value={homeText} onChange={(e) => setHomeText(e.target.value)} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13, opacity: 0.9, marginBottom: 6 }}>Equipo visitante</div>
            <input style={inputCss} placeholder="—" value={awayText} onChange={(e) => setAwayText(e.target.value)} />
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <button
            onClick={run}
            disabled={!canRun || loading}
            style={{
              width: "100%",
              padding: "16px 18px",
              border: "1px solid rgba(124,58,237,.5)",
              background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
              color: "white",
              borderRadius: 12,
              fontWeight: 900,
              fontSize: 18,
              opacity: !canRun || loading ? 0.6 : 1,
              cursor: !canRun || loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Generando…" : "Generar con IA"}
          </button>
        </div>

        {/* Resumen */}
        {data?.summary && (
          <div
            style={{
              ...card,
              background: "linear-gradient(90deg, rgba(124,58,237,.14), rgba(37,99,235,.12))",
              borderColor: "rgba(124,58,237,.35)",
              marginTop: 16,
            }}
          >
            <div style={{ fontWeight: 900, color: "#c7d2fe", letterSpacing: 0.3 }}>ANÁLISIS COMPLETO (IA BOOT)</div>
            <div style={{ marginTop: 8, lineHeight: 1.5 }}>{data.summary}</div>
          </div>
        )}

        {/* Error */}
        {err && (
          <div role="alert" style={{ ...card, background: "rgba(239,68,68,.12)", borderColor: "rgba(239,68,68,.35)", color: "#fecaca" }}>
            {err}
          </div>
        )}

        {/* Picks */}
        {picks.length > 0 && (
          <div style={{ marginTop: 6 }}>
            {picks.map((p, i) => (
              <div key={i} style={card}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      letterSpacing: 0.3,
                      color: p.tier === "Conservador" ? "#86efac" : p.tier === "Estándar" ? "#c7d2fe" : "#fca5a5",
                      border: "1px solid rgba(255,255,255,.14)",
                      background: "rgba(255,255,255,.05)",
                      padding: "4px 8px",
                      borderRadius: 999,
                    }}
                  >
                    {p.tier}
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>{p.label}</div>
                  <div style={rightPct}>{pct(p.prob)}</div>
                </div>
                <div style={{ opacity: 0.85, fontSize: 13, marginTop: 4 }}>
                  {p.note} <span style={{ opacity: 0.7 }}>{p.odd ? `· Momio: ${p.odd}` : "· Sin momio"}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Chips liga/equipos actuales (info) */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {league && <div style={pill}>{league}</div>}
          {home && <div style={pill}>{home}</div>}
          {away && <div style={pill}>{away}</div>}
        </div>

        {/* Footer legal */}
        <div style={{ marginTop: 10, opacity: 0.6, fontSize: 12 }}>
          * Uso educativo/informativo. No constituye asesoría financiera ni garantiza resultados.
        </div>

        {/* Overlay Premium (si no hay clave) */}
        {!premiumKey && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(8,12,24,.7)",
              backdropFilter: "blur(2px)",
              display: "grid",
              placeItems: "center",
              borderRadius: 16,
            }}
          >
            <div
              style={{
                width: "min(520px, 92vw)",
                padding: 18,
                borderRadius: 14,
                border: "1px solid rgba(124,58,237,.35)",
                background: "linear-gradient(135deg, rgba(124,58,237,.15), rgba(37,99,235,.15))",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>🔒 Premium requerido</div>
              <div style={{ opacity: 0.9, marginBottom: 12 }}>
                Desbloquea IA Boot, Parlay inteligente y Generador de selección.
              </div>
              <button
                onClick={() => {
                  document.dispatchEvent(new CustomEvent("open-premium"));
                  onClose();
                }}
                style={{
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: "1px solid rgba(124,58,237,.5)",
                  background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
                  color: "white",
                  fontWeight: 900,
                }}
              >
                Ver planes
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
