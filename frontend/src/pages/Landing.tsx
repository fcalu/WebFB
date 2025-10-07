import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => navigate("/app"), 4500);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      background:
        "radial-gradient(1200px 600px at 20% -10%, #3b0764 0%, transparent 60%), radial-gradient(900px 500px at 120% -20%, #1d4ed8 0%, transparent 55%), #0b1020",
      color: "#e5e7eb",
      padding: 24
    }}>
      <div style={{
        maxWidth: 960,
        width: "100%",
        background: "rgba(255,255,255,.05)",
        border: "1px solid rgba(255,255,255,.10)",
        borderRadius: 16,
        padding: 24
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            display: "grid", placeItems: "center",
            background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
            boxShadow: "0 10px 22px rgba(124,58,237,.35)",
            fontSize: 28, fontWeight: 900
          }}>⚽</div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1 }}>
              FootyMines · IA Predictor
            </div>
            <div style={{ opacity: 0.85 }}>
              Predicciones calibradas (Poisson + mercado) y módulos premium
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18, lineHeight: 1.6, fontSize: 15 }}>
          <p>
            Nuestra plataforma combina modelos de goles (Poisson) con ajustes ligeros (Dixon–Coles),
            calibración y blend con cuotas de mercado para ofrecer picks claros en 1X2, Over/Under
            y BTTS. Además, módulos premium como Generador de Selección, Parley y IA Boot.
          </p>
          <ul style={{ marginTop: 12 }}>
            <li>• Predicciones rápidas y explicables.</li>
            <li>• Generador de selección con probabilidad combinada.</li>
            <li>• Parley con EV y cuota justa.</li>
            <li>• IA Boot con análisis natural en JSON estructurado.</li>
            <li>• Historial de picks y stake (Kelly) opcional.</li>
          </ul>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button
            onClick={() => navigate("/app")}
            style={{
              background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
              color: "white",
              border: "none",
              borderRadius: 14,
              padding: "12px 16px",
              fontWeight: 900,
              fontSize: 16,
              cursor: "pointer"
            }}
          >
            Entrar ahora
          </button>
          <a
            href="#premium"
            onClick={(e) => { e.preventDefault(); navigate("/app"); }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,.12)",
              color: "#d1d5db",
              background: "rgba(255,255,255,.06)",
              textDecoration: "none"
            }}
            title="Hazte Premium dentro de la app"
          >
            👑 Ver Premium
          </a>
        </div>

        <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
          Serás redirigido automáticamente en 4–5 segundos…
        </div>
      </div>
    </div>
  );
}
