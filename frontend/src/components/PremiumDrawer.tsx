// src/components/PremiumDrawer.tsx
import { useMemo, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  API_BASE: string;
  currentKey?: string;                // clave guardada (si ya es premium)
  onKeySubmit?: (k: string) => void;  // para guardar una clave manual (opcional)
};

type Plan = "weekly" | "monthly" | "annual";

const sheet: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.55)",
  backdropFilter: "blur(4px)",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  paddingTop: 24,
  zIndex: 70,
};

const panel: React.CSSProperties = {
  width: "min(1100px, 96vw)",
  maxHeight: "90vh",
  overflow: "auto",
  background:
    "radial-gradient(900px 500px at 110% -20%, #1d4ed8aa 0%, transparent 60%), radial-gradient(1200px 600px at -20% -40%, #7c3aedad 0%, transparent 60%), #0b1020",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 22,
  padding: 18,
  color: "#e5e7eb",
};

const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "9px 12px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,.14)",
  background: "rgba(255,255,255,.05)",
  color: "#d1d5db",
  fontWeight: 700,
};

const btnPrimary: React.CSSProperties = {
  background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
  color: "white",
  border: "none",
  borderRadius: 14,
  padding: "12px 16px",
  fontWeight: 900,
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  ...pill,
  cursor: "pointer",
};

const card: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 18,
  padding: 18,
};

const label: React.CSSProperties = {
  color: "#a5b4fc",
  fontSize: 12,
  marginBottom: 6,
  fontWeight: 800,
  letterSpacing: 0.3,
};

const inputCss: React.CSSProperties = {
  width: "100%",
  background: "#0f172a",
  color: "white",
  border: "1px solid rgba(255,255,255,.18)",
  borderRadius: 12,
  padding: "12px 14px",
  outline: "none",
};

