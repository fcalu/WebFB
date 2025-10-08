import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE: string =
  (typeof window !== "undefined" && (window as any).__API_BASE__) ||
  (import.meta as any).env?.VITE_API_BASE_URL ||
  "http://localhost:8000";

export default function Landing() {
  const navigate = useNavigate();

  // ✅ Canjea premium_key si Stripe te devuelve a "/"
  useEffect(() => {
    const url = new URL(window.location.href);
    const success = url.searchParams.get("success");
    const sessionId = url.searchParams.get("session_id");
    const canceled = url.searchParams.get("canceled");
    (async () => {
      try {
        if (success === "true" && sessionId) {
          const r = await fetch(`${API_BASE}/stripe/redeem?session_id=${encodeURIComponent(sessionId)}`);
          const j = await r.json();
          if (r.ok && j?.premium_key) {
            localStorage.setItem("fm_premium_key", JSON.stringify(j.premium_key));
            alert("¡Premium activado! Tu clave quedó guardada.");
          } else {
            alert("Pago correcto, pero no pude recuperar la clave. Contacta soporte.");
          }
        } else if (canceled === "true") {
          alert("El pago fue cancelado.");
        }
      } catch (e: any) {
        alert(e?.message || "No se pudo canjear la sesión de Stripe.");
      } finally {
        // limpia querystring
        window.history.replaceState(null, "", window.location.pathname);
      }
    })();
  }, []);

  async function startCheckout(plan: "weekly" | "monthly" | "annual") {
    try {
      const r = await fetch(`${API_BASE}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, method: "card", user_email: "" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail || "Error al crear sesión");
      window.location.assign(j.url);
    } catch (e: any) {
      alert(e?.message || "No pude iniciar el checkout.");
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background:
        "radial-gradient(1200px 600px at 20% -10%, #3b0764 0%, transparent 60%), radial-gradient(900px 500px at 120% -20%, #1d4ed8 0%, transparent 55%), #0b1020",
      color: "#e5e7eb",
      fontFamily:
        "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,Helvetica,Arial,Apple Color Emoji,Segoe UI Emoji",
    }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 16px 80px" }}>
        {/* encabezado */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, display: "grid", placeItems: "center",
            background: "linear-gradient(135deg,#7c3aed,#5b21b6)", fontSize: 26 }}>⚽</div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>FootyMines · IA Predictor</div>
            <div style={{ opacity: .85 }}>Predicción clara para usuarios finales</div>
          </div>
        </div>

        {/* hero */}
        <h1 style={{ marginTop: 40, fontSize: 40, fontWeight: 900 }}>
          Predicciones de fútbol con modelo híbrido + IA
        </h1>
        <p style={{ opacity: .85, marginTop: 8 }}>
          Poisson calibrado + blend con mercado. Módulos Premium: Generador de Selección, Parlay e IA Boot.
          Pagos seguros con Stripe.
        </p>

        {/* features */}
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", marginTop: 24 }}>
          <Card title="Modelo base" desc="1X2, Over 2.5 y BTTS con ajuste DC suave y calibración opcional." />
          <Card title="Generador de selección" desc="Picks combinados con umbrales y penalización por correlación." />
          <Card title="Parlay inteligente" desc="EV, cuota justa y control de independencia aproximada." />
          <Card title="IA Boot" desc="Resúmenes y picks estructurados; fallback seguro al modelo base." />
        </div>

        {/* CTA */}
        <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
          <button
            onClick={() => navigate("/app")}
            style={btnPrimary}
          >Entrar</button>

          {/* “Ver planes” abre tarjetas con checkout directo */}
          <div style={{
            background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)",
            borderRadius: 16, padding: 14, width: "100%"
          }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Elige tu plan</div>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
              <PlanCard title="Semanal" price="MXN 70.00 / semana" onClick={() => startCheckout("weekly")} />
              <PlanCard title="Mensual" price="MXN 130.00 / mes" onClick={() => startCheckout("monthly")} />
              <PlanCard title="Anual" price="MXN 1,199.00 / año" onClick={() => startCheckout("annual")} />
            </div>
          </div>
        </div>

        <p style={{ opacity: .5, marginTop: 18, fontSize: 12 }}>
          * Uso educativo/informativo. No constituye asesoría financiera ni garantiza resultados.
        </p>
      </div>
    </div>
  );
}

function Card({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, padding: 16
    }}>
      <div style={{ fontWeight: 900, marginBottom: 6 }}>{title}</div>
      <div style={{ opacity: .85 }}>{desc}</div>
    </div>
  );
}

function PlanCard({ title, price, onClick }: { title: string; price: string; onClick: () => void }) {
  return (
    <div style={{
      background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, padding: 16
    }}>
      <div style={{ fontWeight: 900, marginBottom: 4 }}>{title}</div>
      <div style={{ opacity: .85, marginBottom: 10 }}>{price}</div>
      <button onClick={onClick}
        style={{ ...btnPrimary, padding: "12px 16px", fontSize: 14 }}>Empezar</button>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
  color: "white",
  border: "none",
  borderRadius: 14,
  padding: "14px 18px",
  fontWeight: 900,
  fontSize: 16,
};

