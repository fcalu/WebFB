// src/App.tsx
import { useEffect, useMemo, useState } from "react";
import InstallPWAButton from "./components/InstallPWAButton";

/* ===================== Types ===================== */
type ApiLeagues = { leagues: string[] };
type ApiTeams = { teams: string[] };

/** ---- Formato ANTIGUO (tu app actual) ---- */
type BestPickOld = {
  market: string;
  selection: string;
  prob_pct: number;
  confidence: number;
  reasons: string[];
  summary: string;
};
type PredictResponseOld = {
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
  best_pick: BestPickOld;
  summary: string;
};

/** ---- Formato NUEVO (backend DC + odds + IA) ---- */
type ValueRow = {
  market: string;
  prob_model: number;   // 0..1
  fair_odds: number;
  odd: number;
  edge_pct: number;
  ev: number;
  kelly_frac: number;
};
type BestPickProb = { market: string; prob: number; confidence: number; why: string[] };
type PredictResponseNew = {
  league: string;
  home_team: string;
  away_team: string;
  lambda_home: number;
  lambda_away: number;
  markets: Record<string, number>; // 0..1
  best_pick_prob: BestPickProb;
  best_value_pick?: ValueRow | null;
  value_table: ValueRow[];
  top_scores: { home: number; away: number; p: number }[];
  blend_detail?: Record<string, { model: number; market?: number }> | null;
  legend?: string;
  ai_analysis?: string | null;
};

type PredictAny = PredictResponseOld | PredictResponseNew;

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
      <InstallPWAButton style={actionBtn(true)} />
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

/* ===================== Helpers NUEVOS ===================== */
function labelMarket(k: string) {
  const map: Record<string, string> = {
    "1": "1 (Local)",
    "X": "Empate",
    "2": "2 (Visitante)",
    "1X": "Doble: 1X",
    "12": "Doble: 12",
    "X2": "Doble: X2",
    "BTTS": "Ambos anotan",
    "O1_5": "Over 1.5",
    "U1_5": "Under 1.5",
    "O2_5": "Over 2.5",
    "U2_5": "Under 2.5",
    "O3_5": "Over 3.5",
    "U3_5": "Under 3.5",
    "1_&_U3_5": "Gana local & U3.5",
    "1_&_O2_5": "Gana local & O2.5",
    "2_&_U3_5": "Gana visita & U3.5",
    "2_&_O2_5": "Gana visita & O2.5",
  };
  return map[k] ?? k;
}
const toPct = (p: number) => `${(p * 100).toFixed(2)}%`;

