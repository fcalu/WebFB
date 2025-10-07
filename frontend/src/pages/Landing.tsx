import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const bg: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(1200px 600px at 20% -10%, #3b0764 0%, transparent 60%), radial-gradient(900px 500px at 120% -20%, #1d4ed8 0%, transparent 55%), #0b1020",
  color: "#e5e7eb",
  fontFamily:
    "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,Helvetica,Arial",
  display: "grid",
  placeItems: "center",
  padding: "24px",
};

const card: React.CSSProperties = {
  width: "min(980px, 96vw)",
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 18,
  padding: "22px",
  boxShadow: "0 10px 30px rgba(0,0,0,.25)",
};

const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.12)",
  color: "#d1d5db",
  fontSize: 12,
  whiteSpace: "nowrap",
};

const btn: React.CSSProperties = {
  background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
  color: "white",
  border: "none",
  borderRadius: 14,
  padding: "14px 18px",
  fontWeight: 900,
  fontSize: 16,
  cursor: "pointer",
};

export default function Landing() {
  const navigate = useNavigate();
  const [neverShow, setNeverShow] = useState(false);

  // si el usuario ya lo vio, saltamos directo
  useEffect(() => {
    if (localStorage.getItem("fm_intro_seen") === "1") {
      navigate("/app", { replace: true });
    }
  }, [navigate]);

  // cuenta regresiva y redirección
  const redirectMs = 6000; // 6s (ajusta si quieres)
  const [msLeft, setMsLeft] = useState(redirectMs);

  useEffect(() => {
    const end = Date.now() + redirectMs;
    const tick = setInterval(() => {
      const left = Math.max(0, end - Date.now());
      setMsLeft(left);
    }, 100);
    const to = setTimeout(() => {
      if (neverShow) localStorage.setItem("fm_intro_seen", "1");
      navigate("/app", { replace: true });
    }, redirectMs);
    return () => {
      clearInterval(tick);
      clearTimeout(to);
    };
  }, [navigate, redirectMs, neverShow]);

  const seconds = useMemo(() => Math.ceil(msLeft / 1000), [msLeft]);

  return (
    <div style={bg}>
      <div style={card}>
        {/* Header compacto */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <div
            style={{
              width: 52, height: 52, borderRadius: 16, display: "grid",
              placeItems: "center", background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
              boxShadow: "0 10px 22px rgba(124,58,237,.35)", fontSize: 26, fontWeight: 900,
            }}
            aria-hidden
          >
            ⚽
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1 }}>
              FootyMines · IA Predictor
            </div>
            <div style={{ opacity: 0.8, fontSize: 13 }}>
              Predicciones claras con Poisson + calibración + mercado
            </div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <span style={pill}>🔒 En producción</span>
          </div>
        </div>

        {/* Hero */}
        <div style={{ display: "grid", gap: 10 }}>
          <h1 style={{ fontSize: 28, margin: 0, fontWeight: 900 }}>
            Convierte datos en decisiones. Predicciones explicables, listas para apostar.
          </h1>
          <p style={{ opacity: 0.9, marginTop: 4 }}>
            Nuestro modelo combina matrices de Poisson, un ajuste estilo Dixon–Coles y un blend
            con probabilidades implícitas del mercado para ofrecer picks realistas y justificados.
          </p>
        </div>

        {/* Beneficios premium */}
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          }}
        >
          <Feature title="🎯 Generador de selección (Builder)">
            Construye combinadas seguras (1X2, Over/Under, BTTS, córners, tarjetas) con probabilidad combinada.
          </Feature>
          <Feature title="🧮 Parley inteligente">
            Calcula prob. total, cuota justa y EV estimado usando tus cuotas reales.
          </Feature>
          <Feature title="🤖 IA Boot (opcional)">
            Resumen y picks en lenguaje natural; si la IA falla, mostramos el mejor pick del modelo base.
          </Feature>
          <Feature title="📒 Historial & 📣 Alertas">
            Guarda tus picks y recibe alertas cuando hay “value” con tus cuotas.
          </Feature>
          <Feature title="🚀 Sin límites ni anuncios">
            Acceso completo, sin fricciones ni ruido.
          </Feature>
          <Feature title="🛡️ Seguridad">
            Checkout con Stripe. Clave premium local y validación en backend.
          </Feature>
        </div>

        {/* CTA */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
          <button
            style={btn}
            onClick={() => {
              if (neverShow) localStorage.setItem("fm_intro_seen", "1");
              navigate("/app");
            }}
            aria-label="Entrar ahora"
          >
            Entrar ahora
          </button>
          <button
            style={{ ...btn, background: "linear-gradient(135deg, #22c55e, #16a34a)" }}
            onClick={() => {
              if (neverShow) localStorage.setItem("fm_intro_seen", "1");
              navigate("/app?open=premium"); // ← abrirá tu PremiumDrawer
            }}
            aria-label="Ver Premium"
          >
            Ver Premium
          </button>
          <span style={{ ...pill, fontWeight: 800 }}>Redirigiendo en {seconds}s…</span>
        </div>

        {/* Preferencia */}
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 13, opacity: 0.9 }}>
            <input
              type="checkbox"
              checked={neverShow}
              onChange={(e) => setNeverShow(e.target.checked)}
            />{" "}
            No volver a mostrar esta pantalla
          </label>
        </div>
      </div>
    </div>
  );
}

function Feature({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,.12)",
        background: "rgba(255,255,255,.04)",
        padding: 14,
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 6 }}>{title}</div>
      <div style={{ opacity: 0.9, fontSize: 14 }}>{children}</div>
    </div>
  );
}
