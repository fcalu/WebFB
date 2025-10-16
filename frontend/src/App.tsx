import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

// ===============================================
// ===== IN-FILE COMPONENT DEFINITIONS =====
// ===============================================
// To resolve build errors, all components are defined within this single file.

const IntroModal = ({ open, onClose, onGoPremium }: { open: boolean, onClose: () => void, onGoPremium: () => void }) => {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', display: 'grid', placeItems: 'center' }} onClick={onClose}>
      <div style={{ background: '#0b1020', padding: 20, borderRadius: 16, border: '1px solid #334155', maxWidth: 500, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Bienvenido a FootyMines</h2>
        <p>Usa estadísticas avanzadas para obtener predicciones de fútbol claras y accionables.</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #475569', background: '#1e293b', color: 'white', cursor: 'pointer' }}>Explorar Gratis</button>
          <button onClick={onGoPremium} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>🚀 Ir a Premium</button>
        </div>
      </div>
    </div>
  );
};

const BestPickPro = ({ data }: { data: PredictResponse }) => {
  return (
    <div style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.10)', borderRadius: 16, padding: 14 }}>
      <h3 style={{ marginTop: 0 }}>Mejor Selección (PRO)</h3>
      <p><b>Partido:</b> {data.home_team} vs {data.away_team}</p>
      <p><b>Mercado:</b> {data.best_pick.market}</p>
      <p><b>Selección:</b> {data.best_pick.selection}</p>
      <p><b>Probabilidad:</b> {data.best_pick.prob_pct}%</p>
    </div>
  );
};

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  // A simple pass-through; a real implementation would use componentDidCatch
  return <>{children}</>;
};

const ParlayDrawer = ({ open, onClose, isPremium }: { open: boolean, onClose: () => void, isPremium: boolean }) => {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 'min(400px, 90vw)', background: '#0f172a', padding: 16, borderLeft: '1px solid #334155' }} onClick={e => e.stopPropagation()}>
        <h3>Generador de Parley</h3>
        {!isPremium && <p style={{background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.35)', padding: 12, borderRadius: 12, color: '#fecaca'}}>Esta es una función Premium.</p>}
        <p>Aquí puedes construir tus parlays...</p>
      </div>
    </div>
  );
};

const BuilderDrawer = ({ open, onClose, home, away }: { open: boolean, onClose: () => void, home: string, away: string }) => {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 'min(400px, 90vw)', background: '#0f172a', padding: 16, borderLeft: '1px solid #334155' }} onClick={e => e.stopPropagation()}>
        <h3>Generador de Selección</h3>
        <p>Creando una selección para {home || '...'} vs {away || '...'}...</p>
      </div>
    </div>
  );
};

const NavDrawer = ({ open, onClose, onOpenParlay, onOpenBuilder, onOpenHistory, onOpenTopMatches }: { open: boolean, onClose: () => void, onOpenParlay: () => void, onOpenBuilder: () => void, onOpenHistory: () => void, onOpenTopMatches: () => void }) => {
    if (!open) return null;
    const buttonStyle: React.CSSProperties = {
        display: 'block', width: '100%', padding: '15px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: 'white', textAlign: 'left', fontSize: 16, cursor: 'pointer'
    };
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 'min(300px, 80vw)', background: '#0f172a', padding: 16, borderRight: '1px solid #334155' }} onClick={e => e.stopPropagation()}>
                <h3 style={{marginTop: 0}}>Menú</h3>
                <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                    <button style={buttonStyle} onClick={() => { onOpenTopMatches(); onClose(); }}>📅 Partidos del Día</button>
                    <button style={buttonStyle} onClick={() => { onOpenBuilder(); onClose(); }}>🎯 Generador de Selección</button>
                    <button style={buttonStyle} onClick={() => { onOpenParlay(); onClose(); }}>🧮 Parley Inteligente</button>
                    <button style={buttonStyle} onClick={() => { onOpenHistory(); onClose(); }}>📒 Historial</button>
                </div>
            </div>
        </div>
    );
};

const IABootDrawer = ({ open, onClose }: { open: boolean, onClose: () => void }) => {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 'min(400px, 90vw)', background: '#0f172a', padding: 16, borderLeft: '1px solid #334155' }} onClick={e => e.stopPropagation()}>
        <h3>🤖 IA Boot</h3>
        <p>Análisis profundo del partido con IA.</p>
      </div>
    </div>
  );
};

const InstallBanner = () => { /* Placeholder */ return null; };

