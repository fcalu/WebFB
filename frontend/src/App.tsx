// src/App.tsx
import { useEffect, useMemo, useState } from "react";
import BestPickPro from "./components/BestPickPro";
import ErrorBoundary from "./components/ErrorBoundary";
/* ===================== Types ===================== */
type ApiLeagues = { leagues: string[] };
type ApiTeams = { teams: string[] };

type BestPick = {
  market: string;
  selection: string;
  prob_pct: number;
  confidence: number;
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

/* ===================== Config ===================== */
const API_BASE: string =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_API_BASE_URL?.replace(/\/$/, "")) ||
  "http://localhost:8000";

type Mode = "value" | "prob";

/* ===================== Helpers ===================== */
const pct = (n?: number) =>
  n == null || Number.isNaN(n) ? "—" : `${(+n).toFixed(2)}%`;
const fmt2 = (n?: number) =>
  n == null || Number.isNaN(n) ? "—" : (+n).toFixed(2);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const toFloat = (v: any) => {
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v).replace(",", ".").trim();
  const x = Number(s);
  return Number.isFinite(x) ? x : undefined;
};

function implied(p: number | undefined) {
  return p && p > 0 ? 1 / p : undefined;
}

/* ===================== Base dark styles ===================== */
const page: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(1200px 600px at 20% -10%, #3b0764 0%, transparent 60%), radial-gradient(900px 500px at 120% -20%, #1d4ed8 0%, transparent 55%), #0b1020",
  color: "#e5e7eb",
  fontFamily:
    "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,Helvetica,Arial,Apple Color Emoji,Segoe UI Emoji",
};

const wrap: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "18px 14px 120px",
};

const panel: React.CSSProperties = {
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 16,
  padding: 14,
};

const label: React.CSSProperties = {
  color: "#a5b4fc",
  fontSize: 12,
  marginBottom: 6,
  fontWeight: 800,
  letterSpacing: 0.3,
};

const input: React.CSSProperties = {
  width: "100%",
  background: "#0f172a",
  color: "white",
  border: "1px solid rgba(255,255,255,.18)",
  borderRadius: 12,
  padding: "12px 14px",
  outline: "none",
};

const btnPrimary: React.CSSProperties = {
  background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
  color: "white",
  border: "none",
  borderRadius: 14,
  padding: "14px 18px",
  fontWeight: 900,
  fontSize: 16,
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

/* ===================== Header ===================== */
function Header({
  mode,
  setMode,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        justifyContent: "space-between",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 14,
            display: "grid",
            placeItems: "center",
            background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
            boxShadow: "0 10px 22px rgba(124,58,237,.35)",
            fontSize: 24,
            fontWeight: 900,
          }}
        >
          ⚽
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
            FootyMines · IA Predictor
          </div>
          <div style={{ opacity: 0.8, fontSize: 13 }}>
            Predicción sencilla y clara (modo móvil)
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => setMode("value")}
          style={{
            ...pill,
            borderColor: mode === "value" ? "#7c3aed" : "rgba(255,255,255,.1)",
            background:
              mode === "value"
                ? "linear-gradient(135deg,#7c3aed55,#5b21b655)"
                : "rgba(255,255,255,.06)",
            fontWeight: 800,
          }}
          title="Recomienda el mejor valor (EV)"
        >
          💎 Valor
        </button>
        <button
          onClick={() => setMode("prob")}
          style={{
            ...pill,
            borderColor: mode === "prob" ? "#22c55e" : "rgba(255,255,255,.1)",
            background:
              mode === "prob"
                ? "linear-gradient(135deg,#22c55e55,#16a34a55)"
                : "rgba(255,255,255,.06)",
            fontWeight: 800,
          }}
          title="Recomienda la opción más probable"
        >
          📊 Favorito
        </button>
      </div>
    </div>
  );
}

