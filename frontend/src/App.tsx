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

type View = "calc" | "parley2" | "parley3" | "parley4";

/* ===================== Config ===================== */
const API_BASE: string =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_API_BASE_URL?.replace(/\/$/, "")) ||
  "http://localhost:8000";

const pct = (n?: number) =>
  n == null || Number.isNaN(n) ? "—" : `${(+n).toFixed(2)}%`;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/* ===================== Theme-aware styles (Dark only) ===================== */
const BG_DARK =
  "radial-gradient(1200px 600px at 20% -10%, #3b0764 0%, transparent 60%), radial-gradient(1000px 500px at 120% -20%, #1d4ed8 0%, transparent 55%), #0b1020";

const pageBase: React.CSSProperties = {
  minHeight: "100vh",
  fontFamily:
    "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,Helvetica,Arial,Apple Color Emoji,Segoe UI Emoji",
  color: "#e5e7eb",
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

const panelStyle = (): React.CSSProperties => ({
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 18,
  padding: 18,
});

const labelStyle = (): React.CSSProperties => ({
  color: "#a5b4fc",
  fontSize: 14,
  marginBottom: 8,
  fontWeight: 700,
});

const inputStyle = (): React.CSSProperties => ({
  width: "100%",
  background: "#0f172a",
  color: "#ffffff",
  border: "1px solid rgba(255,255,255,.18)",
  borderRadius: 12,
  padding: "12px 14px",
  outline: "none",
});

const primaryBtn: React.CSSProperties = {
  background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
  color: "white",
  border: "none",
  borderRadius: 16,
  padding: "14px 22px",
  fontWeight: 900,
  fontSize: 18,
};

const cardGradientStyle = (): React.CSSProperties => ({
  borderRadius: 20,
  padding: 20,
  background: "rgba(168,85,247,.08)",
  border: "1px solid rgba(99,102,241,.28)",
  boxShadow: "0 20px 40px rgba(0,0,0,.12)",
});

const statBoxStyle = (): React.CSSProperties => ({
  background: "rgba(255,255,255,.03)",
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 14,
  padding: 12,
  color: "#c7cdd5",
});

const pillStyle = (): React.CSSProperties => ({
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
});

const wrap: React.CSSProperties = {
  maxWidth: 1200,
  margin: "0 auto",
  padding: "28px 18px 80px",
};

/* ===================== Header + Drawer ===================== */
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
          color: "#e5e7eb",
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

function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <div
      className="fm-header"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 14,
      }}
    >
      <div
        className="fm-brand"
        style={{ display: "flex", alignItems: "center", gap: 14 }}
      >
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

      <div
        className="fm-actions"
        style={{ display: "flex", alignItems: "center", gap: 10 }}
      >
        <button style={actionBtn(false)}>↻ Historial</button>
        <button style={actionBtn(true)}>📈 Explorar</button>
      </div>
    </div>
  );
}

