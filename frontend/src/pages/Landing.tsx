// frontend/src/pages/Landing.tsx
import { useNavigate } from "react-router-dom";

const page: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(1200px 600px at 20% -10%, #3b0764 0%, transparent 60%), radial-gradient(900px 500px at 120% -20%, #1d4ed8 0%, transparent 55%), #0b1020",
  color: "#e5e7eb",
  fontFamily:
    "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,Helvetica,Arial,Apple Color Emoji,Segoe UI Emoji",
};

const wrap: React.CSSProperties = {
  maxWidth: 980,
  margin: "0 auto",
  padding: "32px 16px 48px",
};

const hero: React.CSSProperties = {
  display: "grid",
  gap: 14,
  textAlign: "center",
  marginTop: 40,
};

const h1: React.CSSProperties = {
  fontSize: 34,
  fontWeight: 900,
  lineHeight: 1.15,
};

const sub: React.CSSProperties = {
  opacity: 0.9,
  fontSize: 16,
  maxWidth: 760,
  margin: "0 auto",
};

const grid: React.CSSProperties = {
  marginTop: 26,
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 16,
  padding: 16,
};

const ctaWrap: React.CSSProperties = {
  marginTop: 24,
  display: "flex",
  gap: 12,
  justifyContent: "center",
  flexWrap: "wrap",
};

const btnPrimary: React.CSSProperties = {
  background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
  color: "white",
  border: "none",
  borderRadius: 14,
  padding: "14px 18px",
  fontWeight: 900,
  fontSize: 16,
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  background: "rgba(255,255,255,.06)",
  color: "#e5e7eb",
  border: "1px solid rgba(255,255,255,.18)",
  borderRadius: 14,
  padding: "14px 18px",
  fontWeight: 800,
  fontSize: 16,
  cursor: "pointer",
};

export default function Landing() {
  const nav = useNavigate();

  return (
    <div style={page}>
      <div style={wrap}>
        <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              display: "grid",
              placeItems: "center",
              background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
              boxShadow: "0 10px 22px rgba(124,58,237,.35)",
              fontSize: 24,
              fontWeight: 900,
            }}
            aria-hidden
          >
            ⚽
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
              FootyMines · IA Predictor
            </div>
            <div style={{ opacity: 0.8, fontSize: 13 }}>
              Predicción clara para usuarios finales
            </div>
          </div>
        </header>

        <section style={hero}>
          <h1 style={h1}>Predicciones de fútbol con modelo híbrido + IA</h1>
          <p style={sub}>
            Usamos Poisson calibrado, mezcla con mercado y módulos premium
            (Generador de Selección, Parlay, IA Boot) para darte picks
            accionables y un flujo de pago seguro con Stripe.
          </p>

          <div style={grid}>
            <div style={card}>
              <b>Modelo base</b>
              <div style={{ opacity: 0.9, marginTop: 6 }}>
                Probabilidades 1X2, Over 2.5 y BTTS con ajustes suaves Dixon-Coles
                y calibración opcional.
              </div>
            </div>
            <div style={card}>
              <b>Generador de selección</b>
              <div style={{ opacity: 0.9, marginTop: 6 }}>
                Combina mercados con umbrales y penalización por correlación para
                propuestas sólidas.
              </div>
            </div>
            <div style={card}>
              <b>Parlay inteligente</b>
              <div style={{ opacity: 0.9, marginTop: 6 }}>
                EV y cuota justa con independencia aproximada y ajustes por
                correlación.
              </div>
            </div>
            <div style={card}>
              <b>IA Boot</b>
              <div style={{ opacity: 0.9, marginTop: 6 }}>
                Resumenes y picks estructurados; si la IA falla, caemos al mejor
                pick del modelo base.
              </div>
            </div>
          </div>

          <div style={ctaWrap}>
            <button style={btnPrimary} onClick={() => nav("/app")}>
              Entrar
            </button>
            <button
              style={btnGhost}
              onClick={() => nav("/app?show=premium")}
              title="Ver planes Premium"
            >
              Ver planes Premium
            </button>
          </div>

          <p style={{ opacity: 0.7, fontSize: 12, marginTop: 12 }}>
            * Uso educativo/informativo. No constituye asesoría financiera ni
            garantiza resultados.
          </p>
        </section>
      </div>
    </div>
  );
}
