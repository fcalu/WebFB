import React, { useCallback, useEffect, useMemo, useState } from "react";

/** ===== Tipos mínimos compatibles con tu /predict ===== */
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
  };
  poisson: {
    home_lambda: number;
    away_lambda: number;
    top_scorelines: { score: string; pct: number }[];
  };
  best_pick: {
    market: string;
    selection: string;
    prob_pct: number;
    confidence: number; // 0..1
    reasons: string[];
  };
  summary?: string;
};

type Odds = { "1"?: number; X?: number; "2"?: number; O2_5?: number; BTTS_YES?: number };

/** ===== Utilidades UI ===== */
const wrapDrawer: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 60,
  display: "grid",
  gridTemplateRows: "auto 1fr",
  background: "rgba(0,0,0,.55)",
  backdropFilter: "blur(3px)",
};

const panel: React.CSSProperties = {
  maxWidth: 980,
  margin: "12px auto",
  background: "#0b1326",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 16,
  padding: 14,
  color: "#e5e7eb",
  boxShadow: "0 30px 60px rgba(0,0,0,.45)",
};

const hRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "6px 8px 10px",
};

const chip: React.CSSProperties = {
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

const cta: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 12,
  border: "1px solid rgba(124,58,237,.45)",
  background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const field: React.CSSProperties = {
  width: "100%",
  background: "#0f172a",
  color: "white",
  border: "1px solid rgba(255,255,255,.18)",
  borderRadius: 12,
  padding: "10px 12px",
  outline: "none",
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 14,
  padding: 12,
};

const row: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(0,0,0,.15)",
  border: "1px solid rgba(255,255,255,.06)",
};

