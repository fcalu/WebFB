// src/components/StakeModal.tsx
import { useEffect, useMemo, useState } from "react";
import {
  addBet,
  ev,
  impliedFromOdd,
  kelly,
  loadBank,
  RiskLevel,
  riskLabelFromProbEV,
  saveBank,
  uid,
} from "../lib/stake";

const wrap: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.55)",
  display: "grid",
  placeItems: "center",
  zIndex: 1000,
};
const card: React.CSSProperties = {
  width: "min(92vw, 520px)",
  background: "#0b1020",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 16,
  padding: 16,
  color: "#e5e7eb",
};

const input: React.CSSProperties = {
  width: "100%",
  background: "#0f172a",
  color: "white",
  border: "1px solid rgba(255,255,255,.18)",
  borderRadius: 12,
  padding: "12px 14px",
  outline: "none",
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
  whiteSpace: "nowrap",
};

function pct(n?: number) {
  return n == null ? "—" : `${(n * 100).toFixed(2)}%`;
}

export default function StakeModal({
  open,
  onClose,
  matchLabel,
  market,
  selection,
  defaultProb01,
  defaultOdd,
}: {
  open: boolean;
  onClose: () => void;
  matchLabel: string;
  market: string;
  selection: string;
  defaultProb01: number; // 0..1
  defaultOdd?: number;
}) {
  const [bank, setBank] = useState(() => loadBank());
  const [odd, setOdd] = useState<number | undefined>(defaultOdd);
  const [prob01, setProb01] = useState(defaultProb01);
  const [kellyFrac, setKellyFrac] = useState(0.5); // 50% por defecto
  const [note, setNote] = useState("");

  useEffect(() => setOdd(defaultOdd), [defaultOdd]);
  useEffect(() => setProb01(defaultProb01), [defaultProb01]);

  const k = useMemo(() => kelly(prob01, odd ?? 0), [prob01, odd]);
  const stake = useMemo(() => bank * k * kellyFrac, [bank, k, kellyFrac]);
  const expectedValue = useMemo(() => ev(prob01, odd ?? 0), [prob01, odd]);
  const impl = useMemo(() => impliedFromOdd(odd), [odd]);
  const edge = useMemo(
    () => (impl !== undefined ? prob01 - impl : undefined),
    [prob01, impl]
  );
  const risk: RiskLevel = riskLabelFromProbEV(prob01, expectedValue);

  function save() {
    if (!odd || odd <= 1 || stake <= 0) return;
    addBet({
      id: uid(),
      created_at: new Date().toISOString(),
      match: matchLabel,
      market,
      selection,
      prob01,
      odd,
      stake,
      kellyUsed: kellyFrac,
      note: note || undefined,
      status: "pending",
    });
    saveBank(bank);
    onClose();
  }

  if (!open) return null;

  return (
    <div style={wrap} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>💰 Calculadora de Stake</div>
          <button onClick={onClose} style={{ ...pill, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ marginTop: 10, opacity: 0.9 }}>{matchLabel}</div>
        <div style={{ marginTop: 2, fontSize: 13, opacity: 0.8 }}>
          {market} — {selection}
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Banca (u)</div>
            <input
              type="number"
              step="0.01"
              value={bank}
              onChange={(e) => setBank(Math.max(0, Number(e.target.value)))}
              style={input}
            />
          </div>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Cuota</div>
              <input
                type="number"
                step="0.01"
                value={odd ?? ""}
                onChange={(e) => setOdd(Number(e.target.value))}
                style={input}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
                Probabilidad (0–100%)
              </div>
              <input
                type="number"
                step="0.01"
                value={(prob01 * 100).toFixed(2)}
                onChange={(e) =>
                  setProb01(Math.max(0, Math.min(1, Number(e.target.value) / 100)))
                }
                style={input}
              />
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
              Fracción de Kelly
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[1, 0.5, 0.25, 0.1].map((f) => (
                <button
                  key={f}
                  onClick={() => setKellyFrac(f)}
                  style={{
                    ...pill,
                    cursor: "pointer",
                    borderColor: kellyFrac === f ? "#7c3aed" : "rgba(255,255,255,.1)",
                    background:
                      kellyFrac === f
                        ? "linear-gradient(135deg,#7c3aed55,#5b21b655)"
                        : "rgba(255,255,255,.06)",
                    fontWeight: 800,
                  }}
                >
                  {Math.round(f * 100)}%
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Nota (opcional)</div>
            <input
              type="text"
              placeholder="Motivo, book, límite, etc."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={input}
            />
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
          }}
        >
          <div style={pill}>Stake sugerido: <b>{stake.toFixed(2)} u</b></div>
          <div style={pill}>EV: <b>{(expectedValue ?? 0).toFixed(2)}</b></div>
          <div style={pill}>Edge: <b>
            {edge !== undefined ? `${(edge * 100).toFixed(2)}%` : "—"}
          </b></div>
          <div style={pill}>Riesgo: <b>{risk}</b></div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={pill}>Cancelar</button>
          <button
            onClick={save}
            style={{
              ...pill,
              borderColor: "#22c55e",
              background: "linear-gradient(135deg,#22c55e55,#16a34a55)",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Guardar apuesta
          </button>
        </div>
      </div>
    </div>
  );
}
