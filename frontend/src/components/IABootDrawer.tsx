import { useEffect, useMemo, useState } from "react";

/** Ajusta si ya tienes este tipo exportado en otro archivo */
type Odds = { "1"?: number; X?: number; "2"?: number; O2_5?: number; BTTS_YES?: number };

type Props = {
  open: boolean;
  onClose: () => void;
  API_BASE: string;
  league?: string;
  home?: string;
  away?: string;
  odds?: Odds;
};

type ApiLeagues = { leagues: string[] };
type ApiTeams = { teams: string[] };

// Respuesta flexible del backend de IA Boot (Debe coincidir con IABootOut de Python)
type IAPick = { market: string; selection: string; prob_pct?: number; confidence?: number; rationale?: string };
type IABootResponse =
  | {
      summary?: string;
      explanation?: string;
      picks?: IAPick[];
      combined_prob_pct?: number;
      combined_fair_odds?: number;
      raw_text?: string; // por si decides devolver un texto libre
    }
  | any;

const sheet: React.CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  width: "min(680px, 100%)",
  background: "#0b1220",
  borderLeft: "1px solid rgba(255,255,255,.08)",
  zIndex: 60,
  boxShadow: "0 10px 30px rgba(0,0,0,.45)",
  transform: "translateX(0)",
  transition: "transform .25s ease",
  overflow: "hidden",
};

const head: React.CSSProperties = {
  padding: "14px 16px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  borderBottom: "1px solid rgba(255,255,255,.08)",
  background: "rgba(255,255,255,.02)",
};

const title: React.CSSProperties = { fontSize: 22, fontWeight: 900, display: "flex", gap: 8, alignItems: "center" };

const body: React.CSSProperties = { padding: 16, height: "100%", overflow: "auto" };

const input: React.CSSProperties = {
  width: "100%",
  background: "#0f172a",
  color: "white",
  border: "1px solid rgba(255,255,255,.18)",
  borderRadius: 12,
  padding: "12px 14px",
  outline: "none",
};

const label: React.CSSProperties = { color: "#a5b4fc", fontSize: 12, marginBottom: 6, fontWeight: 800, letterSpacing: 0.3 };

const btnPrimary: React.CSSProperties = {
  background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
  color: "white",
  border: "none",
  borderRadius: 14,
  padding: "14px 18px",
  fontWeight: 900,
  fontSize: 16,
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 16,
  padding: 14,
};