function pct(n?: number) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(+n).toFixed(2)}%`;
}
const to01 = (pctNum: number) => Math.max(0, Math.min(1, pctNum / 100));
const fairOdd = (p01: number) => (p01 > 0 ? +(1 / p01).toFixed(2) : undefined);
const implied = (odd?: number) => (odd ? 1 / odd : undefined);

/** “Valor” relativo (positivo si la oferta es > cuota justa) */
function valuePct(modelP01: number, offeredOdd?: number) {
  if (!offeredOdd || modelP01 <= 0) return undefined;
  const fair = 1 / modelP01;
  return (offeredOdd / fair - 1) * 100; // %
}

/** Kelly fraccional (para sugerir stake %) */
function kellyFraction(p01: number, odd?: number) {
  if (!odd) return 0;
  const b = odd - 1;
  const q = 1 - p01;
  const k = (b * p01 - q) / b;
  // conservador (1/2 Kelly)
  return Math.max(0, k / 2);
}

/** Fetch JSON simple con header opcional */
async function fetchJSON<T>(url: string, opts: RequestInit & { premiumKey?: string } = {}) {
  const headers: HeadersInit = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if ((opts as any).premiumKey) (headers as any)["X-Premium-Key"] = (opts as any).premiumKey;
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

/** ====== Componente principal ====== */
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
  premiumKey?: string;
}) {
  const [localHome, setLocalHome] = useState(home);
  const [localAway, setLocalAway] = useState(away);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState<PredictResponse | null>(null);

  useEffect(() => {
    if (!open) return;
    setLocalHome(home);
    setLocalAway(away);
    setErr("");
  }, [open, home, away]);

  const canRun = league && localHome && localAway && localHome !== localAway;

  const run = useCallback(async () => {
    if (!canRun || loading) return;
    setLoading(true);
    setErr("");
    setData(null);
    try {
      const body: any = { league, home_team: localHome, away_team: localAway };
      const j = await fetchJSON<PredictResponse>(`${API_BASE}/predict`, {
        method: "POST",
        body: JSON.stringify(body),
        premiumKey,
      });
      setData(j);
    } catch (e: any) {
      setErr(e?.message || "No se pudo generar el análisis.");
    } finally {
      setLoading(false);
    }
  }, [API_BASE, canRun, league, localHome, localAway, loading, premiumKey]);

  /** ======= Construcción de “menú Bet365-like” ======= */
  const markets = useMemo(() => {
    if (!data) return null;
    const p = data.probs;
    const picks: Array<{
      group: "Seguro" | "Equilibrado" | "Arriesgado";
      key: string;
      market: string;
      selection: string;
      p01: number;
      offeredOdd?: number;
    }> = [];

    // 1X2
    const m1 = [
      { sel: "Gana local", p01: to01(p.home_win_pct), odd: odds["1"], k: "1X2:1" },
      { sel: "Empate", p01: to01(p.draw_pct), odd: odds.X, k: "1X2:X" },
      { sel: "Gana visitante", p01: to01(p.away_win_pct), odd: odds["2"], k: "1X2:2" },
    ];
    for (const x of m1) {
      const group = x.p01 >= 0.62 ? "Seguro" : x.p01 >= 0.54 ? "Equilibrado" : "Arriesgado";
      picks.push({ group, key: x.k, market: "1X2", selection: x.sel, p01: x.p01, offeredOdd: x.odd });
    }

    // Over 2.5
    const o25 = to01(p.over_2_5_pct);
    picks.push({
      group: o25 >= 0.60 ? "Seguro" : o25 >= 0.52 ? "Equilibrado" : "Arriesgado",
      key: "O25",
      market: "Más de 2.5",
      selection: "Over 2.5",
      p01: o25,
      offeredOdd: odds.O2_5,
    });

    // BTTS Sí
    const btts = to01(p.btts_pct);
    picks.push({
      group: btts >= 0.60 ? "Seguro" : btts >= 0.52 ? "Equilibrado" : "Arriesgado",
      key: "BTTSY",
      market: "BTTS",
      selection: "Sí",
      p01: btts,
      offeredOdd: odds.BTTS_YES,
    });

    const scorelines = data.poisson?.top_scorelines ?? [];
for (const sc of scorelines.slice(0, 3)) {
  picks.push({
    group: "Arriesgado",
    key: `CS:${sc.score}`,
    market: "Marcador correcto",
    selection: sc.score,
    p01: Math.max(0, Math.min(1, (sc.pct ?? 0) / 100)),
    offeredOdd: undefined,
  });
}

    return picks;
  }, [data, odds]);

  const summary = useMemo(() => {
    if (!data) return null;
    if (data.summary) return data.summary;

    // Fallback: generamos un resumen breve
    const { home_team, away_team, probs } = data;
    const top =
      probs.home_win_pct > probs.away_win_pct && probs.home_win_pct > probs.draw_pct
        ? `${home_team} ligero favorito`
        : probs.away_win_pct > probs.home_win_pct && probs.away_win_pct > probs.draw_pct
        ? `${away_team} con ventaja ajustada`
        : "Partido muy parejo";

    const goals =
      probs.over_2_5_pct >= 58
        ? "tendencia a 3+ goles"
        : probs.over_2_5_pct <= 45
        ? "tendencia a pocos goles"
        : "línea de 2–3 goles";

    const both = probs.btts_pct >= 58 ? "con ambos marcando" : probs.btts_pct <= 45 ? "con uno quedándose en cero" : "difícil de separar en BTTS";

    return `${top}. Se espera ${goals}, ${both}.`;
  }, [data]);

  const grouped = useMemo(() => {
    if (!markets) return null;
    const groups: Record<string, typeof markets> = { Seguro: [], Equilibrado: [], Arriesgado: [] };
    markets.forEach((m) => groups[m.group].push(m));
    // orden por mayor probabilidad
    (Object.keys(groups) as Array<keyof typeof groups>).forEach((g) =>
      groups[g].sort((a, b) => b.p01 - a.p01)
    );
    return groups;
  }, [markets]);

  if (!open) return null;

  return (
    <div style={wrapDrawer} onClick={onClose}>
      <div style={{ ...panel, width: "min(980px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={hRow}>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 0.2 }}>🤖 Predicción IA Boot</div>
          <button
            onClick={onClose}
            style={{
              ...chip,
              cursor: "pointer",
              borderColor: "rgba(255,255,255,.20)",
              background: "rgba(255,255,255,.06)",
            }}
          >
            Cerrar ✕
          </button>
        </div>

        {/* Inputs rápidos */}
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Equipo local</div>
            <input value={localHome} onChange={(e) => setLocalHome(e.target.value)} style={field} />
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Equipo visitante</div>
            <input value={localAway} onChange={(e) => setLocalAway(e.target.value)} style={field} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button
            onClick={run}
            disabled={!canRun || loading}
            style={{ ...cta, opacity: !canRun || loading ? 0.6 : 1 }}
          >
            {loading ? "Generando…" : "Generar con IA"}
          </button>
          {data && (
            <div style={{ ...chip, borderColor: "rgba(34,197,94,.45)", color: "#d1fae5", background: "rgba(34,197,94,.12)" }}>
              {data.home_team} vs {data.away_team}
            </div>
          )}
        </div>

        {err && (
          <div
            role="alert"
            style={{
              marginTop: 12,
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

        {/* ======== Contenido ======== */}
        {data && (
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            {/* Bloque de análisis */}
            <div style={{ ...card, borderColor: "rgba(124,58,237,.35)", background: "linear-gradient(135deg,#312e81,#1e1b4b)" }}>
              <div style={{ fontWeight: 900, letterSpacing: 0.2, marginBottom: 6 }}>ANÁLISIS COMPLETO (IA BOOT)</div>
              <div style={{ opacity: 0.92 }}>{summary}</div>
            </div>

            {/* Barras 1X2 */}
            <div style={card}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Termómetro 1X2</div>
              <div style={{ display: "grid", gap: 10 }}>
                {[
                  { label: "Gana local", v: data.probs.home_win_pct },
                  { label: "Empate", v: data.probs.draw_pct },
                  { label: "Gana visitante", v: data.probs.away_win_pct },
                ].map((x) => (
                  <div key={x.label}>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>{x.label}</div>
                    <div
                      style={{
                        height: 10,
                        borderRadius: 999,
                        background: "rgba(255,255,255,.08)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.max(6, Math.min(100, x.v))}%`,
                          height: "100%",
                          background: "linear-gradient(90deg,#7c3aed,#5b21b6)",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Picks por nivel */}
            {grouped && (
              <div style={{ display: "grid", gap: 12 }}>
                {(["Seguro", "Equilibrado", "Arriesgado"] as const).map((g) => (
                  <div key={g} style={card}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 900 }}>
                        {g}{" "}
                        <span style={{ opacity: 0.7, fontWeight: 600, fontSize: 12 }}>
                          {g === "Seguro" ? "Mayor probabilidad" : g === "Equilibrado" ? "Balance riesgo/retorno" : "Cuotas altas"}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                      {grouped[g].map((m) => {
                        const fair = fairOdd(m.p01);
                        const val = valuePct(m.p01, m.offeredOdd);
                        const kelly = kellyFraction(m.p01, m.offeredOdd);
                        return (
                          <div key={m.key} style={row}>
                            <div style={{ display: "grid", gap: 6 }}>
                              <div style={{ fontWeight: 800 }}>
                                {m.market} — <span style={{ opacity: 0.9, fontWeight: 700 }}>{m.selection}</span>
                              </div>
                              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12 }}>
                                <span style={chip}>Modelo: {pct(m.p01 * 100)}</span>
                                <span style={chip}>Cuota justa: {fair}</span>
                                {m.offeredOdd && <span style={chip}>Tu cuota: {m.offeredOdd}</span>}
                                {val !== undefined && (
                                  <span
                                    style={{
                                      ...chip,
                                      borderColor: val > 0 ? "rgba(34,197,94,.45)" : "rgba(239,68,68,.45)",
                                      color: val > 0 ? "#d1fae5" : "#fecaca",
                                      background: val > 0 ? "rgba(34,197,94,.12)" : "rgba(239,68,68,.12)",
                                    }}
                                  >
                                    {val > 0 ? "Value +" : "Value "}
                                    {val.toFixed(1)}%
                                  </span>
                                )}
                                {m.offeredOdd && kelly > 0 && <span style={chip}>Stake sug.: {(kelly * 100).toFixed(1)}% banca</span>}
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                onClick={() => {
                                  const text = `${m.market} — ${m.selection} | ${pct(m.p01 * 100)} | Cuota justa ${fair}${m.offeredOdd ? ` | Tu cuota ${m.offeredOdd}` : ""}`;
                                  navigator.clipboard?.writeText(text);
                                }}
                                style={{
                                  ...chip,
                                  cursor: "pointer",
                                  borderColor: "rgba(124,58,237,.45)",
                                  background: "rgba(124,58,237,.15)",
                                  fontWeight: 800,
                                }}
                                title="Copiar a portapapeles"
                              >
                                Copiar
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Marcadores correctos */}
            {data.poisson?.top_scorelines?.length > 0 && (
              <div style={card}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Marcadores más probables</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {data.poisson.top_scorelines.slice(0, 5).map((s) => (
                    <div key={s.score} style={{ ...row, background: "rgba(255,255,255,.03)" }}>
                      <div style={{ fontWeight: 800 }}>{s.score}</div>
                      <div style={{ ...chip }}>{pct(s.pct)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Combos rápidos (mismo partido) */}
            {markets && (
              <div style={card}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Combos rápidos (mismo partido)</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {(() => {
                    // Dos combinaciones simples con penalización por dependencia
                    const pOver = to01(data.probs.over_2_5_pct);
                    const pBTTS = to01(data.probs.btts_pct);
                    const pHome = to01(data.probs.home_win_pct);
                    const pAway = to01(data.probs.away_win_pct);
                    const corr = 0.92; // penalización light por correlación

                    const combos = [
                      {
                        label: "Over 2.5 + BTTS Sí",
                        p01: pOver * pBTTS * corr,
                      },
                      {
                        label:
                          data.probs.home_win_pct >= data.probs.away_win_pct
                            ? "1X (Local/Empate) + Over 1.5"
                            : "X2 (Empate/Visitante) + Over 1.5",
                        p01:
                          (Math.max(pHome, pAway) + to01(data.probs.draw_pct)) * 0.5 * // aprox “doble oportunidad”
                          Math.max(0.70, pOver) * // Over 1.5 aprox si Over2.5 es alto
                          corr,
                      },
                    ];
                    return combos.map((c) => (
                      <div key={c.label} style={{ ...row, background: "rgba(0,0,0,.15)" }}>
                        <div style={{ fontWeight: 800 }}>{c.label}</div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={chip}>Modelo: {pct(c.p01 * 100)}</span>
                          <span style={chip}>Cuota justa: {fairOdd(c.p01)}</span>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div style={{ fontSize: 12, opacity: 0.65 }}>
              * Uso educativo/informativo. No constituye asesoría financiera ni garantiza resultados.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
