// frontend/src/pages/Landing.tsx
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

/* === API base como en App.tsx === */
const API_BASE: string =
  (typeof window !== "undefined" && (window as any).__API_BASE__) ||
  (import.meta as any).env?.VITE_API_BASE_URL ||
  "http://localhost:8000";

/* === Estilos === */
const page: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(1200px 600px at 20% -10%, #3b0764 0%, transparent 60%), radial-gradient(900px 500px at 120% -20%, #1d4ed8 0%, transparent 55%), #0b1020",
  color: "#e5e7eb",
  fontFamily:
    "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,Helvetica,Arial,Apple Color Emoji,Segoe UI Emoji",
};
const wrap: React.CSSProperties = { maxWidth: 980, margin: "0 auto", padding: "32px 16px 48px" };
const hero: React.CSSProperties = { display: "grid", gap: 14, textAlign: "center", marginTop: 40 };
const h1: React.CSSProperties = { fontSize: 34, fontWeight: 900, lineHeight: 1.15 };
const sub: React.CSSProperties = { opacity: 0.9, fontSize: 16, maxWidth: 760, margin: "0 auto" };
const grid: React.CSSProperties = {
  marginTop: 26,
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
};
const card: React.CSSProperties = {
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 16,
  padding: 16,
};
const ctaWrap: React.CSSProperties = {
  marginTop: 24,
  display: "flex",
  gap: 12,
  justifyContent: "center",
  flexWrap: "wrap",
};
const btnPrimary: React.CSSProperties = {
  background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
  color: "white",
  border: "none",
  borderRadius: 14,
  padding: "14px 18px",
  fontWeight: 900,
  fontSize: 16,
  cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  background: "rgba(255,255,255,.06)",
  color: "#e5e7eb",
  border: "1px solid rgba(255,255,255,.18)",
  borderRadius: 14,
  padding: "14px 18px",
  fontWeight: 800,
  fontSize: 16,
  cursor: "pointer",
};

type PriceInfo = {
  id: string;
  amount: number;      // en moneda (ej: 130.00)
  currency: string;    // "MXN"
  interval: "week" | "month" | "year";
  interval_count: number;
};

