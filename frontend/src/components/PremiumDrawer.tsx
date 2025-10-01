import React from "react";

type Props = { open: boolean; onClose: () => void };

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,.5)",
  display: "grid", placeItems: "center", zIndex: 60
};
const card: React.CSSProperties = {
  width: "min(680px, 92vw)", background: "rgba(17,24,39,.95)",
  border: "1px solid rgba(255,255,255,.15)", borderRadius: 16, padding: 20,
  color: "#e5e7eb", boxShadow: "0 30px 80px rgba(0,0,0,.45)"
};
const pill: React.CSSProperties = {
  display:"inline-flex", alignItems:"center", gap:8, padding:"8px 12px",
  borderRadius:999, background:"rgba(255,255,255,.06)",
  border:"1px solid rgba(255,255,255,.12)", color:"#d1d5db", fontSize:12
};

export default function PremiumDrawer({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h2 style={{fontSize:22, fontWeight:900}}>👑 Premium</h2>
          <button onClick={onClose} style={pill}>Cerrar ✕</button>
        </div>

        <p style={{opacity:.9, marginTop:8}}>
          Desbloquea pronósticos avanzados y herramientas pro:
        </p>
        <ul style={{marginTop:12, lineHeight:1.7}}>
          <li>• Generador de parley con EV y cuota total</li>
          <li>• “Selección” combinada: 1X, córners, tarjetas, BTTS, Over</li>
          <li>• Stake recomendado (Kelly) y control de banca</li>
          <li>• Historial con ROI, hit-rate y registro de tickets</li>
          <li>• Sin anuncios + soporte prioritario</li>
        </ul>

        <div style={{display:"flex", gap:10, marginTop:16, flexWrap:"wrap"}}>
          <span style={pill}>⚡ 3 días gratis</span>
          <span style={pill}>🔒 Cancela cuando quieras</span>
        </div>

        <div style={{display:"flex", gap:10, marginTop:18}}>
          <button
            style={{
              background:"linear-gradient(135deg,#7c3aed,#5b21b6)",
              color:"#fff", border:"none", borderRadius:12, padding:"12px 18px",
              fontWeight:900, cursor:"pointer"
            }}
            onClick={()=> alert("Aquí integras tu checkout (Stripe, Lemon, Paddle).")}
          >
            Empezar prueba
          </button>
          <button onClick={onClose} style={pill}>Ahora no</button>
        </div>
      </div>
    </div>
  );
}
