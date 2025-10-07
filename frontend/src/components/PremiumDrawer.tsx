// src/components/PremiumDrawer.tsx
import { useMemo, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  API_BASE: string;
  currentKey?: string;
  onKeySubmit?: (key: string) => void;
};

// ——— Ajusta aquí si quieres mostrar otros precios (solo para UI)
const FALLBACK_PRICES = {
  currency: "MXN",
  weekly: 70_00,   // $70.00
  monthly: 130_00, // $130.00
  annual: 1199_00, // $1,199.00
};

function fmtMoney(cents?: number, currency: string = "MXN") {
  if (typeof cents !== "number") return "—";
  const amount = cents / 100;
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.55)",
  backdropFilter: "blur(4px)",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  padding: "24px 14px",
  zIndex: 60,
};

const sheet: React.CSSProperties = {
  width: "min(1100px, 96vw)",
  maxHeight: "92vh",
  overflow: "auto",
  background: "rgba(17,24,39,.98)", // #111827
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 16,
  padding: 18,
  color: "#e5e7eb",
};

const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,.12)",
  color: "#d1d5db",
  background: "rgba(255,255,255,.06)",
  whiteSpace: "nowrap",
};

const card: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(124,58,237,.08), rgba(2,6,23,.35))",
  border: "1px solid rgba(124,58,237,.35)",
  borderRadius: 16,
  padding: 18,
};

const cta: React.CSSProperties = {
  display: "inline-block",
  background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
  color: "white",
  borderRadius: 999,
  padding: "12px 18px",
  fontWeight: 900,
  border: "none",
  cursor: "pointer",
};

const small: React.CSSProperties = { fontSize: 12, opacity: 0.85 };

