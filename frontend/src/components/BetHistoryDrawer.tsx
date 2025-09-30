// src/components/BetHistoryDrawer.tsx
import { useEffect, useState } from "react";
import { loadBets, SavedBet } from "../lib/stake";

const drawer: React.CSSProperties = {
  position: "fixed",
  right: 0,
  top: 0,
  bottom: 0,
  width: "min(92vw, 420px)",
  background: "#0b1020",
  borderLeft: "1px solid rgba(255,255,255,.12)",
  color: "#e5e7eb",
  zIndex: 999,
  transform: "translateX(0)",
  padding: 14,
  overflow: "auto",
};

const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.10)",
  color: "#d1d5db",
  fontSize: 12,
};

export default function BetHistoryDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [bets, setBets] = useState<SavedBet[]>([]);

  useEffect(() => {
    if (open) setBets(loadBets());
  }, [open]);

  if (!open) return null;

  return (
    <div style={drawer}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>📒 Historial</div>
        <button onClick={onClose} style={{ ...pill, cursor: "pointer" }}>✕</button>
      </div>

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        {bets.length === 0 && (
          <div style={{ opacity: 0.8, fontSize: 14 }}>Aún no guardas apuestas.</div>
        )}
        {bets.map((b) => (
          <div
            key={b.id}
            style={{
              background: "rgba(255,255,255,.04)",
              border: "1px solid rgba(255,255,255,.08)",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <div style={{ fontWeight: 800 }}>{b.match}</div>
            <div style={{ marginTop: 2, fontSize: 13, opacity: 0.9 }}>
              {b.market} — {b.selection}
            </div>
            <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={pill}>Prob: <b>{(b.prob01 * 100).toFixed(2)}%</b></span>
              <span style={pill}>Cuota: <b>{b.odd}</b></span>
              <span style={pill}>Stake: <b>{b.stake.toFixed(2)} u</b></span>
              <span style={pill}>Kelly: <b>{(b.kellyUsed * 100).toFixed(0)}%</b></span>
            </div>
            {b.note && <div style={{ marginTop: 6, opacity: 0.85 }}>{b.note}</div>}
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
              {new Date(b.created_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
