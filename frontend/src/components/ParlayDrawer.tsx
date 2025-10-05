// src/components/ParlayDrawer.tsx
import { useEffect, useState } from "react";

type ApiLeagues = { leagues: string[] };
type ApiTeams = { teams: string[] };

type Odds = { "1"?: number; X?: number; "2"?: number; O2_5?: number; BTTS_YES?: number };

type Leg = {
  league: string;
  teams: string[];
  home: string;
  away: string;
  odds: Odds;
};

type BestPick = { market: string; selection: string; prob_pct: number; confidence: number };
type ParlayLegOut = {
  league: string;
  home_team: string;
  away_team: string;
  pick: BestPick;
  probs: Record<string, number>;
  used_odd?: number;
  fair_prob_pct: number;
  ev?: number;
};
type ParlayOut = {
  legs: ParlayLegOut[];
  combined_prob_pct: number;
  combined_fair_odds: number;
  combined_used_odds?: number;
  combined_ev?: number;
  summary: string;
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

const input: React.CSSProperties = {
  width: "100%",
  background: "#0f172a",
  color: "white",
  border: "1px solid rgba(255,255,255,.18)",
  borderRadius: 12,
  padding: "12px 14px",
  outline: "none",
};

const panel: React.CSSProperties = {
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 16,
  padding: 14,
};

const pct = (n?: number) => (n == null || Number.isNaN(n) ? "—" : `${(+n).toFixed(2)}%`);
const fmt2 = (n?: number) => (n == null || Number.isNaN(n) ? "—" : (+n).toFixed(2));
const toFloat = (v: any) => {
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v).replace(",", ".").trim();
  const x = Number(s);
  return Number.isFinite(x) ? x : undefined;
};