const StakeModal = ({ open, onClose, matchLabel, market, selection }: { open: boolean, onClose: () => void, matchLabel: string, market: string, selection: string }) => {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', display: 'grid', placeItems: 'center' }} onClick={onClose}>
      <div style={{ background: '#0b1020', padding: 20, borderRadius: 16, border: '1px solid #334155', maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <h3 style={{marginTop: 0}}>Calcular Stake (Kelly)</h3>
        <p><b>Partido:</b> {matchLabel}</p>
        <p><b>Selección:</b> {market} - {selection}</p>
        {/* Kelly Criterion calculation form would go here */}
      </div>
    </div>
  );
};

const BetHistoryDrawer = ({ open, onClose }: { open: boolean, onClose: () => void }) => {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 'min(400px, 90vw)', background: '#0f172a', padding: 16, borderLeft: '1px solid #334155' }} onClick={e => e.stopPropagation()}>
        <h3>📒 Historial de Apuestas</h3>
        <p>Tus predicciones guardadas aparecerán aquí.</p>
      </div>
    </div>
  );
};


/* ===== Tipos ===== */
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
    market: "1X2" | "Over 2.5" | "BTTS" | string;
    selection: "1" | "X" | "2" | "Sí" | "No" | string;
    prob_pct: number;
    confidence: number;
    reasons: string[];
  };
  summary: string;
  debug?: Record<string, unknown>;
};

// NUEVOS TIPOS PARA TOP MATCHES
type TopMatch = {
  home: string;
  away: string;
  competition: string;
  country: string;
  kickoff_local: string;
  kickoff_utc: string;
  tv_mexico?: string;
  importance_score?: number;
  rationale?: string;
  sources: string[];
};

type TopMatchesResponse = {
  date: string;
  timezone: string;
  matches: TopMatch[];
};


type Odds = { "1"?: number; X?: number; "2"?: number; O2_5?: number; BTTS_YES?: number };
type RawOdds = { "1"?: string; X?: string; "2"?: string; O2_5?: string; BTTS_YES?: string };

type SubscriptionState = {
  active: boolean;
  status?: string | null;
  plan?: string | null;
  price_id?: string | null;
  current_period_end?: number | null;
  premium_key?: string | null;
  email?: string | null;
};

function planFromPriceId(price?: string | null) {
  if (!price) return null;
  const p = String(price).toLowerCase();
  if (p.includes("week") || p.includes("semana")) return "Semanal";
  if (p.includes("month") || p.includes("mensual")) return "Mensual";
  if (p.includes("year") || p.includes("anual")) return "Anual";
  return null;
}

// FIX: Replaced import.meta which is not available in the target environment
const LABEL_WEEKLY  = "Semanal   $70.00";
const LABEL_MONTHLY = "Mensual   $130.00";
const LABEL_YEARLY  = "Anual     $1199.00";

/* ===== Config (entorno) ===== */
const API_BASE: string =
  (typeof window !== "undefined" && (window as any).__API_BASE__) ||
  "http://localhost:8000";

/* ===== Helpers ===== */
const toFloat = (v: unknown) => {
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v).replace(",", ".").trim();
  const x = Number(s);
  return Number.isFinite(x) ? x : undefined;
};

/** Guarda estado en localStorage con SSR-safe. */
function useLocalStorageState<T>(key: string, initial: T) {
  const [val, setVal] = useState<T>(() => {
    try {
      if (typeof window === "undefined") return initial;
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  }, [key, val]);
  return [val, setVal] as const;
}

/** Fetch JSON tipado con AbortController. Adjunta Premium-Key si existe. */
async function fetchJSON<T>(url: string, opts: RequestInit & { premiumKey?: string } = {}): Promise<T> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 20_000);
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    };
    if ((opts as any).premiumKey) (headers as Record<string, string>)["X-Premium-Key"] = (opts as any).premiumKey;

    const res = await fetch(url, { ...opts, headers, signal: controller.signal });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(id);
  }
}

/** Mapea best_pick -> odd ingresada por usuario. */
function oddFromBestPick(best: PredictResponse["best_pick"], odds: Odds): number | undefined {
  const market = best.market;
  const sel = best.selection;
  if (market === "1X2") {
    if (sel === "1") return odds["1"];
    if (sel === "2") return odds["2"];
    if (sel === "X") return odds["X"];
  }
  if (market === "Over 2.5") return odds.O2_5;
  if (market === "BTTS") {
    const yesish = String(sel).toLowerCase();
    if (["sí", "si", "yes", "y"].includes(yesish)) return odds.BTTS_YES;
  }
  return undefined;
}

/* ===== Estilos base (dark) ===== */
const page: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(1200px 600px at 20% -10%, #3b0764 0%, transparent 60%), radial-gradient(900px 500px at 120% -20%, #1d4ed8 0%, transparent 55%), #0b1020",
  color: "#e5e7eb",
  fontFamily:
    "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,Helvetica,Arial,Apple Color Emoji,Segoe UI Emoji",
};