export default function IABootDrawer({ open, onClose, API_BASE, league, home, away, odds }: Props) {
  const [leagues, setLeagues] = useState<string[]>([]);
  const [leagueSel, setLeagueSel] = useState<string>(league || "");
  const [teams, setTeams] = useState<string[]>([]);
  const [homeSel, setHomeSel] = useState<string>(home || "");
  const [awaySel, setAwaySel] = useState<string>(away || "");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");
  const [resp, setResp] = useState<IABootResponse | null>(null);

  // Al abrir, carga ligas y pre-llena con props
  useEffect(() => {
    if (!open) return;
    setErr("");
    setResp(null);
    // precargar valores desde props
    setLeagueSel(league || "");
    setHomeSel(home || "");
    setAwaySel(away || "");
    // cargar ligas
    fetch(`${API_BASE}/leagues`)
      .then((r) => r.json())
      .then((d: ApiLeagues) => setLeagues(d.leagues ?? []))
      .catch(() => setLeagues([]));
  }, [open, API_BASE, league, home, away]);

  // Cuando cambia la liga seleccionada, carga equipos
  useEffect(() => {
    if (!leagueSel) {
      setTeams([]);
      setHomeSel("");
      setAwaySel("");
      return;
    }
    fetch(`${API_BASE}/teams?league=${encodeURIComponent(leagueSel)}`)
      .then((r) => r.json())
      .then((d: ApiTeams) => setTeams(d.teams ?? []))
      .catch(() => setTeams([]));
  }, [leagueSel, API_BASE]);

  const filteredHome = useMemo(
    () => teams.filter((t) => t.toLowerCase().includes(homeSel.toLowerCase())),
    [teams, homeSel]
  );
  const filteredAway = useMemo(
    () => teams.filter((t) => t.toLowerCase().includes(awaySel.toLowerCase())),
    [teams, awaySel]
  );

  const canRun = leagueSel && homeSel && awaySel && homeSel !== awaySel;

  async function onRunIA() {
    if (!canRun) return;
    setLoading(true);
    setErr("");
    setResp(null);
    try {
      // Llama a tu endpoint del backend (no al API de OpenAI desde el browser)
      const body: any = {
        league: leagueSel,
        home_team: homeSel,
        away_team: awaySel,
      };
      if (odds && (odds["1"] || odds.X || odds["2"] || odds.O2_5 || odds.BTTS_YES)) body.odds = odds;

      const r = await fetch(`${API_BASE}/iaboot/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      const j: IABootResponse = await r.json();
      setResp(j);
    } catch (e: any) {
      // Si el error es una excepción lanzada por ValueError en el backend:
      if (e?.message && e.message.includes("AI returned non-parseable JSON")) {
         setErr("Error: La IA devolvió un formato incorrecto. Intenta de nuevo.");
      } else {
         setErr(e?.message || "Error generando IA Boot.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div style={sheet} role="dialog" aria-modal>
      <div style={head}>
        <div style={title}>🤖 <span>Predicción IA Boot</span></div>
        <button
          onClick={onClose}
          style={{
            border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(255,255,255,.06)",
            color: "#e5e7eb",
            borderRadius: 12,
            padding: "8px 12px",
            cursor: "pointer",
          }}
        >
          Cerrar ✕
        </button>
      </div>

      <div style={body}>
        {/* Selección de liga/equipos */}
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr" }}>
          <div>
            <div style={label}>Liga</div>
            <select value={leagueSel} onChange={(e) => setLeagueSel(e.target.value)} style={input}>
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
              value={homeSel}
              onChange={(e) => setHomeSel(e.target.value)}
              list="ia_home_list"
              style={input}
            />
            <datalist id="ia_home_list">
              {filteredHome.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>

          <div>
            <div style={label}>Equipo visitante</div>
            <input
              placeholder="Escribe para buscar…"
              value={awaySel}
              onChange={(e) => setAwaySel(e.target.value)}
              list="ia_away_list"
              style={input}
            />
            <datalist id="ia_away_list">
              {filteredAway.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        </div>

        <div style={{ height: 12 }} />

        <button
          onClick={onRunIA}
          disabled={!canRun || loading}
          style={{ ...btnPrimary, opacity: !canRun || loading ? 0.6 : 1, cursor: !canRun || loading ? "not-allowed" : "pointer" }}
        >
          {loading ? "Generando…" : "Generar con IA"}
        </button>

        {err && (
          <div
            style={{
              marginTop: 12,
              background: "rgba(239,68,68,.12)",
              border: "1px solid rgba(239,68,68,.35)",
              padding: 12,
              borderRadius: 12,
              color: "#fecaca",
            }}
          >
            {err}
          </div>
        )}

        {/* ========================================================= */}
        {/* === RESULTADO (DISEÑO PROFESIONAL) === */}
        {/* ========================================================= */}
        {resp && (
          <div style={{ marginTop: 14 }}>
            {/* Título / Resumen General - Tarjeta Destacada */}
            {(resp.summary || resp.explanation) && (
              <div 
                style={{ 
                  ...card, 
                  marginBottom: 16,
                  background: "rgba(124,58,237, 0.15)", // Fondo sutil del color principal
                  border: "1px solid rgba(124,58,237, 0.5)",
                }}
              >
                <div style={{ color: "#a5b4fc", fontWeight: 800, fontSize: 13, marginBottom: 8, letterSpacing: 0.5 }}>
                  ANÁLISIS COMPLETO (IA BOOT)
                </div>
                <div style={{ fontSize: 16, lineHeight: 1.6, opacity: 0.95, color: '#f3f4f6' }}>
                  {/* El summary va aquí, con un tamaño y espaciado mejorado */}
                  {resp.summary || resp.explanation}
                </div>
              </div>
            )}

            {/* Lista de Picks Detallados - Tarjetas Individuales */}
            {Array.isArray(resp?.picks) && resp.picks.length > 0 ? (
              <div style={{ display: "grid", gap: 14 }}>
                {resp.picks.map((p: IAPick, i: number) => {
                  // Usamos 'confidence' si existe, sino usamos 'prob_pct'
                  const score = p.confidence ?? p.prob_pct ?? 0;
                  const displayProb = p.prob_pct ?? 0;
                  
                  // Determinar color de confianza (Alto > 75%, Medio > 60%, Bajo)
                  const confidenceColor = score >= 75 
                    ? "#22c55e" // Verde (High conviction)
                    : score >= 60 
                    ? "#facc15" // Amarillo (Medium conviction)
                    : "#fb7185"; // Rojo/Rosado (Lower conviction)
                  
                  return (
                    <div
                      key={i}
                      style={{ 
                        ...card, 
                        padding: 16, 
                        borderLeft: `4px solid ${confidenceColor}`, 
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      
                      {/* TOP LINE: PICK NAME AND PROBABILITY */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {/* Market & Selection */}
                        <div style={{ fontWeight: 900, fontSize: 16 }}>
                          {p.market} — <span style={{ color: confidenceColor }}>{p.selection}</span>
                        </div>
                        
                        {/* Probability */}
                        {typeof p.prob_pct === "number" && (
                          <div style={{ fontWeight: 900, fontSize: 17, color: '#e5e7eb' }}>
                            {displayProb.toFixed(2)}%
                          </div>
                        )}
                      </div>
                      
                      {/* BOTTOM LINE: RATIONALE */}
                      {p.rationale && (
                        <div style={{ 
                          opacity: 0.8, 
                          fontSize: 13, 
                          color: '#9ca3af' // Gris sutil para la explicación
                        }}>
                          {p.rationale}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* Texto crudo si el backend devuelve raw_text */}
            {resp.raw_text && (
              <div style={{ ...card, marginTop: 12, whiteSpace: "pre-wrap", opacity: 0.95 }}>{resp.raw_text}</div>
            )}

            {/* Métricas de combo si existen */}
            {typeof resp.combined_prob_pct === "number" && (
              <div style={{ ...card, marginTop: 12, fontWeight: 800 }}>
                Prob. combinada: {resp.combined_prob_pct.toFixed(2)}%
                {typeof resp.combined_fair_odds === "number" && (
                  <> · Cuota justa ~ {resp.combined_fair_odds}</>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}