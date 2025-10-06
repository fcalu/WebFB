// src/components/BillingDrawer.tsx
import { useEffect, useMemo, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  API_BASE: string;
  currentKey?: string;
  onKeySaved: (k: string) => void; // guarda premium_key en localStorage (setPremiumKey)
};

type CheckoutResp = { provider: "stripe"; url: string };
type PayPalCreateResp = { order_id: string; approve_url: string };
type PayPalCaptureResp = { premium_key: string; status: string; current_period_end: number };

const sheet: React.CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  width: "min(760px, 100%)",
  background: "#0b1220",
  borderLeft: "1px solid rgba(255,255,255,.08)",
  zIndex: 80,
  boxShadow: "0 12px 34px rgba(0,0,0,.5)",
  transform: "translateX(0)",
  transition: "transform .25s ease",
  overflow: "hidden",
};
const head: React.CSSProperties = {
  padding: "16px 18px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  borderBottom: "1px solid rgba(255,255,255,.08)",
  background: "linear-gradient(90deg,#1e1635,#0b1220)",
};
const title: React.CSSProperties = { fontSize: 22, fontWeight: 900, display: "flex", gap: 10, alignItems: "center" };
const body: React.CSSProperties = { padding: 16, height: "100%", overflow: "auto" };
const card: React.CSSProperties = {
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 16,
  padding: 14,
};
const badge: React.CSSProperties = {
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
const label: React.CSSProperties = { color: "#a5b4fc", fontSize: 12, marginBottom: 6, fontWeight: 800, letterSpacing: 0.3 };
const btnPrimary: React.CSSProperties = {
  background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
  color: "white",
  border: "none",
  borderRadius: 14,
  padding: "14px 18px",
  fontWeight: 900,
  fontSize: 16,
  cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,.12)",
  background: "rgba(255,255,255,.06)",
  color: "#e5e7eb",
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
};

