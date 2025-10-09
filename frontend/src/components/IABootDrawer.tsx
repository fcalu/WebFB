import React, { useEffect, useMemo, useState } from "react";

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
  summary: string;
};

async function fetchJSON<T>(url: string, init?: RequestInit, premiumKey?: string): Promise<T> {
  const headers: HeadersInit = { "Content-Type": "application/json", ...(init?.headers || {}) };
  if (premiumKey) (headers as any)["X-Premium-Key"] = premiumKey;
  const r = await fetch(url, { ...init, headers });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

// EV por unidad apostada (ganancia neta esperada)
function expectedValue(probPct: number, odd?: number | null) {
  if (!odd || odd <= 1) return null;
  const p = probPct / 100;
  return p * (odd - 1) - (1 - p);
}

// Kelly fraction
function kellyFraction(probPct: number, odd: number) {
  const p = probPct / 100;
  const b = Math.max(odd - 1, 0.000001);
  return (b * p - (1 - p)) / b; // puede ser negativa
}

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
  const [err, setErr] = useState("");
  const [data, setData] = useState<PredictResponse | null>(null);
  const [analysis, setAnalysis] = useState("");
  const [bankroll, setBankroll] = useState<number>(100); // unidades

  const nf = useMemo(() => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }), []);
  const nf0 = useMemo(() => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }), []);

  async function onGenerate() {
    if (!league || !home || !away) {
      setErr("Selecciona liga y equipos en el Paso 1 antes de usar IA Boot.");
      return;
    }
    setErr("");
    setLoading(true);
    setAnalysis("");
    setData(null);

    try {
      const base = await fetchJSON<PredictResponse>(
        `${API_BASE}/predict`,
        {
          method: "POST",
          body: JSON.stringify({
            league,
            home_team: home,
            away_team: away,
            odds: Object.keys(odds || {}).length ? odds : undefined,
          }),
        },
        premiumKey
      );
      setData(base);

      // Texto de IA (español). Si falla, usamos fallback corto.
      try {
        const j = await fetchJSON<{ text: string }>(
          `${API_BASE}/ia/boot`,
          {
            method: "POST",
            body: JSON.stringify({ league, home_team: home, away_team: away, probs: base.probs, poisson: base.poisson, lang: "es" }),
          },
          premiumKey
        );
        setAnalysis(j?.text || "");
      } catch {
        const p = base.probs;
        const edge = p.home_win_pct > p.away_win_pct ? home : away;
        setAnalysis(
          `${home} y ${away} llegan parejos con leve ventaja para ${edge}. ` +
            (p.over_2_5_pct >= 55
              ? "Se espera un partido con varios goles (tendencia a Over 2.5)."
              : "Tendencia a marcador corto.")
        );
      }
    } catch (e: any) {
      setErr(e?.message || "No se pudo generar el análisis.");
    } finally {
      setLoading(false);
    }
  }

  // --- Picks y “Selección estrella” ---
  type Pick = {
    market: string;
    selection: string;
    probPct: number;
    odd?: number;
    ev?: number | null;
    group: "Conservador" | "Estándar" | "Riesgo";
    note?: string;
  };

  const picks: Pick[] = useMemo(() => {
    if (!data) return [];
    const p = data.probs;
    const out: Pick[] = [];

    // 1X2 (lado más fuerte)
    const side =
      p.home_win_pct >= p.away_win_pct
        ? { sel: `Gana ${home}`, pct: p.home_win_pct, odd: odds["1"] }
        : { sel: `Gana ${away}`, pct: p.away_win_pct, odd: odds["2"] };
    out.push({
      market: "1X2",
      selection: side.sel,
      probPct: side.pct,
      odd: side.odd,
      ev: expectedValue(side.pct, side.odd),
      group: "Estándar",
      note: p.draw_pct > 28 ? "Empate no despreciable; valora Doble Oportunidad." : undefined,
    });

    // Doble Oportunidad
    const p1x = p.home_win_pct + p.draw_pct;
    const px2 = p.away_win_pct + p.draw_pct;
    out.push({
      market: "Doble oportunidad",
      selection: p1x >= px2 ? "1X (Local o Empate)" : "X2 (Empate o Visitante)",
      probPct: Math.max(p1x, px2),
      group: "Conservador",
      note: "Protege contra el empate.",
    });

    // DNB
    const denom = Math.max(0.0001, 100 - p.draw_pct);
    const dnbHome = (p.home_win_pct / denom) * 100;
    const dnbAway = (p.away_win_pct / denom) * 100;
    out.push({
      market: "DNB (Empate no válida)",
      selection: dnbHome >= dnbAway ? `Local (DNB ${home})` : `Visitante (DNB ${away})`,
      probPct: Math.max(dnbHome, dnbAway),
      group: "Conservador",
      note: "Si empata, devuelve stake.",
    });

    // Over/Under
    const o25 = p.over_2_5_pct;
    const o15 = Math.min(100, o25 + 15);
    const o35 = Math.max(0, o25 - 18);

    out.push({
      market: "Over 2.5",
      selection: "Más de 2.5",
      probPct: o25,
      odd: odds.O2_5,
      ev: expectedValue(o25, odds.O2_5),
      group: "Estándar",
    });
    out.push({
      market: "Over 1.5",
      selection: "Más de 1.5",
      probPct: o15,
      group: "Conservador",
      note: "Línea cómoda para combinadas.",
    });
    out.push({
      market: "Over 3.5",
      selection: "Más de 3.5",
      probPct: o35,
      group: "Riesgo",
      note: "Sólo si esperas partido abierto.",
    });

    // BTTS
    out.push({
      market: "BTTS",
      selection: "Sí",
      probPct: p.btts_pct,
      odd: odds.BTTS_YES,
      ev: expectedValue(p.btts_pct, odds.BTTS_YES),
      group: "Estándar",
    });

    // Marcador correcto — top-3 (siempre riesgo)
    for (const sc of (data.poisson?.top_scorelines ?? []).slice(0, 3)) {
      out.push({
        market: "Marcador correcto",
        selection: sc.score,
        probPct: sc.pct ?? 0,
        group: "Riesgo",
      });
    }

    return out;
  }, [data, home, away, odds]);

  const star = useMemo(() => {
    // mejor EV entre picks con cuota
    const withOdds = picks.filter((p) => p.odd && p.ev != null) as Required<Pick>[];
    const bestEV = withOdds
      .filter((p) => (p.ev ?? -1) > 0)
      .sort((a, b) => (b.ev ?? -1) - (a.ev ?? -1))[0];

    // fallback: el de mayor prob con cuota aunque EV <= 0
    const fallback =
      withOdds.sort((a, b) => b.probPct - a.probPct)[0] ||
      null;

    return bestEV || fallback || null;
  }, [picks]);

  const starStake = useMemo(() => {
    if (!star || !star.odd) return null;
    const k = kellyFraction(star.probPct, star.odd);
    const kHalf = Math.max(0, k) * 0.5; // Kelly 1/2
    const kCapped = Math.min(kHalf, 0.10); // cap 10% banca
    return {
      frac: kCapped,
      units: Math.max(0, Math.round(bankroll * kCapped * 100) / 100),
    };
  }, [star, bankroll]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", zIndex: 60 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
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
      >
        {/* Header */}
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

        {/* Contexto de partido (solo lectura) */}
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <Chip>{league || "—"}</Chip>
          <Chip>{home || "—"}</Chip>
          <Chip>{away || "—"}</Chip>
        </div>

        {/* Botón generar */}
        <button
          onClick={onGenerate}
          disabled={loading || !league || !home || !away}
          style={{
            marginTop: 12,
            padding: "16px 18px",
            borderRadius: 14,
            border: "none",
            background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
            color: "white",
            fontWeight: 900,
            opacity: loading ? 0.6 : 1,
            cursor: loading ? "not-allowed" : "pointer",
            width: "100%",
          }}
        >
          {loading ? "Generando…" : "Generar con IA"}
        </button>

        {/* error */}
        {err && (
          <div
            role="alert"
            style={{
              marginTop: 10,
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

        {/* Análisis IA */}
        {!!analysis && (
          <div
            style={{
              marginTop: 12,
              borderRadius: 14,
              padding: 14,
              background: "linear-gradient(135deg,#1e1b4b,#0f172a)",
              border: "1px solid rgba(255,255,255,.12)",
            }}
          >
            <div style={{ fontSize: 13, letterSpacing: 0.3, color: "#c7d2fe", fontWeight: 900 }}>ANÁLISIS COMPLETO (IA BOOT)</div>
            <div style={{ marginTop: 8, fontSize: 16, lineHeight: 1.5 }}>{analysis}</div>
          </div>
        )}

        {/* Selección estrella (tipo Bet365) */}
        {star && (
          <div
            style={{
              marginTop: 12,
              borderRadius: 16,
              padding: 16,
              background: "rgba(34,197,94,.10)",
              border: "1px solid rgba(34,197,94,.35)",
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ fontWeight: 900, color: "#bbf7d0" }}>⭐ Selección estrella</div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>
              {star.market} — <span style={{ color: "#fecaca" }}>{star.selection}</span>
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap" }}>
              <small>Prob: {nf.format(star.probPct)}%</small>
              {star.odd && <small>Momio: {star.odd}</small>}
              {star.ev != null && <small>EV: {nf.format(star.ev)}</small>}
              {starStake && (
                <small>
                  Stake sugerido: <strong>{nf.format(starStake.units)}u</strong>{" "}
                  <span style={{ opacity: 0.75 }}>(Kelly 1/2, banca {nf0.format(bankroll)}u)</span>
                </small>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
              <label style={{ fontSize: 12, opacity: 0.8 }}>Banca (u):</label>
              <input
                type="number"
                min={1}
                value={bankroll}
                onChange={(e) => setBankroll(Math.max(1, Number(e.target.value) || 1))}
                style={{
                  width: 110,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,.16)",
                  background: "#0f172a",
                  color: "#e5e7eb",
                  outline: "none",
                }}
              />
            </div>
          </div>
        )}

        {/* Lista de picks */}
        {!!picks.length && (
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {picks.map((pk, i) => (
              <div
                key={i}
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
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                    {pk.group} · {pk.market}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>
                    {pk.market} — <span style={{ color: "#fecaca" }}>{pk.selection}</span>
                  </div>
                  <div style={{ opacity: 0.8, marginTop: 6, fontSize: 14 }}>
                    {pk.note ||
                      (pk.group === "Riesgo"
                        ? "Selección de alta cuota; stake bajo."
                        : pk.group === "Conservador"
                        ? "Sólida para combinadas."
                        : "Selección de valor según el modelo.")}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 22, fontWeight: 900 }}>{nf.format(pk.probPct)}%</div>
                  <div style={{ opacity: 0.75 }}>
                    {pk.odd ? `Momio ${pk.odd}` : "Sin momio"}
                    {pk.ev != null && ` · EV ${nf.format(pk.ev)}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- UI mini helper ---------- */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "6px 10px",
        borderRadius: 999,
        background: "rgba(255,255,255,.06)",
        border: "1px solid rgba(255,255,255,.10)",
        fontSize: 12,
      }}
    >
      {children}
    </div>
  );
}
