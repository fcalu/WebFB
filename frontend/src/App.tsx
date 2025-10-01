import { useEffect, useMemo, useState } from "react";
import BestPickPro from "./components/BestPickPro";
import ErrorBoundary from "./components/ErrorBoundary";
import ParlayDrawer from "./components/ParlayDrawer";
import BuilderDrawer from "./components/BuilderDrawer";
import NavDrawer from "./components/NavDrawer";

import InstallBanner from "./components/InstallBanner";
import PremiumDrawer from "./components/PremiumDrawer";

// NUEVO: módulos de stake/historial
import StakeModal from "./components/StakeModal";
import BetHistoryDrawer from "./components/BetHistoryDrawer";

/* ===== Tipos mínimos ===== */
type ApiLeagues = { leagues: string[] };
type ApiTeams = { teams: string[] };

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
  best_pick: {
    market: string;
    selection: string;
    prob_pct: number;
    confidence: number;
    reasons: string[];
  };
  summary: string;
  debug?: Record<string, any>;
};

type Odds = { "1"?: number; X?: number; "2"?: number; O2_5?: number; BTTS_YES?: number };
type RawOdds = { "1"?: string; X?: string; "2"?: string; O2_5?: string; BTTS_YES?: string };

const API_BASE: string =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_API_BASE_URL?.replace(/\/$/, "")) ||
  "http://localhost:8000";

/* ===== Helpers ===== */
const toFloat = (v: any) => {
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v).replace(",", ".").trim();
  const x = Number(s);
  return Number.isFinite(x) ? x : undefined;
};

const pct = (n?: number) => (n == null || Number.isNaN(n) ? "—" : `${(+n).toFixed(2)}%`);

/* ===== Estilos base (dark) ===== */
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

/* ===== Cabecera minimal ===== */
/* ===== Cabecera con hamburguesa ===== */
function Header({
  onOpenMenu,
  onOpenHistory,
  onOpenParlay,
  onOpenBuilder,
}: {
  onOpenMenu: () => void;
  onOpenHistory: () => void;
  onOpenParlay: () => void;
  onOpenBuilder: () => void;
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
      {/* Lado izquierdo: Hamburguesa + marca */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          aria-label="Abrir menú"
          onClick={onOpenMenu}
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(255,255,255,.06)",
            color: "#e5e7eb",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
          }}
        >
          {/* ícono hamburguesa simple */}
          <div style={{ display: "grid", gap: 4 }}>
            <span style={{ display: "block", width: 18, height: 2, background: "#e5e7eb" }} />
            <span style={{ display: "block", width: 18, height: 2, background: "#e5e7eb" }} />
            <span style={{ display: "block", width: 18, height: 2, background: "#e5e7eb" }} />
          </div>
        </button>

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
          <div style={{ opacity: 0.8, fontSize: 13 }}>Predicción clara para usuarios finales</div>
        </div>
      </div>

      {/* Acciones rápidas (ocultas en móvil) */}
      <div className="quick-actions" style={{ display: "flex", gap: 8 }}>
        <button
          onClick={onOpenBuilder}
          title="Generador de selección"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.12)",
            color: "#d1d5db",
            background: "rgba(255,255,255,.06)",
          }}
        >
          🎯 Selección
        </button>
        <button
          onClick={onOpenHistory}
          title="Historial de apuestas"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.12)",
            color: "#d1d5db",
            background: "rgba(255,255,255,.06)",
          }}
        >
          📒 Historial
        </button>
        <button
          onClick={onOpenParlay}
          title="Generador de Parley"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.12)",
            color: "#d1d5db",
            background: "rgba(255,255,255,.06)",
          }}
        >
          🧮 Parley
        </button>
      </div>
    </div>
  );
}

