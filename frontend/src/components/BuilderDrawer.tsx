// src/components/BuilderDrawer.tsx
import { useEffect, useMemo, useState } from "react";
import TicketCard from "./TicketCard";

type Props = {
  open: boolean;
  onClose: () => void;
  API_BASE: string;
  league: string;
  home: string;
  away: string;
  odds?: Record<string, number | undefined>;
  premiumKey?: string;
};

type ApiLeagues = { leagues: string[] };
type ApiTeams = { teams: string[] };

type BuilderLeg = { market: string; selection: string; prob_pct: number };
type BuilderOut = { legs: BuilderLeg[]; combo_prob_pct: number; summary: string };

const sheet: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.55)",
  backdropFilter: "blur(4px)",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  paddingTop: 24,
  zIndex: 60,
};

const card: React.CSSProperties = {
  width: "min(920px, 96vw)",
  maxHeight: "88vh",
  overflow: "auto",
  background: "rgba(17,24,39,.95)",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 16,
  padding: 18,
  color: "#e5e7eb",
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

const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.12)",
  color: "#d1d5db",
  background: "rgba(255,255,255,.06)",
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

export default function BuilderDrawer({
  open,
  onClose,
  API_BASE,
  league,
  home,
  away,
  odds,
  premiumKey,
}: Props) {
  const [leagues, setLeagues] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);

  const [selLeague, setSelLeague] = useState(league || "");
  const [selHome, setSelHome] = useState(home || "");
  const [selAway, setSelAway] = useState(away || "");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<BuilderOut | null>(null);

  // Al abrir, precargar listas y seed de props
  useEffect(() => {
    if (!open) return;
    setSelLeague(league || "");
    setSelHome(home || "");
    setSelAway(away || "");
    setResult(null);
    setErr("");

    fetch(`${API_BASE}/leagues`)
      .then((r) => r.json())
      .then((d: ApiLeagues) => setLeagues(d.leagues ?? []))
      .catch(() => setLeagues([]));
  }, [open, API_BASE, league, home, away]);

  // Cargar equipos cuando cambia la liga
  useEffect(() => {
    setTeams([]);
    if (!selLeague) return;
    fetch(`${API_BASE}/teams?league=${encodeURIComponent(selLeague)}`)
      .then((r) => r.json())
      .then((d: ApiTeams) => setTeams(d.teams ?? []))
      .catch(() => setTeams([]));
  }, [selLeague, API_BASE]);

  const canBuild = selLeague && selHome && selAway && selHome !== selAway;

  const filteredHome = useMemo(
    () => teams.filter((t) => t.toLowerCase().includes(selHome.toLowerCase())),
    [teams, selHome]
  );
  const filteredAway = useMemo(
    () => teams.filter((t) => t.toLowerCase().includes(selAway.toLowerCase())),
    [teams, selAway]
  );

  async function onBuild() {
    if (!canBuild) return;
    setLoading(true);
    setErr("");
    setResult(null);
    try {
      const trimmedKey = premiumKey?.trim() || "";

      const body: any = {
        league: selLeague,
        home_team: selHome,
        away_team: selAway,
        ...(trimmedKey ? { premium_key: trimmedKey } : {}),
      };
      if (odds && Object.keys(odds).length) body.odds = odds;

      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (trimmedKey) (headers as any)["X-Premium-Key"] = trimmedKey;

      const res = await fetch(`${API_BASE}/builder/suggest`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(await res.text());
      const json: BuilderOut = await res.json();
      setResult(json);
    } catch (e: any) {
      setErr(e?.message || "No pude generar la selección.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div style={sheet} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: 900,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            🎯 Generador de selección
          </div>
          <button onClick={onClose} style={pill}>
            Cerrar ✕
          </button>
        </div>

        {/* Form */}
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <div style={label}>Liga</div>
            <select
              value={selLeague}
              onChange={(e) => setSelLeague(e.target.value)}
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
              style={input}
              list="builder_home_list"
              value={selHome}
              onChange={(e) => setSelHome(e.target.value)}
              placeholder="Local"
            />
            <datalist id="builder_home_list">
              {filteredHome.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>

          <div>
            <div style={label}>Equipo visitante</div>
            <input
              style={input}
              list="builder_away_list"
              value={selAway}
              onChange={(e) => setSelAway(e.target.value)}
              placeholder="Visitante"
            />
            <datalist id="builder_away_list">
              {filteredAway.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        </div>

        {/* Actions */}
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            marginTop: 14,
          }}
        >
          <button
            onClick={onBuild}
            disabled={!canBuild || loading}
            style={{
              ...btnPrimary,
              opacity: !canBuild || loading ? 0.6 : 1,
              cursor: !canBuild || loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Generando…" : "Generar selección"}
          </button>
          <div style={pill}>Usando cuotas del partido (si existen)</div>
        </div>

        {/* Error */}
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

        {/* Resultado */}
        {result && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>
              Selección sugerida
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {result.legs.map((leg, i) => (
                <div key={i} style={{ marginTop: 8 }}>
                  <TicketCard
                    title={leg.market}
                    subtitle={leg.selection}
                    probPct={leg.prob_pct}
                  />
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 12,
                background: "rgba(255,255,255,.06)",
                border: "1px solid rgba(255,255,255,.12)",
                borderRadius: 12,
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 900 }}>Probabilidad combinada</div>
              <div style={{ marginTop: 6, fontSize: 18, fontWeight: 900 }}>
                {result.combo_prob_pct.toFixed(2)}%
              </div>
              <div style={{ opacity: 0.9, marginTop: 4 }}>{result.summary}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
