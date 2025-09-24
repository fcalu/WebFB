// src/App.tsx
import { useEffect, useMemo, useState } from "react";

/** ===================== Types ===================== **/
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

/** ===================== Config ===================== **/
const API_BASE: string =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_API_BASE_URL?.replace(/\/$/, "")) ||
  "http://localhost:8000";

const pct = (n?: number) =>
  n == null || Number.isNaN(n) ? "—" : `${(+n).toFixed(2)}%`;

/** ===================== Styles (inline) ===================== **/
const page: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(1200px 600px at 20% -10%, #3b0764 0%, transparent 60%), radial-gradient(1000px 500px at 120% -20%, #1d4ed8 0%, transparent 55%), #0b1020",
  color: "#e5e7eb",
  fontFamily:
    "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,Helvetica,Arial,Apple Color Emoji,Segoe UI Emoji",
};

const wrap: React.CSSProperties = {
  maxWidth: 1200,
  margin: "0 auto",
  padding: "28px 18px 80px",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
};

const brandRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
};

const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 12px",
  borderRadius: 999,
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.08)",
  color: "#cbd5e1",
  fontSize: 14,
  cursor: "default",
};

const actionBtn = (primary = false): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 14px",
  borderRadius: 12,
  fontWeight: 800,
  border: primary ? "none" : "1px solid rgba(255,255,255,.12)",
  color: primary ? "white" : "#d1d5db",
  background: primary
    ? "linear-gradient(135deg, #7c3aed, #5b21b6)"
    : "rgba(255,255,255,.06)",
});

const panel: React.CSSProperties = {
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 18,
  padding: 18,
};

const grid3: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 14,
};