/* ===================== Calculadora ===================== */
function Calculadora({ leagues }: { leagues: string[] }) {
  const [league, setLeague] = useState("");
  const [teams, setTeams] = useState<string[]>([]);
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState<PredictResponse | null>(null);

  // cuotas opcionales – solo 1, X, 2 y Over 2.5
  const [odds, setOdds] = useState<Record<string, string>>({});

  const ODDS_FIELDS: [string, string][] = [
    ["1", "1 (Local)"],
    ["X", "Empate"],
    ["2", "2 (Visitante)"],
    ["O2_5", "Over 2.5"],
  ];

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

  function cleanOdds(src: Record<string, string>) {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(src)) {
      const num = parseFloat((v ?? "").toString());
      if (!Number.isNaN(num)) out[k] = num;
    }
    return out;
  }

  async function onPredict() {
    if (!canPredict) return;
    setLoading(true);
    setErr("");
    setData(null);
    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          league,
          home_team: home,
          away_team: away,
          odds: cleanOdds(odds),
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

  return (
    <>
      <div
        style={{ display: "flex", gap: 12, marginBottom: 18 }}
        className="fm-badges"
      >
        <div style={pillStyle()}>🛡️ Poisson/DC</div>
        <div style={pillStyle()}>🛡️ BTTS</div>
        <div style={pillStyle()}>🛡️ Odds Blend</div>
        <div style={pillStyle()}>📊 IA</div>
      </div>

      <div style={{ ...panelStyle(), padding: 22, marginBottom: 18 }}>
        <div
          className="fm-grid3"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 14,
          }}
        >
          <div>
            <div style={labelStyle()}>Liga</div>
            <select
              value={league}
              onChange={(e) => setLeague(e.target.value)}
              style={inputStyle()}
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
            <div style={labelStyle()}>Equipo local</div>
            <input
              placeholder="Escribe para buscar..."
              value={home}
              onChange={(e) => setHome(e.target.value)}
              list="home_datalist"
              style={inputStyle()}
            />
            <datalist id="home_datalist">
              {filteredHome.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <div>
            <div style={labelStyle()}>Equipo visitante</div>
            <input
              placeholder="Escribe para buscar..."
              value={away}
              onChange={(e) => setAway(e.target.value)}
              list="away_datalist"
              style={inputStyle()}
            />
            <datalist id="away_datalist">
              {filteredAway.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
          className="fm-cta-row"
        >
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

      {/* ====== Cuotas (solo 1, X, 2, Over 2.5) ====== */}
      <div style={{ ...panelStyle(), marginBottom: 18 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Cuotas (opcionales)</div>

        <div className="odds-grid">
          {ODDS_FIELDS.map(([k, labelK]) => (
            <div className="odds-item" key={k}>
              <label>{labelK}</label>
              <input
                className="odds-input"
                placeholder="2.00"
                inputMode="decimal"
                enterKeyHint="done"
                value={odds[k] ?? ""}
                onChange={(e) => {
                  const v = e.target.value.replace(",", ".").replace(/[^\d.]/g, "");
                  setOdds((p) => ({ ...p, [k]: v }));
                }}
              />
            </div>
          ))}
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={actionBtn(false)} onClick={() => setOdds({})} type="button">
            Limpiar cuotas
          </button>
          <div style={{ fontSize: 12, opacity: 0.8, alignSelf: "center" }}>
            Sugerencia: ingresa las cuotas ~5 horas antes para mejor precisión.
          </div>
        </div>
      </div>

      {err && (
        <div
          style={{
            background: "rgba(239,68,68,.12)",
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

      {data && (
        <>
          <div style={{ ...cardGradientStyle(), marginBottom: 18 }} className="fm-card">
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                opacity: 0.85,
                marginBottom: 6,
              }}
            >
              Mejor predicción
            </div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 900,
                lineHeight: 1.2,
                marginBottom: 6,
              }}
              className="fm-title-xl"
            >
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

          <div style={{ ...panelStyle(), marginBottom: 18 }} className="fm-panel">
            <div style={{ fontWeight: 900, marginBottom: 10 }}>MERCADOS</div>
            <div
              className="fm-grid-auto"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
                gap: 12,
              }}
            >
              <div style={statBoxStyle()}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>1X2</div>
                <div>1: {pct(data.probs.home_win_pct)}</div>
                <div>X: {pct(data.probs.draw_pct)}</div>
                <div>2: {pct(data.probs.away_win_pct)}</div>
              </div>

              <div style={statBoxStyle()}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Goles</div>
                <div>Over 2.5: {pct(data.probs.over_2_5_pct)}</div>
                <div>BTTS Sí: {pct(data.probs.btts_pct)}</div>
                <div>Over 2.5 (MLP): {pct(data.probs.o25_mlp_pct)}</div>
              </div>

              <div style={statBoxStyle()}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>
                  Marcadores más probables
                </div>
                {(data.poisson?.top_scorelines ?? [])
                  .slice(0, 3)
                  .map((t) => (
                    <div key={t.score}>
                      {t.score} · {t.pct}%
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div style={panelStyle()} className="fm-panel">
            <div style={{ fontWeight: 900, marginBottom: 10 }}>
              GOLES Y CORNERS
            </div>
            <div
              className="fm-grid-auto"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
                gap: 12,
              }}
            >
              <div style={statBoxStyle()}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Lambdas (λ)</div>
                <div>λ Local: {data.poisson?.home_lambda ?? "—"}</div>
                <div>λ Visitante: {data.poisson?.away_lambda ?? "—"}</div>
              </div>
              <div style={statBoxStyle()}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Corners</div>
                <div>
                  Promedio total: {data.averages.total_corners_avg.toFixed(2)}
                </div>
                <div>
                  Predicción MLP: {data.averages.corners_mlp_pred.toFixed(2)}
                </div>
              </div>
              <div style={statBoxStyle()}>
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
      const r = await fetch(
        `${API_BASE}/teams?league=${encodeURIComponent(league)}`
      );
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
      <div style={{ ...panelStyle(), padding: 22, marginBottom: 18 }}>
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
              <div key={idx} style={{ ...panelStyle() }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>
                  Leg #{idx + 1}
                </div>
                <div
                  className="fm-grid3"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 14,
                  }}
                >
                  <div>
                    <div style={labelStyle()}>Liga</div>
                    <select
                      value={L.league}
                      onChange={(e) => onLeagueChange(idx, e.target.value)}
                      style={inputStyle()}
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
                    <div style={labelStyle()}>Equipo local</div>
                    <input
                      value={L.home}
                      onChange={(e) => setLeg(idx, { home: e.target.value })}
                      list={`home_${idx}`}
                      placeholder="Escribe…"
                      style={inputStyle()}
                    />
                    <datalist id={`home_${idx}`}>
                      {filteredHome.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <div style={labelStyle()}>Equipo visitante</div>
                    <input
                      value={L.away}
                      onChange={(e) => setLeg(idx, { away: e.target.value })}
                      list={`away_${idx}`}
                      placeholder="Escribe…"
                      style={inputStyle()}
                    />
                    <datalist id={`away_${idx}`}>
                      {filteredAway.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 12,
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
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
                  <div style={{ marginTop: 12, ...cardGradientStyle() }}>
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

        <div style={{ marginTop: 16, ...cardGradientStyle() }}>
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
              puede considerarse como <b>parley seguro</b> según la IA.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===================== App ===================== */
export default function App() {
  const [drawer, setDrawer] = useState(false);
  const [view, setView] = useState<View>("calc");
  const [leagues, setLeagues] = useState<string[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/leagues`)
      .then((r) => r.json())
      .then((d: ApiLeagues) => setLeagues(d.leagues ?? []))
      .catch(() => setLeagues([]));
  }, []);

  // Theme-color meta para móvil (oscuro)
  useEffect(() => {
    const el = document.querySelector(
      'meta[name="theme-color"]'
    ) as HTMLMetaElement | null;
    if (el) el.setAttribute("content", "#0b1020");
  }, []);

  return (
    <div style={{ ...pageBase, background: BG_DARK }}>
      {/* CSS RESPONSIVE – dark fijo */}
      <style>{`
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
        @media (min-width: 721px) and (max-width: 1024px) {
          .fm-grid3 { grid-template-columns: 1fr 1fr !important; }
        }
        .odds-grid { display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
        @media (max-width: 480px) { .odds-grid { grid-template-columns: 1fr; } }
        .odds-item label {
          display:block;
          font-size:13px;
          font-weight:700;
          margin-bottom:6px;
          color:#a5b4fc;
        }
        .odds-input {
          width:100%;
          font-size:16px;
          padding:12px 14px;
          background:#0f172a;
          color:#ffffff;
          border:1px solid rgba(255,255,255,.18);
          border-radius:12px;
          text-align:right;
        }
        .odds-input[type=number]::-webkit-outer-spin-button,
        .odds-input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
        .odds-input[type=number] { -moz-appearance:textfield; }
      `}</style>

      <Drawer open={drawer} onClose={() => setDrawer(false)} view={view} setView={setView} />
      <div style={wrap}>
        <Header onOpenMenu={() => setDrawer(true)} />

        {view === "calc" && <Calculadora leagues={leagues} />}
        {view === "parley2" && <ParlayBuilder leagues={leagues} legsRequired={2} />}
        {view === "parley3" && <ParlayBuilder leagues={leagues} legsRequired={3} />}
        {view === "parley4" && <ParlayBuilder leagues={leagues} legsRequired={4} />}
      </div>
    </div>
  );
}
