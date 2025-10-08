import { useEffect, useMemo, useState } from "react";

// ── Tipos ──────────────────────────────────────────────────────────────────────
export type SubscriptionState = {
  active: boolean;
  status?: string;
  current_period_end?: number | null; // epoch seconds
  premium_key?: string;
  email?: string | null;
};

type Props = {
  apiBase: string;
  premiumKey: string; // lo que tengas guardado en localStorage (si existe)
  onRedeemDone?: (state: SubscriptionState) => void; // callback opcional al canjear
};

// ── Utils ─────────────────────────────────────────────────────────────────────
function fmtExpiry(ts?: number | null) {
  if (!ts) return "";
  try {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString();
  } catch {
    return "";
  }
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const text = await r.text();
  if (!r.ok) throw new Error(text || `HTTP ${r.status}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function PremiumButton({ apiBase, premiumKey, onRedeemDone }: Props) {
  const [sub, setSub] = useState<SubscriptionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  // Considera activo si ya tenemos estado activo o (como fallback) hay premiumKey
  const isActive = useMemo(
    () => Boolean(sub?.active) || Boolean(premiumKey?.trim()),
    [sub?.active, premiumKey]
  );

  // ── 1) Manejar retorno de Stripe (?success=true&session_id=...) ─────────────
  useEffect(() => {
    const url = new URL(window.location.href);
    const success = url.searchParams.get("success");
    const sessionId = url.searchParams.get("session_id");
    const canceled = url.searchParams.get("canceled");

    // si no venimos del checkout, no hacemos nada
    if (!(success === "true" && sessionId)) return;

    (async () => {
      try {
        setLoading(true);
        setErr("");

        type RedeemResp = {
          premium_key?: string;
          status?: string;
          current_period_end?: number;
          email?: string | null;
          active?: boolean; // por compatibilidad si algún día lo devuelves así
        };

        const j = await fetchJSON<RedeemResp>(
          `${apiBase}/stripe/redeem?session_id=${encodeURIComponent(sessionId)}`
        );

        // ⬇⬇⬇ AQUÍ VA EXACTAMENTE EL BLOQUE QUE ME PREGUNTASTE ⬇⬇⬇
        const next: SubscriptionState = {
          active: j?.active ?? (j?.status === "active" || j?.status === "trialing"),
          status: j?.status,
          current_period_end: j?.current_period_end ?? null,
          premium_key: j?.premium_key,
          email: j?.email ?? null,
        };

        if (next.premium_key) {
          // guarda la clave para el resto de la app
          localStorage.setItem("fm_premium_key", next.premium_key);
        }

        setSub(next);

        // notifica al padre (App) si pasó onRedeemDone
        onRedeemDone?.(next);
        // ⬆⬆⬆ FIN DEL BLOQUE ⬆⬆⬆

        alert("¡Premium activado!");
      } catch (e: any) {
        console.error(e);
        setErr(e?.message || "No se pudo canjear la sesión de Stripe.");
      } finally {
        setLoading(false);
        // Limpia los query params (?success=...&session_id=...)
        window.history.replaceState(null, "", window.location.pathname);
      }
    })();
  }, [apiBase, onRedeemDone]);

  // ── 2) Iniciar Checkout (Stripe) ────────────────────────────────────────────
  async function startCheckout(plan: "weekly" | "monthly" | "annual" = "monthly") {
    try {
      setLoading(true);
      setErr("");

      // Usamos tu endpoint unificado /billing/checkout
      // method 'card' → suscripción
      const payload = { plan, method: "card", user_email: "" };
      const r = await fetch(`${apiBase}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j.detail || "No se pudo crear la sesión de pago.");
      if (!j?.url) throw new Error("Respuesta inesperada: falta { url }");

      window.location.assign(j.url); // redirige al Checkout de Stripe
    } catch (e: any) {
      setErr(e?.message || "Error iniciando checkout.");
    } finally {
      setLoading(false);
    }
  }

  // ── 3) Portal de facturación (Stripe) ───────────────────────────────────────
  async function openPortal() {
    try {
      setLoading(true);
      setErr("");
      const key = sub?.premium_key || premiumKey;
      if (!key) throw new Error("No hay premium_key. Inicia sesión de pago primero.");

      const r = await fetch(`${apiBase}/create-billing-portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ premium_key: key }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail || "No se pudo abrir el portal de facturación.");
      if (!j?.url) throw new Error("Respuesta inesperada: falta { url }");

      window.location.assign(j.url);
    } catch (e: any) {
      setErr(e?.message || "Error abriendo el portal.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "inline-flex", gap: 8 }}>
      {/* Estado / Error */}
      {err && (
        <div
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid rgba(239,68,68,.35)",
            background: "rgba(239,68,68,.12)",
            color: "#fecaca",
            fontSize: 12,
          }}
        >
          {err}
        </div>
      )}

      {/* Botones */}
      {!isActive ? (
        <>
          <button
            onClick={() => startCheckout("monthly")}
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,.12)",
              color: "#fff",
              background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
              fontWeight: 900,
              cursor: loading ? "not-allowed" : "pointer",
            }}
            title="Activar Premium Mensual"
          >
            {loading ? "Procesando…" : "👑 Premium mensual"}
          </button>

          <button
            onClick={() => startCheckout("annual")}
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,.12)",
              color: "#d1d5db",
              background: "rgba(255,255,255,.06)",
              fontWeight: 800,
              cursor: loading ? "not-allowed" : "pointer",
            }}
            title="Activar Premium Anual"
          >
            {loading ? "Procesando…" : "Anual (-20%)"}
          </button>
        </>
      ) : (
        <>
          <span
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid rgba(34,197,94,.35)",
              background: "rgba(34,197,94,.12)",
              color: "#bbf7d0",
              fontSize: 12,
              whiteSpace: "nowrap",
              fontWeight: 800,
            }}
            title={sub?.current_period_end ? `Vence: ${fmtExpiry(sub.current_period_end)}` : undefined}
          >
            ✅ Premium activo{sub?.current_period_end ? ` — vence ${fmtExpiry(sub.current_period_end)}` : ""}
          </span>

          <button
            onClick={openPortal}
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,.12)",
              color: "#d1d5db",
              background: "rgba(255,255,255,.06)",
              fontWeight: 800,
              cursor: loading ? "not-allowed" : "pointer",
            }}
            title="Administrar método de pago / cancelar"
          >
            Gestionar
          </button>
        </>
      )}
    </div>
  );
}
