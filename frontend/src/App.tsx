// src/App.tsx
import { useEffect, useMemo, useState } from "react";

/* ===================== Types ===================== */
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

/* ===================== Config ===================== */
const API_BASE: string =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_API_BASE_URL?.replace(/\/$/, "")) ||
  "http://localhost:8000";

const pct = (n?: number) =>
  n == null || Number.isNaN(n) ? "—" : `${(+n).toFixed(2)}%`;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/* ===================== Base styles (inline) ===================== */
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

/* ===================== Header + Drawer ===================== */
type View = "calc" | "parley2" | "parley3" | "parley4";

function Header({
  dark,
  setDark,
  onOpenMenu,
}: {
  dark: boolean;
  setDark: (v: boolean) => void;
  onOpenMenu: () => void;
}) {
  return (
    <div className="fm-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
      <div className="fm-brand" style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button
          onClick={onOpenMenu}
          style={{
            ...actionBtn(false),
            width: 44,
            height: 44,
            justifyContent: "center",
            padding: 0,
            borderRadius: 12,
          }}
          title="Menú"
        >
          ☰
        </button>

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
          <div style={{ opacity: 0.8 }}>
            Predicciones confiables para el usuario final
          </div>
        </div>
      </div>

      <div className="fm-actions" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button style={actionBtn(false)}>↻ Historial</button>
        <button
          style={actionBtn(false)}
          onClick={() => setDark(!dark)}
          title="Cambiar tema"
        >
          {dark ? "☀️ Claro" : "🌙 Oscuro"}
        </button>
        <button style={actionBtn(true)}>📈 Explorar</button>
      </div>
    </div>
  );
}

function Drawer({
  open,
  onClose,
  setView,
  view,
}: {
  open: boolean;
  onClose: () => void;
  view: View;
  setView: (v: View) => void;
}) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: open ? "rgba(0,0,0,.45)" : "transparent",
          pointerEvents: open ? "auto" : "none",
          transition: "background .25s",
          zIndex: 40,
        }}
      />
      <div
        className="fm-drawer"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          height: "100%",
          width: 280,
          background: "#0b1020",
          borderRight: "1px solid rgba(255,255,255,.1)",
          transform: open ? "translateX(0)" : "translateX(-110%)",
          transition: "transform .25s",
          zIndex: 50,
          padding: 16,
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 14, fontSize: 18 }}>
          ☰ Menú
        </div>
        <MenuItem
          active={view === "calc"}
          label="Calculadora"
          onClick={() => {
            setView("calc");
            onClose();
          }}
        />
        <div style={{ opacity: 0.6, margin: "10px 0 6px", fontSize: 12 }}>
          Parlays IA
        </div>
        <MenuItem
          active={view === "parley2"}
          label="Parley doble"
          onClick={() => {
            setView("parley2");
            onClose();
          }}
        />
        <MenuItem
          active={view === "parley3"}
          label="Parley triple"
          onClick={() => {
            setView("parley3");
            onClose();
          }}
        />
        <MenuItem
          active={view === "parley4"}
          label="Súper parley (4)"
          onClick={() => {
            setView("parley4");
            onClose();
          }}
        />
        <div style={{ marginTop: 18, fontSize: 12, opacity: 0.65 }}>
          *La IA sugiere el pick más seguro por partido y calcula probabilidad
          combinada. Uso informativo.
        </div>
      </div>
    </>
  );
}

function MenuItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "12px 12px",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,.12)",
        background: active ? "rgba(124,58,237,.25)" : "rgba(255,255,255,.04)",
        color: "#e5e7eb",
        marginBottom: 10,
        fontWeight: active ? 900 : 600,
      }}
    >
      {label}
    </button>
  );
}

