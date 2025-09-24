// src/App.tsx
import { useEffect, useMemo, useState } from "react";
import { Trophy, Copy, Info, TrendingUp, Sparkles, ShieldCheck } from "lucide-react";

type ApiLeagues = { leagues: string[] };
type ApiTeams = { teams: string[] };

type BestPick = {
  market: string;
  selection: string;
  prob_pct: number;     // 0-100
  confidence: number;   // 0-100
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
  };
  poisson: {
    home_lambda: number;
    away_lambda: number;
    top_scorelines: { score: string; pct: number }[];
  };
  best_pick: BestPick;
  summary: string;
};

const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:8000";

function pct(n: number | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(+n).toFixed(2)}%`;
}

function oddsTarget(probPct: number) {
  // “Cuota mínima sugerida” (decimal) ≈ 1 / (p * margen)
  // margen 0.92 => pedimos ~8% de edge frente a prob. estimada
  const p = Math.max(0.0001, probPct / 100);
  const o = 1 / (p * 0.92);
  return o < 1.01 ? "—" : o.toFixed(2);
}

function riskTag(probPct: number) {
  if (probPct >= 65) return { label: "Riesgo: bajo", color: "#10b981" };     // verde
  if (probPct >= 55) return { label: "Riesgo: medio", color: "#f59e0b" };    // ámbar
  return { label: "Riesgo: alto", color: "#ef4444" };                         // rojo
}

function Bar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div style={{ background: "#1f2937", borderRadius: 999, height: 10, width: "100%" }}>
      <div
        style={{
          width: `${v}%`,
          height: "100%",
          borderRadius: 999,
          background:
            "linear-gradient(90deg, #a855f7 0%, #6366f1 50%, #06b6d4 100%)",
          transition: "width .25s ease",
        }}
      />
    </div>
  );
}

function BestBetCard({
  data,
  simple,
}: {
  data: PredictResponse;
  simple: boolean;
}) {
  const pick = data.best_pick;
  const risk = riskTag(pick.prob_pct);
  const odds = oddsTarget(pick.prob_pct);

  const copyText = `${data.league} | ${data.home_team} vs ${data.away_team}
