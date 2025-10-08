import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE: string =
  (typeof window !== "undefined" && (window as any).__API_BASE__) ||
  (import.meta as any).env?.VITE_API_BASE_URL ||
  "http://localhost:8000";

const PRICES = {
  weekly: (import.meta as any).env?.VITE_STRIPE_PRICE_WEEKLY_ID || "",
  monthly: (import.meta as any).env?.VITE_STRIPE_PRICE_MONTHLY_ID || "",
  yearly: (import.meta as any).env?.VITE_STRIPE_PRICE_YEARLY_ID || "",
};

const page: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(1200px 600px at 20% -10%, #3b0764 0%, transparent 60%), radial-gradient(900px 500px at 120% -20%, #1d4ed8 0%, transparent 55%), #0b1020",
  color: "#e5e7eb",
  fontFamily:
    "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,Helvetica,Arial,Apple Color Emoji,Segoe UI Emoji",
};

const wrap: React.CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: "36px 16px 80px",
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 16,
  padding: 16,
};

const pillBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "14px 18px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,.12)",
  color: "#fff",
  background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
  cursor: "pointer",
  fontWeight: 900,
};

const ghostBtn: React.CSSProperties = {
  ...pillBtn,
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.18)",
  fontWeight: 800,
};

function Feature({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ ...card }}>
      <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 6 }}>{title}</div>
      <div style={{ opacity: 0.9, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

function Modal({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.55)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
        padding: 12,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(96vw, 980px)",
          background: "#0b1020",
          border: "1px solid rgba(255,255,255,.12)",
          borderRadius: 16,
          padding: 18,
          color: "#e5e7eb",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 900, fontSize: 20 }}>{title}</div>
          <button
            onClick={onClose}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,.14)",
              background: "rgba(255,255,255,.06)",
              color: "#d1d5db",
              cursor: "pointer",
            }}
          >
            Cerrar ✕
          </button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

export default function Landing() {
  const nav = useNavigate();
  const [plansOpen, setPlansOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  async function startCheckout(price_id: string) {
    if (!price_id) {
      alert(
        "Falta configurar los PRICE_ID de Stripe (VITE_STRIPE_PRICE_WEEKLY_ID / MONTHLY / YEARLY) en Vercel."
      );
      return;
    }
    try {
      setLoading(price_id);
      const r = await fetch(`${API_BASE}/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price_id,
          user_email: "",
          // asegúrate en tu backend de poner success_url a `${origin}/app?success=true&session_id=...`
        }),
      });

      const raw = await r.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {}

      if (!r.ok) {
        const msg = j.detail || j.message || raw || `HTTP ${r.status}`;
        throw new Error(msg);
      }
      if (!j.session_url) throw new Error("El backend no devolvió session_url.");
      window.location.assign(j.session_url);
    } catch (e: any) {
      alert(e?.message || "No se pudo iniciar el checkout.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={page}>
      <div style={wrap}>
        {/* Marca */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 16,
              display: "grid",
              placeItems: "center",
              background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
              boxShadow: "0 10px 22px rgba(124,58,237,.35)",
              fontSize: 28,
              fontWeight: 900,
            }}
            aria-hidden
          >
            ⚽
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1 }}>
              FootyMines · IA Predictor
            </div>
            <div style={{ opacity: 0.85 }}>Predicción clara para usuarios finales</div>
          </div>
        </div>

        {/* Hero */}
        <h1 style={{ fontSize: 42, lineHeight: 1.1, margin: "12px 0 6px", fontWeight: 900 }}>
          Predicciones de fútbol con{" "}
          <span style={{ color: "#c4b5fd" }}>modelo híbrido + IA</span>
        </h1>
        <p style={{ opacity: 0.9, maxWidth: 900 }}>
          Poisson calibrado + blend con mercado. Módulos Premium: Generador de Selección, Parlay e
          IA Boot. Pagos seguros con Stripe.
        </p>

        {/* Features */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
            gap: 12,
            marginTop: 18,
          }}
        >
          <Feature title="Modelo base">
            1X2, Over 2.5 y BTTS con ajuste DC suave y calibración opcional.
          </Feature>
          <Feature title="Generador de selección">
            Picks combinados con umbrales y penalización por correlación.
          </Feature>
          <Feature title="Parlay inteligente">
            EV, cuota justa y control de independencia aproximada.
          </Feature>
          <Feature title="IA Boot">
            Resúmenes y picks estructurados; fallback seguro al modelo base.
          </Feature>
        </div>

        {/* CTA */}
        <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
          <button style={pillBtn} onClick={() => nav("/app")}>
            Entrar
          </button>
        </div>

        <div style={{ opacity: 0.6, fontSize: 12, marginTop: 18 }}>
          * Uso educativo/informativo. No constituye asesoría financiera ni garantiza resultados.
        </div>
      </div>

      {/* Modal de planes (se abre solo si el usuario lo pide) */}
      <Modal open={plansOpen} onClose={() => setPlansOpen(false)} title="Planes Premium">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
            gap: 12,
          }}
        >
          <div style={{ ...card }}>
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 4 }}>Semanal</div>
            <div style={{ opacity: 0.85, marginBottom: 10 }}>
              Ideal para probar funciones Pro.
            </div>
            <button
              onClick={() => startCheckout(PRICES.weekly)}
              style={{ ...pillBtn, width: "100%", justifyContent: "center" }}
            >
              {loading === PRICES.weekly ? "Creando…" : "Empezar"}
            </button>
          </div>
          <div style={{ ...card }}>
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 4 }}>Mensual</div>
            <div style={{ opacity: 0.85, marginBottom: 10 }}>
              Uso continuo y soporte prioritario.
            </div>
            <button
              onClick={() => startCheckout(PRICES.monthly)}
              style={{ ...pillBtn, width: "100%", justifyContent: "center" }}
            >
              {loading === PRICES.monthly ? "Creando…" : "Empezar"}
            </button>
          </div>
          <div style={{ ...card }}>
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 4 }}>Anual</div>
            <div style={{ opacity: 0.85, marginBottom: 10 }}>Mejor precio / mes.</div>
            <button
              onClick={() => startCheckout(PRICES.yearly)}
              style={{ ...pillBtn, width: "100%", justifyContent: "center" }}
            >
              {loading === PRICES.yearly ? "Creando…" : "Empezar"}
            </button>
          </div>
        </div>

        <div style={{ opacity: 0.7, fontSize: 12, marginTop: 10 }}>
          Al finalizar, volverás a la app y se activará tu acceso Premium automáticamente.
        </div>
      </Modal>
    </div>
  );
}
