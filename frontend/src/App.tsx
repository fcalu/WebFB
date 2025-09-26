// src/App.tsx
import { useEffect, useMemo, useState } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import BestPickPro from "./components/BestPickPro";

/* ===================== Tipos mínimos (flexibles) ===================== */
type ApiLeagues = { leagues: string[] };
type ApiTeams = { teams: string[] };

type PredictResponse = {
  league?: string;
  home_team?: string;
  away_team?: string;
  probs?: {
    home_win_pct?: number;
    draw_pct?: number;
    away_win_pct?: number;
    over_2_5_pct?: number;
    btts_pct?: number;
    o25_mlp_pct?: number;
  };
  poisson?: {
    home_lambda?: number;
    away_lambda?: number;
    top_scorelines?: { score: string; pct: number }[];
  };
  averages?: {
    total_yellow_cards_avg?: number;
    total_corners_avg?: number;
    corners_mlp_pred?: number;
  };
  best_pick?: {
    market?: string;
    selection?: string;
    prob_pct?: number;
    confidence?: number;
    reasons?: string[];
  };
  summary?: string;
};

/* ===================== Config ===================== */
const API_BASE: string =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_API_BASE_URL?.replace(/\/$/, "")) ||
  "http://localhost:8000";

const page: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(1200px 600px at 20% -10%, #3b0764 0%, transparent 60%), radial-gradient(1000px 500px at 120% -20%, #1d4ed8 0%, transparent 55%), #0b1020",
  color: "#e5e7eb",
  fontFamily:
    "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,Helvetica,Arial,Apple Color Emoji,Segoe UI Emoji",
};

const wrap: React.CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: "24px 16px 64px",
};