export default function Landing() {
  const nav = useNavigate();
  const plansRef = useRef<HTMLDivElement | null>(null);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState<null | "weekly" | "monthly" | "annual">(null);
  const [prices, setPrices] = useState<{ weekly?: PriceInfo; monthly?: PriceInfo; annual?: PriceInfo }>({});

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/billing/prices`);
        const j = await r.json();
        setPrices({
          weekly: j.weekly || undefined,
          monthly: j.monthly || undefined,
          annual: j.annual || undefined,
        });
      } catch {
        // Si falla, se quedan los placeholders
      }
    })();
  }, []);

  const scrollToPlans = () => {
    plansRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  function fmt(p?: PriceInfo) {
    if (!p) return "—";
    try {
      return new Intl.NumberFormat("es-MX", { style: "currency", currency: p.currency || "MXN" }).format(p.amount);
    } catch {
      return `MXN ${p.amount?.toFixed(2)}`;
    }
  }

  async function goCheckout(plan: "weekly" | "monthly" | "annual") {
    try {
      setLoading(plan);
      const res = await fetch(`${API_BASE}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, method: "card", user_email: email.trim() || null }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json(); // { provider:"stripe", url:"..." }
      if (!j?.url) throw new Error("No se recibió URL de Stripe.");
      window.location.href = j.url;
    } catch (e: any) {
      alert(e?.message || "No se pudo iniciar el checkout.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={page}>
      <div style={wrap}>
        {/* Header */}
        <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
            aria-hidden
          >
            ⚽
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
              FootyMines · IA Predictor
            </div>
            <div style={{ opacity: 0.8, fontSize: 13 }}>Predicción clara para usuarios finales</div>
          </div>
        </header>

        {/* Hero */}
        <section style={hero}>
          <h1 style={h1}>Predicciones de fútbol con modelo híbrido + IA</h1>
          <p style={sub}>
            Poisson calibrado + blend con mercado. Módulos Premium: Generador de Selección, Parlay e IA Boot.
            Pagos seguros con Stripe.
          </p>

          <div style={grid}>
            <div style={card}>
              <b>Modelo base</b>
              <div style={{ opacity: 0.9, marginTop: 6 }}>
                1X2, Over 2.5 y BTTS con ajuste DC suave y calibración opcional.
              </div>
            </div>
            <div style={card}>
              <b>Generador de selección</b>
              <div style={{ opacity: 0.9, marginTop: 6 }}>
                Picks combinados con umbrales y penalización por correlación.
              </div>
            </div>
            <div style={card}>
              <b>Parlay inteligente</b>
              <div style={{ opacity: 0.9, marginTop: 6 }}>
                EV, cuota justa y control de independencia aproximada.
              </div>
            </div>
            <div style={card}>
              <b>IA Boot</b>
              <div style={{ opacity: 0.9, marginTop: 6 }}>
                Resúmenes y picks estructurados; fallback seguro al modelo base.
              </div>
            </div>
          </div>

          <div style={ctaWrap}>
            <button style={btnPrimary} onClick={() => nav("/app")}>
              Entrar
            </button>
            <button style={btnGhost} onClick={scrollToPlans} title="Ver planes Premium">
              Ver planes Premium
            </button>
          </div>

          <p style={{ opacity: 0.7, fontSize: 12, marginTop: 12 }}>
            * Uso educativo/informativo. No constituye asesoría financiera ni garantiza resultados.
          </p>
        </section>

        {/* Planes */}
        <section ref={plansRef} style={{ marginTop: 48 }}>
          <h2 style={{ fontSize: 26, fontWeight: 900, textAlign: "center" }}>Planes Premium</h2>

          {/* Email opcional */}
          <div style={{ maxWidth: 520, margin: "12px auto 0" }}>
            <label style={{ fontSize: 12, opacity: 0.85 }}>(Opcional) Email para prellenar en Stripe</label>
            <input
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%",
                background: "#0f172a",
                color: "white",
                border: "1px solid rgba(255,255,255,.18)",
                borderRadius: 12,
                padding: "12px 14px",
                outline: "none",
                marginTop: 6,
              }}
            />
          </div>

          <div
            style={{
              marginTop: 18,
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
            }}
          >
            {/* Semanal */}
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <b>Semanal</b>
                <span
                  style={{
                    fontSize: 12,
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,.18)",
                    background: "rgba(255,255,255,.06)",
                  }}
                >
                  Flex
                </span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{fmt(prices.weekly)}</div>
              <div style={{ opacity: 0.8, fontSize: 13, marginTop: 2 }}>por semana</div>
              <ul style={{ marginTop: 8, opacity: 0.9, paddingLeft: 18 }}>
                <li>Generador de Selección</li>
                <li>Parlay inteligente (2–4 legs)</li>
                <li>Soporte básico</li>
              </ul>
              <button
                style={{ ...btnPrimary, width: "100%", marginTop: 12, opacity: loading === "weekly" ? 0.6 : 1 }}
                disabled={loading === "weekly"}
                onClick={() => goCheckout("weekly")}
              >
                {loading === "weekly" ? "Redirigiendo…" : "Suscribirme (Semanal)"}
              </button>
            </div>

            {/* Mensual */}
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <b>Mensual</b>
                <span
                  style={{
                    fontSize: 12,
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,.18)",
                    background: "rgba(255,255,255,.06)",
                  }}
                >
                  Recomendado
                </span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{fmt(prices.monthly)}</div>
              <div style={{ opacity: 0.8, fontSize: 13, marginTop: 2 }}>por mes</div>
              <ul style={{ marginTop: 8, opacity: 0.9, paddingLeft: 18 }}>
                <li>Todo lo del Semanal</li>
                <li>IA Boot (resumen y picks)</li>
                <li>Acceso prioritario</li>
              </ul>
              <button
                style={{ ...btnPrimary, width: "100%", marginTop: 12, opacity: loading === "monthly" ? 0.6 : 1 }}
                disabled={loading === "monthly"}
                onClick={() => goCheckout("monthly")}
              >
                {loading === "monthly" ? "Redirigiendo…" : "Suscribirme (Mensual)"}
              </button>
            </div>

            {/* Anual */}
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <b>Anual</b>
                <span
                  style={{
                    fontSize: 12,
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,.18)",
                    background: "rgba(255,255,255,.06)",
                  }}
                >
                  Mejor precio
                </span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{fmt(prices.annual)}</div>
              <div style={{ opacity: 0.8, fontSize: 13, marginTop: 2 }}>por año</div>
              <ul style={{ marginTop: 8, opacity: 0.9, paddingLeft: 18 }}>
                <li>Todo lo del Mensual</li>
                <li>Mejor costo por mes</li>
                <li>Soporte prioritario</li>
              </ul>
              <button
                style={{ ...btnPrimary, width: "100%", marginTop: 12, opacity: loading === "annual" ? 0.6 : 1 }}
                disabled={loading === "annual"}
                onClick={() => goCheckout("annual")}
              >
                {loading === "annual" ? "Redirigiendo…" : "Suscribirme (Anual)"}
              </button>
            </div>
          </div>

          <p style={{ opacity: 0.7, fontSize: 12, marginTop: 12, textAlign: "center" }}>
            Tu pago se procesa en Stripe. Podrás gestionar tu suscripción desde el portal de facturación.
          </p>
        </section>
      </div>
    </div>
  );
}