export default function PremiumDrawer({
  open,
  onClose,
  API_BASE,
  currentKey,
  onKeySubmit,
}: Props) {
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [showRedeem, setShowRedeem] = useState(false);
  const [manualKey, setManualKey] = useState("");

  const isPremium = useMemo(() => !!(currentKey && currentKey.trim()), [currentKey]);

  if (!open) return null;

  async function startCheckout(plan: Plan) {
    try {
      setLoadingPlan(plan);
      const res = await fetch(`${API_BASE}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json().catch(() => ({}));
      const url =
        data.url ||
        data.session_url ||
        data.checkout_url ||
        data?.session?.url;

      if (!res.ok || !url) {
        console.error("Checkout error:", data);
        alert("No se pudo iniciar el checkout.");
        return;
      }
      window.location.href = url; // redirige a Stripe
    } catch (e) {
      console.error(e);
      alert("No se pudo iniciar el checkout.");
    } finally {
      setLoadingPlan(null);
    }
  }

  function handleRedeem() {
    const k = manualKey.trim();
    if (!k) return;
    onKeySubmit?.(k);
    setManualKey("");
    setShowRedeem(false);
  }

  return (
    <div style={sheet} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
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
              fontSize: 26,
              fontWeight: 900,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            👑 Acceso Premium
          </div>
          <button onClick={onClose} style={btnGhost}>
            Cerrar ✕
          </button>
        </div>

        {/* Estado actual */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {isPremium ? (
            <span style={{ ...pill, borderColor: "#22c55e", background: "rgba(34,197,94,.12)" }}>
              ✅ Premium activo
            </span>
          ) : (
            <span style={pill}>🔒 Pago seguro con Stripe</span>
          )}
          <span style={{ opacity: 0.85, fontSize: 12 }}>
            Al completar el pago volverás a la app y tu acceso se activará automáticamente.
          </span>
        </div>

        {/* Contenido */}
        <div
          style={{
            display: "grid",
            gap: 14,
            marginTop: 14,
            gridTemplateColumns: "1fr",
          }}
        >
          {/* Grid 2 columnas en desktop */}
          <div
            style={{
              display: "grid",
              gap: 14,
              gridTemplateColumns: "1.1fr .9fr",
            }}
          >
            {/* Columna izquierda: beneficios */}
            <div style={{ ...card, padding: 16 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>¿Qué incluye?</div>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                <li>
                  🤖 <b>IA Boot</b>: análisis narrativo con picks fundamentados.
                </li>
                <li>
                  🧮 <b>Parley Builder</b>: combinadas con EV cuando hay cuotas.
                </li>
                <li>
                  🎯 <b>Selección combinada</b>: 1X/BTTS/Over/Under/Córners/Tarjetas.
                </li>
                <li>
                  💰 <b>Gestión Pro</b>: Kelly, bankroll y registro de tickets.
                </li>
                <li>
                  🚀 <b>Experiencia pura</b>: sin anuncios + soporte prioritario.
                </li>
              </ul>
              <div style={{ marginTop: 10, opacity: 0.85, fontSize: 12 }}>
                * En pruebas usa tarjetas de test de Stripe.
              </div>
            </div>

            {/* Columna derecha: planes */}
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 2 }}>1. Elige tu Plan</div>

              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "1fr",
                }}
              >
                <div style={card}>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>Semanal</div>
                  <div style={{ opacity: 0.85 }}>Acceso completo por 7 días</div>
                  <div style={{ fontSize: 30, fontWeight: 900 }}>MXN 70.00</div>
                  <button
                    style={btnPrimary}
                    onClick={() => startCheckout("weekly")}
                    disabled={loadingPlan === "weekly"}
                  >
                    {loadingPlan === "weekly" ? "Abriendo…" : "Empezar ahora"}
                  </button>
                  <div style={{ opacity: 0.8, fontSize: 12 }}>
                    Se renueva semanalmente. Cancela cuando quieras.
                  </div>
                </div>

                <div style={card}>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>Mensual</div>
                  <div style={{ opacity: 0.85 }}>Ideal para uso continuo</div>
                  <div style={{ fontSize: 30, fontWeight: 900 }}>MXN 130.00</div>
                  <button
                    style={btnPrimary}
                    onClick={() => startCheckout("monthly")}
                    disabled={loadingPlan === "monthly"}
                  >
                    {loadingPlan === "monthly" ? "Abriendo…" : "Empezar ahora"}
                  </button>
                  <div style={{ opacity: 0.8, fontSize: 12 }}>
                    Se renueva mensualmente. Cancela cuando quieras.
                  </div>
                </div>

                <div style={card}>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>Anual</div>
                  <div style={{ opacity: 0.85 }}>El mejor precio por mes</div>
                  <div style={{ fontSize: 30, fontWeight: 900 }}>MXN 1300.00</div>
                  <button
                    style={btnPrimary}
                    onClick={() => startCheckout("annual")}
                    disabled={loadingPlan === "annual"}
                  >
                    {loadingPlan === "annual" ? "Abriendo…" : "Empezar ahora"}
                  </button>
                  <div style={{ opacity: 0.8, fontSize: 12 }}>
                    Cargo anual. Cancela la renovación cuando quieras.
                  </div>
                </div>
              </div>

              {/* Canje manual de clave (opcional) */}
              <div style={{ ...card, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 900 }}>¿Ya tienes una clave Premium?</div>
                  <button style={btnGhost} onClick={() => setShowRedeem((s) => !s)}>
                    {showRedeem ? "Ocultar" : "Canjear clave"}
                  </button>
                </div>
                {showRedeem && (
                  <div style={{ marginTop: 10 }}>
                    <div style={label}>Ingresa tu clave</div>
                    <input
                      value={manualKey}
                      onChange={(e) => setManualKey(e.target.value)}
                      placeholder="pej. pm_ABC123..."
                      style={inputCss}
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button style={btnPrimary} onClick={handleRedeem}>
                        Guardar clave
                      </button>
                      <button style={btnGhost} onClick={() => setShowRedeem(false)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Pie de ayuda */}
          <div style={{ opacity: 0.85, fontSize: 12, textAlign: "center" }}>
            ¿Dudas con el pago? Escríbenos por soporte, con gusto te ayudamos.
          </div>
        </div>
      </div>
    </div>
  );
}