function isNew(resp: PredictAny): resp is PredictResponseNew {
  return (resp as any)?.markets !== undefined;
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

  // NUEVO: Odds + IA
  const [odds, setOdds] = useState<Record<string, string>>({});
  const [kickoff, setKickoff] = useState<string>("");
  const [blend, setBlend] = useState<boolean>(true);
  const [withAI, setWithAI] = useState<boolean>(false);
  const [aiModel, setAiModel] = useState<string>("gpt-4o-mini");
  const [aiLang, setAiLang] = useState<string>("es");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState<PredictAny | null>(null);

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

  function buildOddsPayload() {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(odds)) {
      const num = Number(String(v).replace(",", "."));
      if (Number.isFinite(num) && num > 0) out[k] = num;
    }
    return Object.keys(out).length ? out : undefined;
  }

  async function onPredict() {
    if (!canPredict) return;
    setLoading(true);
    setErr("");
    setData(null);
    try {
      const payload: any = {
        league,
        home_team: home,
        away_team: away,
      };
      const o = buildOddsPayload();
      if (o) payload.odds = o;
      if (kickoff) payload.kickoff_utc = kickoff;
      if (o) payload.blend_with_market = blend;
      if (withAI) {
        payload.with_ai = true;
        payload.ai_model = aiModel;
        payload.ai_lang = aiLang;
      }

      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const json: PredictAny = await res.json();
      setData(json);
    } catch (e: any) {
      setErr(e?.message || "Error al predecir.");
    } finally {
      setLoading(false);
    }
  }

  // NUEVO: chips de mercados para respuesta nueva
  function MarketsChips({ markets }: { markets: Record<string, number> }) {
    const keys = [
      "1",
      "X",
      "2",
      "1X",
      "12",
      "X2",
      "BTTS",
      "O2_5",
      "U2_5",
      "O3_5",
      "U3_5",
      "1_&_U3_5",
      "2_&_U3_5",
      "1_&_O2_5",
      "2_&_O2_5",
    ];
    return (
      <div style={{ ...panel, marginBottom: 18 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>
          MERCADOS (probabilidad)
        </div>
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
          className="fm-badges"
        >
          {keys
            .filter((k) => k in markets)
            .map((k) => (
              <div key={k} style={pill}>
                <span style={{ opacity: 0.8, marginRight: 6 }}>
                  {labelMarket(k)}:
                </span>
                <b>{toPct(markets[k])}</b>
              </div>
            ))}
        </div>
      </div>
    );
  }

  // NUEVO: tabla de valor
  function ValueTable({ rows }: { rows: ValueRow[] }) {
    if (!rows?.length) return null;
    return (
      <div style={{ ...panel, marginBottom: 18 }}>
        <div className="mb-3" style={{ fontWeight: 900, marginBottom: 8 }}>
          Value table (EV/Kelly)
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="min-w-full" style={{ fontSize: 14, width: "100%" }}>
            <thead style={{ opacity: 0.7, fontSize: 12 }}>
              <tr style={{ textAlign: "left" }}>
                <th style={{ padding: "6px 10px" }}>Mercado</th>
                <th style={{ padding: "6px 10px" }}>Prob%</th>
                <th style={{ padding: "6px 10px" }}>Cuota justa</th>
                <th style={{ padding: "6px 10px" }}>Tu cuota</th>
                <th style={{ padding: "6px 10px" }}>Edge</th>
                <th style={{ padding: "6px 10px" }}>EV</th>
                <th style={{ padding: "6px 10px" }}>Kelly</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.market}
                  style={{
                    borderTop: "1px solid rgba(255,255,255,.08)",
                  }}
                >
                  <td style={{ padding: "8px 10px", fontWeight: 700 }}>
                    {labelMarket(r.market)}
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    {(r.prob_model * 100).toFixed(1)}%
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    {r.fair_odds.toFixed(2)}
                  </td>
                  <td style={{ padding: "8px 10px" }}>{r.odd.toFixed(2)}</td>
                  <td style={{ padding: "8px 10px" }}>
                    <span
                      style={{
                        color: r.edge_pct >= 0 ? "#34d399" : "#f87171",
                        fontWeight: 700,
                      }}
                    >
                      {r.edge_pct.toFixed(2)}%
                    </span>
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <span
                      style={{
                        color: r.ev >= 0 ? "#34d399" : "#f87171",
                        fontWeight: 700,
                      }}
                    >
                      {r.ev.toFixed(3)}
                    </span>
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    {(r.kelly_frac * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // NUEVO: best value card
  function BestValueCard({ pick }: { pick?: ValueRow | null }) {
    if (!pick) return null;
    return (
      <div style={{ ...cardGradient, marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.85, marginBottom: 6 }}>
          Mejor valor (EV)
        </div>
        <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.2, marginBottom: 6 }}>
          {labelMarket(pick.market)}
        </div>
        <div style={{ fontSize: 14, marginBottom: 6 }}>
          Prob: <b>{(pick.prob_model * 100).toFixed(1)}%</b> · Cuota justa:{" "}
          <b>{pick.fair_odds.toFixed(2)}</b> · Tu cuota: <b>{pick.odd.toFixed(2)}</b>
        </div>
        <div style={{ fontSize: 14 }}>
          Edge:{" "}
          <b style={{ color: pick.edge_pct >= 0 ? "#34d399" : "#f87171" }}>
            {pick.edge_pct.toFixed(2)}%
          </b>{" "}
          · Kelly: <b>{(pick.kelly_frac * 100).toFixed(1)}%</b>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        style={{ display: "flex", gap: 12, marginBottom: 18 }}
        className="fm-badges"
      >
        <div style={pill}>🛡️ Poisson/DC</div>
        <div style={pill}>🛡️ BTTS</div>
        <div style={pill}>🛡️ Odds Blend</div>
        <div style={pill}>🤖 IA</div>
      </div>

      <div style={{ ...panel, padding: 22, marginBottom: 18 }} className="fm-panel">
        <div
          className="fm-grid3"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}
        >
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

        {/* NUEVO: Cuotas + Kickoff + IA */}
        <div
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: 14,
          }}
        >
          <div style={{ ...panel }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Cuotas (opcionales)</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
                gap: 10,
              }}
            >
              {["1", "X", "2", "O2_5", "U2_5", "BTTS", "NOBTTS", "O3_5", "U3_5"].map(
                (k) => (
                  <div key={k}>
                    <div style={label}>{labelMarket(k)}</div>
                    <input
                      placeholder="2.00"
                      value={odds[k] ?? ""}
                      onChange={(e) =>
                        setOdds((p) => ({ ...p, [k]: e.target.value }))
                      }
                      style={input}
                      inputMode="decimal"
                    />
                  </div>
                )
              )}
            </div>

            <div
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <div>
                <div style={label}>Kickoff (UTC, ISO 8601)</div>
                <input
                  type="datetime-local"
                  value={kickoff ? kickoff.substring(0, 16) : ""}
                  onChange={(e) =>
                    setKickoff(e.target.value ? new Date(e.target.value).toISOString() : "")
                  }
                  style={input}
                />
              </div>
              <div style={{ fontSize: 12, opacity: 0.8, alignSelf: "end" }}>
                Sugerencia: ingresa las cuotas ~5 horas antes del partido para un cálculo
                más preciso.
              </div>
            </div>
          </div>

          <div style={{ ...panel }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Análisis</div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
              <input
                type="checkbox"
                checked={blend}
                onChange={(e) => setBlend(e.target.checked)}
              />
              Mezclar modelo con mercado (log-odds)
            </label>
            <label
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                fontSize: 14,
                marginTop: 8,
              }}
            >
              <input
                type="checkbox"
                checked={withAI}
                onChange={(e) => setWithAI(e.target.checked)}
              />
              Incluir análisis IA
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <div>
                <div style={label}>Modelo IA</div>
                <select value={aiModel} onChange={(e) => setAiModel(e.target.value)} style={input}>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="gpt-4o">gpt-4o</option>
                </select>
              </div>
              <div>
                <div style={label}>Idioma</div>
                <select value={aiLang} onChange={(e) => setAiLang(e.target.value)} style={input}>
                  <option value="es">Español</option>
                  <option value="en">English</option>
                  <option value="pt">Português</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 16 }}
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

      {/* ==== RESULTADOS ==== */}
      {data && (
        <>
          {/* CARD PRINCIPAL: usa formato nuevo si existe; si no, muestra el viejo */}
          <div style={{ ...cardGradient, marginBottom: 18 }} className="fm-card">
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

            {isNew(data) ? (
              <>
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 900,
                    lineHeight: 1.2,
                    marginBottom: 6,
                  }}
                  className="fm-title-xl"
                >
                  {labelMarket(data.best_pick_prob.market)}
                </div>
                <div style={{ fontSize: 16, marginBottom: 12 }}>
                  Prob: <b>{toPct(data.best_pick_prob.prob)}</b> · Confianza:{" "}
                  <b>{data.best_pick_prob.confidence}%</b>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                  {data.best_pick_prob.why.map((r, i) => (
                    <li key={i} style={{ color: "#d1d5db" }}>
                      {r}
                    </li>
                  ))}
                </ul>
                {data.legend && (
                  <div style={{ marginTop: 10, opacity: 0.9 }}>{data.legend}</div>
                )}
              </>
            ) : (
              <>
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 900,
                    lineHeight: 1.2,
                    marginBottom: 6,
                  }}
                  className="fm-title-xl"
                >
                  {(data as PredictResponseOld).best_pick.market} —{" "}
                  {(data as PredictResponseOld).best_pick.selection}
                </div>
                <div style={{ fontSize: 16, marginBottom: 12 }}>
                  Prob: <b>{pct((data as PredictResponseOld).best_pick.prob_pct)}</b> ·
                  Confianza: <b>{pct((data as PredictResponseOld).best_pick.confidence)}</b>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                  {(data as PredictResponseOld).best_pick.reasons.map((r, i) => (
                    <li key={i} style={{ color: "#d1d5db" }}>
                      {r}
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: 10, opacity: 0.9 }}>
                  {(data as PredictResponseOld).summary}
                </div>
              </>
            )}
          </div>

          {/* NUEVO: Mejor valor (EV/Kelly) */}
          {isNew(data) && <BestValueCard pick={data.best_value_pick || null} />}

          {/* Bloque mercados / resumen estadístico */}
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
              {/* 1X2 y goles - usar uno u otro formato */}
              {!isNew(data) && (
                <>
                  <div style={statBox}>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>1X2</div>
                    <div>1: {pct((data as PredictResponseOld).probs.home_win_pct)}</div>
                    <div>X: {pct((data as PredictResponseOld).probs.draw_pct)}</div>
                    <div>2: {pct((data as PredictResponseOld).probs.away_win_pct)}</div>
                  </div>

                  <div style={statBox}>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>Goles</div>
                    <div>Over 2.5: {pct((data as PredictResponseOld).probs.over_2_5_pct)}</div>
                    <div>BTTS Sí: {pct((data as PredictResponseOld).probs.btts_pct)}</div>
                    <div>
                      Over 2.5 (MLP):{" "}
                      {pct((data as PredictResponseOld).probs.o25_mlp_pct)}
                    </div>
                  </div>
                </>
              )}

              {isNew(data) && (
                <div style={{ gridColumn: "1/-1" }}>
                  <MarketsChips markets={data.markets} />
                </div>
              )}

              {/* Top marcadores */}
              <div style={statBox}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>
                  Marcadores más probables
                </div>
                {!isNew(data) &&
                  (data as PredictResponseOld).poisson?.top_scorelines
                    ?.slice(0, 3)
                    .map((t) => (
                      <div key={t.score}>
                        {t.score} · {t.pct}%
                      </div>
                    ))}
                {isNew(data) &&
                  data.top_scores.slice(0, 3).map((t, i) => (
                    <div key={i}>
                      {t.home}-{t.away} · {toPct(t.p)}
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Goles / corners / tarjetas (formato viejo) o lambdas (nuevo) */}
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
                <div>
                  λ Local:{" "}
                  {isNew(data)
                    ? data.lambda_home.toFixed(2)
                    : (data as PredictResponseOld).poisson?.home_lambda ?? "—"}
                </div>
                <div>
                  λ Visitante:{" "}
                  {isNew(data)
                    ? data.lambda_away.toFixed(2)
                    : (data as PredictResponseOld).poisson?.away_lambda ?? "—"}
                </div>
              </div>

              {!isNew(data) && (
                <>
                  <div style={statBox}>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>Corners</div>
                    <div>
                      Promedio total:{" "}
                      {(data as PredictResponseOld).averages.total_corners_avg.toFixed(2)}
                    </div>
                    <div>
                      Predicción MLP:{" "}
                      {(data as PredictResponseOld).averages.corners_mlp_pred.toFixed(2)}
                    </div>
                  </div>
                  <div style={statBox}>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>Tarjetas</div>
                    <div>
                      Promedio total amarillas:{" "}
                      {(data as PredictResponseOld).averages.total_yellow_cards_avg.toFixed(
                        2
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* NUEVO: Tabla de valor y Análisis IA */}
          {isNew(data) && <ValueTable rows={data.value_table} />}

          {isNew(data) && data.ai_analysis && (
            <div style={{ ...panel }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Análisis IA</div>
              <div
                style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}
                // seguridad básica
                dangerouslySetInnerHTML={{
                  __html: escapeHtml(data.ai_analysis).replace(/\n/g, "<br/>"),
                }}
              />
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 28, opacity: 0.6, fontSize: 12 }}>
        *Modelo: Dixon-Coles/Poisson + mezcla de cuotas (opcional) + IA. Uso informativo; no constituye asesoría financiera.
      </div>
    </>
  );
}

/* ===================== Parlay Builder (con soporte dual) ===================== */
type LegState = {
  league: string;
  teams: string[];
  home: string;
  away: string;
  loading: boolean;
  error: string;
  result?: PredictAny;
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
      const json: PredictAny = await res.json();
      setLeg(idx, { result: json });
    } catch (e: any) {
      setLeg(idx, { error: e?.message || "Error en predicción" });
    } finally {
      setLeg(idx, { loading: false });
    }
  }

  const legProb = (r?: PredictAny) => {
    if (!r) return undefined;
    if (isNew(r)) return r.best_pick_prob?.prob ?? undefined; // 0..1
    const p = (r as PredictResponseOld).best_pick?.prob_pct;
    return typeof p === "number" ? p / 100 : undefined;
  };

  const combinedProb01 = useMemo(() => {
    const probs = legs
      .map((l) => legProb(l.result))
      .filter((p): p is number => typeof p === "number")
      .map((p) => clamp01(p));
    if (probs.length < legsRequired) return 0;
    return probs.reduce((a, b) => a * b, 1);
  }, [legs, legsRequired]);

  const allReady = legs.every(
    (l) => l.result && !l.loading && !l.error && l.home && l.away
  );

  const labelPick = (r: PredictAny) => {
    if (isNew(r)) return labelMarket(r.best_pick_prob.market);
    return `${(r as PredictResponseOld).best_pick.market} — ${
      (r as PredictResponseOld).best_pick.selection
    }`;
    };

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
                <div
                  className="fm-grid3"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 14,
                  }}
                >
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

                <div
                  style={{
                    marginTop: 12,
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                  }}
                  className="fm-cta-row"
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
                  <div style={{ marginTop: 12, ...cardGradient }} className="fm-card">
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>
                      Pick recomendado:
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>
                      {labelPick(L.result)}
                    </div>
                    <div>
                      Prob:{" "}
                      <b>
                        {isNew(L.result)
                          ? toPct(L.result.best_pick_prob.prob)
                          : pct((L.result as PredictResponseOld).best_pick.prob_pct)}
                      </b>{" "}
                      · Confianza:{" "}
                      <b>
                        {isNew(L.result)
                          ? `${L.result.best_pick_prob.confidence}%`
                          : pct(
                              (L.result as PredictResponseOld).best_pick.confidence
                            )}
                      </b>
                    </div>
                    {!isNew(L.result) && (
                      <div style={{ marginTop: 8, opacity: 0.8 }}>
                        {(L.result as PredictResponseOld).summary}
                      </div>
                    )}
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

/* ===================== helpers ===================== */
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => {
    const m: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return m[c] || c;
  });
}