export default function PremiumDrawer({
  open,
  onClose,
  API_BASE,
  currentKey,
  onKeySubmit,
}: Props) {
  const [busy, setBusy] = useState<null | "weekly" | "monthly" | "annual">(null);
  const [showKey, setShowKey] = useState(false);
  const [manualKey, setManualKey] = useState("");

  const prices = useMemo(() => FALLBACK_PRICES, []);
  const currency = prices.currency || "MXN";

  async function startCheckout(plan: "weekly" | "monthly" | "annual") {
    if (busy) return;
    setBusy(plan);
    try {
      const res = await fetch(`${API_BASE}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.url) {
        throw new Error(json?.detail || "No se pudo iniciar el checkout.");
      }
      window.location.href = json.url as string;
    } catch (e: any) {
      alert(e?.message || "Error al iniciar el pago.");
    } finally {
      setBusy(null);
    }
  }

  if (!open) return null;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 26, fontWeight: 900 }}>
            👑 Acceso Premium
          </div>
          <button onClick={onClose} style={pill} aria-label="Cerrar premium">Cerrar ✕</button>
        </div>

        {/* Grid: features + plans */}
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "1.1fr 1.9fr",
          }}
        >
          {/* Features */}
          <div style={{ padding: 6 }}>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>
              Desbloquea el poder del análisis profundo y las herramientas Pro:
            </div>

            <ul style={{ lineHeight: 1.7, paddingLeft: 0, listStyle: "none" }}>
              <li style={{ marginBottom: 10 }}>
                <span style={pill}>🤖 IA Boot</span>&nbsp;
                análisis narrativo con picks fundamentados.
              </li>
              <li style={{ marginBottom: 10 }}>
                <span style={pill}>🧮 Parley Builder</span>&nbsp;
                combinadas con EV cuando hay cuotas.
              </li>
              <li style={{ marginBottom: 10 }}>
                <span style={pill}>🎯 Selección Combinada</span>&nbsp;
                1X/BTTS/Over/Under/Córners/Tarjetas.
              </li>
              <li style={{ marginBottom: 10 }}>
                <span style={pill}>💼 Gestión Pro</span>&nbsp;
                Kelly, bankroll y registro de tickets.
              </li>
              <li style={{ marginBottom: 10 }}>
                <span style={pill}>🚀 Experiencia Pura</span>&nbsp;
                sin anuncios + soporte prioritario.
              </li>
            </ul>

            {/* Clave manual */}
            <div style={{ marginTop: 16 }}>
              <button
                onClick={() => setShowKey((v) => !v)}
                style={{ ...pill, cursor: "pointer" }}
                aria-expanded={showKey}
              >
                {showKey ? "Ocultar" : "Ya tengo una clave"} 🔑
              </button>

              {showKey && (
                <div
                  style={{
                    marginTop: 10,
                    border: "1px dashed rgba(255,255,255,.2)",
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <div style={{ ...small, marginBottom: 6 }}>
                    Pega tu clave Premium para activar tu acceso en este dispositivo.
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={manualKey}
                      onChange={(e) => setManualKey(e.target.value)}
                      placeholder="pmk_xxx..."
                      style={{
                        flex: 1,
                        background: "#0f172a",
                        border: "1px solid rgba(255,255,255,.16)",
                        color: "white",
                        borderRadius: 10,
                        padding: "10px 12px",
                        outline: "none",
                      }}
                    />
                    <button
                      style={cta}
                      onClick={() => {
                        const k = manualKey.trim();
                        if (!k) return;
                        onKeySubmit?.(k);
                        alert("Clave guardada. ¡Listo para usar funciones Pro!");
                      }}
                    >
                      Activar
                    </button>
                  </div>
                  {currentKey && (
                    <div style={{ ...small, marginTop: 6, opacity: 0.9 }}>
                      Clave actual detectada: <b>{currentKey.slice(0, 8)}…</b>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Plans */}
          <div style={{ padding: 6 }}>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>
              1. Elige tu Plan de Suscripción
            </div>

            <div
              style={{
                display: "grid",
                gap: 14,
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              }}
            >
              {/* Semanal */}
              <div style={card}>
                <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10, textAlign: "center" }}>
                  Semanal
                </div>
                <div style={{ fontSize: 32, fontWeight: 900, textAlign: "center" }}>
                  {fmtMoney(prices.weekly, currency)}
                </div>
                <div style={{ ...small, textAlign: "center", marginTop: 6 }}>Precio por semanal</div>
                <div style={{ textAlign: "center", marginTop: 14 }}>
                  <button
                    style={cta}
                    disabled={busy === "weekly"}
                    onClick={() => startCheckout("weekly")}
                  >
                    {busy === "weekly" ? "Abriendo…" : "Empezar prueba"}
                  </button>
                </div>
              </div>

              {/* Mensual */}
              <div style={card}>
                <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10, textAlign: "center" }}>
                  Mensual
                </div>
                <div style={{ fontSize: 32, fontWeight: 900, textAlign: "center" }}>
                  {fmtMoney(prices.monthly, currency)}
                </div>
                <div style={{ ...small, textAlign: "center", marginTop: 6 }}>Precio por mensual</div>
                <div style={{ textAlign: "center", marginTop: 14 }}>
                  <button
                    style={cta}
                    disabled={busy === "monthly"}
                    onClick={() => startCheckout("monthly")}
                  >
                    {busy === "monthly" ? "Abriendo…" : "Empezar prueba"}
                  </button>
                </div>
              </div>

              {/* Anual */}
              <div style={{ ...card, borderColor: "rgba(34,197,94,.35)", background: "linear-gradient(180deg, rgba(34,197,94,.10), rgba(2,6,23,.35))" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                  <span style={{ ...pill, borderColor: "rgba(34,197,94,.45)" }}>🛡️ Plan recomendado</span>
                </div>
                <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10, textAlign: "center" }}>
                  Anual
                </div>
                <div style={{ fontSize: 32, fontWeight: 900, textAlign: "center" }}>
                  {fmtMoney(prices.annual, currency)}
                </div>
                <div style={{ ...small, textAlign: "center", marginTop: 6 }}>Precio por anual</div>
                <div style={{ textAlign: "center", marginTop: 14 }}>
                  <button
                    style={{ ...cta, background: "linear-gradient(135deg, #22c55e, #16a34a)" }}
                    disabled={busy === "annual"}
                    onClick={() => startCheckout("annual")}
                  >
                    {busy === "annual" ? "Abriendo…" : "Empezar prueba"}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ ...small, marginTop: 12, opacity: 0.85 }}>
              Pagos procesados de forma segura por Stripe. Puedes cancelar en cualquier momento desde tu perfil.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
