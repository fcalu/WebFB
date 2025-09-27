import React, { useMemo, useState } from "react";

/** ====== Tipos (compatibles con tu backend) ====== */
type BestPick = {
  market: string;        // "1X2" | "Over 2.5" | "BTTS" ...
  selection: string;     // "1" | "X" | "2" | "Sí"
  prob_pct: number;      // 0..100
  confidence: number;    // 0..100
  reasons: string[];
};

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
  averages: {
    total_yellow_cards_avg: number;
    total_corners_avg: number;
    corners_mlp_pred: number;
  };
  best_pick: BestPick;
  summary: string;
  debug?: Record<string, any>;
};

type Odds = {
  "1"?: number;
  X?: number;
  "2"?: number;
  O2_5?: number;
  BTTS_YES?: number;
};

/** ====== Utilidades visuales ====== */
const pct = (n?: number) =>
  n == null || Number.isNaN(n) ? "—" : `${(+n).toFixed(2)}%`;
const fmt2 = (n?: number) =>
  n == null || Number.isNaN(n) ? "—" : (+n).toFixed(2);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const cardGradient: React.CSSProperties = {
  borderRadius: 18,
  padding: 16,
  background:
    "linear-gradient(135deg, rgba(168,85,247,.18), rgba(99,102,241,.18))",
  border: "1px solid rgba(99,102,241,.28)",
  boxShadow: "0 18px 36px rgba(0,0,0,.25)",
};

const panel: React.CSSProperties = {
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 16,
  padding: 14,
};

const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.10)",
  color: "#d1d5db",
  fontSize: 12,
  whiteSpace: "nowrap",
};

const chip = (bg: string, b: string): React.CSSProperties => ({
  ...pill,
  background: bg,
  border: `1px solid ${b}`,
  color: "#fff",
});

/** ====== Mapeo a lenguaje claro ====== */
function humanPick(market: string, selection: string) {
  if (market === "1X2") {
    if (selection === "1") return "Gana local";
    if (selection === "X") return "Empate";
    if (selection === "2") return "Gana visitante";
  }
  if (market.toLowerCase().includes("over") && selection === "Sí") {
    return market.replace("Over", "Más de") + " goles";
  }
  if (market === "BTTS" && selection === "Sí") return "Ambos equipos anotan (Sí)";
  // fallback
  return `${market} — ${selection}`;
}

/** ====== EV/Edge usando cuotas (si las pasas) ====== */
function implied(p: number | undefined) {
  return p && p > 0 ? 1 / p : undefined;
}
function calcEdgeAndEV(
  best: BestPick,
  probs: PredictResponse["probs"],
  odds?: Odds
) {
  if (!odds) return { ev: undefined, edge: undefined, usedOdd: undefined };

  let prob01: number | undefined;
  let odd: number | undefined;

  if (best.market === "1X2") {
    if (best.selection === "1") {
      prob01 = probs.home_win_pct / 100;
      odd = odds["1"];
    } else if (best.selection === "X") {
      prob01 = probs.draw_pct / 100;
      odd = odds.X;
    } else if (best.selection === "2") {
      prob01 = probs.away_win_pct / 100;
      odd = odds["2"];
    }
  } else if (best.market === "Over 2.5" && best.selection === "Sí") {
    prob01 = probs.over_2_5_pct / 100;
    odd = odds.O2_5;
  } else if (best.market === "BTTS" && best.selection === "Sí") {
    prob01 = probs.btts_pct / 100;
    odd = odds.BTTS_YES;
  }

  if (!prob01 || !odd) return { ev: undefined, edge: undefined, usedOdd: odd };

  const ev = prob01 * odd - 1;
  const pImpl = implied(odd);
  const edge = pImpl !== undefined ? prob01 - pImpl : undefined;
  return { ev, edge, usedOdd: odd };
}

/** ====== Barra básica (sin librerías) ====== */
function Bar({ value }: { value: number }) {
  const width = `${Math.max(0, Math.min(100, value)).toFixed(0)}%`;
  return (
    <div style={{ background: "rgba(255,255,255,.08)", borderRadius: 999, height: 10 }}>
      <div
        style={{
          width,
          height: 10,
          borderRadius: 999,
          background: "linear-gradient(90deg,#a78bfa,#60a5fa)",
          boxShadow: "0 0 14px rgba(99,102,241,.45) inset",
        }}
      />
    </div>
  );
}

