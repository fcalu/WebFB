// src/components/IABootDrawer.tsx
import React, { useMemo, useState } from "react";

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
  poisson: {
    home_lambda: number;
    away_lambda: number;
    top_scorelines: { score: string; pct: number }[];
  };
  averages?: {
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
  };
  summary: string; // si tu backend ya devuelve un resumen de IA, lo mostramos
};

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
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");
  const [data, setData] = useState<PredictResponse | null>(null);
  const [analysis, setAnalysis] = useState<string>("");

  const nfPct = useMemo(
    () => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }),
    []
  );

  async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    };
    if (premiumKey) (headers as any)["X-Premium-Key"] = premiumKey;
    const r = await fetch(url, { ...init, headers });
    if (!r.ok) throw new Error(await r.text());
    return (await r.json()) as T;
  }

  async function onGenerate() {
    if (!home || !away || !league) {
      setErr("Completa liga y equipos antes de usar IA Boot.");
      return;
    }
    setLoading(true);
    setErr("");
    setData(null);
    try {
      // 1) Obtenemos (o refrescamos) las probabilidades base del modelo
      const base = await fetchJSON<PredictResponse>(`${API_BASE}/predict`, {
        method: "POST",
        body: JSON.stringify({
          league,
          home_team: home,
          away_team: away,
          odds: Object.keys(odds).length ? odds : undefined,
        }),
      });
      setData(base);

      // 2) Pedimos al backend el párrafo de IA, forzando ESPAÑOL
      //    (ajusta el endpoint si el tuyo es distinto)
      try {
        const j = await fetchJSON<{ text: string }>(`${API_BASE}/ia/boot`, {
          method: "POST",
          body: JSON.stringify({
            league,
            home_team: home,
            away_team: away,
            probs: base.probs,
            poisson: base.poisson,
            lang: "es", // << fuerza idioma
          }),
        });
        setAnalysis(j?.text || "");
      } catch {
        // fallback simple en caso de que el endpoint no exista
        const h = base.probs.home_win_pct;
        const a = base.probs.away_win_pct;
        const edgeTeam = h > a ? home : away;
        setAnalysis(
          `${home} y ${away} se enfrentan con ligera ventaja para ${edgeTeam} según el modelo. ` +
            `Se esperan ocasiones para ambos y un partido con ${base.probs.over_2_5_pct >= 55 ? "buenas opciones de Over" : "tendencia ajustada en el total de goles"}.`
        );
      }
    } catch (e: any) {
      setErr(e?.message || "No se pudo generar el análisis.");
    } finally {
      setLoading(false);
    }
  }

  // ---- Construcción de picks estilo “Bet365” desde los números del modelo ----
  type PickCard = {
    group: "Seguro" | "Conservador" | "Estándar" | "Riesgo";
    market: string;
    selection: string;
    probPct: number; // 0..100
    note?: string;
  };

  const picks: PickCard[] = useMemo(() => {
    if (!data) return [];
    const p = data.probs;

    const res: PickCard[] = [];

    // 1X2
    const maxSide =
      p.home_win_pct >= p.away_win_pct
        ? { sel: `Gana ${home}`, pct: p.home_win_pct }
        : { sel: `Gana ${away}`, pct: p.away_win_pct };
    res.push({
      group: "Estándar",
      market: "1X2",
      selection: maxSide.sel,
      probPct: maxSide.pct,
      note:
        p.draw_pct > 28
          ? "Empate relativamente probable; valora Doble Oportunidad."
          : undefined,
    });

    // Doble oportunidad
    const p1x = p.home_win_pct + p.draw_pct;
    const px2 = p.away_win_pct + p.draw_pct;
    res.push({
      group: "Conservador",
      market: "Doble oportunidad",
      selection: p1x >= px2 ? "1X (Local o Empate)" : "X2 (Empate o Visitante)",
      probPct: Math.max(p1x, px2),
    });

    // DNB (Empate no acción) -> P(win) / (1 - P(draw))
    const denom = Math.max(0.0001, 100 - p.draw_pct);
    const dnbHome = (p.home_win_pct / denom) * 100;
    const dnbAway = (p.away_win_pct / denom) * 100;
    res.push({
      group: "Conservador",
      market: "DNB",
      selection: dnbHome >= dnbAway ? `Local (DNB ${home})` : `Visitante (DNB ${away})`,
      probPct: Math.max(dnbHome, dnbAway),
      note: "Empate retorna la apuesta.",
    });

    // Over/Under
    res.push({
      group: "Estándar",
      market: "Over 2.5",
      selection: "Más de 2.5",
      probPct: p.over_2_5_pct,
    });
    // Alternativos (aprox desde over2.5)
    const o15 = Math.min(100, p.over_2_5_pct + 15);
    const o35 = Math.max(0, p.over_2_5_pct - 18);
    res.push({
      group: "Seguro",
      market: "Over 1.5",
      selection: "Más de 1.5",
      probPct: o15,
    });
    res.push({
      group: "Riesgo",
      market: "Over 3.5",
      selection: "Más de 3.5",
      probPct: o35,
    });

    // BTTS
    res.push({
      group: "Estándar",
      market: "BTTS",
      selection: "Sí",
      probPct: p.btts_pct,
    });

    // Correct score (top 3) – Riesgo
    const scorelines = data.poisson?.top_scorelines ?? [];
    for (const sc of scorelines.slice(0, 3)) {
      res.push({
        group: "Riesgo",
        market: "Marcador correcto",
        selection: sc.score,
        probPct: sc.pct ?? 0,
      });
    }

    return res;
  }, [data, home, away]);

  // ---- UI ----
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(0,0,0,.45)",
        display: "grid",
        placeItems: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(980px, 92vw)",
          maxHeight: "88vh",
          overflow: "auto",
          background: "#0d1426",
          border: "1px solid rgba(255,255,255,.12)",
          borderRadius: 18,
          padding: 16,
          color: "#e5e7eb",
          boxShadow: "0 20px 60px rgba(0,0,0,.45)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 900 }}>🤖 Predicción IA Boot</div>
          <button
            onClick={onClose}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,.14)",
              background: "rgba(255,255,255,.04)",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Cerrar ✕
          </button>
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {/* Inputs bloqueados, sólo informativos */}
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <Field label="Equipo local" value={home || "—"} />
            <Field label="Equipo visitante" value={away || "—"} />
          </div>

          <button
            onClick={onGenerate}
            disabled={loading || !home || !away || !league}
            style={{
              marginTop: 6,
              alignSelf: "start",
              padding: "14px 18px",
              borderRadius: 14,
              border: "none",
              background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
              color: "white",
              fontWeight: 900,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Generando…" : "Generar con IA"}
          </button>

          {err && (
            <div
              role="alert"
              style={{
                background: "rgba(239,68,68,.12)",
                border: "1px solid rgba(239,68,68,.35)",
                padding: 12,
                borderRadius: 12,
                color: "#fecaca",
              }}
            >
              {err}
            </div>
          )}

          {/* Bloque de análisis IA */}
          {!!analysis && (
            <div
              style={{
                borderRadius: 14,
                padding: 14,
                background: "linear-gradient(135deg,#1e1b4b,#0f172a)",
                border: "1px solid rgba(255,255,255,.12)",
              }}
            >
              <div style={{ fontSize: 13, letterSpacing: 0.3, color: "#c7d2fe", fontWeight: 900 }}>
                ANÁLISIS COMPLETO (IA BOOT)
              </div>
              <div style={{ marginTop: 8, fontSize: 16, lineHeight: 1.5 }}>{analysis}</div>
            </div>
          )}

          {/* Picks estilo Bet365 */}
          {!!picks.length && (
            <div style={{ display: "grid", gap: 10 }}>
              {picks.map((pk, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    alignItems: "center",
                    gap: 8,
                    borderRadius: 14,
                    padding: 14,
                    background: "rgba(255,255,255,.04)",
                    border: "1px solid rgba(255,255,255,.12)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>
                      {pk.market} — <span style={{ color: "#fecaca" }}>{pk.selection}</span>
                    </div>
                    <div style={{ opacity: 0.8, marginTop: 6, fontSize: 14 }}>
                      {pk.note ||
                        (pk.group === "Riesgo"
                          ? "Selección de alta cuota; úsala con stake bajo."
                          : pk.group === "Conservador"
                          ? "Opción protegida para tickets combinados."
                          : "Selección de valor según el modelo.")}
                    </div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900 }}>
                    {nfPct.format(pk.probPct)}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: "#c7d2fe", fontSize: 12, fontWeight: 800, letterSpacing: 0.3 }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          padding: "12px 14px",
          borderRadius: 12,
          background: "#0f172a",
          border: "1px solid rgba(255,255,255,.16)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
