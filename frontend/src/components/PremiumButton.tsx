import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  apiBase: string;
  /** Clave premium actual (si existe en localStorage, App te la pasa) */
  premiumKey?: string;
};

/** Lee variables de entorno (IDs de precios de Stripe) */
const PRICES = {
  weekly: (import.meta as any).env?.VITE_STRIPE_PRICE_WEEKLY_ID || "",
  monthly: (import.meta as any).env?.VITE_STRIPE_PRICE_MONTHLY_ID || "",
  yearly: (import.meta as any).env?.VITE_STRIPE_PRICE_YEARLY_ID || "",
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
  cursor: "pointer",
};

const menuWrap: React.CSSProperties = {
  position: "relative",
};

const menuCard: React.CSSProperties = {
  position: "absolute",
  right: 0,
  marginTop: 8,
  width: 300,
  background: "#0b1020",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 16,
  padding: 10,
  zIndex: 30,
  boxShadow: "0 20px 40px rgba(0,0,0,.35)",
};

const item: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "14px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.10)",
  background: "rgba(255,255,255,.03)",
  cursor: "pointer",
};

function fmtDate(ts?: number) {
  if (!ts) return "";
  try {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString();
  } catch {
    return "";
  }
}

export default function PremiumButton({ apiBase, premiumKey }: Props) {
  const [open, setOpen] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    active?: boolean;
    plan?: string;
    current_period_end?: number;
    cancel_at_period_end?: boolean;
  }>({});

  const isPremium = !!premiumKey;

  // Cerrar menú al hacer click fuera
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Consultar estado (si tu backend expone /stripe/me con X-Premium-Key)
  useEffect(() => {
    let abort = false;
    (async () => {
      if (!isPremium) {
        setStatus({});
        return;
      }
      try {
        const r = await fetch(`${apiBase}/stripe/me`, {
          headers: premiumKey ? { "X-Premium-Key": premiumKey } : undefined,
        });
        if (!r.ok) return; // endpoint opcional
        const j = await r.json();
        if (abort) return;
        setStatus({
          active: j?.active ?? (j?.status === "active" || j?.status === "trialing"),
          plan: j?.plan || j?.price_id || undefined,
          current_period_end: j?.current_period_end,
          cancel_at_period_end: j?.cancel_at_period_end,
        });
      } catch {
        /* silencioso: endpoint puede no existir */
      }
    })();
    return () => {
      abort = true;
    };
  }, [apiBase, premiumKey, isPremium]);

  /** Manejo robusto de errores en checkout */
  async function startCheckout(price_id: string) {
    if (!price_id) {
      alert(
        "Falta configurar el PRICE_ID de Stripe en las variables de entorno del frontend (VITE_STRIPE_PRICE_*_ID)."
      );
      return;
    }
    try {
      setLoadingPlan(price_id);
      const r = await fetch(`${apiBase}/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price_id, user_email: "" }),
      });

      const raw = await r.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        /* noop */
      }

      if (!r.ok) {
        const msg = j.detail || j.message || raw || `HTTP ${r.status}`;
        throw new Error(msg);
      }
      if (!j.session_url) throw new Error("Respuesta del backend sin session_url.");
      window.location.assign(j.session_url);
    } catch (err: any) {
      console.error("Checkout error:", err);
      alert(err?.message || String(err));
    } finally {
      setLoadingPlan(null);
    }
  }

  async function openPortal() {
    try {
      const r = await fetch(`${apiBase}/create-portal-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(premiumKey ? { "X-Premium-Key": premiumKey } : {}),
        },
        body: JSON.stringify({ return_url: window.location.href }),
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
      if (!j.url) throw new Error("El backend no devolvió la URL del portal.");
      window.location.assign(j.url);
    } catch (e: any) {
      alert(e?.message || "No se pudo abrir el portal de facturación.");
    }
  }

  function pasteKey() {
    const k = prompt("Pega tu clave Premium:");
    if (!k) return;
    try {
      localStorage.setItem("fm_premium_key", k.trim());
      alert("Clave guardada. Recargando…");
      window.location.reload();
    } catch {
      alert("No pude guardar la clave en este navegador.");
    }
  }

  function revoke() {
    if (!confirm("¿Quitar acceso Premium en este dispositivo?")) return;
    try {
      localStorage.removeItem("fm_premium_key");
      alert("Acceso Premium revocado. Recargando…");
      window.location.reload();
    } catch {
      alert("No pude revocar la clave en este navegador.");
    }
  }

  const activeLabel = useMemo(() => {
    if (!isPremium) return null;
    const until = fmtDate(status.current_period_end);
    if (until) {
      return status.cancel_at_period_end
        ? `Activo hasta ${until} (cancelado)`
        : `Activo hasta ${until}`;
    }
    return "Premium activo";
  }, [isPremium, status.current_period_end, status.cancel_at_period_end]);

  return (
    <div style={menuWrap} ref={ref}>
      <button
        title="Premium"
        onClick={() => setOpen((v) => !v)}
        style={{
          ...pill,
          background: "rgba(255,255,255,.06)",
          borderColor: isPremium ? "#4ade80" : "rgba(255,255,255,.12)",
          fontWeight: 800,
        }}
      >
        👑 {isPremium ? "Premium" : "Premium"}
      </button>

      {open && (
        <div style={menuCard} role="menu" aria-label="Premium menu">
          {!isPremium ? (
            <>
              <div style={{ padding: "6px 8px", opacity: 0.85, fontSize: 13, marginBottom: 6 }}>
                Elige tu plan:
              </div>

              <div
                style={{ ...item, marginBottom: 8 }}
                onClick={() => startCheckout(PRICES.weekly)}
              >
                <span>📅 Semanal</span>
                <span style={{ marginLeft: "auto", opacity: 0.8, fontSize: 12 }}>
                  {loadingPlan === PRICES.weekly ? "Creando…" : "Empezar"}
                </span>
              </div>
              <div
                style={{ ...item, marginBottom: 8 }}
                onClick={() => startCheckout(PRICES.monthly)}
              >
                <span>💳 Mensual</span>
                <span style={{ marginLeft: "auto", opacity: 0.8, fontSize: 12 }}>
                  {loadingPlan === PRICES.monthly ? "Creando…" : "Empezar"}
                </span>
              </div>
              <div style={{ ...item }} onClick={() => startCheckout(PRICES.yearly)}>
                <span>🛡️ Anual</span>
                <span style={{ marginLeft: "auto", opacity: 0.8, fontSize: 12 }}>
                  {loadingPlan === PRICES.yearly ? "Creando…" : "Empezar"}
                </span>
              </div>

              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                <button
                  style={{ ...item, justifyContent: "center" }}
                  onClick={pasteKey}
                >
                  🔑 Ya tengo una clave
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ padding: "6px 8px", fontWeight: 800 }}>👑 Premium</div>
              <div
                style={{
                  padding: "6px 8px",
                  opacity: 0.85,
                  fontSize: 13,
                  marginBottom: 8,
                  lineHeight: 1.3,
                }}
              >
                {activeLabel}
                {status.plan ? (
                  <>
                    <br />
                    <span style={{ opacity: 0.7 }}>Plan: {status.plan}</span>
                  </>
                ) : null}
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <button style={{ ...item, justifyContent: "center" }} onClick={openPortal}>
                  🧾 Portal de facturación
                </button>
                <button style={{ ...item, justifyContent: "center" }} onClick={pasteKey}>
                  🔁 Cambiar clave
                </button>
                <button
                  style={{
                    ...item,
                    justifyContent: "center",
                    borderColor: "rgba(239,68,68,.35)",
                    background: "rgba(239,68,68,.08)",
                  }}
                  onClick={revoke}
                >
                  ❌ Quitar Premium en este dispositivo
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
