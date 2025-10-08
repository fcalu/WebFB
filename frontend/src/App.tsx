import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import IntroModal from "./components/IntroModal";

// ✅ Componentes reales
import BestPickPro from "./components/BestPickPro";
import ErrorBoundary from "./components/ErrorBoundary";
import ParlayDrawer from "./components/ParlayDrawer";
import BuilderDrawer from "./components/BuilderDrawer";
import NavDrawer from "./components/NavDrawer";
import IABootDrawer from "./components/IABootDrawer";
import InstallBanner from "./components/InstallBanner";
import StakeModal from "./components/StakeModal";
import BetHistoryDrawer from "./components/BetHistoryDrawer";

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

/* ===== Config (entorno) ===== */
const API_BASE: string =
  (typeof window !== "undefined" && (window as any).__API_BASE__) ||
  (import.meta as any).env?.VITE_API_BASE_URL ||
  "http://localhost:8000";

/* ===== Helpers ===== */
const toFloat = (v: unknown) => {
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v).replace(",", ".").trim();
  const x = Number(s);
  return Number.isFinite(x) ? x : undefined;
};

const pct = (n?: number) => (n == null || Number.isNaN(n) ? "—" : `${(+n).toFixed(2)}%`);
function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

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
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
    <div style={{ ...panel }} role="status" aria-live="polite" aria-busy>
      <style>{`@keyframes shimmer{0%{background-position:-200px 0}100%{background-position:400px 0}}`}</style>
      <div style={{ ...sk, width: "50%", marginBottom: 8 }} />
      <div style={{ ...sk, width: "80%", height: 26, marginBottom: 8 }} />
      <div style={{ ...sk, width: "60%", marginBottom: 8 }} />
      <div style={{ width: "100%", marginBottom: 6 }} />
      <div style={{ width: "90%", marginBottom: 6 }} />
      <div style={{ width: "70%" }} />
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

  const [premiumKey, setPremiumKey] = useLocalStorageState<string>("fm_premium_key", "");
  const [sub, setSub] = useState<SubscriptionState>({ active: false, premium_key: null });
  const [introOpen, setIntroOpen] = useState(!localStorage.getItem("fm_intro_seen"));

  const [parlayOpen, setParlayOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [stakeOpen, setStakeOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  /* === Checkout compacto y portal === */
  const startCheckout = useCallback(
    async (plan: "weekly" | "monthly" | "annual" = "monthly") => {
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
  }, [API_BASE, setPremiumKey]);

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
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(34,197,94,.45)", color: "#d1fae5", background: "rgba(34,197,94,.12)", fontWeight: 800 }}
                >
                  👑 Gestionar
                </button>
              ) : (
                <button
                  onClick={() => startCheckout("monthly")}
                  title="Activar Premium"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(124,58,237,.5)", color: "white", background: "linear-gradient(135deg,#7c3aed,#5b21b6)", fontWeight: 900 }}
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
        <NavDrawer open={navOpen} onClose={() => setNavOpen(false)} onOpenParlay={() => setParlayOpen(true)} onOpenBuilder={() => setBuilderOpen(true)} onOpenHistory={() => setHistOpen(true)} />

        <ParlayDrawer open={parlayOpen} onClose={() => setParlayOpen(false)} API_BASE={API_BASE} isPremium={isPremiumUI} premiumKey={premiumKey} />

        <BuilderDrawer open={builderOpen} onClose={() => setBuilderOpen(false)} API_BASE={API_BASE} league={league} home={home} away={away} odds={odds} premiumKey={premiumKey} />

        <IABootDrawer open={iaOpen} onClose={() => setIaOpen(false)} API_BASE={API_BASE} league={league} home={home} away={away} odds={odds} premiumKey={premiumKey} />

        <BetHistoryDrawer open={histOpen} onClose={() => setHistOpen(false)} />

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
                <BestPickPro data={data} odds={odds} />
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
      </div>
    </div>
  );
}