const wrap: React.CSSProperties = { maxWidth: 900, margin: "0 auto", padding: "18px 14px 120px" };
const panel: React.CSSProperties = {
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 16,
  padding: 14,
};
const labelCss: React.CSSProperties = { color: "#a5b4fc", fontSize: 12, marginBottom: 6, fontWeight: 800, letterSpacing: 0.3 };
const inputCss: React.CSSProperties = {
  width: "100%", background: "#0f172a", color: "white",
  border: "1px solid rgba(255,255,255,.18)", borderRadius: 12, padding: "12px 14px", outline: "none",
};
const btnPrimary: React.CSSProperties = {
  background: "linear-gradient(135deg, #7c3aed, #5b21b6)", color: "white", border: "none",
  borderRadius: 14, padding: "14px 18px", fontWeight: 900, fontSize: 16,
};
const pill: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 999,
  background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)", color: "#d1d5db", fontSize: 12, whiteSpace: "nowrap",
};

/* ===== Cabecera ===== */
function Header({
  onOpenMenu, onOpenHistory, onOpenParlay, onOpenBuilder, onOpenIABoot, premiumSlot,
}: {
  onOpenMenu: () => void;
  onOpenHistory: () => void;
  onOpenParlay: () => void;
  onOpenBuilder: () => void;
  onOpenIABoot: () => void;
  premiumSlot?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          aria-label="Abrir menú"
          onClick={onOpenMenu}
          style={{
            width: 42, height: 42, borderRadius: 12, border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(255,255,255,.06)", color: "#e5e7eb", display: "grid", placeItems: "center", cursor: "pointer",
          }}
        >
          <div style={{ display: "grid", gap: 4 }} aria-hidden>
            <span style={{ display: "block", width: 18, height: 2, background: "#e5e7eb" }} />
            <span style={{ display: "block", width: 18, height: 2, background: "#e5e7eb" }} />
            <span style={{ display: "block", width: 18, height: 2, background: "#e5e7eb" }} />
          </div>
        </button>

        <div
          style={{
            width: 46, height: 46, borderRadius: 14, display: "grid", placeItems: "center",
            background: "linear-gradient(135deg,#7c3aed,#5b21b6)", boxShadow: "0 10px 22px rgba(124,58,237,.35)",
            fontSize: 24, fontWeight: 900,
          }}
          aria-hidden
        >
          ⚽
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>FootyMines · IA Predictor</div>
          <div style={{ opacity: 0.8, fontSize: 13 }}>Predicción clara para usuarios finales</div>
        </div>
      </div>

      <div className="quick-actions" style={{ display: "flex", gap: 8 }}>
        <button onClick={onOpenBuilder} title="Generador de selección" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,.12)", color: "#d1d5db", background: "rgba(255,255,255,.06)" }}>
          🎯 Selección
        </button>
        <button onClick={onOpenHistory} title="Historial de apuestas" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,.12)", color: "#d1d5db", background: "rgba(255,255,255,.06)" }}>
          📒 Historial
        </button>
        <button onClick={onOpenParlay} title="Generador de Parley" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,.12)", color: "#d1d5db", background: "rgba(255,255,255,.06)" }}>
          🧮 Parley
        </button>
        <button onClick={onOpenIABoot} title="IA Boot" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,.12)", color: "#d1d5db", background: "rgba(255,255,255,.06)" }}>
          🤖 IA Boot
        </button>

        {/* 👑 Premium compacto */}
        {premiumSlot}
      </div>
    </div>
  );
}