/* ===================== Calculadora ===================== */
function Calculadora({
  dark,
  leagues,
}: {
  dark: boolean;
  leagues: string[];
}) {
  const [league, setLeague] = useState("");
  const [teams, setTeams] = useState<string[]>([]);
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState<PredictResponse | null>(null);

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
    <>
      <div style={{ display: "flex", gap: 12, marginBottom: 18 }} className="fm-badges">
        <div style={pill}>🛡️ Poisson</div>
        <div style={pill}>🛡️ BTTS</div>
        <div style={pill}>🛡️ MLP Corners</div>
      </div>

      <div style={{ ...panel, padding: 22, marginBottom: 18 }} className="fm-panel">
        <div className="fm-grid3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
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

        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 16 }} className="fm-cta-row">
          <button
            className="fm-primary-btn"
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

      {data && (
        <>
          <div style={{ ...cardGradient, marginBottom: 18 }} className="fm-card">
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.85, marginBottom: 6 }}>
              Mejor predicción
            </div>
            <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.2, marginBottom: 6 }} className="fm-title-xl">
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

          <div style={{ ...panel, marginBottom: 18 }} className="fm-panel">
            <div style={{ fontWeight: 900, marginBottom: 10 }}>MERCADOS</div>
            <div
              className="fm-grid-auto"
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

          <div style={panel} className="fm-panel">
            <div style={{ fontWeight: 900, marginBottom: 10 }}>GOLES Y CORNERS</div>
            <div
              className="fm-grid-auto"
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

      <div style={{ marginTop: 28, opacity: 0.6, fontSize: 12 }}>
        *Modelo: Poisson + BTTS + MLP (corners y O2.5). Uso informativo; no constituye
        asesoría financiera.
      </div>
    </>
  );
}

/* ===================== Parlay Builder ===================== */
type LegState = {
  league: string;
  teams: string[];
  home: string;
  away: string;
  loading: boolean;
  error: string;
  result?: PredictResponse;
};