export default function BillingDrawer({ open, onClose, API_BASE, currentKey, onKeySaved }: Props) {
  const [plan, setPlan] = useState<"monthly" | "annual">("monthly");
  const [method, setMethod] = useState<"card" | "oxxo" | "paypal">("card");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // Para PayPal: al volver con ?pp_return=true&token=ORDER_ID
  const [ppOrderId, setPpOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr("");
    setMsg("");
    // Detectar regreso desde PayPal (después de aprobar)
    const url = new URL(window.location.href);
    const ppReturn = url.searchParams.get("pp_return");
    const token = url.searchParams.get("token"); // PayPal usa 'token' como order_id
    if (ppReturn === "true" && token) {
      setMethod("paypal");
      setPpOrderId(token);
      setMsg("Pago aprobado en PayPal. Falta capturar para activar tu Premium.");
      // Quitar los parámetros para no repetir el flujo
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [open]);

  const priceCopy = useMemo(
    () =>
      plan === "annual"
        ? { title: "Anual", save: "Ahorra 16%", detail: "Facturado anualmente", cta: "Continuar con Anual" }
        : { title: "Mensual", save: "", detail: "Facturado mensualmente", cta: "Continuar con Mensual" },
    [plan]
  );

  async function goStripeCheckout(kind: "card" | "oxxo") {
    setLoading(true);
    setErr("");
    setMsg("");
    try {
      // email es útil para pre-cargar el checkout; para OXXO es imprescindible mostrar el boleto en Stripe
      const res = await fetch(`${API_BASE}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, method: kind, user_email: email || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = (await res.json()) as CheckoutResp;
      window.location.href = j.url; // redirige a Stripe
    } catch (e: any) {
      setErr(e?.message || "No pude iniciar el checkout.");
    } finally {
      setLoading(false);
    }
  }

  async function startPayPal() {
    setLoading(true);
    setErr("");
    setMsg("");
    try {
      const r = await fetch(`${API_BASE}/paypal/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!r.ok) throw new Error(await r.text());
      const j = (await r.json()) as PayPalCreateResp;
      window.location.href = j.approve_url; // abre PayPal
    } catch (e: any) {
      setErr(e?.message || "No pude crear la orden de PayPal.");
    } finally {
      setLoading(false);
    }
  }

  async function capturePayPal() {
    if (!ppOrderId) return;
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`${API_BASE}/paypal/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: ppOrderId }),
      });
      if (!r.ok) throw new Error(await r.text());
      const j = (await r.json()) as PayPalCaptureResp;
      onKeySaved(j.premium_key);
      setMsg("¡Listo! Premium activado automáticamente.");
      setPpOrderId(null);
    } catch (e: any) {
      setErr(e?.message || "No se pudo capturar el pago de PayPal.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div style={sheet} role="dialog" aria-modal>
      <div style={head}>
        <div style={title}>👑 <span>Facturación & Premium</span></div>
        <button onClick={onClose} style={btnGhost}>Cerrar ✕</button>
      </div>

      <div style={body}>
        <div style={{ display: "grid", gap: 12 }}>
          {/* Planes */}
          <div style={{ ...card }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ ...badge }}>Elige tu plan</span>
                {priceCopy.save && <span style={{ ...badge, borderColor: "#22c55e", color: "#86efac" }}>💸 {priceCopy.save}</span>}
              </div>
              {!!currentKey && <span style={{ ...badge, borderColor: "#60a5fa", color: "#bfdbfe" }}>Clave activa</span>}
            </div>

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
              <PlanCard
                active={plan === "monthly"}
                title="Mensual"
                price="USD $30"
                detail="Facturado mensualmente"
                onClick={() => setPlan("monthly")}
              />
              <PlanCard
                active={plan === "annual"}
                title="Anual"
                price="USD $25"
                sub="(~$30) por usuario/mes"
                detail="Facturado anualmente"
                onClick={() => setPlan("annual")}
              />
            </div>
          </div>

          {/* Métodos de pago */}
          <div style={{ ...card }}>
            <div style={{ ...label, marginBottom: 10 }}>Método de pago</div>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
              <MethodButton active={method === "card"} onClick={() => setMethod("card")} emoji="💳" label="Tarjeta / Débito (Stripe)" />
              <MethodButton active={method === "oxxo"} onClick={() => setMethod("oxxo")} emoji="🧾" label="OXXO (Stripe)" />
              <MethodButton active={method === "paypal"} onClick={() => setMethod("paypal")} emoji="🟡" label="PayPal" />
            </div>

            {/* Email para Stripe */}
            {(method === "card" || method === "oxxo") && (
              <div style={{ marginTop: 12 }}>
                <div style={label}>Correo (para el recibo y tu cuenta)</div>
                <input
                  style={input}
                  type="email"
                  placeholder="tucorreo@dominio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {method === "oxxo" && (
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                    Con OXXO se genera un voucher. Tu acceso se activa automáticamente cuando el pago se acredita.
                  </div>
                )}
              </div>
            )}

            {/* CTA */}
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              {method === "card" && (
                <button
                  disabled={loading}
                  onClick={() => goStripeCheckout("card")}
                  style={{ ...btnPrimary, opacity: loading ? 0.6 : 1 }}
                >
                  {loading ? "Abriendo Checkout…" : "Pagar con Tarjeta (Stripe)"}
                </button>
              )}
              {method === "oxxo" && (
                <button
                  disabled={loading || !email}
                  onClick={() => goStripeCheckout("oxxo")}
                  style={{ ...btnPrimary, opacity: loading || !email ? 0.6 : 1 }}
                  title={!email ? "Ingresa tu correo" : ""}
                >
                  {loading ? "Generando voucher…" : "Pagar con OXXO (Stripe)"}
                </button>
              )}
              {method === "paypal" && (
                <>
                  {!ppOrderId ? (
                    <button
                      disabled={loading}
                      onClick={startPayPal}
                      style={{ ...btnPrimary, opacity: loading ? 0.6 : 1 }}
                    >
                      {loading ? "Conectando a PayPal…" : "Pagar con PayPal"}
                    </button>
                  ) : (
                    <button
                      disabled={loading}
                      onClick={capturePayPal}
                      style={{ ...btnPrimary, background: "linear-gradient(135deg,#16a34a,#065f46)", opacity: loading ? 0.6 : 1 }}
                    >
                      {loading ? "Capturando…" : "Finalizar y activar (capturar PayPal)"}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Mensajes */}
            {err && (
              <div
                role="alert"
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
            {msg && (
              <div
                style={{
                  marginTop: 12,
                  background: "rgba(34,197,94,.12)",
                  border: "1px solid rgba(34,197,94,.35)",
                  padding: 12,
                  borderRadius: 12,
                  color: "#bbf7d0",
                }}
              >
                {msg}
              </div>
            )}
          </div>

          {/* FAQ corto */}
          <div style={{ ...card }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>FAQ rápido</div>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
              <li>Con **Tarjeta** se crea una suscripción (Stripe). Puedes cancelarla en cualquier momento.</li>
              <li>Con **OXXO**/ **PayPal** es **pago único** y te damos acceso por el periodo del plan.</li>
              <li>Tras pagar con Stripe, tu app volverá con <code>?success=true&session_id=…</code> y tu App ya hace el <i>redeem</i>.</li>
              <li>Tras aprobar en PayPal, regresas con <code>?pp_return=true&token=…</code>. Aquí verás el botón para **capturar** y activar.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --- UI helpers --- */
function PlanCard({
  active,
  title,
  price,
  sub,
  detail,
  onClick,
}: {
  active: boolean;
  title: string;
  price: string;
  sub?: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: 16,
        borderRadius: 16,
        border: active ? "2px solid #7c3aed" : "1px solid rgba(255,255,255,.12)",
        background: active ? "linear-gradient(135deg,#312e81,#0b1220)" : "rgba(255,255,255,.03)",
        color: "#e5e7eb",
        cursor: "pointer",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{price}</div>
      {sub && <div style={{ opacity: 0.75, fontSize: 12, marginTop: 2 }}>{sub}</div>}
      <div style={{ opacity: 0.8, fontSize: 13, marginTop: 8 }}>{detail}</div>
    </button>
  );
}

function MethodButton({
  active,
  emoji,
  label,
  onClick,
}: {
  active: boolean;
  emoji: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 14px",
        borderRadius: 14,
        border: active ? "2px solid #7c3aed" : "1px solid rgba(255,255,255,.12)",
        background: active ? "linear-gradient(135deg,#1f1536,#0b1220)" : "rgba(255,255,255,.03)",
        color: "#e5e7eb",
        cursor: "pointer",
      }}
    >
      <span style={{ fontSize: 18 }}>{emoji}</span>
      <span style={{ fontWeight: 800 }}>{label}</span>
    </button>
  );
}