/* ===== Editor de cuotas (acepta punto/coma) ===== */
function OddsEditor({
  odds,
  setOdds,
  rawOdds,
  setRawOdds,
}: {
  odds: Odds;
  setOdds: (o: Odds) => void;
  rawOdds: RawOdds;
  setRawOdds: (o: RawOdds) => void;
}) {
  const Field = ({ k, labelText, ph }: { k: keyof Odds; labelText: string; ph: string }) => (
    <div>
      <div style={label}>{labelText}</div>
      <input
        type="text"
        inputMode="decimal"
        placeholder={ph}
        style={input}
        value={rawOdds[k] ?? ""}
        onChange={(e) => setRawOdds({ ...rawOdds, [k]: e.target.value })}
        onBlur={(e) => {
          const num = toFloat(e.target.value);
          setOdds({ ...odds, [k]: num });
          if (num !== undefined) setRawOdds({ ...rawOdds, [k]: String(num) });
        }}
      />
    </div>
  );

  const anyOdds = odds["1"] || odds.X || odds["2"] || odds.O2_5 || odds.BTTS_YES;

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
        <Field k="O2_5" labelText="Más de 2.5" ph="1.95" />
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

/* ===== Skeleton simple ===== */
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

/* ===== App ===== */
export default function App() {
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
  const [premiumOpen, setPremiumOpen] = useState(false);
  // Parley + Historial + Stake
  const [parlayOpen, setParlayOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [stakeOpen, setStakeOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);


  useEffect(() => {
    fetch(`${API_BASE}/leagues`)
      .then((r) => r.json())
      .then((d: ApiLeagues) => setLeagues(d.leagues ?? []))
      .catch(() => setLeagues([]));
  }, []);

  useEffect(() => {
    setHome("");
    setAway("");
    setData(null);
    setErr("");
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
    try {
      const body: any = { league, home_team: home, away_team: away };
      if (odds["1"] || odds.X || odds["2"] || odds.O2_5 || odds.BTTS_YES) {
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

  // ======== Datos por defecto para el modal de Stake =========
  const stakeDefaults = useMemo(() => {
    if (!data) return null;
    const prob01 = (data.best_pick?.prob_pct ?? 0) / 100;

    // elegir cuota usada según el mercado
    let odd: number | undefined;
    if (data.best_pick.market === "1X2") {
      odd =
        data.best_pick.selection === "1"
          ? odds["1"]
          : data.best_pick.selection === "2"
          ? odds["2"]
          : odds["X"];
    } else if (data.best_pick.market === "Over 2.5") {
      odd = odds.O2_5;
    } else if (data.best_pick.market === "BTTS" && data.best_pick.selection === "Sí") {
      odd = odds.BTTS_YES;
    }

    const humanMarket =
      data.best_pick.market === "1X2"
        ? "Ganador del partido"
        : data.best_pick.market === "Over 2.5"
        ? "Más de 2.5 goles"
        : data.best_pick.market === "BTTS"
        ? "Ambos equipos anotan"
        : data.best_pick.market;

    const humanSelection =
      data.best_pick.market === "1X2"
        ? data.best_pick.selection === "1"
          ? "Gana Local"
          : data.best_pick.selection === "2"
          ? "Gana Visitante"
          : "Empate"
        : data.best_pick.selection;

    const matchLabel = `${data.home_team} vs ${data.away_team}`;

    return { prob01, odd, humanMarket, humanSelection, matchLabel };
  }, [data, odds]);

  return (
    <div style={page}>
      <style>{`
        @media (max-width: 720px) {
          .g3 { display:grid; grid-template-columns: 1fr; gap:12px; }
          .quick-actions { display: none !important; }
        }
        @media (min-width: 721px) {
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
        <Header
          onOpenMenu={() => setNavOpen(true)}
          onOpenHistory={() => setHistOpen(true)}
          onOpenParlay={() => setParlayOpen(true)}
          onOpenBuilder={() => setBuilderOpen(true)}
        />

        {/* Paso 1: Selección */}
        <div style={{ ...panel }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={pill}>1️⃣ Selecciona liga y equipos</div>
            <div style={pill}>2️⃣ (Opcional) Ingresar cuotas</div>
            <div style={pill}>3️⃣ Calcular</div>
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
        <OddsEditor odds={odds} setOdds={setOdds} rawOdds={rawOdds} setRawOdds={setRawOdds} />

        {/* CTA fijo inferior */}
        <div className="fixedbar">
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {canPredict ? "Listo para calcular" : "Selecciona liga y ambos equipos"}
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

        {/* Loading */}
        {loading && (
          <div style={{ marginTop: 12 }}>
            <SkeletonCard />
          </div>
        )}
        <NavDrawer
          open={navOpen}
          onClose={() => setNavOpen(false)}
          onOpenParlay={() => setParlayOpen(true)}
          onOpenBuilder={() => setBuilderOpen(true)}
          onOpenHistory={() => setHistOpen(true)}
        />
        {/* Parley & Historial (sliders) */}
        <ParlayDrawer
          open={parlayOpen}
          onClose={() => setParlayOpen(false)}
          API_BASE={API_BASE}
          isPremium={true /* o tu flag real */}
        />

        <BuilderDrawer
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        API_BASE={API_BASE}
        league={league}
        home={home}
        away={away}
        odds={odds}
      />
      <button
  onClick={() => setPremiumOpen(true)}
  title="Premium"
  style={{
    display:"inline-flex", alignItems:"center", gap:8, padding:"10px 14px",
    borderRadius:12, border:"1px solid rgba(255,255,255,.12)",
    color:"#d1d5db", background:"rgba(255,255,255,.06)"
  }}
>
  👑 Premium
</button>
      <BetHistoryDrawer open={histOpen} onClose={() => setHistOpen(false)} />
      <PremiumDrawer open={premiumOpen} onClose={() => setPremiumOpen(false)} />
      {/* <-- AQUÍ el banner PWA */}
<InstallBanner />

      {/* Resultado (UNA sola tarjeta pro) */}
      {data && !loading && (
        <div style={{ marginTop: 12 }}>
          <ErrorBoundary>
            <BestPickPro data={data} odds={odds} />
          </ErrorBoundary>
        </div>
      )} 

        {/* Resultado (UNA sola tarjeta pro) + barra de acciones */}
        {data && !loading && (
          <>
            {/* Barra de acciones para el pick: Stake */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button
                onClick={() => setStakeOpen(true)}
                style={{
                  ...pill,
                  cursor: "pointer",
                  borderColor: "#22c55e",
                  background: "linear-gradient(135deg,#22c55e55,#16a34a55)",
                  fontWeight: 900,
                }}
                title="Calcular stake con Kelly"
              >
                💰 Stake
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <ErrorBoundary>
                <BestPickPro data={data} odds={odds} />
              </ErrorBoundary>
            </div>
          </>
        )}

        {/* Modal de Stake */}
        {stakeDefaults && (
          <StakeModal
            open={stakeOpen}
            onClose={() => setStakeOpen(false)}
            matchLabel={stakeDefaults.matchLabel}
            market={stakeDefaults.humanMarket}
            selection={stakeDefaults.humanSelection}
            defaultProb01={stakeDefaults.prob01}
            defaultOdd={stakeDefaults.odd}
          />
        )}
      </div>
    </div>
  );
}