/* ===================== Odds Editor (ahora acepta punto) ===================== */
type Odds = {
  "1"?: number;
  X?: number;
  "2"?: number;
  O2_5?: number;
  BTTS_YES?: number;
};
type RawOdds = {
  "1"?: string;
  X?: string;
  "2"?: string;
  O2_5?: string;
  BTTS_YES?: string;
};

function OddsEditor({
  odds,
  setOdds,
  rawOdds,
  setRawOdds,
}: {
  odds: Odds;
  setOdds: (o: Odds) => void;
  rawOdds: RawOdds;
  setRawOdds: (r: RawOdds) => void;
}) {
  const setField = (k: keyof Odds, txt: string) => {
    // Mantenemos el texto mientras escribes...
    setRawOdds({ ...rawOdds, [k]: txt });
  };
  const commitField = (k: keyof Odds, txt: string) => {
    // ...y recién al salir del input parseamos a número.
    const num = toFloat(txt);
    setOdds({ ...odds, [k]: num });
    if (num === undefined) {
      // si no parsea, dejamos el texto tal cual para que el usuario lo corrija
      return;
    }
    // normalizamos la visual a 2 decimales
    setRawOdds({ ...rawOdds, [k]: String(num) });
  };

  const anyOdds =
    odds["1"] || odds.X || odds["2"] || odds.O2_5 || odds.BTTS_YES;

  const Field = ({
    k,
    labelText,
    ph,
  }: {
    k: keyof Odds;
    labelText: string;
    ph: string;
  }) => (
    <div>
      <div style={label}>{labelText}</div>
      <input
        type="text"
        inputMode="decimal"
        placeholder={ph}
        style={input}
        value={rawOdds[k] ?? ""}
        onChange={(e) => setField(k, e.target.value)}
        onBlur={(e) => commitField(k, e.target.value)}
      />
    </div>
  );

  return (
    <div style={{ ...panel, marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ ...pill }}>👛 Cuotas (opcional)</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Sugerencia: ingrésalas ~5 horas antes para mayor precisión.
        </div>
      </div>

      <div
        style={{
          marginTop: 10,
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
        }}
      >
        <Field k="1" labelText="1 (Local)" ph="2.10" />
        <Field k="X" labelText="X (Empate)" ph="3.30" />
        <Field k="2" labelText="2 (Visitante)" ph="3.40" />
        <Field k="O2_5" labelText="Over 2.5" ph="1.95" />
        <Field k="BTTS_YES" labelText="BTTS Sí" ph="1.85" />
      </div>

      {anyOdds && (
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => {
              setOdds({});
              setRawOdds({});
            }}
            style={{ ...pill, cursor: "pointer" }}
          >
            🧹 Limpiar cuotas
          </button>
        </div>
      )}
    </div>
  );
}

/* ===================== Risk & EV helpers ===================== */
function calcEdgeAndEV(
  best: BestPick | undefined,
  probs: PredictResponse["probs"],
  odds: Odds
) {
  if (!best) return { ev: undefined, edge: undefined, usedOdd: undefined };

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
  const p_impl = implied(odd); // prob implícita de la cuota
  const edge = p_impl !== undefined ? prob01 - p_impl : undefined;
  return { ev, edge, usedOdd: odd };
}

function riskLabel(prob01: number, ev?: number) {
  // base por probabilidad
  let level: "Bajo" | "Medio" | "Alto";
  if (prob01 >= 0.60) level = "Bajo";
  else if (prob01 >= 0.50) level = "Medio";
  else level = "Alto";
  // mejora leve si EV es alto
  if (ev !== undefined && ev >= 0.12 && level !== "Bajo") level = "Medio";
  return level;
}

