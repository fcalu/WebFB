// src/components/TicketCard.tsx
import React from "react";

export default function TicketCard({
  title,
  subtitle,
  probPct,
}: {
  title: string;     // p.ej. "Doble oportunidad"
  subtitle: string;  // p.ej. "1X (Local o Empate)"
  probPct: number;   // p.ej. 62.34
}) {
  return (
    <div style={{
      display: "flex",
      gap: 12,
      alignItems: "center",
      background: "#0f172a",
      border: "1px solid rgba(255,255,255,.12)",
      borderRadius: 12,
      padding: "12px 14px",
      position: "relative",
    }}>
      {/* franja izquierda tipo bookie */}
      <div style={{
        width: 6,
        alignSelf: "stretch",
        borderRadius: 6,
        background: "linear-gradient(180deg,#10b981,#059669)",
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 900 }}>{title}</div>
        <div style={{ opacity: .9 }}>{subtitle}</div>
      </div>
      <div style={{
        fontWeight: 900,
        background: "rgba(16,185,129,.12)",
        border: "1px solid rgba(16,185,129,.35)",
        padding: "6px 10px",
        borderRadius: 999,
        whiteSpace: "nowrap"
      }}>
        Prob: {probPct.toFixed(2)}%
      </div>
    </div>
  );
}