const panel: React.CSSProperties = {
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 18,
  padding: 16,
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

/* ===================== Helpers ===================== */
const toNum = (s: string) => {
  if (!s) return undefined;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

/* ===================== App ===================== */
export default function App() {
  const [dark, setDark] = useState(true);

  const [leagues, setLeagues] = useState<string[]>([]);
  const [league, setLeague] = useState("");
  const [teams, setTeams] = useState<string[]>([]);
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");

  // Cuotas
  const [odd1, setOdd1] = useState("");
  const [oddX, setOddX] = useState("");
  const [odd2, setOdd2] = useState("");
  const [oddO25, setOddO25] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState<PredictResponse | null>(null);

  // cargar ligas al inicio
  useEffect(() => {
    fetch(`${API_BASE}/leagues`)
      .then((r) => r.json())
      .then((d: ApiLeagues) => setLeagues(d.leagues ?? []))
      .catch(() => setLeagues([]));
  }, []);

  // cargar equipos al cambiar liga
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
      .catch(() => setTeams([]));
  }, [league]);

  const canPredict = useMemo(
    () => Boolean(league && home && away && home !== away),
    [league, home, away]
  );

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
      const odds: Record<string, number> = {};
      const v1 = toNum(odd1);
      const vX = toNum(oddX);
      const v2 = toNum(odd2);
      const vO = toNum(oddO25);
      if (v1) odds["1"] = v1;
      if (vX) odds["X"] = vX;
      if (v2) odds["2"] = v2;
      if (vO) odds["O2_5"] = vO;

      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          league,
          home_team: home,
          away_team: away,
          odds: Object.keys(odds).length ? odds : undefined,
        }),
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

  function clearOdds() {
    setOdd1("");
    setOddX("");
    setOdd2("");
    setOddO25("");
  }

  return (
    <div
      style={{
        ...page,
        backgroundColor: dark ? undefined : "#f6f7fb",
        color: dark ? "#e5e7eb" : "#0b1020",
      }}
    >
      {/* CSS responsive simple */}
      <style>{`
        .grid3 { display:grid; grid-template-columns: 1fr 1fr 1fr; gap:14px; }
        .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap:14px; }
        @media (max-width: 860px) {
          .grid3 { grid-template-columns: 1fr; }
          .grid2 { grid-template-columns: 1fr; }
          .btn-full { width: 100%; }
        }
      `}</style>

      <div style={wrap}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 54,
                height: 54,
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
              <div style={{ fontSize: 26, fontWeight: 900 }}>
                FootyMines · IA Predictor
              </div>
              <div style={{ opacity: 0.8 }}>
                Predicciones confiables para el usuario final
              </div>
            </div>
          </div>

          <button
            onClick={() => setDark(!dark)}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,.12)",
              background: "rgba(255,255,255,.06)",
              color: dark ? "#d1d5db" : "#0b1020",
              fontWeight: 800,
            }}
            title="Cambiar tema"
          >
            {dark ? "☀️ Claro" : "🌙 Oscuro"}
          </button>
        </div>

        {/* Formulario */}
        <div style={{ ...panel, marginBottom: 16 }}>
          <div className="grid3">
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
                list="home_datalist"
                style={input}
              />
              <datalist id="home_datalist">
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

          {/* Cuotas opcionales */}
          <div style={{ marginTop: 16 }}>
            <div style={{ ...label, marginBottom: 6 }}>
              Cuotas (opcionales)
            </div>
            <div className="grid3">
              <div>
                <div style={{ opacity: 0.75, marginBottom: 6, fontWeight: 700 }}>
                  1 (Local)
                </div>
                <input
                  value={odd1}
                  onChange={(e) => setOdd1(e.target.value)}
                  inputMode="decimal"
                  placeholder="Ej. 1.95"
                  style={input}
                />
              </div>
              <div>
                <div style={{ opacity: 0.75, marginBottom: 6, fontWeight: 700 }}>
                  Empate
                </div>
                <input
                  value={oddX}
                  onChange={(e) => setOddX(e.target.value)}
                  inputMode="decimal"
                  placeholder="Ej. 3.20"
                  style={input}
                />
              </div>
              <div>
                <div style={{ opacity: 0.75, marginBottom: 6, fontWeight: 700 }}>
                  2 (Visitante)
                </div>
                <input
                  value={odd2}
                  onChange={(e) => setOdd2(e.target.value)}
                  inputMode="decimal"
                  placeholder="Ej. 3.60"
                  style={input}
                />
              </div>
            </div>

            <div className="grid2" style={{ marginTop: 12 }}>
              <div>
                <div style={{ opacity: 0.75, marginBottom: 6, fontWeight: 700 }}>
                  Over 2.5
                </div>
                <input
                  value={oddO25}
                  onChange={(e) => setOddO25(e.target.value)}
                  inputMode="decimal"
                  placeholder="Ej. 2.05"
                  style={input}
                />
              </div>

              <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
                <button
                  className="btn-full"
                  onClick={onPredict}
                  disabled={!canPredict || loading}
                  style={{
                    ...primaryBtn,
                    opacity: !canPredict || loading ? 0.6 : 1,
                    cursor: !canPredict || loading ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "Calculando…" : "Predecir"}
                </button>
                <button
                  onClick={clearOdds}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,.12)",
                    background: "rgba(255,255,255,.06)",
                    color: "#d1d5db",
                    fontWeight: 800,
                    minWidth: 120,
                  }}
                >
                  Limpiar cuotas
                </button>
              </div>
            </div>

            <div style={{ marginTop: 8, opacity: 0.65, fontSize: 12 }}>
              Sugerencia: ingresa las cuotas ~5 horas antes para mejor precisión.
            </div>
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

        {/* === Resultado: SOLO UNA VEZ === */}
        {data && (
          <ErrorBoundary>
            <BestPickPro data={data as any} />
          </ErrorBoundary>
        )}

        <div style={{ marginTop: 28, opacity: 0.6, fontSize: 12 }}>
          *Modelo: Poisson + BTTS + mezcla Bayes-mercado (log-odds). Uso
          informativo; no constituye asesoría financiera.
        </div>
      </div>
    </div>
  );
}