export default function ParlayDrawer({
  open,
  onClose,
  API_BASE,
  isPremium,
  premiumKey,
}: {
  open: boolean;
  onClose: () => void;
  API_BASE: string;
  isPremium?: boolean;       // controla UI/limitaciones
  premiumKey?: string;       // header para el backend
}) {
  // Si no te pasan isPremium, lo inferimos de la existencia de premiumKey
  const premium = isPremium ?? !!premiumKey;

  const [leagues, setLeagues] = useState<string[]>([]);
  const [legs, setLegs] = useState<Leg[]>(
    Array.from({ length: 4 }, () => ({ league: "", teams: [], home: "", away: "", odds: {} }))
  );
  const [loading, setLoading] = useState(false);
  const [out, setOut] = useState<ParlayOut | null>(null);
  const [err, setErr] = useState("");

  // Helper para añadir header X-Premium-Key en fetch
  const withKey = (headers?: HeadersInit): HeadersInit =>
    premiumKey ? { ...(headers || {}), "X-Premium-Key": premiumKey } : headers || {};

  useEffect(() => {
    if (!open) return;
    fetch(`${API_BASE}/leagues`, { headers: withKey() })
      .then((r) => r.json())
      .then((d: ApiLeagues) => setLeagues(d.leagues ?? []))
      .catch(() => setLeagues([]));
  }, [open, API_BASE, premiumKey]);

  async function onLeagueChange(i: number, league: string) {
    patch(i, { league, home: "", away: "", teams: [] });
    if (!league) return;
    try {
      const r = await fetch(`${API_BASE}/teams?league=${encodeURIComponent(league)}`, {
        headers: withKey(),
      });
      const d: ApiTeams = await r.json();
      patch(i, { teams: d.teams ?? [] });
    } catch {}
  }

  function patch(i: number, p: Partial<Leg>) {
    setLegs((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...p };
      return next;
    });
  }

  function removeLeg(i: number) {
    setLegs((prev) =>
      prev
        .filter((_, idx) => idx !== i)
        .concat([{ league: "", teams: [], home: "", away: "", odds: {} }])
        .slice(0, 4)
    );
  }

  async function generate() {
    setLoading(true);
    setErr("");
    setOut(null);
    try {
      const payload = {
        legs: legs
          .filter((L) => L.league && L.home && L.away)
          .slice(0, 4)
          .map((L) => ({
            league: L.league,
            home_team: L.home,
            away_team: L.away,
            odds: L.odds,
          })),
      };
      if (payload.legs.length < 2) {
        setErr("Agrega al menos 2 partidos.");
        setLoading(false);
        return;
      }
      const r = await fetch(`${API_BASE}/parlay/suggest`, {
        method: "POST",
        headers: withKey({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await r.text());
      const j: ParlayOut = await r.json();
      setOut(j);
    } catch (e: any) {
      setErr(e?.message || "Error al generar parley");
    } finally {
      setLoading(false);
    }
  }
  async function startCheckout(price_id: string) {
  const r = await fetch(`${API_BASE}/create-checkout-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ price_id, user_email: "" }) // el email es opcional
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.detail || "Error al crear sesión");
  window.location.assign(j.session_url);
}


  return (
    <>
      {/* overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: open ? "rgba(0,0,0,.45)" : "transparent",
          pointerEvents: open ? "auto" : "none",
          transition: "background .25s",
          zIndex: 70,
        }}
      />
      {/* drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100%",
          width: "min(560px,95vw)",
          background: "#0b1020",
          borderLeft: "1px solid rgba(255,255,255,.12)",
          transform: open ? "translateX(0)" : "translateX(110%)",
          transition: "transform .25s",
          zIndex: 80,
          padding: 16,
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>⚡ Generador de Parley {premium ? "Premium" : ""}</div>
          <button onClick={onClose} style={{ ...pill, cursor: "pointer" }}>
            ✕ Cerrar
          </button>
        </div>

        {!premium && (
          <div style={{ ...panel, marginBottom: 10, borderColor: "rgba(234,179,8,.4)" }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Sección Premium</div>
            <div>Desbloquea para usar IA en hasta 4 selecciones y ver EV del parley.</div>
            <div style={{ marginTop: 8 }}>
              <a href="#" style={{ color: "#a5b4fc", textDecoration: "underline" }}>
                Más info
              </a>
            </div>
          </div>
        )}

        {/* legs */}
        {legs.map((L, i) => {
          const filteredHome = L.teams.filter((t) => t.toLowerCase().includes(L.home.toLowerCase()));
          const filteredAway = L.teams.filter((t) => t.toLowerCase().includes(L.away.toLowerCase()));
          return (
            <div key={i} style={{ ...panel, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 800 }}>Partido #{i + 1}</div>
                <button onClick={() => removeLeg(i)} style={{ ...pill, cursor: "pointer" }}>
                  Eliminar
                </button>
              </div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr 1fr" }}>
                <div>
                  <div style={{ color: "#a5b4fc", fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Liga</div>
                  <select value={L.league} onChange={(e) => onLeagueChange(i, e.target.value)} style={input}>
                    <option value="">— Selecciona liga —</option>
                    {leagues.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{ color: "#a5b4fc", fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Local</div>
                  <input
                    list={`home_${i}`}
                    value={L.home}
                    onChange={(e) => patch(i, { home: e.target.value })}
                    style={input}
                    placeholder="Escribe para buscar…"
                  />
                  <datalist id={`home_${i}`}>{filteredHome.map((t) => <option key={t} value={t} />)}</datalist>
                </div>
                <div>
                  <div style={{ color: "#a5b4fc", fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Visitante</div>
                  <input
                    list={`away_${i}`}
                    value={L.away}
                    onChange={(e) => patch(i, { away: e.target.value })}
                    style={input}
                    placeholder="Escribe para buscar…"
                  />
                  <datalist id={`away_${i}`}>{filteredAway.map((t) => <option key={t} value={t} />)}</datalist>
                </div>
              </div>

              {/* cuotas opcionales */}
              <div style={{ marginTop: 10, display: "grid", gap: 10, gridTemplateColumns: "repeat(5,1fr)" }}>
                {(["1", "X", "2", "O2_5", "BTTS_YES"] as (keyof Odds)[]).map((k, idx) => (
                  <div key={idx}>
                    <div style={{ color: "#a5b4fc", fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
                      {k === "1"
                        ? "1 (Local)"
                        : k === "X"
                        ? "X (Empate)"
                        : k === "2"
                        ? "2 (Visitante)"
                        : k === "O2_5"
                        ? "Más de 2.5"
                        : "BTTS Sí"}
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={k === "O2_5" || k === "BTTS_YES" ? "1.95" : idx === 1 ? "3.30" : "2.10"}
                      value={L.odds[k] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        const num = toFloat(v);
                        patch(i, { odds: { ...L.odds, [k]: num } });
                      }}
                      style={input}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button
            onClick={generate}
            disabled={loading}
            style={{
              ...pill,
              cursor: "pointer",
              borderColor: "#7c3aed",
              background: "linear-gradient(135deg,#7c3aed55,#5b21b655)",
            }}
          >
            {loading ? "Generando…" : "⚙️ Generar con IA"}
          </button>
          <button onClick={() => setOut(null)} style={{ ...pill, cursor: "pointer" }}>
            Limpiar resultado
          </button>
        </div>

        {/* salida */}
        {err && (
          <div
            style={{
              marginTop: 10,
              color: "#fecaca",
              border: "1px solid rgba(239,68,68,.35)",
              padding: 10,
              borderRadius: 12,
            }}
          >
            {err}
          </div>
        )}

        {out && (
          <div style={{ ...panel, marginTop: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Resultado del Parley</div>
            {out.legs.map((L, idx) => (
              <div
                key={idx}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  background: "rgba(255,255,255,.04)",
                  border: "1px solid rgba(255,255,255,.08)",
                  marginBottom: 8,
                }}
              >
                <div style={{ fontWeight: 800 }}>
                  {L.home_team} vs {L.away_team} — {L.league}
                </div>
                <div style={{ marginTop: 4 }}>
                  Pick:{" "}
                  <b>
                    {L.pick.market === "1X2"
                      ? L.pick.selection === "1"
                        ? "Gana local"
                        : L.pick.selection === "2"
                        ? "Gana visitante"
                        : "Empate"
                      : L.pick.market === "Over 2.5"
                      ? "Más de 2.5 goles"
                      : L.pick.market === "BTTS"
                      ? "Ambos anotan (Sí)"
                      : `${L.pick.market} — ${L.pick.selection}`}
                  </b>
                  {" · Prob: "}<b>{pct(L.pick.prob_pct)}</b>
                  {" · Cuota usada: "}<b>{L.used_odd ?? "—"}</b>
                  {L.ev != null && (
                    <>
                      {" · EV: "} <b>{fmt2(L.ev)}</b>
                    </>
                  )}
                </div>
              </div>
            ))}
            <div style={{ marginTop: 10, display: "grid", gap: 10, gridTemplateColumns: "repeat(2,1fr)" }}>
              <div style={pill}>
                Prob. combinada: <b style={{ marginLeft: 6 }}>{pct(out.combined_prob_pct)}</b>
              </div>
              <div style={pill}>
                Cuota justa: <b style={{ marginLeft: 6 }}>{fmt2(out.combined_fair_odds)}</b>
              </div>
              <div style={pill}>
                Cuota parley (ingresada): <b style={{ marginLeft: 6 }}>{out.combined_used_odds ?? "—"}</b>
              </div>
              <div style={pill}>
                EV parley:{" "}
                <b style={{ marginLeft: 6 }}>{out.combined_ev != null ? fmt2(out.combined_ev) : "—"}</b>
              </div>
            </div>
            <div style={{ marginTop: 10, opacity: 0.85 }}>{out.summary}</div>
          </div>
        )}
      </div>
    </>
  );
}
