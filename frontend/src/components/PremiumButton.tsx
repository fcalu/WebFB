import { useState } from "react";

type Props = {
  apiBase: string;                 // e.g. https://tu-backend.onrender.com
  premiumKey?: string | null;      // para mostrar “Activo” si ya tiene premium
  plan?: "monthly" | "annual";     // por simplicidad: default mensual
};

export default function PremiumButton({ apiBase, premiumKey, plan = "monthly" }: Props) {
  const [loading, setLoading] = useState(false);

  async function goCheckout() {
    try {
      setLoading(true);
      const r = await fetch(`${apiBase}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, method: "card" }), // ← tarjeta crédito/débito
      });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json(); // { provider:"stripe", url:"..." }
      window.location.href = j.url; // redirige a Stripe Checkout
    } catch (e) {
      alert("No se pudo iniciar el pago con Stripe. Revisa la configuración.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={goCheckout}
      disabled={loading}
      title="Premium"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,.12)",
        color: "#d1d5db",
        background: "linear-gradient(90deg, #7c3aed, #5b21b6)",
        fontWeight: 800,
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.7 : 1,
      }}
    >
      👑 {loading ? "Abriendo Stripe…" : "Premium"}
      {!!premiumKey && <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.85 }}>✔ Activo</span>}
    </button>
  );
}
