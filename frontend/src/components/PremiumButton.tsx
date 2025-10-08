import { useState } from "react";

export default function PremiumButton({ apiBase, premiumKey }: { apiBase: string; premiumKey?: string }) {
  const [open, setOpen] = useState(false);

  async function startCheckout(plan: "weekly" | "monthly" | "annual") {
    try {
      const r = await fetch(`${apiBase}/billing/checkout`, {
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
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 14px",
          borderRadius: 12, border: "1px solid rgba(255,255,255,.12)", color: "#d1d5db",
          background: "rgba(255,255,255,.06)", fontWeight: 800
        }}
        title="Premium"
      >
        👑 Premium
      </button>

      {open && (
        <div
          style={{
            position: "absolute", right: 0, marginTop: 8, width: 280,
            background: "#0b1020", border: "1px solid rgba(255,255,255,.12)", borderRadius: 14, padding: 10, zIndex: 50
          }}
        >
          <div style={{ fontWeight: 900, margin: "6px 8px 8px" }}>Elige tu plan</div>
          <MenuItem label="📅 Semanal" onClick={() => startCheckout("weekly")} />
          <MenuItem label="💳 Mensual" onClick={() => startCheckout("monthly")} />
          <MenuItem label="🛡️ Anual" onClick={() => startCheckout("annual")} />
        </div>
      )}
    </div>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 10,
        background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)",
        color: "#e5e7eb", cursor: "pointer", marginBottom: 8
      }}
    >
      {label}
    </button>
  );
}