function ParlayBuilder({
  leagues,
  legsRequired,
}: {
  leagues: string[];
  legsRequired: 2 | 3 | 4;
}) {
  const [legs, setLegs] = useState<LegState[]>(
    Array.from({ length: legsRequired }, () => ({
      league: "",
      teams: [],
      home: "",
      away: "",
      loading: false,
      error: "",
    }))
  );

  function setLeg(idx: number, patch: Partial<LegState>) {
    setLegs((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }

  async function onLeagueChange(idx: number, league: string) {
    setLeg(idx, { league, home: "", away: "", result: undefined, error: "" });
    if (!league) {
      setLeg(idx, { teams: [] });
      return;
    }
    try {
      const r = await fetch(`${API_BASE}/teams?league=${encodeURIComponent(league)}`);
      const d: ApiTeams = await r.json();
      setLeg(idx, { teams: d.teams ?? [] });
    } catch {
      setLeg(idx, { error: "No pude cargar equipos." });
    }
  }

  async function predictLeg(idx: number) {
    const L = legs[idx];
    if (!(L.league && L.home && L.away && L.home !== L.away)) {
      setLeg(idx, { error: "Completa liga y equipos distintos." });
      return;
    }
    setLeg(idx, { loading: true, error: "", result: undefined });
    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          league: L.league,
          home_team: L.home,
          away_team: L.away,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json: PredictResponse = await res.json();
      setLeg(idx, { result: json });
    } catch (e: any) {
      setLeg(idx, { error: e?.message || "Error en predicción" });
    } finally {
      setLeg(idx, { loading: false });
    }
  }

  const combinedProb01 = useMemo(() => {
    const probs = legs
      .map((l) => l.result?.best_pick?.prob_pct)
      .filter((p): p is number => typeof p === "number")
      .map((p) => clamp01(p / 100));
    if (probs.length < legsRequired) return 0;
    return probs.reduce((a, b) => a * b, 1);
  }, [legs, legsRequired]);

  const allReady = legs.every(
    (l) => l.result && !l.loading && !l.error && l.home && l.away
  );

  return (
    <div>
      <div style={{ ...panel, padding: 22, marginBottom: 18 }} className="fm-panel">
        <div style={{ fontWeight: 900, marginBottom: 10 }}>
          Construye tu parley — {legsRequired} selecciones
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          {legs.map((L, idx) => {
            const filteredHome = L.teams.filter((t) =>
              t.toLowerCase().includes(L.home.toLowerCase())
            );
            const filteredAway = L.teams.filter((t) =>
              t.toLowerCase().includes(L.away.toLowerCase())
            );

            return (
              <div key={idx} style={{ ...panel }} className="fm-panel">
                <div style={{ fontWeight: 800, marginBottom: 8 }}>
                  Leg #{idx + 1}
                </div>
                <div className="fm-grid3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                  <div>
                    <div style={label}>Liga</div>
                    <select
                      value={L.league}
                      onChange={(e) => onLeagueChange(idx, e.target.value)}
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
                      value={L.home}
                      onChange={(e) => setLeg(idx, { home: e.target.value })}
                      list={`home_${idx}`}
                      placeholder="Escribe…"
                      style={input}
                    />
                    <datalist id={`home_${idx}`}>
                      {filteredHome.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <div style={label}>Equipo visitante</div>
                    <input
                      value={L.away}
                      onChange={(e) => setLeg(idx, { away: e.target.value })}
                      list={`away_${idx}`}
                      placeholder="Escribe…"
                      style={input}
                    />
                    <datalist id={`away_${idx}`}>
                      {filteredAway.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }} className="fm-cta-row">
                  <button
                    className="fm-primary-btn"
                    onClick={() => predictLeg(idx)}
                    disabled={L.loading}
                    style={{
                      ...primaryBtn,
                      opacity: L.loading ? 0.6 : 1,
                      cursor: L.loading ? "not-allowed" : "pointer",
                    }}
                  >
                    {L.loading ? "Calculando…" : "Obtener pick IA"}
                  </button>
                  {L.error && (
                    <div
                      style={{
                        background: "rgba(239,68,68,.12)",
                        border: "1px solid rgba(239,68,68,.3)",
                        color: "#fecaca",
                        padding: 8,
                        borderRadius: 10,
                      }}
                    >
                      {L.error}
                    </div>
                  )}
                </div>

                {L.result && (
                  <div style={{ marginTop: 12, ...cardGradient }} className="fm-card">
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>
                      Pick recomendado:
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>
                      {L.result.best_pick.market} — {L.result.best_pick.selection}
                    </div>
                    <div>
                      Prob: <b>{pct(L.result.best_pick.prob_pct)}</b> · Confianza:{" "}
                      <b>{pct(L.result.best_pick.confidence)}</b>
                    </div>
                    <div style={{ marginTop: 8, opacity: 0.8 }}>
                      {L.result.summary}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 16, ...cardGradient }} className="fm-card">
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Resumen del parley</div>
          <div>
            Probabilidad combinada: <b>{pct(combinedProb01 * 100)}</b>
          </div>
          {!allReady && (
            <div style={{ marginTop: 6, opacity: 0.75 }}>
              Completa y calcula los {legsRequired} picks para ver el parley sugerido.
            </div>
          )}
          {allReady && (
            <div style={{ marginTop: 10 }}>
              ✅ Recomendación: combinar las <b>{legsRequired}</b> mejores jugadas sugeridas.
              Si la probabilidad combinada supera ~35–40% y las cuotas son razonables,
              puede considerarse como **parley seguro** según la IA.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===================== App ===================== */
export default function App() {
  const [dark, setDark] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [view, setView] = useState<View>("calc");
  const [leagues, setLeagues] = useState<string[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/leagues`)
      .then((r) => r.json())
      .then((d: ApiLeagues) => setLeagues(d.leagues ?? []))
      .catch(() => setLeagues([]));
  }, []);

  return (
    <div
      style={{
        ...page,
        backgroundColor: dark ? undefined : "#f6f7fb",
        color: dark ? "#e5e7eb" : "#0b1020",
      }}
    >
      {/* CSS RESPONSIVE in-app */}
      <style>{`
        /* apilado mobile */
        .fm-header { flex-wrap: wrap; }
        @media (max-width: 720px) {
          .fm-header { flex-direction: column; align-items: stretch; gap: 10px; }
          .fm-brand { gap: 10px; }
          .fm-actions { width: 100%; justify-content: space-between; }
          .fm-drawer { width: 85vw; }
          .fm-panel { padding: 16px !important; }
          .fm-card { padding: 16px !important; border-radius: 16px !important; }
          .fm-grid3 { grid-template-columns: 1fr !important; }
          .fm-primary-btn { width: 100%; }
          .fm-cta-row { flex-direction: column; align-items: stretch !important; gap: 10px !important; }
          .fm-badges { flex-wrap: wrap; }
          .fm-title-xl { font-size: 22px !important; }
        }
        /* tablet */
        @media (min-width: 721px) and (max-width: 1024px) {
          .fm-grid3 { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        view={view}
        setView={setView}
      />
      <div style={wrap}>
        <Header dark={dark} setDark={setDark} onOpenMenu={() => setDrawer(true)} />

        {view === "calc" && <Calculadora dark={dark} leagues={leagues} />}
        {view === "parley2" && <ParlayBuilder leagues={leagues} legsRequired={2} />}
        {view === "parley3" && <ParlayBuilder leagues={leagues} legsRequired={3} />}
        {view === "parley4" && <ParlayBuilder leagues={leagues} legsRequired={4} />}
      </div>
    </div>
  );
}
