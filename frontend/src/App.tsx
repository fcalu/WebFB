// src/App.tsx
import { useEffect, useMemo, useState } from "react";

type ApiLeagues = { leagues: string[] };
type ApiTeams = { teams: string[] };

type BestPick = {
  market: string;
  selection: string;
  prob_pct: number;
  confidence: number;
  reasons: string[];
  summary: string;
};

type PredictResponse = {
  engine: "poisson" | "dc";
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
};

const API_BASE: string =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_API_BASE_URL?.replace(/\/$/, "")) ||
  "http://localhost:8000";

function pct(n?: number) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(+n).toFixed(2)}%`;
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0b1020",
  color: "#e5e7eb",
};

const wrap: React.CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: "28px 18px 64px",
};

const panel: React.CSSProperties = {
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.06)",
  borderRadius: 18,
  padding: 16,
};

const tag: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 999,
  background: "rgba(99,102,241,.15)",
  border: "1px solid rgba(99,102,241,.35)",
  color: "#c7d2fe",
  fontSize: 12,
  fontWeight: 700,
};

const h2: React.CSSProperties = {
  fontWeight: 900,
  fontSize: 16,
  color: "#cbd5e1",
  letterSpacing: 0.2,
  marginBottom: 10,
};

const gridAuto: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
  gap: 12,
};

export default function App() {
  const [leagues, setLeagues] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [league, setLeague] = useState("");
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [engine, setEngine] = useState<"poisson" | "dc">("poisson");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState<PredictResponse | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/leagues`)
      .then((r) => r.json())
      .then((d: ApiLeagues) => setLeagues(d.leagues ?? []))
      .catch(() => setErr("No pude cargar ligas."));
  }, []);

  useEffect(() => {
    setHome(""); setAway(""); setData(null);
    if (!league) { setTeams([]); return; }
    fetch(`${API_BASE}/teams?league=${encodeURIComponent(league)}`)
      .then((r) => r.json())
      .then((d: ApiTeams) => setTeams(d.teams ?? []))
      .catch(() => setErr("No pude cargar equipos."));
  }, [league]);

  const canPredict = league && home && away && home !== away;

  async function onPredict() {
    if (!canPredict) return;
    setLoading(true); setErr(""); setData(null);
    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ league, home_team: home, away_team: away, engine }),
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

  const filteredHome = useMemo(
    () => teams.filter((t) => t.toLowerCase().includes(home.toLowerCase())),
    [teams, home]
  );
  const filteredAway = useMemo(
    () => teams.filter((t) => t.toLowerCase().includes(away.toLowerCase())),
    [teams, away]
  );

  return (
    <div style={page}>
      <div style={wrap}>
        {/* Header */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 0.2 }}>
            Footy Predictions
          </div>
          <div style={{ color: "#9ca3af" }}>
            Probabilidades reales con Poisson y Dixon-Coles (ponderación por recencia).
          </div>
        </div>

        {/* Formulario */}
        <div style={{ ...panel, marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12 }}>
            {/* Liga */}
            <select
              value={league}
              onChange={(e) => setLeague(e.target.value)}
              style={inputStyle}
            >
              <option value="">— Selecciona liga —</option>
              {leagues.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>

            {/* Local */}
            <div>
              <input
                value={home}
                onChange={(e) => setHome(e.target.value)}
                placeholder="Equipo local"
                list="home_teams"
                style={inputStyle}
              />
              <datalist id="home_teams">
                {filteredHome.map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>

            {/* Visitante */}
            <div>
              <input
                value={away}
                onChange={(e) => setAway(e.target.value)}
                placeholder="Equipo visitante"
                list="away_teams"
                style={inputStyle}
              />
              <datalist id="away_teams">
                {filteredAway.map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>

            <button
              onClick={onPredict}
              disabled={!canPredict || loading}
              style={primaryBtn(!canPredict || loading)}
            >
              {loading ? "Calculando…" : "Predecir"}
            </button>
          </div>

          {/* Motor */}
          <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ color: "#9ca3af" }}>Motor:</span>
            <select
              value={engine}
              onChange={(e) => setEngine(e.target.value as "poisson" | "dc")}
              style={smallSelect}
            >
              <option value="poisson">Poisson</option>
              <option value="dc">Dixon-Coles</option>
            </select>
          </div>

          {!canPredict && (
            <div style={{ color: "#9ca3af", marginTop: 8 }}>
              Selecciona liga y ambos equipos (distintos).
            </div>
          )}
        </div>

        {/* Error */}
        {err && (
          <div
            style={{
              background: "rgba(239,68,68,.1)",
              border: "1px solid rgba(239,68,68,.3)",
              color: "#fecaca",
              padding: 12,
              borderRadius: 12,
              marginBottom: 14,
            }}
          >
            {err}
          </div>
        )}

        {/* RESULTADO */}
        {data && (
          <>
            {/* MEJOR JUGADA */}
            <div
              style={{
                borderRadius: 18,
                padding: 16,
                background:
                  "linear-gradient(135deg, rgba(168,85,247,.12), rgba(99,102,241,.12))",
                border: "1px solid rgba(99,102,241,.28)",
                boxShadow: "0 10px 30px rgba(0,0,0,.25)",
                marginBottom: 14,
              }}
            >
              <div style={{ ...tag, marginBottom: 8 }}>MEJOR JUGADA</div>
              <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 6, color: "white" }}>
                {data.best_pick.market} — {data.best_pick.selection}
              </div>
              <div style={{ marginBottom: 10 }}>
                <b>Prob:</b> {pct(data.best_pick.prob_pct)} · <b>Confianza:</b>{" "}
                {pct(data.best_pick.confidence)}
              </div>

              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                {data.best_pick.reasons.map((r, i) => (
                  <li key={i} style={{ color: "#c7cdd5" }}>{r}</li>
                ))}
              </ul>

              <div style={{ marginTop: 10, color: "#c7cdd5" }}>
                {data.summary}
              </div>
            </div>

            {/* MERCADOS */}
            <div style={{ ...panel, marginBottom: 14 }}>
              <div style={h2}>MERCADOS</div>
              <div style={gridAuto}>
                <div style={statBox}>
                  <div style={statTitle}>1X2</div>
                  <div>1: {pct(data.probs.home_win_pct)}</div>
                  <div>X: {pct(data.probs.draw_pct)}</div>
                  <div>2: {pct(data.probs.away_win_pct)}</div>
                </div>
                <div style={statBox}>
                  <div style={statTitle}>Goles</div>
                  <div>O2.5: {pct(data.probs.over_2_5_pct)}</div>
                  <div>AA (BTTS Sí): {pct(data.probs.btts_pct)}</div>
                  <div>O2.5 (MLP): {pct(data.probs.o25_mlp_pct)}</div>
                </div>
                <div style={statBox}>
                  <div style={statTitle}>Marcadores más probables</div>
                  {(data.poisson?.top_scorelines ?? []).slice(0, 3).map((t) => (
                    <div key={t.score}>
                      {t.score} · {t.pct}%
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* GOLES Y CORNERS */}
            <div style={panel}>
              <div style={h2}>GOLES Y CORNERS</div>
              <div style={gridAuto}>
                <div style={statBox}>
                  <div style={statTitle}>Lambdas (λ)</div>
                  <div>λ Local: {data.poisson?.home_lambda ?? "—"}</div>
                  <div>λ Visitante: {data.poisson?.away_lambda ?? "—"}</div>
                </div>
                <div style={statBox}>
                  <div style={statTitle}>Corners</div>
                  <div>Promedio total corners: {data.averages.total_corners_avg.toFixed(2)}</div>
                  <div>Corners (MLP predicho): {data.averages.corners_mlp_pred.toFixed(2)}</div>
                </div>
                <div style={statBox}>
                  <div style={statTitle}>Tarjetas</div>
                  <div>
                    Promedio total amarillas: {data.averages.total_yellow_cards_avg.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Footer */}
        <div style={{ marginTop: 24, color: "#6b7280", fontSize: 12 }}>
          *Modelo: Poisson / Dixon-Coles + BTTS + MLP (corners y O2.5). Uso informativo; no
          constituye asesoría financiera.
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#121829",
  color: "white",
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 12,
  padding: "10px 12px",
  outline: "none",
};

const smallSelect: React.CSSProperties = {
  ...inputStyle,
  width: 180,
  padding: "8px 10px",
};

const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
  color: "white",
  border: "none",
  borderRadius: 12,
  padding: "10px 16px",
  fontWeight: 900,
  opacity: disabled ? 0.6 : 1,
});

const statBox: React.CSSProperties = {
  background: "rgba(255,255,255,.03)",
  border: "1px solid rgba(255,255,255,.06)",
  borderRadius: 14,
  padding: 12,
  color: "#c7cdd5",
};

const statTitle: React.CSSProperties = {
  color: "#e5e7eb",
  fontWeight: 800,
  marginBottom: 6,
};