const label: React.CSSProperties = {
  color: "#a5b4fc",
  fontSize: 14,
  marginBottom: 8,
  fontWeight: 700,
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

const primaryBtn: React.CSSProperties = {
  background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
  color: "white",
  border: "none",
  borderRadius: 16,
  padding: "14px 22px",
  fontWeight: 900,
  fontSize: 18,
};

const cardGradient: React.CSSProperties = {
  borderRadius: 20,
  padding: 20,
  background:
    "linear-gradient(135deg, rgba(168,85,247,.18), rgba(99,102,241,.18))",
  border: "1px solid rgba(99,102,241,.28)",
  boxShadow: "0 20px 40px rgba(0,0,0,.25)",
};

const statBox: React.CSSProperties = {
  background: "rgba(255,255,255,.03)",
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 14,
  padding: 12,
  color: "#c7cdd5",
};

/** ===================== App ===================== **/
export default function App() {
  const [dark, setDark] = useState(true);

  const [leagues, setLeagues] = useState<string[]>([]);
  const [league, setLeague] = useState("");

  const [teams, setTeams] = useState<string[]>([]);
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState<PredictResponse | null>(null);

  /** Load leagues */
  useEffect(() => {
    fetch(`${API_BASE}/leagues`)
      .then((r) => r.json())
      .then((d: ApiLeagues) => setLeagues(d.leagues ?? []))
      .catch(() => setErr("No pude cargar ligas."));
  }, []);

  /** Load teams on league change */
  useEffect(() => {
    setHome("");
    setAway("");
    setData(null);
    if (!league) {
      setTeams([]);
      return;
    }
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
    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ league, home_team: home, away_team: away }),
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

  return (
    <div style={{ ...page, backgroundColor: dark ? undefined : "#f6f7fb", color: dark ? "#e5e7eb" : "#0b1020" }}>
      <div style={wrap}>
        {/* ===================== Header ===================== */}
        <div style={headerRow}>
          <div style={brandRow}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                display: "grid",
                placeItems: "center",
                background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
                boxShadow: "0 10px 22px rgba(124,58,237,.35)",
                fontSize: 26,
              }}
            >
              ⚡️
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 900 }}>
                FootyMines · IA Predictor
              </div>
              <div style={{ opacity: 0.8 }}>Predicciones confiables para el usuario final</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button style={actionBtn(false)}>↻ Historial</button>
            <button
              style={actionBtn(false)}
              onClick={() => setDark((d) => !d)}
              title="Cambiar tema"
            >
              {dark ? "☀️ Claro" : "🌙 Oscuro"}
            </button>
            <button style={actionBtn(true)}>📈 Explorar</button>
          </div>
        </div>

        {/* Badges */}
        <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
          <div style={pill}>🛡️ Poisson</div>
          <div style={pill}>🛡️ BTTS</div>
          <div style={pill}>🛡️ MLP Corners</div>
        </div>

        {/* ===================== Search Card ===================== */}
        <div style={{ ...panel, padding: 22, marginBottom: 18 }}>
          <div style={grid3}>
            {/* Liga */}
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

            {/* Local */}
            <div>
              <div style={label}>Equipo local</div>
              <input
                placeholder="Escribe para buscar..."
                value={home}
                onChange={(e) => setHome(e.target.value)}
                list="home_datalist"
                style={input}
              />
              <datalist id="home_datalist">
                {filteredHome.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>

            {/* Visitante */}
            <div>
              <div style={label}>Equipo visitante</div>
              <input
                placeholder="Escribe para buscar..."
                value={away}
                onChange={(e) => setAway(e.target.value)}
                list="away_datalist"
                style={input}
              />
              <datalist id="away_datalist">
                {filteredAway.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          </div>

          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 16 }}>
            <button
              style={{
                ...primaryBtn,
                opacity: !canPredict || loading ? 0.6 : 1,
                cursor: !canPredict || loading ? "not-allowed" : "pointer",
              }}
              onClick={onPredict}
              disabled={!canPredict || loading}
            >
              {loading ? "Calculando…" : "Predecir"}
            </button>
            {!canPredict && (
              <div style={{ opacity: 0.75 }}>
                Selecciona liga y ambos equipos (distintos).
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {err && (
          <div
            style={{
              background: "rgba(239,68,68,.12)",
              border: "1px solid rgba(239,68,68,.3)",
              color: dark ? "#fecaca" : "#7f1d1d",
              padding: 12,
              borderRadius: 12,
              marginBottom: 14,
            }}
          >
            {err}
          </div>
        )}

        {/* ===================== Results ===================== */}
        {data && (
          <>
            {/* Mejor predicción */}
            <div style={{ ...cardGradient, marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.85, marginBottom: 6 }}>
                Mejor predicción
              </div>
              <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.2, marginBottom: 6 }}>
                {data.best_pick.market} — {data.best_pick.selection}
              </div>
              <div style={{ fontSize: 16, marginBottom: 12 }}>
                Prob: <b>{pct(data.best_pick.prob_pct)}</b> · Confianza:{" "}
                <b>{pct(data.best_pick.confidence)}</b>
              </div>

              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                {data.best_pick.reasons.map((r, i) => (
                  <li key={i} style={{ color: "#d1d5db" }}>
                    {r}
                  </li>
                ))}
              </ul>

              <div style={{ marginTop: 10, opacity: 0.9 }}>{data.summary}</div>
            </div>

            {/* Mercados */}
            <div style={{ ...panel, marginBottom: 18 }}>
              <div
                style={{
                  fontWeight: 900,
                  color: dark ? "#e5e7eb" : "#111827",
                  marginBottom: 10,
                }}
              >
                MERCADOS
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
                  gap: 12,
                }}
              >
                <div style={statBox}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>1X2</div>
                  <div>1: {pct(data.probs.home_win_pct)}</div>
                  <div>X: {pct(data.probs.draw_pct)}</div>
                  <div>2: {pct(data.probs.away_win_pct)}</div>
                </div>

                <div style={statBox}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Goles</div>
                  <div>Over 2.5: {pct(data.probs.over_2_5_pct)}</div>
                  <div>BTTS Sí: {pct(data.probs.btts_pct)}</div>
                  <div>Over 2.5 (MLP): {pct(data.probs.o25_mlp_pct)}</div>
                </div>

                <div style={statBox}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>
                    Marcadores más probables
                  </div>
                  {(data.poisson?.top_scorelines ?? []).slice(0, 3).map((t) => (
                    <div key={t.score}>
                      {t.score} · {t.pct}%
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Goles y corners */}
            <div style={panel}>
              <div
                style={{
                  fontWeight: 900,
                  color: dark ? "#e5e7eb" : "#111827",
                  marginBottom: 10,
                }}
              >
                GOLES Y CORNERS
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
                  gap: 12,
                }}
              >
                <div style={statBox}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Lambdas (λ)</div>
                  <div>λ Local: {data.poisson?.home_lambda ?? "—"}</div>
                  <div>λ Visitante: {data.poisson?.away_lambda ?? "—"}</div>
                </div>
                <div style={statBox}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Corners</div>
                  <div>Promedio total: {data.averages.total_corners_avg.toFixed(2)}</div>
                  <div>Predicción MLP: {data.averages.corners_mlp_pred.toFixed(2)}</div>
                </div>
                <div style={statBox}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Tarjetas</div>
                  <div>
                    Promedio total amarillas:{" "}
                    {data.averages.total_yellow_cards_avg.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Footer */}
        <div style={{ marginTop: 28, opacity: 0.6, fontSize: 12 }}>
          *Modelo: Poisson + BTTS + MLP (corners y O2.5). Uso informativo; no constituye
          asesoría financiera.
        </div>
      </div>
    </div>
  );
}
