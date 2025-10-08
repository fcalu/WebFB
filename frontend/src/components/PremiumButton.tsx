import { useEffect, useState } from "react";

type Status = { active: boolean; current_period_end?: number; plan?: string; status?: string };

export default function PremiumButton({
  apiBase,
  premiumKey,
  onRedeemDone,
}: {
  apiBase: string;
  premiumKey: string;
  onRedeemDone?: (s: Status) => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>({ active: false });

  async function refresh() {
    if (!premiumKey) {
      setStatus({ active: false });
      return;
    }
    try {
      const r = await fetch(`${apiBase}/premium/status`, { headers: { "X-Premium-Key": premiumKey } });
      const j: Status = await r.json();
      setStatus(j);
      onRedeemDone?.(j);
    } catch {
      setStatus({ active: false });
    }
  }

  useEffect(() => { refresh(); }, [premiumKey]);

  const cpeStr = status.current_period_end
    ? new Date(status.current_period_end * 1000).toLocaleDateString()
    : "";

  async function startCheckout(price_id: string) {
    const r = await fetch(`${apiBase}/create-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price_id, user_email: "" }),
    });
    const j = await r.json();
    if (!r.ok) return alert(j.detail || "Error al crear sesión");
    window.location.assign(j.session_url);
  }

  async function openPortal() {
    if (!premiumKey) return;
    const r = await fetch(`${apiBase}/create-billing-portal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ premium_key: premiumKey }),
    });
    const j = await r.json();
    if (!r.ok) return alert(j.detail || "Error");
    window.location.assign(j.url);
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "12px 18px",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,.12)",
          background: status.active ? "linear-gradient(135deg,#22c55e,#16a34a)" : "rgba(255,255,255,.06)",
          color: "#fff",
          fontWeight: 900,
          cursor: "pointer",
        }}
        title={status.active ? `Premium activo · vence ${cpeStr}` : "Premium"}
      >
        {status.active ? "✅ Premium activo" : "👑 Premium"}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            marginTop: 8,
            background: "#0b1020",
            border: "1px solid rgba(255,255,255,.12)",
            borderRadius: 12,
            width: 320,
            padding: 10,
            zIndex: 40,
          }}
        >
          {status.active ? (
            <>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Tu suscripción</div>
              <div style={{ fontSize: 14, opacity: .85, marginBottom: 8 }}>
                Plan: {status.plan || "—"} · Estado: {status.status || "—"}
                <br />
                Vence: <b>{cpeStr || "—"}</b>
              </div>
              <button onClick={openPortal} style={btn("rgba(59,130,246,.25)")} >⚙️ Gestionar / Cambiar tarjeta</button>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Elige tu plan</div>
              <button onClick={() => startCheckout(import.meta.env.VITE_PRICE_WEEKLY)} style={btn("#3b82f61f")}>📅 Semanal</button>
              <button onClick={() => startCheckout(import.meta.env.VITE_PRICE_MONTHLY)} style={btn("#3b82f61f")}>📆 Mensual</button>
              <button onClick={() => startCheckout(import.meta.env.VITE_PRICE_ANNUAL)} style={btn("#3b82f61f")}>🛡️ Anual</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return {
    width: "100%",
    textAlign: "left",
    marginTop: 6,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,.12)",
    background: bg,
    color: "#e5e7eb",
    cursor: "pointer",
  };
}
