import { useEffect, useMemo, useState } from "react";

export type PlanKey = "weekly" | "monthly" | "annual";
const PLAN_LABELS: Record<PlanKey, string> = {
  weekly: "Semanal",
  monthly: "Mensual",
  annual: "Anual",
};

export type SubscriptionState = {
  active: boolean;
  status?: string;
  current_period_end?: number | null; // epoch seconds
  premium_key?: string;
  email?: string | null;
  plan?: PlanKey | null;
  price_id?: string | null;
  interval?: string | null; // "week" | "month" | "year" | ...
};

type Props = {
  apiBase: string;
  premiumKey: string;
  onRedeemDone?: (state: SubscriptionState) => void;
};

function fmtExpiry(ts?: number | null) {
  if (!ts) return "";
  try {
    return new Date(ts * 1000).toLocaleDateString();
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

function planFromInterval(interval?: string | null): PlanKey | null {
  if (!interval) return null;
  if (interval === "week") return "weekly";
  if (interval === "month") return "monthly";
  if (interval === "year") return "annual";
  return null;
}

// si tu backend devuelve price_id podemos mapearlo aquí
const PRICE_TO_PLAN: Record<string, PlanKey> = {
  // "price_123weekly": "weekly",
  // "price_456monthly": "monthly",
  // "price_789annual": "annual",
};

function planFromPriceId(price_id?: string | null): PlanKey | null {
  if (!price_id) return null;
  return PRICE_TO_PLAN[price_id] ?? null;
}

export default function PremiumButton({ apiBase, premiumKey, onRedeemDone }: Props) {
  const [sub, setSub] = useState<SubscriptionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  const isActive = useMemo(
    () => Boolean(sub?.active) || Boolean(premiumKey?.trim()),
    [sub?.active, premiumKey]
  );

  // ————————————————————————————————————————————————
  // 1) Canjear al volver de Stripe (?success=true&session_id=...)
  // ————————————————————————————————————————————————
  useEffect(() => {
    const url = new URL(window.location.href);
    const success = url.searchParams.get("success");
    const sessionId = url.searchParams.get("session_id");
    const canceled = url.searchParams.get("canceled");

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
          active?: boolean;
          interval?: string | null;     // si tu backend lo expone
          price_id?: string | null;     // si tu backend lo expone
          plan?: PlanKey | null;        // si tu backend lo expone
        };

        const j = await fetchJSON<RedeemResp>(
          `${apiBase}/stripe/redeem?session_id=${encodeURIComponent(sessionId)}`
        );

        // Recuperar intención del plan por si el backend no devuelve plan/interval
        const lastIntent = (localStorage.getItem("fm_last_plan_intent") || "") as PlanKey | "";

        const inferredPlan: PlanKey | null =
          j?.plan ??
          planFromInterval(j?.interval) ??
          planFromPriceId(j?.price_id ?? null) ??
          (lastIntent ? lastIntent : null);

        const next: SubscriptionState = {
          active: j?.active ?? (j?.status === "active" || j?.status === "trialing"),
          status: j?.status,
          current_period_end: j?.current_period_end ?? null,
          premium_key: j?.premium_key,
          email: j?.email ?? null,
          plan: inferredPlan ?? null,
          price_id: j?.price_id ?? null,
          interval: j?.interval ?? null,
        };

        if (next.premium_key) {
          localStorage.setItem("fm_premium_key", next.premium_key);
        }
        localStorage.removeItem("fm_last_plan_intent");

        setSub(next);
        onRedeemDone?.(next);

        alert("¡Premium activado!");
      } catch (e: any) {
        console.error(e);
        const msg =
          e?.message?.includes("Failed to fetch")
            ? "No pude conectar con el backend para canjear la sesión (revisa API_BASE y CORS)."
            : e?.message || "No se pudo canjear la sesión de Stripe.";
        setErr(msg);
      } finally {
        setLoading(false);
        // limpia los query params
        window.history.replaceState(null, "", window.location.pathname);
      }
    })();
  }, [apiBase, onRedeemDone]);

  // ————————————————————————————————————————————————
  // 2) Iniciar Checkout
  // ————————————————————————————————————————————————
  async function startCheckout(plan: PlanKey = "monthly") {
    try {
      setLoading(true);
      setErr("");

      // guarda intención para mostrar el plan correcto al volver
      localStorage.setItem("fm_last_plan_intent", plan);

      const payload = { plan, method: "card", user_email: "" };
      const r = await fetch(`${apiBase}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j.detail || "No se pudo crear la sesión de pago.");
      if (!j?.url) throw new Error("Respuesta inesperada: falta { url }");

      window.location.assign(j.url);
    } catch (e: any) {
      const msg =
        e?.message?.includes("Failed to fetch")
          ? "No pude conectar con el backend (revisa VITE_API_BASE_URL y CORS)."
          : e?.message || "Error iniciando checkout.";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  // ————————————————————————————————————————————————
  // 3) Portal de facturación (Gestionar)
  // ————————————————————————————————————————————————
  async function openPortal() {
    try {
      setLoading(true);
      setErr("");
      const key = sub?.premium_key || premiumKey;
      if (!key) throw new Error("No hay premium_key. Activa Premium primero.");

      const r = await fetch(`${apiBase}/create-billing-portal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // algunos backends esperan header:
          "X-Premium-Key": key,
        },
        // otros esperan en el body:
        body: JSON.stringify({ premium_key: key }),
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j.detail || "No se pudo abrir el portal de facturación.");
      if (!j?.url) throw new Error("Respuesta inesperada: falta { url }");

      window.location.assign(j.url);
    } catch (e: any) {
      const msg =
        e?.message?.includes("Failed to fetch")
          ? "No pude conectar con el backend (URL/CORS del endpoint /create-billing-portal)."
          : e?.message || "Error abriendo el portal.";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  const planLabel = sub?.plan ? PLAN_LABELS[sub.plan] : undefined;

  return (
    <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
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
              padding: "10px 16px",
              borderRadius: 16,
              background: "linear-gradient(135deg,#14532d,#052e16)",
              border: "1px solid rgba(34,197,94,.35)",
              color: "#bbf7d0",
              fontWeight: 900,
              whiteSpace: "nowrap",
            }}
            title={
              sub?.current_period_end
                ? `Vence: ${fmtExpiry(sub.current_period_end)}`
                : undefined
            }
          >
            ✅ Premium activo
            {planLabel ? ` — ${planLabel}` : ""}
            {sub?.current_period_end ? ` (vence ${fmtExpiry(sub.current_period_end)})` : ""}
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
