import React, { useEffect, useRef, useState } from "react";

type Props = {
  apiBase: string;
  premiumKey?: string;
};

export default function PremiumButton({ apiBase, premiumKey }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<"idle" | "checkout" | "portal">("idle");
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function startCheckout(plan: "weekly" | "monthly" | "annual") {
    try {
      setLoading("checkout");
      const res = await fetch(`${apiBase}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, method: "card", user_email: "" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.detail || "No se pudo crear la sesión de pago.");
      if (j?.url) window.location.assign(j.url);
      else throw new Error("Respuesta inválida del servidor.");
    } catch (e: any) {
      alert(e?.message || "Error al iniciar el checkout.");
    } finally {
      setLoading("idle");
    }
  }

  async function openBillingPortal() {
    try {
      if (!premiumKey) return;
      setLoading("portal");
      const res = await fetch(`${apiBase}/create-billing-portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ premium_key: premiumKey }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.detail || "No se pudo abrir el portal de facturación.");
      if (j?.url) window.location.assign(j.url);
      else throw new Error("Respuesta inválida del servidor.");
    } catch (e: any) {
      alert(e?.message || "Error al abrir el portal de facturación.");
    } finally {
      setLoading("idle");
    }
  }

  if (premiumKey) {
    return (
      <button
        onClick={openBillingPortal}
        disabled={loading !== "idle"}
        title="Gestionar suscripción"
        style={btn}
      >
        👑 Gestionar
      </button>
    );
  }

  return (
    <div style={{ position: "relative" }} ref={popRef}>
      <button onClick={() => setOpen((v) => !v)} title="Hazte Premium" style={btn}>
        👑 Premium
      </button>

      {open && (
        <div role="menu" style={menu}>
          <div style={{ padding: "8px 10px", fontSize: 12, opacity: .8 }}>Elige tu plan</div>

          <button onClick={() => startCheckout("weekly")} disabled={loading !== "idle"} style={item}>
            🗓️ Semanal
          </button>

          <button onClick={() => startCheckout("monthly")} disabled={loading !== "idle"} style={item}>
            💳 Mensual
          </button>

          <button onClick={() => startCheckout("annual")} disabled={loading !== "idle"} style={item}>
            🛡️ Anual
          </button>
        </div>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.12)",
  color: "#d1d5db",
  background: "linear-gradient(90deg, #7c3aed, #5b21b6)",
  fontWeight: 800,
  cursor: "pointer",
};

const menu: React.CSSProperties = {
  position: "absolute",
  right: 0,
  top: "calc(100% + 8px)",
  minWidth: 240,
  background: "rgba(15,23,42,.98)",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 12,
  boxShadow: "0 10px 24px rgba(0,0,0,.35)",
  padding: 8,
  zIndex: 100,
};

const item: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,.08)",
  background: "rgba(255,255,255,.03)",
  color: "#e5e7eb",
  cursor: "pointer",
  marginBottom: 6,
};