/** ====== Componente principal ====== */
export default function BestPickPro({
  data,
  odds,
}: {
  data: PredictResponse;
  odds?: Odds;
}) {
  const [open, setOpen] = useState(false);

  // Riesgo semáforo
  const p01 = (data.best_pick?.prob_pct ?? 0) / 100;
  const risk =
    p01 >= 0.6 ? "Bajo" : p01 >= 0.5 ? "Medio" : "Alto";

  // Alternativa sugerida (doble oportunidad más probable)
  const p1 = data.probs.home_win_pct / 100;
  const px = data.probs.draw_pct / 100;
  const p2 = data.probs.away_win_pct / 100;
  const alts = [
    { key: "1X", label: "Doble oportunidad: 1X", prob: clamp01(p1 + px) },
    { key: "X2", label: "Doble oportunidad: X2", prob: clamp01(px + p2) },
    { key: "12", label: "Doble oportunidad: 12", prob: clamp01(p1 + p2) },
  ].sort((a, b) => b.prob - a.prob);
  const bestAlt = alts[0];

  // EV/Edge si nos pasas cuotas
  const { ev, edge, usedOdd } = useMemo(
    () => calcEdgeAndEV(data.best_pick, data.probs, odds),
    [data, odds]
  );

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
      {/* TOP CARD */}
      <div style={cardGradient}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.85 }}>Mejor predicción</div>
            <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.2, marginTop: 4 }}>
              {humanPick(data.best_pick.market, data.best_pick.selection)}
            </div>
            <div style={{ marginTop: 6 }}>
              Probabilidad: <b>{pct(data.best_pick.prob_pct)}</b> · Confianza:{" "}
              <b>{pct(data.best_pick.confidence)}</b>
            </div>
            <div style={{ marginTop: 6, opacity: .9 }}>
              {data.home_team} vs {data.away_team} — {data.league}
            </div>
          </div>

          <div
            style={
              risk === "Bajo"
                ? chip("rgba(34,197,94,.18)", "rgba(34,197,94,.45)")
                : risk === "Medio"
                ? chip("rgba(234,179,8,.18)", "rgba(234,179,8,.45)")
                : chip("rgba(239,68,68,.18)", "rgba(239,68,68,.45)")
            }
            title="Riesgo estimado por la IA"
          >
            🔎 Riesgo: <b>{risk}</b>
          </div>
        </div>

        {/* EV/Edge si hay cuotas */}
        {(ev !== undefined || edge !== undefined) && (
          <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={pill}>💰 EV: <b style={{ marginLeft: 6 }}>{fmt2(ev)}</b></div>
            <div style={pill}>
              📈 Edge: <b style={{ marginLeft: 6 }}>
                {edge !== undefined ? `${(edge * 100).toFixed(2)}%` : "—"}
              </b>
            </div>
            <div style={pill}>🧮 Cuota usada: <b style={{ marginLeft: 6 }}>{usedOdd ?? "—"}</b></div>
          </div>
        )}

        {/* Alternativa */}
        {bestAlt && (
          <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ ...pill, borderColor: "rgba(255,255,255,.18)" }}>💡 Alternativa</div>
            <div style={{ fontWeight: 800 }}>{bestAlt.label}</div>
            <div style={{ minWidth: 90, fontSize: 12, opacity: 0.9 }}>
              Prob: <b>{pct(bestAlt.prob * 100)}</b>
            </div>
          </div>
        )}

        {/* Toggle detalles */}
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => setOpen(s => !s)}
            style={{ ...pill, cursor: "pointer", borderColor: "rgba(255,255,255,.18)" }}
          >
            {open ? "▾ Ocultar detalles" : "▸ Ver detalles y análisis"}
          </button>
        </div>
      </div>

      {/* DETAILS (collapsible) */}
      {open && (
        <>
          {/* Mercados resumidos con barras */}
          <div style={panel}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Mercados</div>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
              <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Ganador del partido</div>
                <div style={{ marginBottom: 6 }}>Gana local — {pct(data.probs.home_win_pct)}</div>
                <Bar value={data.probs.home_win_pct} />
                <div style={{ margin: "10px 0 6px" }}>Empate — {pct(data.probs.draw_pct)}</div>
                <Bar value={data.probs.draw_pct} />
                <div style={{ margin: "10px 0 6px" }}>Gana visitante — {pct(data.probs.away_win_pct)}</div>
                <Bar value={data.probs.away_win_pct} />
              </div>

              <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Goles</div>
                <div style={{ marginBottom: 6 }}>Más de 2.5 goles — {pct(data.probs.over_2_5_pct)}</div>
                <Bar value={data.probs.over_2_5_pct} />
                <div style={{ margin: "10px 0 6px" }}>Ambos equipos anotan (Sí) — {pct(data.probs.btts_pct)}</div>
                <Bar value={data.probs.btts_pct} />
              </div>

              <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Marcadores probables</div>
                {(data.poisson?.top_scorelines ?? []).slice(0, 3).map((t) => (
                  <div key={t.score} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontWeight: 700 }}>{t.score}</div>
                    <div style={{ opacity: 0.9 }}>{t.pct}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Indicadores del partido */}
          <div style={panel}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Indicadores del partido</div>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
              <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Lambdas (media de goles)</div>
                <div>λ Local: {fmt2(data.poisson?.home_lambda)}</div>
                <div>λ Visitante: {fmt2(data.poisson?.away_lambda)}</div>
              </div>
              <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Corners</div>
                <div>Promedio total: {fmt2(data.averages.total_corners_avg)}</div>
                <div>Predicción simple: {fmt2(data.averages.corners_mlp_pred)}</div>
              </div>
              <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Tarjetas</div>
                <div>Amarillas totales (prom): {fmt2(data.averages.total_yellow_cards_avg)}</div>
              </div>
            </div>
          </div>

          {/* ¿Por qué este pick? (razones del backend en claro) */}
          {!!(data.best_pick?.reasons?.length) && (
            <div style={panel}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>¿Por qué este pick?</div>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                {data.best_pick.reasons.map((r, i) => (
                  <li key={i} style={{ color: "#d1d5db" }}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Nota legal */}
      <div style={{ fontSize: 12, opacity: 0.7 }}>
        *Contenido informativo; no constituye asesoría financiera.
      </div>
    </div>
  );
}