/* ===================== “Ideas extra” (doble oportunidad y combos) ===================== */
function ExtraSuggestions({ data }: { data: PredictResponse }) {
  const p1 = data.probs.home_win_pct / 100;
  const px = data.probs.draw_pct / 100;
  const p2 = data.probs.away_win_pct / 100;
  const pO25 = data.probs.over_2_5_pct / 100;
  const pBTTS = data.probs.btts_pct / 100;

  // Doble oportunidad
  const p1x = clamp01(p1 + px);
  const px2 = clamp01(px + p2);
  const p12 = clamp01(p1 + p2);

  // Combos simples ~ independencia (aprox)
  const p1x_btts = clamp01(p1x * pBTTS);
  const px2_o25 = clamp01(px2 * pO25);

  // Favorito + Under 3.5 si el partido pinta de pocos goles
  const lamSum = (data.poisson.home_lambda ?? 1) + (data.poisson.away_lambda ?? 1);
  const lowScoring = lamSum < 2.6;
  const fav = p1 >= p2 ? "1" : "2";
  const pFav = Math.max(p1, p2);
  const pUnder35 = clamp01(1 - pO25 * 0.75); // heurística para “cerrado”
  const pFavU35 = lowScoring ? clamp01(pFav * pUnder35) : 0;

  const suggestions = [
    {
      key: "1X",
      title: "Doble oportunidad: 1X",
      prob: p1x,
      reason: "Cobras con Local o Empate (más segura que 1 limpio).",
    },
    {
      key: "X2",
      title: "Doble oportunidad: X2",
      prob: px2,
      reason: "Cobras con Empate o Visitante (útil si el local no es muy fuerte).",
    },
    {
      key: "12",
      title: "Doble oportunidad: 12",
      prob: p12,
      reason: "Gana cualquiera (evitas el empate).",
    },
    {
      key: "1X+BTTS",
      title: "1X & BTTS Sí",
      prob: p1x_btts,
      reason: "Partido equilibrado con goles de ambos.",
    },
    {
      key: "X2+O25",
      title: "X2 & Over 2.5",
      prob: px2_o25,
      reason: "Visitante no pierde y partido con ritmo ofensivo.",
    },
    ...(lowScoring
      ? [
          {
            key: "Fav+U35",
            title: `Favorito (${fav}) & Under 3.5`,
            prob: pFavU35,
            reason: "Favorito por poco y tendencia a pocos goles.",
          },
        ]
      : []),
  ]
    .filter((s) => s.prob > 0)
    .sort((a, b) => b.prob - a.prob)
    .slice(0, 4);

  if (!suggestions.length) return null;

  return (
    <div style={{ ...panel }}>
      <div style={{ fontWeight: 900, marginBottom: 8 }}>Ideas extra (opcional)</div>
      <div
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
        }}
      >
        {suggestions.map((s) => (
          <div
            key={s.key}
            style={{
              background: "rgba(255,255,255,.04)",
              border: "1px solid rgba(255,255,255,.08)",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <div style={{ fontWeight: 800 }}>{s.title}</div>
            <div style={{ marginTop: 4 }}>Prob: <b>{pct(s.prob * 100)}</b></div>
            <div style={{ marginTop: 6, opacity: 0.9 }}>{s.reason}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, opacity: 0.7 }}>
        *Prob. combinadas aproximadas (independencia parcial). Úsalo como orientación.
      </div>
    </div>
  );
}

/* ===================== Loading skeleton ===================== */
function SkeletonCard() {
  const sk = {
    background: "linear-gradient(90deg,#1f2937 0px,#111827 40px,#1f2937 80px)",
    backgroundSize: "600px",
    animation: "shimmer 1.4s infinite linear",
    height: 14,
    borderRadius: 8,
  } as React.CSSProperties;
  return (
    <div style={{ ...panel }}>
      <style>{`@keyframes shimmer{0%{background-position:-200px 0}100%{background-position:400px 0}}`}</style>
      <div style={{ ...sk, width: "50%", marginBottom: 8 }} />
      <div style={{ ...sk, width: "80%", height: 26, marginBottom: 8 }} />
      <div style={{ ...sk, width: "60%", marginBottom: 8 }} />
      <div style={{ ...sk, width: "100%", marginBottom: 6 }} />
      <div style={{ ...sk, width: "90%", marginBottom: 6 }} />
      <div style={{ ...sk, width: "70%" }} />
    </div>
  );
}

/* ===================== Main Calculator ===================== */
export default function App() {
  const [mode, setMode] = useState<Mode>("value");
  const [leagues, setLeagues] = useState<string[]>([]);
  const [league, setLeague] = useState("");
  const [teams, setTeams] = useState<string[]>([]);
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [odds, setOdds] = useState<Odds>({});
  const [rawOdds, setRawOdds] = useState<RawOdds>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState<PredictResponse | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/leagues`)
      .then((r) => r.json())
      .then((d: ApiLeagues) => setLeagues(d.leagues ?? []))
      .catch(() => setLeagues([]));
  }, []);

  useEffect(() => {
    // reset al cambiar liga
    setHome("");
    setAway("");
    setData(null);
    setErr("");
    setWhyOpen(false);
    if (!league) return setTeams([]);
    fetch(`${API_BASE}/teams?league=${encodeURIComponent(league)}`)
      .then((r) => r.json())
      .then((d: ApiTeams) => setTeams(d.teams ?? []))
      .catch(() => setErr("No pude cargar equipos."));
  }, [league]);

  const canPredict = league && home && away && home !== away;

  const filteredHome = useMemo(
    () => teams.filter((t) => t.toLowerCase().includes(home.toLowerCase())),
    [teams, home]
  );
  const filteredAway = useMemo(
    () => teams.filter((t) => t.toLowerCase().includes(away.toLowerCase())),
    [teams, away]
  );

  async function onPredict() {
    if (!canPredict) return;
    setLoading(true);
    setErr("");
    setData(null);
    setWhyOpen(false);
    try {
      const body: any = { league, home_team: home, away_team: away, mode };
      if (
        odds["1"] ||
        odds.X ||
        odds["2"] ||
        odds.O2_5 ||
        odds.BTTS_YES
      ) {
        body.odds = odds;
      }
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const json: PredictResponse = await res.json();
      setData(json);
    } catch (e: any) {
      setErr(e?.message || "Error al predecir.");
    } finally {
      setLoading(false);
    }
  }

  // EV/Edge/Riesgo (si hay odds)
  const { ev, edge, usedOdd } = useMemo(() => {
    if (!data) return { ev: undefined, edge: undefined, usedOdd: undefined };
    return calcEdgeAndEV(data.best_pick, data.probs, odds);
  }, [data, odds]);

  const risk = useMemo(() => {
    if (!data) return undefined;
    const p01 = (data.best_pick?.prob_pct ?? 0) / 100;
    return riskLabel(p01, ev);
  }, [data, ev]);

  return (
    <div style={page}>
      {/* responsive tweaks */}
      <style>{`
        @media (max-width: 720px) {
          .g2 { display:grid; grid-template-columns: 1fr; gap:12px; }
          .g3 { display:grid; grid-template-columns: 1fr; gap:12px; }
        }
        @media (min-width: 721px) {
          .g2 { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
          .g3 { display:grid; grid-template-columns: 1fr 1fr 1fr; gap:12px; }
        }
        .fixedbar {
          position: fixed; left: 0; right: 0; bottom: 0;
          background: rgba(11,16,32,.9); backdrop-filter: blur(6px);
          border-top: 1px solid rgba(255,255,255,.12);
          padding: 10px 14px; display:flex; gap:10px; align-items:center; justify-content:space-between;
        }
      `}</style>

      <div style={wrap}>
        <Header mode={mode} setMode={setMode} />

        {/* Paso 1: Selección */}
        <div style={{ ...panel }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ ...pill }}>1️⃣ Selecciona liga y equipos</div>
            <div style={{ ...pill }}>2️⃣ (Opcional) Ingresar cuotas</div>
            <div style={{ ...pill }}>3️⃣ Calcular</div>
          </div>

          <div className="g3" style={{ marginTop: 12 }}>
            <div>
              <div style={label}>Liga</div>
              <select
                value={league}
                onChange={(e) => setLeague(e.target.value)}
                style={input}
              >
                <option value="">— Selecciona liga —</option>
                {leagues.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={label}>Equipo local</div>
              <input
                placeholder="Escribe para buscar…"
                value={home}
                onChange={(e) => setHome(e.target.value)}
                list="home_list"
                style={input}
              />
              <datalist id="home_list">
                {filteredHome.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div>
              <div style={label}>Equipo visitante</div>
              <input
                placeholder="Escribe para buscar…"
                value={away}
                onChange={(e) => setAway(e.target.value)}
                list="away_list"
                style={input}
              />
              <datalist id="away_list">
                {filteredAway.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          </div>
        </div>

        {/* Paso 2: Cuotas opcionales */}
        <OddsEditor
          odds={odds}
          setOdds={setOdds}
          rawOdds={rawOdds}
          setRawOdds={setRawOdds}
        />

        {/* CTA fijo inferior (móvil) */}
        <div className="fixedbar">
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {canPredict
              ? "Listo para calcular"
              : "Selecciona liga y ambos equipos"}
          </div>
          <button
            onClick={onPredict}
            disabled={!canPredict || loading}
            style={{
              ...btnPrimary,
              opacity: !canPredict || loading ? 0.6 : 1,
              cursor: !canPredict || loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Calculando…" : "Calcular ahora"}
          </button>
        </div>

        {/* Errores */}
        {err && (
          <div
            style={{
              background: "rgba(239,68,68,.12)",
              border: "1px solid rgba(239,68,68,.35)",
              padding: 12,
              borderRadius: 12,
              marginTop: 12,
              color: "#fecaca",
            }}
          >
            {err}
          </div>
        )}
        {data && (
        <ErrorBoundary>
          <BestPickPro data={data as any} />
        </ErrorBoundary>
      )}
        {/* Resultado */}
        {loading && (
          <div style={{ marginTop: 12 }}>
            <SkeletonCard />
          </div>
        )}

        {data && !loading && (
          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            {/* Mejor jugada */}
            <div
              style={{
                borderRadius: 18,
                padding: 16,
                background:
                  "linear-gradient(135deg, rgba(168,85,247,.18), rgba(99,102,241,.18))",
                border: "1px solid rgba(99,102,241,.28)",
                boxShadow: "0 18px 36px rgba(0,0,0,.25)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div>
                  <div
                    style={{ fontSize: 12, fontWeight: 900, opacity: 0.85 }}
                  >
                    Mejor predicción
                  </div>
                  <div
                    style={{
                      fontSize: 26,
                      fontWeight: 900,
                      lineHeight: 1.2,
                      marginTop: 4,
                    }}
                  >
                    {data.best_pick.market} — {data.best_pick.selection}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    Prob: <b>{pct(data.best_pick.prob_pct)}</b> · Confianza:{" "}
                    <b>{pct(data.best_pick.confidence)}</b>
                  </div>
                </div>

                {/* Semáforo */}
                {(() => {
                  const p01 = (data.best_pick?.prob_pct ?? 0) / 100;
                  const level = riskLabel(p01);
                  return (
                    <div
                      style={
                        level === "Bajo"
                          ? chip("rgba(34,197,94,.18)", "rgba(34,197,94,.45)")
                          : level === "Medio"
                          ? chip(
                              "rgba(234,179,8,.18)",
                              "rgba(234,179,8,.45)"
                            )
                          : chip("rgba(239,68,68,.18)", "rgba(239,68,68,.45)")
                      }
                    >
                      🔎 Riesgo: <b>{level}</b>
                    </div>
                  );
                })()}
              </div>

              {/* EV/Edge si hay cuotas */}
              {(() => {
                const { ev, edge, usedOdd } = calcEdgeAndEV(
                  data.best_pick,
                  data.probs,
                  odds
                );
                if (ev === undefined && edge === undefined) return null;
                return (
                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={pill}>
                      💰 EV: <b style={{ marginLeft: 6 }}>{fmt2(ev)}</b>
                    </div>
                    <div style={pill}>
                      📈 Edge:{" "}
                      <b style={{ marginLeft: 6 }}>
                        {edge !== undefined ? `${(edge * 100).toFixed(2)}%` : "—"}
                      </b>
                    </div>
                    <div style={pill}>
                      🧮 Cuota usada:{" "}
                      <b style={{ marginLeft: 6 }}>{usedOdd ?? "—"}</b>
                    </div>
                  </div>
                );
              })()}

              {/* ¿Por qué este pick? */}
              <div style={{ marginTop: 10 }}>
                <button
                  onClick={() => setWhyOpen((s) => !s)}
                  style={{
                    ...pill,
                    cursor: "pointer",
                    borderColor: "rgba(255,255,255,.18)",
                  }}
                >
                  {whyOpen ? "▾ Ocultar razones" : "▸ ¿Por qué este pick?"}
                </button>
                {whyOpen && (
                  <ul
                    style={{
                      margin: "10px 0 0 18px",
                      padding: 0,
                      lineHeight: 1.6,
                    }}
                  >
                    {data.best_pick.reasons.map((r, i) => (
                      <li key={i} style={{ color: "#d1d5db" }}>
                        {r}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Mercados resumidos */}
            <div style={{ ...panel }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Mercados</div>
              <div
                className="g3"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    background: "rgba(255,255,255,.04)",
                    border: "1px solid rgba(255,255,255,.08)",
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>1X2</div>
                  <div>1: {pct(data.probs.home_win_pct)}</div>
                  <div>X: {pct(data.probs.draw_pct)}</div>
                  <div>2: {pct(data.probs.away_win_pct)}</div>
                </div>

                <div
                  style={{
                    background: "rgba(255,255,255,.04)",
                    border: "1px solid rgba(255,255,255,.08)",
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Goles</div>
                  <div>Over 2.5: {pct(data.probs.over_2_5_pct)}</div>
                  <div>BTTS Sí: {pct(data.probs.btts_pct)}</div>
                </div>

                <div
                  style={{
                    background: "rgba(255,255,255,.04)",
                    border: "1px solid rgba(255,255,255,.08)",
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>
                    Marcadores probables
                  </div>
                  {(data.poisson?.top_scorelines ?? []).slice(0, 3).map((t) => (
                    <div key={t.score}>
                      {t.score} · {t.pct}%
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Ideas extra tipo “Sporty” */}
            <ExtraSuggestions data={data} />

            {/* Indicadores extra */}
            <div style={{ ...panel }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>
                Indicadores del partido
              </div>
              <div className="g3">
                <div
                  style={{
                    background: "rgba(255,255,255,.04)",
                    border: "1px solid rgba(255,255,255,.08)",
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Lambdas</div>
                  <div>λ Local: {fmt2(data.poisson?.home_lambda)}</div>
                  <div>λ Visitante: {fmt2(data.poisson?.away_lambda)}</div>
                </div>
                <div
                  style={{
                    background: "rgba(255,255,255,.04)",
                    border: "1px solid rgba(255,255,255,.08)",
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Corners</div>
                  <div>
                    Promedio total: {fmt2(data.averages.total_corners_avg)}
                  </div>
                  <div>
                    Predicción (simple): {fmt2(data.averages.corners_mlp_pred)}
                  </div>
                </div>
                <div
                  style={{
                    background: "rgba(255,255,255,.04)",
                    border: "1px solid rgba(255,255,255,.08)",
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Tarjetas</div>
                  <div>
                    Promedio total amarillas:{" "}
                    {fmt2(data.averages.total_yellow_cards_avg)}
                  </div>
                </div>
              </div>
            </div>

            {/* Nota legal */}
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              *Este contenido es informativo. No constituye asesoría financiera.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