/* ===== Editor de cuotas ===== */
function OddsEditor({
  odds, setOdds, rawOdds, setRawOdds,
}: { odds: Odds; setOdds: (o: Odds) => void; rawOdds: RawOdds; setRawOdds: (o: RawOdds) => void; }) {
  const Field = ({ k, labelText, ph }: { k: keyof Odds; labelText: string; ph: string }) => (
    <div>
      <div style={labelCss}>{labelText}</div>
      <input
        type="text" inputMode="decimal" aria-label={`Cuota ${labelText}`} placeholder={ph} style={inputCss}
        pattern="^[0-9]+([\\.,][0-9]+)?$" value={rawOdds[k] ?? ""}
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ ...pill }}>👛 Cuotas (opcional)</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>Sugerencia: ingrésalas ~5 horas antes para mayor precisión.</div>
      </div>
      <div style={{ marginTop: 10, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
        <Field k="1" labelText="1 (Local)" ph="2.10" />
        <Field k="X" labelText="X (Empate)" ph="3.30" />
        <Field k="2" labelText="2 (Visitante)" ph="3.40" />
        <Field k="O2_5" labelText="Más de 2.5" ph="1.95" />
        <Field k="BTTS_YES" labelText="BTTS Sí" ph="1.85" />
      </div>
      {anyOdds && (
        <div style={{ marginTop: 10 }}>
          <button onClick={() => { setOdds({}); setRawOdds({}); }} style={{ ...pill, cursor: "pointer" }}>
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
    <div style={{ ...panel, marginTop: 12 }} role="status" aria-live="polite" aria-busy>
      <style>{`@keyframes shimmer{0%{background-position:-200px 0}100%{background-position:400px 0}}`}</style>
      <div style={{ ...sk, width: "50%", marginBottom: 8 }} />
      <div style={{ ...sk, width: "80%", height: 26, marginBottom: 8 }} />
      <div style={{ ...sk, width: "60%" }} />
    </div>
  );
}

/* ====== Popup de Planes ====== */
type PlanKey = "weekly" | "monthly" | "annual";

function PlanCard({
  label, priceLabel, bullets, onClick, disabled
}: {
  label: string; priceLabel: string; bullets: string[];
  onClick: () => void; disabled?: boolean;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,.12)",
        background: "rgba(255,255,255,.04)",
        borderRadius: 16, padding: 16,
        display: "flex", flexDirection: "column", gap: 10, minHeight: 210
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 900 }}>{label}</div>
      <div style={{ opacity: 0.9 }}>{priceLabel}</div>
      <ul style={{ margin: 0, paddingInlineStart: 18, lineHeight: 1.5 }}>
        {bullets.map((b, i) => <li key={i} style={{ opacity: 0.9 }}>{b}</li>)}
      </ul>
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          marginTop: "auto", padding: "12px 14px",
          borderRadius: 12, border: "none", fontWeight: 900,
          cursor: disabled ? "not-allowed" : "pointer",
          background: "linear-gradient(135deg,#8b5cf6,#6d28d9)", color: "white"
        }}
        title="Ir a Stripe"
      >
        {disabled ? "Abriendo…" : "Empezar"}
      </button>
    </div>
  );
}

function PlansModal({
  open, onClose, onChoose
}: {
  open: boolean; onClose: () => void;
  onChoose: (plan: PlanKey) => void;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog" aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 80,
        display: "grid", placeItems: "center",
        background: "rgba(0,0,0,.55)", padding: 16
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(920px, 96vw)",
          background: "linear-gradient(180deg,#0f172a 0%, #0b1020 100%)",
          border: "1px solid rgba(255,255,255,.12)",
          borderRadius: 18, padding: 18, color: "#e5e7eb",
          boxShadow: "0 20px 70px rgba(0,0,0,.45)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 22, fontWeight: 900 }}>Planes Premium</div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)",
              color: "#e5e7eb", borderRadius: 10, padding: "8px 12px", cursor: "pointer"
            }}
          >
            Cerrar ✕
          </button>
        </div>

        <div
          style={{
            marginBottom: 14,
            background: "rgba(124,58,237,.12)",
            border: "1px solid rgba(124,58,237,.35)",
            borderRadius: 12, padding: 12, fontSize: 14
          }}
        >
          Desbloquea <b>Generador de Selección</b>, <b>Parlay inteligente</b> e
          <b> IA Boot</b>, además de <b>blend con cuotas</b> y <b>soporte prioritario</b>.
          Cancela cuando quieras.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
          <PlanCard
            label="Semanal" priceLabel={LABEL_WEEKLY}
            bullets={["Ideal para probar funciones Pro.", "Incluye todos los módulos.", "Renovable semanalmente."]}
            onClick={() => onChoose("weekly")}
          />
          <PlanCard
            label="Mensual" priceLabel={LABEL_MONTHLY}
            bullets={["Uso continuo y soporte prioritario.", "Mejor relación funciones/precio.", "Renovable mensualmente."]}
            onClick={() => onChoose("monthly")}
          />
          <PlanCard
            label="Anual" priceLabel={LABEL_YEARLY}
            bullets={["Mejor precio por mes.", "Acceso estable toda la temporada.", "Incluye todo lo de Mensual."]}
            onClick={() => onChoose("annual")}
          />
        </div>

        <div style={{ marginTop: 14, fontSize: 12, opacity: 0.8 }}>
          * Uso educativo/informativo. No constituye asesoría financiera ni garantiza resultados.
        </div>
      </div>
    </div>
  );
}

