import React, { useEffect, useMemo, useState } from "react";

type Props = {
  apiBase: string;
  premiumKey?: string | null;
  onRedeemDone?: (status: any) => void;
  showLabel?: string;
};

const LABEL_WEEKLY =
  (import.meta as any).env?.VITE_PRICE_WEEKLY_LABEL ?? "Semanal";
const LABEL_MONTHLY =
  (import.meta as any).env?.VITE_PRICE_MONTHLY_LABEL ?? "Mensual";
const LABEL_YEARLY =
  (import.meta as any).env?.VITE_PRICE_YEARLY_LABEL ?? "Anual";

async function postJSON<T>(url: string, body: any): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
  return (await r.json()) as T;
}

export default function PremiumButton({
  apiBase,
  premiumKey,
  onRedeemDone,
  showLabel = "Premium",
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    active: boolean;
    status?: string | null;
    current_period_end?: number | null;
    email?: string | null;
    plan?: string | null;
  }>({ active: false });

  // Permite abrir el modal desde otros sitios: document.dispatchEvent(new CustomEvent("open-premium"))
  useEffect(() => {
    const fn = () => setOpen(true);
    document.addEventListener("open-premium", fn as any);
    return () => document.removeEventListener("open-premium", fn as any);
  }, []);

  // Estado verificado (opcional)
  useEffect(() => {
    let abort = false;
    (async () => {
      if (!premiumKey) {
        setStatus({ active: false });
        return;
      }
      try {
        const r = await fetch(`${apiBase}/premium/status`, {
          headers: { "X-Premium-Key": premiumKey },
        });
        if (!r.ok) throw new Error(await r.text());
        const j = await r.json();
        if (!abort) setStatus(j);
        onRedeemDone?.(j);
      } catch {
        if (!abort) setStatus({ active: false });
      }
    })();
    return () => {
      abort = true;
    };
  }, [apiBase, premiumKey]);

  const isActive = !!status.active;
  const expiresText = useMemo(() => {
    if (!status?.current_period_end) return "";
    try {
      const d = new Date(status.current_period_end * 1000);
      return ` (vence ${d.toLocaleDateString()})`;
    } catch {
      return "";
    }
  }, [status?.current_period_end]);

  async function startCheckout(plan: "weekly" | "monthly" | "annual") {
    try {
      setBusy(plan);
      const j = await postJSON<{ provider: string; url: string }>(
        `${apiBase}/billing/checkout`,
        { plan, method: "card" }
      );
      if (j?.url) {
        window.location.href = j.url; // → Stripe
      } else {
        alert("No se pudo iniciar el checkout.");
      }
    } catch (e: any) {
      alert(e?.message || "Error iniciando checkout.");
      setBusy(null);
    }
  }

  async function openBillingPortal() {
    if (!premiumKey) return alert("No hay clave premium en este dispositivo.");
    try {
      setBusy("portal");
      const j = await postJSON<{ url: string }>(`${apiBase}/create-billing-portal`, {
        premium_key: premiumKey,
      });
      if (j?.url) window.location.href = j.url;
      else alert("No se pudo abrir el portal de facturación.");
    } catch (e: any) {
      alert(e?.message || "No pude conectar con /create-billing-portal.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {/* Botón del header */}
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: "12px 18px",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,.12)",
          background: isActive
            ? "linear-gradient(135deg,#22c55e,#16a34a)"
            : "linear-gradient(135deg,#8b5cf6,#6d28d9)",
          color: "white",
          fontWeight: 900,
          cursor: "pointer",
          minWidth: 130,
        }}
        title={isActive ? "Premium activo" : "Hazte Premium"}
      >
        {isActive ? `Premium activo${expiresText}` : `👑 ${showLabel}`}
      </button>

      {/* Modal */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            display: "grid",
            placeItems: "center",
            background: "rgba(0,0,0,.55)",
            padding: 16,
          }}
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(920px, 96vw)",
              background:
                "linear-gradient(180deg, rgba(15,23,42,1) 0%, rgba(11,16,32,1) 100%)",
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: 18,
              padding: 18,
              color: "#e5e7eb",
              boxShadow: "0 20px 70px rgba(0,0,0,.45)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 900 }}>Planes Premium</div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "rgba(255,255,255,.06)",
                  border: "1px solid rgba(255,255,255,.12)",
                  color: "#e5e7eb",
                  borderRadius: 10,
                  padding: "8px 12px",
                  cursor: "pointer",
                }}
              >
                Cerrar ✕
              </button>
            </div>

            <div
              style={{
                marginBottom: 14,
                background: "rgba(124,58,237,.12)",
                border: "1px solid rgba(124,58,237,.35)",
                borderRadius: 12,
                padding: 12,
                fontSize: 14,
              }}
            >
              Desbloquea <b>Generador de Selección</b>, <b>Parlay inteligente</b> e
              <b> IA Boot</b>, además de <b>soporte prioritario</b> y mejoras
              de precisión (blend con cuotas). Cancela cuando quieras.
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 12,
              }}
            >
              <PlanCard
                label="Semanal"
                priceLabel={LABEL_WEEKLY}
                bullets={[
                  "Ideal para probar funciones Pro.",
                  "Incluye todos los módulos.",
                  "Renovable semanalmente.",
                ]}
                action={() => startCheckout("weekly")}
                busy={busy === "weekly"}
              />
              <PlanCard
                label="Mensual"
                priceLabel={LABEL_MONTHLY}
                bullets={[
                  "Uso continuo y soporte prioritario.",
                  "Mejor relación funciones/precio.",
                  "Renovable mensualmente.",
                ]}
                action={() => startCheckout("monthly")}
                busy={busy === "monthly"}
              />
              <PlanCard
                label="Anual"
                priceLabel={LABEL_YEARLY}
                bullets={[
                  "Mejor precio por mes.",
                  "Acceso estable para toda la temporada.",
                  "Incluye todo lo de Mensual.",
                ]}
                action={() => startCheckout("annual")}
                busy={busy === "annual"}
              />
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 14,
                fontSize: 12,
                opacity: 0.8,
              }}
            >
              <div>
                * Uso educativo/informativo. No constituye asesoría financiera
                ni garantiza resultados.
              </div>

              {isActive && (
                <button
                  onClick={openBillingPortal}
                  style={{
                    background: "rgba(255,255,255,.06)",
                    border: "1px solid rgba(255,255,255,.12)",
                    color: "#e5e7eb",
                    borderRadius: 10,
                    padding: "8px 12px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                  disabled={busy === "portal"}
                  title="Gestiona tu suscripción"
                >
                  {busy === "portal" ? "Abriendo…" : "Gestionar suscripción"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PlanCard({
  label,
  priceLabel,
  bullets,
  action,
  busy,
}: {
  label: string;
  priceLabel: string;
  bullets: string[];
  action: () => void;
  busy?: boolean;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,.12)",
        background: "rgba(255,255,255,.04)",
        borderRadius: 16,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minHeight: 210,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 900 }}>{label}</div>
      <div style={{ opacity: 0.9 }}>{priceLabel}</div>
      <ul style={{ margin: 0, paddingInlineStart: 18, lineHeight: 1.5 }}>
        {bullets.map((b, i) => (
          <li key={i} style={{ opacity: 0.9 }}>
            {b}
          </li>
        ))}
      </ul>
      <button
        onClick={action}
        disabled={busy}
        style={{
          marginTop: "auto",
          padding: "12px 14px",
          borderRadius: 12,
          border: "none",
          fontWeight: 900,
          cursor: busy ? "not-allowed" : "pointer",
          background: "linear-gradient(135deg,#8b5cf6,#6d28d9)",
          color: "white",
        }}
        title="Ir a Stripe"
      >
        {busy ? "Abriendo…" : "Empezar"}
      </button>
    </div>
  );
}