Apuesta recomendada: ${pick.market} — ${pick.selection}
Confianza: ${pick.confidence.toFixed(0)}% | Cuota mínima sugerida: ${odds}`;

  const top3 = (data.poisson?.top_scorelines ?? []).slice(0, 3);

  return (
    <div
      style={{
        borderRadius: 24,
        padding: 20,
        background:
          "linear-gradient(135deg, rgba(168,85,247,.12), rgba(99,102,241,.12))",
        border: "1px solid rgba(99,102,241,.25)",
        boxShadow: "0 10px 30px rgba(0,0,0,.25)",
      }}
    >
      {/* Cabecera */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
        <div
          style={{
            width: 40,
            height: 40,
            display: "grid",
            placeItems: "center",
            borderRadius: 12,
            background:
              "linear-gradient(135deg, #8b5cf6 0%, #22d3ee 100%)",
          }}
        >
          <Trophy size={22} color="white" />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#e5e7eb" }}>
            Apuesta recomendada
          </div>
          <div style={{ color: "#9ca3af" }}>
            {data.home_team} vs {data.away_team} · {data.league}
          </div>
        </div>
      </div>

      {/* Selección principal */}
      <div style={{ fontSize: 24, fontWeight: 900, color: "white", margin: "6px 0 2px" }}>
        {pick.market} — {pick.selection}
      </div>

      {/* Probabilidad / confianza / riesgo */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto auto",
          gap: 12,
          alignItems: "center",
          margin: "10px 0 8px",
        }}
      >
        <Bar value={pick.prob_pct} />
        <div style={{ color: "#e5e7eb", fontWeight: 700 }}>{pct(pick.prob_pct)}</div>
        <span
          title="Estimación interna de consistencia del pick"
          style={{
            color: "#e5e7eb",
            padding: "4px 10px",
            borderRadius: 999,
            background: "rgba(17,24,39,.6)",
            border: "1px solid rgba(255,255,255,.08)",
            fontSize: 12,
          }}
        >
          Confianza {Math.round(pick.confidence)}
        </span>
      </div>

      {/* Chips de cuota mínima y riesgo */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div
          title="Usa esta cuota como mínima para que tenga valor esperado."
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(16,185,129,.15)",
            border: "1px solid rgba(16,185,129,.3)",
            color: "#d1fae5",
            padding: "6px 12px",
            borderRadius: 999,
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          <TrendingUp size={16} /> Cuota mínima: {odds}
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(255,255,255,.06)",
            border: `1px solid ${risk.color}55`,
            color: risk.color,
            padding: "6px 12px",
            borderRadius: 999,
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          <ShieldCheck size={16} /> {risk.label}
        </div>
      </div>

      {/* Por qué (versión simple: 2 bullets; experto: todos) */}
      <div style={{ color: "#e5e7eb", fontWeight: 800, marginBottom: 6 }}>¿Por qué?</div>
      <ul style={{ margin: 0, paddingLeft: 18, color: "#c7cdd5", lineHeight: 1.6 }}>
        {(simple ? pick.reasons.slice(0, 2) : pick.reasons).map((r, i) => (
          <li key={i} style={{ marginBottom: 2 }}>{r}</li>
        ))}
        {!simple && top3.length > 0 && (
          <li>
            <span style={{ opacity: .9 }}>
              Top marcadores:{" "}
              {top3.map((t) => `${t.score} (${t.pct}%)`).join(" · ")}
            </span>
          </li>
        )}
      </ul>

      {/* Botones */}
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <button
          onClick={() => navigator.clipboard.writeText(copyText)}
          style={{
            background:
              "linear-gradient(135deg, #7c3aed, #5b21b6)",
            color: "white",
            border: "none",
            borderRadius: 12,
            padding: "10px 16px",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontWeight: 800,
          }}
        >
          <Copy size={18} /> Copiar pick
        </button>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            color: "#9ca3af",
            fontSize: 13,
          }}
        >
          <Info size={16} /> Esto no es asesoría financiera.
        </span>
      </div>
    </div>
  );
}

export default function App() {
  const [leagues, setLeagues] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [league, setLeague] = useState("");
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState<PredictResponse | null>(null);
  const [simple, setSimple] = useState(true);

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

  const filteredHome = useMemo(
    () => teams.filter((t) => t.toLowerCase().includes(home.toLowerCase())),
    [teams, home]
  );
  const filteredAway = useMemo(
    () => teams.filter((t) => t.toLowerCase().includes(away.toLowerCase())),
    [teams, away]
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0b1020", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 18px 80px" }}>
        {/* Header */}
        <header style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              display: "grid", placeItems: "center",
              background: "linear-gradient(135deg, #8b5cf6, #06b6d4)"
            }}>
              <Sparkles size={22} color="white" />
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: .2 }}>
                FootyMines · IA Predictor
              </div>
              <div style={{ color: "#9ca3af" }}>
                Recomendación directa y explicada para el usuario final.
              </div>
            </div>
          </div>

          <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <span style={{ color: "#9ca3af" }}>Modo experto</span>
            <input
              type="checkbox"
              checked={!simple}
              onChange={() => setSimple((s) => !s)}
            />
          </label>
        </header>

        {/* Formulario */}
        <div
          style={{
            background: "rgba(255,255,255,.04)",
            border: "1px solid rgba(255,255,255,.06)",
            borderRadius: 18,
            padding: 16,
            marginBottom: 18,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr auto",
              gap: 12,
            }}
          >
            {/* LIGA */}
            <select
              value={league}
              onChange={(e) => setLeague(e.target.value)}
              style={{
                width: "100%",
                background: "#121829",
                color: "white",
                border: "1px solid rgba(255,255,255,.08)",
                borderRadius: 12,
                padding: "10px 12px",
              }}
            >
              <option value="">— Selecciona liga —</option>
              {leagues.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>

            {/* LOCAL */}
            <div>
              <input
                value={home}
                onChange={(e) => setHome(e.target.value)}
                placeholder="Equipo local"
                list="home_teams"
                style={{
                  width: "100%",
                  background: "#121829",
                  color: "white",
                  border: "1px solid rgba(255,255,255,.08)",
                  borderRadius: 12,
                  padding: "10px 12px",
                }}
              />
              <datalist id="home_teams">
                {filteredHome.map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>

            {/* VISITANTE */}
            <div>
              <input
                value={away}
                onChange={(e) => setAway(e.target.value)}
                placeholder="Equipo visitante"
                list="away_teams"
                style={{
                  width: "100%",
                  background: "#121829",
                  color: "white",
                  border: "1px solid rgba(255,255,255,.08)",
                  borderRadius: 12,
                  padding: "10px 12px",
                }}
              />
              <datalist id="away_teams">
                {filteredAway.map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>

            <button
              onClick={onPredict}
              disabled={!canPredict || loading}
              style={{
                background:
                  "linear-gradient(135deg, #7c3aed, #5b21b6)",
                color: "white",
                border: "none",
                borderRadius: 12,
                padding: "10px 16px",
                fontWeight: 900,
                opacity: !canPredict || loading ? 0.6 : 1,
              }}
            >
              {loading ? "Calculando…" : "Predecir"}
            </button>
          </div>

          {/* Ayuda de validación */}
          {!canPredict && (
            <div style={{ color: "#9ca3af", marginTop: 8 }}>
              Selecciona una liga y ambos equipos (distintos).
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
              marginBottom: 18,
            }}
          >
            {err}
          </div>
        )}

        {/* Resultado simple: una tarjeta clara */}
        {data && (
          <>
            <BestBetCard data={data} simple={simple} />

            {/* Modo experto: mercados clave */}
            {!simple && (
              <div
                style={{
                  marginTop: 18,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
                  gap: 12,
                }}
              >
                <div style={miniCard}>
                  <div style={miniTitle}>1X2</div>
                  <div>1: {pct(data.probs.home_win_pct)}</div>
                  <div>X: {pct(data.probs.draw_pct)}</div>
                  <div>2: {pct(data.probs.away_win_pct)}</div>
                </div>
                <div style={miniCard}>
                  <div style={miniTitle}>Goles</div>
                  <div>Over 2.5: {pct(data.probs.over_2_5_pct)}</div>
                  <div>BTTS Sí: {pct(data.probs.btts_pct)}</div>
                </div>
                <div style={miniCard}>
                  <div style={miniTitle}>Lambdas</div>
                  <div>λ Local: {data.poisson.home_lambda}</div>
                  <div>λ Visitante: {data.poisson.away_lambda}</div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{ marginTop: 28, color: "#6b7280", fontSize: 12 }}>
          *Usa la <b>Cuota mínima</b> como referencia para valorar si hay valor.
          Esta app es informativa; no constituye asesoría financiera.
        </div>
      </div>
    </div>
  );
}

const miniCard: React.CSSProperties = {
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.06)",
  borderRadius: 16,
  padding: 12,
  color: "#c7cdd5",
};

const miniTitle: React.CSSProperties = {
  color: "#e5e7eb",
  fontWeight: 800,
  marginBottom: 6,
};