// ===============================================
// ===== NUEVO COMPONENTE: TOP MATCHES DRAWER =====
// ===============================================
function TopMatchesDrawer({ open, onClose }: { open: boolean, onClose: () => void }) {
  const [data, setData] = useState<TopMatchesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [date, setDate] = useState(() => new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0]);

  useEffect(() => {
    if (!open) return;

    let isCancelled = false;
    async function fetchData() {
      setLoading(true);
      setError('');
      try {
        const result = await fetchJSON<TopMatchesResponse>(`${API_BASE}/top-matches?date=${date}`);
        if (!isCancelled) {
          setData(result);
        }
      } catch (e: any) {
        if (!isCancelled) {
          setError(e.message || "No se pudieron cargar los partidos.");
          setData(null);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => { isCancelled = true; };
  }, [open, date]);

  if (!open) return null;

  return (
    <div
      role="dialog" aria-modal="true" onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)',
        display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(500px, 95vw)', height: '100%',
          background: '#0f172a', borderLeft: '1px solid rgba(255,255,255,.15)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: 16, borderBottom: '1px solid rgba(255,255,255,.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>📅 Partidos del Día</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.8 }}>Seleccionados por IA con Web Search</p>
          </div>
          <button onClick={onClose} style={{...pill, cursor: 'pointer'}}>Cerrar ✕</button>
        </div>

        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.15)' }}>
          <label style={{...labelCss, marginBottom: 4}}>Seleccionar Fecha</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{...inputCss, padding: '8px 12px'}}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {loading && <SkeletonCard />}
          {error && <p style={{color: '#fecaca'}}>{error}</p>}
          {data && data.matches.length === 0 && !loading && <p>No se encontraron partidos para esta fecha.</p>}
          {data && data.matches.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {data.matches.map((match, i) => (
                <li key={i} style={{...panel, padding: 12}}>
                  <div style={{fontSize: 12, opacity: 0.7}}>{match.competition} - {match.country}</div>
                  <div style={{fontSize: 16, fontWeight: 'bold', margin: '4px 0'}}>{match.home} <span style={{opacity: 0.7}}>vs</span> {match.away}</div>
                  <div style={{display: 'flex', gap: 12, fontSize: 12, marginTop: 6}}>
                    <span><strong>Local:</strong> {match.kickoff_local}</span>
                    <span><strong>UTC:</strong> {match.kickoff_utc}</span>
                  </div>
                  {match.rationale && <p style={{fontSize: 13, opacity: 0.85, margin: '8px 0 0', fontStyle: 'italic'}}>{match.rationale}</p>}
                  <div style={{marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap'}}>
                    {match.sources.map((url, j) => <a key={j} href={url} target="_blank" rel="noopener noreferrer" style={{...pill, textDecoration: 'none'}}>Fuente {j+1}</a>)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// --- APP PRINCIPAL ---
export default function App() {
  // ⚙️ Estado
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
  const [expert, setExpert] = useState(false);
  const [iaOpen, setIaOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);

  const [premiumKey, setPremiumKey] = useLocalStorageState<string>("fm_premium_key", "");
  const [sub, setSub] = useState<SubscriptionState>({ active: false, premium_key: null });
  const [introOpen, setIntroOpen] = useState(!localStorage.getItem("fm_intro_seen"));

  const [parlayOpen, setParlayOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [stakeOpen, setStakeOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [topMatchesOpen, setTopMatchesOpen] = useState(false); // <--- NUEVO ESTADO

  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  /* === Checkout compacto y portal === */
  const startCheckout = useCallback(
    async (plan: PlanKey = "monthly") => {
      try {
        const j = await fetchJSON<{ provider: string; url: string }>(`${API_BASE}/billing/checkout`, {
          method: "POST",
          body: JSON.stringify({ plan, method: "card", user_email: null }),
          premiumKey,
        });
        if (j?.url) window.location.href = j.url;
      } catch (e: any) {
        alert(e?.message || "No se pudo iniciar el pago.");
      }
    },
    [premiumKey]
  );

  const openPortal = useCallback(async () => {
    try {
      const j = await fetchJSON<{ url: string }>(`${API_BASE}/create-billing-portal`, {
        method: "POST",
        body: JSON.stringify({ premium_key: premiumKey }),
        premiumKey,
      });
      if (j?.url) window.location.href = j.url;
    } catch (e: any) {
      alert(e?.message || "No se pudo abrir el portal.");
    }
  }, [premiumKey]);

  // abre Premium desde Intro (sin modal)
  const goPremium = useCallback(() => {
    setIntroOpen(false);
    localStorage.setItem("fm_intro_seen", "1");
    startCheckout("monthly");
  }, [startCheckout]);

  /* ✅ VALIDAR CLAVE GUARDADA AL ARRANCAR */
  useEffect(() => {
    const k = localStorage.getItem("fm_premium_key") || "";
    setPremiumKey(k);

    if (!k) {
      setSub({ active: false, premium_key: null });
      return;
    }

    (async () => {
      try {
        const r = await fetch(`${API_BASE}/premium/status`, { headers: { "X-Premium-Key": k } });
        if (!r.ok) throw new Error(await r.text());
        const j = await r.json();

        const active = !!(j.active || j.status === "active" || j.status === "trialing");
        const next: SubscriptionState = {
          active,
          status: j?.status ?? null,
          plan: j?.plan ?? planFromPriceId(j?.price_id),
          price_id: j?.price_id ?? null,
          current_period_end: j?.current_period_end ?? null,
          premium_key: k,
          email: j?.email ?? null,
        };

        setSub(next);

        if (!active) {
          localStorage.removeItem("fm_premium_key");
          setPremiumKey("");
        }
      } catch {
        localStorage.removeItem("fm_premium_key");
        setPremiumKey("");
        setSub({ active: false, premium_key: null });
      }
    })();
  }, [setPremiumKey]);

  /* 🔁 Refrescar estado cuando cambia premiumKey */
  useEffect(() => {
    if (!premiumKey) return;
    let cancel = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/premium/status`, { headers: { "X-Premium-Key": premiumKey } });
        if (!r.ok) return;
        const j = await r.json();
        if (cancel) return;
        setSub({
          active: !!(j.active || j.status === "active" || j.status === "trialing"),
          status: j?.status ?? null,
          plan: j?.plan ?? planFromPriceId(j?.price_id),
          price_id: j?.price_id ?? null,
          current_period_end: j?.current_period_end ?? null,
          premium_key: premiumKey,
          email: j?.email ?? null,
        });
      } catch {}
    })();
    return () => { cancel = true; };
  }, [premiumKey]);

  const redeemHandledRef = useRef(false);
  /** 🔁 Canjeo de sesión Stripe (?success/&session_id) */
  useEffect(() => {
    const url = new URL(window.location.href);
    const success = url.searchParams.get("success");
    const sessionId = url.searchParams.get("session_id");
    const canceled = url.searchParams.get("canceled");

    if (redeemHandledRef.current) return;

    if (canceled === "true") {
      window.history.replaceState(null, "", window.location.pathname);
      redeemHandledRef.current = true;
      return;
    }

    if (success === "true" && sessionId) {
      const already = sessionStorage.getItem("fm_redeem_sid");
      if (already === sessionId) {
        window.history.replaceState(null, "", window.location.pathname);
        redeemHandledRef.current = true;
        return;
      }

      window.history.replaceState(null, "", window.location.pathname);

      (async () => {
        try {
          type RedeemResp = { premium_key?: string; status?: string; current_period_end?: number };
          const j = await fetchJSON<RedeemResp>(`${API_BASE}/stripe/redeem?session_id=${encodeURIComponent(sessionId)}`);
          if (j?.premium_key) {
            setPremiumKey(j.premium_key);
            if (j.current_period_end) localStorage.setItem("fm_premium_cpe", String(j.current_period_end));
            sessionStorage.setItem("fm_redeem_sid", sessionId);
          } else {
            alert("Pago correcto, pero no se pudo recuperar la clave. Contacta soporte.");
          }
        } catch (e: any) {
          alert(e?.message || "No se pudo canjear la sesión de Stripe.");
        } finally {
          redeemHandledRef.current = true;
        }
      })();
    }
  }, [setPremiumKey]);

  /* 🎉 “Premium activado” UNA sola vez */
  const prevActiveRef = useRef<boolean>(false);
  useEffect(() => {
    if (sub.active && !prevActiveRef.current) {
      prevActiveRef.current = true;
      if (!sessionStorage.getItem("fm_premium_welcome_shown")) {
        sessionStorage.setItem("fm_premium_welcome_shown", "1");
        alert("¡Premium activado!");
      }
    }
  }, [sub.active]);

  // Cargar ligas
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const d = await fetchJSON<ApiLeagues>(`${API_BASE}/leagues`, { signal: controller.signal as any, premiumKey });
        if (!mounted.current) return;
        setLeagues(d.leagues ?? []);
      } catch (e) {
        if ((e as any)?.name === "AbortError") return;
        setLeagues([]);
      }
    })();
    return () => controller.abort();
  }, [premiumKey]);

  // Cargar equipos por liga
  useEffect(() => {
    setHome(""); setAway(""); setData(null); setErr("");
    if (!league) return setTeams([]);

    const controller = new AbortController();
    (async () => {
      try {
        const d = await fetchJSON<ApiTeams>(`${API_BASE}/teams?league=${encodeURIComponent(league)}`, {
          signal: controller.signal as any, premiumKey,
        });
        if (!mounted.current) return;
        setTeams(d.teams ?? []);
      } catch (e) {
        if ((e as any)?.name === "AbortError") return;
        setErr("No pude cargar equipos.");
      }
    })();
    return () => controller.abort();
  }, [league, premiumKey]);

  const canPredict = league && home && away && home !== away;

  const filteredHome = useMemo(() => teams.filter((t) => t.toLowerCase().includes(home.toLowerCase())), [teams, home]);
  const filteredAway = useMemo(() => teams.filter((t) => t.toLowerCase().includes(away.toLowerCase())), [teams, away]);

  async function onPredict() {
    if (!canPredict || loading) return;
    setLoading(true);
    setErr("");
    setData(null);
    try {
      const body: any = { league, home_team: home, away_team: away };
      if (odds["1"] || odds.X || odds["2"] || odds.O2_5 || odds.BTTS_YES) body.odds = odds;

      const json = await fetchJSON<PredictResponse>(`${API_BASE}/predict`, {
        method: "POST", body: JSON.stringify(body), premiumKey,
      });
      if (!mounted.current) return;
      setData(json);

      // Log best-effort
      try {
        const odd = oddFromBestPick(json.best_pick, odds);
        await fetchJSON(`${API_BASE}/history/log`, {
          method: "POST",
          body: JSON.stringify({
            ts: Math.floor(Date.now() / 1000), league, home, away,
            market: json.best_pick.market, selection: json.best_pick.selection,
            prob_pct: json.best_pick.prob_pct, odd, stake: null,
          }),
          premiumKey,
        });
      } catch {}
    } catch (e: any) {
      setErr(e?.message || "Error al predecir.");
    } finally {
      setLoading(false);
    }
  }

  const stakeDefaults = useMemo(() => {
    if (!data) return null;
    const prob01 = (data.best_pick?.prob_pct ?? 0) / 100;
    const odd = oddFromBestPick(data.best_pick, odds);
    const humanMarket =
      data.best_pick.market === "1X2" ? "Ganador del partido"
        : data.best_pick.market === "Over 2.5" ? "Más de 2.5 goles"
        : data.best_pick.market === "BTTS" ? "Ambos equipos anotan" : data.best_pick.market;
    const humanSelection =
      data.best_pick.market === "1X2"
        ? data.best_pick.selection === "1" ? "Gana Local" : data.best_pick.selection === "2" ? "Gana Visitante" : "Empate"
        : data.best_pick.selection;
    const matchLabel = `${data.home_team} vs ${data.away_team}`;
    return { prob01, odd, humanMarket, humanSelection, matchLabel };
  }, [data, odds]);

  const isPremiumUI = sub.active === true;

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
          z-index: 50;
        }
      `}</style>

      <div style={wrap}>
        <Header
          onOpenMenu={() => setNavOpen(true)}
          onOpenHistory={() => setHistOpen(true)}
          onOpenParlay={() => setParlayOpen(true)}
          onOpenBuilder={() => setBuilderOpen(true)}
          onOpenIABoot={() => setIaOpen(true)}
          premiumSlot={
            <div style={{ display: "flex", gap: 8 }}>
              {isPremiumUI ? (
                <button
                  onClick={openPortal}
                  title="Gestionar suscripción"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "10px 14px", borderRadius: 12,
                    border: "1px solid rgba(34,197,94,.45)",
                    color: "#d1fae5", background: "rgba(34,197,94,.12)", fontWeight: 800
                  }}
                >
                  👑 Gestionar
                </button>
              ) : (
                <button
                  onClick={() => setPlansOpen(true)}
                  title="Activar Premium"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "10px 14px", borderRadius: 12,
                    border: "1px solid rgba(124,58,237,.5)",
                    color: "white",
                    background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
                    fontWeight: 900
                  }}
                >
                  👑 Premium
                </button>
              )}
            </div>
          }
        />

        <IntroModal
          open={!!introOpen}
          onClose={() => { setIntroOpen(false); localStorage.setItem("fm_intro_seen", "1"); }}
          onGoPremium={goPremium}
        />

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>
            <input type="checkbox" checked={expert} onChange={(e) => setExpert(e.target.checked)} />
            &nbsp;Modo experto (ver detalles POISSON/DC)
          </label>
          <div style={{ ...pill, borderColor: isPremiumUI ? "#22c55e" : "rgba(255,255,255,.1)" }}>
            {isPremiumUI ? `✅ Premium activo${sub.plan ? " · " + sub.plan : ""}` : "🔒 Modo gratis"}
          </div>
        </div>

        {/* Paso 1: Selección */}
        <div style={{ ...panel }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={pill}>1️⃣ Selecciona liga y equipos</div>
            <div style={pill}>2️⃣ (Opcional) Ingresar cuotas</div>
            <div style={pill}>3️⃣ Calcular</div>
          </div>

          <div className="g3" style={{ marginTop: 12 }}>
            <div>
              <div style={labelCss}>Liga</div>
              <select value={league} onChange={(e) => setLeague(e.target.value)} style={inputCss} aria-label="Selecciona liga">
                <option value="">— Selecciona liga —</option>
                {leagues.map((l) => (<option key={l} value={l}>{l}</option>))}
              </select>
            </div>
            <div>
              <div style={labelCss}>Equipo local</div>
              <input placeholder="Escribe para buscar…" value={home} onChange={(e) => setHome(e.target.value)} list="home_list" style={inputCss} aria-label="Equipo local" />
              <datalist id="home_list">{filteredHome.map((t) => (<option key={t} value={t} />))}</datalist>
            </div>
            <div>
              <div style={labelCss}>Equipo visitante</div>
              <input placeholder="Escribe para buscar…" value={away} onChange={(e) => setAway(e.target.value)} list="away_list" style={inputCss} aria-label="Equipo visitante" />
              <datalist id="away_list">{filteredAway.map((t) => (<option key={t} value={t} />))}</datalist>
            </div>
          </div>
        </div>

        {/* Paso 2: Cuotas opcionales */}
        <OddsEditor odds={odds} setOdds={setOdds} rawOdds={rawOdds} setRawOdds={setRawOdds} />

        {/* CTA fijo inferior */}
        <div className="fixedbar" aria-live="polite">
          <div style={{ fontSize: 12, opacity: 0.8 }}>{canPredict ? "Listo para calcular" : "Selecciona liga y ambos equipos"}</div>
          <button
            onClick={onPredict}
            disabled={!canPredict || loading}
            style={{ ...btnPrimary, opacity: !canPredict || loading ? 0.6 : 1, cursor: !canPredict || loading ? "not-allowed" : "pointer" }}
            aria-busy={loading}
          >
            {loading ? "Calculando…" : "Calcular ahora"}
          </button>
        </div>

        {/* Errores */}
        {err && (
          <div role="alert" style={{ background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.35)", padding: 12, borderRadius: 12, marginTop: 12, color: "#fecaca" }}>
            {err}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ marginTop: 12 }}>
            <SkeletonCard />
          </div>
        )}

        {/* Drawers */}
        <NavDrawer 
            open={navOpen} 
            onClose={() => setNavOpen(false)} 
            onOpenParlay={() => setParlayOpen(true)} 
            onOpenBuilder={() => setBuilderOpen(true)} 
            onOpenHistory={() => setHistOpen(true)}
            onOpenTopMatches={() => setTopMatchesOpen(true)} // <-- PROP NUEVA
        />

        <ParlayDrawer open={parlayOpen} onClose={() => setParlayOpen(false)} API_BASE={API_BASE} isPremium={isPremiumUI} premiumKey={premiumKey} />
        
        <BuilderDrawer open={builderOpen} onClose={() => setBuilderOpen(false)} API_BASE={API_BASE} league={league} home={home} away={away} odds={odds} premiumKey={premiumKey} />

        <IABootDrawer open={iaOpen} onClose={() => setIaOpen(false)} API_BASE={API_BASE} league={league} home={home} away={away} odds={odds} premiumKey={premiumKey} />

        <BetHistoryDrawer open={histOpen} onClose={() => setHistOpen(false)} />
        
        {/* NUEVO DRAWER RENDERIZADO AQUÍ */}
        <TopMatchesDrawer open={topMatchesOpen} onClose={() => setTopMatchesOpen(false)} />

        {/* Banner PWA */}
        <InstallBanner />

        {/* Resultado */}
        {data && !loading && (
          <>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button
                onClick={() => setStakeOpen(true)}
                style={{ ...pill, cursor: "pointer", borderColor: "#22c55e", background: "linear-gradient(135deg,#22c55e55,#16a34a55)", fontWeight: 900 }}
                title="Calcular stake con Kelly"
              >
                💰 Stake
              </button>

              <button
                onClick={async () => {
                  const body: any = { league, home_team: home, away_team: away };
                  if (odds["1"] || odds.X || odds["2"] || odds.O2_5 || odds.BTTS_YES) body.odds = odds;
                  try {
                    await fetchJSON(`${API_BASE}/alerts/value-pick`, { method: "POST", body: JSON.stringify(body), premiumKey });
                    alert("Enviado (si cumple umbrales).");
                  } catch (e: any) {
                    alert(e?.message || "No se pudo enviar la alerta.");
                  }
                }}
                style={{ ...pill, cursor: "pointer" }}
                title="Enviar a Telegram si es value pick"
              >
                📣 Alerta
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <ErrorBoundary>
                <BestPickPro data={data} />
              </ErrorBoundary>
            </div>
          </>
        )}

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

        {/* Modal de Planes */}
        <PlansModal
          open={plansOpen}
          onClose={() => setPlansOpen(false)}
          onChoose={(plan) => {
            setPlansOpen(false);
            startCheckout(plan);
          }}
        />
      </div>
    </div>
  );
}

