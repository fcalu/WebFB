// src/components/BuilderDrawer.tsx
import { useEffect, useState } from "react";

type Odds = { "1"?: number; X?: number; "2"?: number; O2_5?: number; BTTS_YES?: number };

type Props = {
  open: boolean;
  onClose: () => void;
  API_BASE: string;
  league?: string;
  home?: string;
  away?: string;
  odds?: Odds; // se enviarán si existen (no es obligatorio)
};

type BuilderPick = { text: string; prob_pct: number };
type BuilderOut = {
  picks: BuilderPick[];
  combined_prob_pct: number;
  combined_fair_odds: number;
  summary: string;
};

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.4)",
  backdropFilter: "blur(2px)",
  zIndex: 50,
};

const drawer: React.CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  height: "100%",
  width: "min(520px, 100vw)",
  background: "rgba(17,24,39,.98)",
  color: "#e5e7eb",
  borderLeft: "1px solid rgba(255,255,255,.15)",
  zIndex: 51,
  display: "flex",
  flexDirection: "column",
};

const header: React.CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid rgba(255,255,255,.12)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const body: React.CSSProperties = {
  padding: 14,
  overflow: "auto",
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

const label: React.CSSProperties = {
  color: "#a5b4fc",
  fontSize: 12,
  marginBottom: 6,
  fontWeight: 800,
  letterSpacing: 0.3,
};

const btn: React.CSSProperties = {
  background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
  color: "white",
  border: "none",
  borderRadius: 14,
  padding: "12px 16px",
  fontWeight: 900,
  cursor: "pointer",
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

export default function BuilderDrawer({
  open,
  onClose,
  API_BASE,
  league: leagueProp,
  home: homeProp,
  away: awayProp,
  odds,
}: Props) {
  const [league, setLeague] = useState(leagueProp ?? "");
  const [home, setHome] = useState(homeProp ?? "");
  const [away, setAway] = useState(awayProp ?? "");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<BuilderOut | null>(null);

  useEffect(() => {
    if (open) {
      setLeague(leagueProp ?? "");
      setHome(homeProp ?? "");
      setAway(awayProp ?? "");
      setErr("");
      setResult(null);
    }
  }, [open, leagueProp, homeProp, awayProp]);

  const canGenerate = league && home && away && home !== away;

  async function onGenerate() {
    if (!canGenerate || loading) return;
    setLoading(true);
    setErr("");
    setResult(null);

    try {
      // <<<<<<<<<<<<<<<<<<<<<<<<<<<< AQUÍ va el fetch >>>>>>>>>>>>>>>>>>>>>>>>>>>>
      const body = { league, home_team: home, away_team: away, odds };
      const res = await fetch(`${API_BASE}/builder/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const json: BuilderOut = await res.json();
      setResult(json);
    } catch (e: any) {
      setErr(e?.message || "Error al generar la selección.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div style={overlay} onClick={onClose} />
      <div style={drawer}>
        <div style={header}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>🎯 Generador de selección</div>
          <button onClick={onClose} style={{ ...pill, cursor: "pointer" }}>Cerrar ✕</button>
        </div>

        <div style={body}>
          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <div style={label}>Liga</div>
              <input
                style={input}
                placeholder="Ej: La Liga / Premier League / ChampionsLegue"
                value={league}
                onChange={(e) => setLeague(e.target.value)}
              />
            </div>
            <div>
              <div style={label}>Equipo local</div>
              <input
                style={input}
                placeholder="Local"
                value={home}
                onChange={(e) => setHome(e.target.value)}
              />
            </div>
            <div>
              <div style={label}>Equipo visitante</div>
              <input
                style={input}
                placeholder="Visitante"
                value={away}
                onChange={(e) => setAway(e.target.value)}
              />
            </div>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button
              onClick={onGenerate}
              disabled={!canGenerate || loading}
              style={{ ...btn, opacity: !canGenerate || loading ? 0.6 : 1 }}
            >
              {loading ? "Generando…" : "Generar selección"}
            </button>
            {odds && <div style={pill}>Usando cuotas del partido (si existen)</div>}
          </div>

          {err && (
            <div
              style={{
                background: "rgba(239,68,68,.12)",
                border: "1px solid rgba(239,68,68,.35)",
                padding: 10,
                borderRadius: 10,
                marginTop: 12,
                color: "#fecaca",
              }}
            >
              {err}
            </div>
          )}

          {result && (
            <div
              style={{
                marginTop: 14,
                background: "rgba(255,255,255,.05)",
                border: "1px solid rgba(255,255,255,.10)",
                borderRadius: 14,
                padding: 12,
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Selección sugerida</div>

              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {result.picks.map((p, idx) => (
                  <li key={idx} style={{ marginBottom: 6 }}>
                    {p.text} · <b>{p.prob_pct.toFixed(2)}%</b>
                  </li>
                ))}
              </ul>

              <div style={{ marginTop: 10 }}>
                Prob. combinada: <b>{result.combined_prob_pct.toFixed(2)}%</b> ·
                Cuota justa: <b>{Number.isFinite(result.combined_fair_odds) ? result.combined_fair_odds : "∞"}</b>
              </div>

              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                {result.summary}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
