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

/** ————— Estilos ————— */
const wrap: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.55)",
  display: "grid",
  placeItems: "center",
  zIndex: 1000,
};
const card: React.CSSProperties = {
  width: "min(92vw, 560px)",
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
const pillBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.10)",
};

/** ————— Utils ————— */
function pct01(n?: number) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

/** ————— Modal ————— */
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
  // Estado
  const [bank, setBank] = useState(() => loadBank());
  const [odd, setOdd] = useState<number | undefined>(defaultOdd);
  const [prob01, setProb01] = useState(defaultProb01);
  const [kellyFrac, setKellyFrac] = useState(0.5); // 50% por defecto
  const [note, setNote] = useState("");

  // Sincroniza props -> estado cuando cambian
  useEffect(() => setOdd(defaultOdd), [defaultOdd]);
  useEffect(() => setProb01(defaultProb01), [defaultProb01]);

  // Cálculos principales
  const kFull = useMemo(() => kelly(prob01, odd ?? 0), [prob01, odd]); // Kelly completo (0..1, puede ser 0)
  const kApplied = useMemo(() => Math.max(0, kFull * kellyFrac), [kFull, kellyFrac]);

  const stake = useMemo(() => Math.max(0, bank * kApplied), [bank, kApplied]);

  // EV por unidad (si apuesto 1u)
  const evPerUnit = useMemo(() => ev(prob01, odd ?? 0) ?? 0, [prob01, odd]);

  // EV total con el stake calculado
  const evTotal = useMemo(() => stake * evPerUnit, [stake, evPerUnit]);

  // Probabilidad implícita por la cuota y edge
  const implied = useMemo(() => impliedFromOdd(odd), [odd]);
  const edge = useMemo(
    () => (implied !== undefined ? prob01 - implied : undefined),
    [prob01, implied]
  );

  // Etiqueta de riesgo (explicativa)
  const risk: RiskLevel = riskLabelFromProbEV(prob01, evPerUnit);

  // Guardar apuesta
  const canSave = !!odd && odd > 1 && stake > 0;

  function save() {
    if (!canSave) return;
    addBet({
      id: uid(),
      created_at: new Date().toISOString(),
      match: matchLabel,
      market,
      selection,
      prob01,
      odd: odd!, // validado en canSave
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
    <div style={wrap} onClick={onClose} aria-modal="true" role="dialog" aria-label="Calculadora de stake">
      <div style={card} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>💰 Calculadora de Stake</div>
          <button onClick={onClose} style={{ ...pill, cursor: "pointer" }} aria-label="Cerrar">✕</button>
        </div>

        {/* Contexto del pick */}
        <div style={{ marginTop: 10, opacity: 0.9 }}>{matchLabel}</div>
        <div style={{ marginTop: 2, fontSize: 13, opacity: 0.8 }}>
          {market} — {selection}
        </div>

        {/* Inputs */}
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Banca (u)</div>
            <input
              type="number"
              step="0.01"
              value={bank}
              onChange={(e) => setBank(Math.max(0, Number(e.target.value)))}
              style={input}
              aria-label="Banca"
            />
          </div>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Cuota</div>
              <input
                type="number"
                step="0.01"
                value={odd ?? ""}
                onChange={(e) => setOdd(e.target.value === "" ? undefined : Number(e.target.value))}
                style={input}
                aria-label="Cuota"
              />
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
                Probabilidad (0–100%)
              </div>
              <input
                type="number"
                step="0.01"
                value={Number.isFinite(prob01) ? (prob01 * 100).toFixed(2) : ""}
                onChange={(e) =>
                  setProb01(Math.max(0, Math.min(1, Number(e.target.value) / 100)))
                }
                style={input}
                aria-label="Probabilidad en porcentaje"
              />
            </div>
          </div>

          {/* Kelly */}
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
                  aria-pressed={kellyFrac === f}
                  aria-label={`Usar ${Math.round(f * 100)}% de Kelly`}
                >
                  {Math.round(f * 100)}%
                </button>
              ))}
            </div>
          </div>

          {/* Nota */}
          <div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Nota (opcional)</div>
            <input
              type="text"
              placeholder="Motivo, book, límite, etc."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={input}
              aria-label="Nota"
            />
          </div>
        </div>

        {/* Métricas en vivo */}
        <div
          style={{
            marginTop: 12,
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
          }}
        >
          <div style={pillBox}>
            Stake sugerido: <b style={{ marginLeft: 6 }}>{stake.toFixed(2)} u</b>
          </div>
          <div style={pillBox}>
            EV por unidad: <b style={{ marginLeft: 6 }}>{evPerUnit.toFixed(2)} u</b>
          </div>
          <div style={pillBox}>
            EV con tu stake: <b style={{ marginLeft: 6 }}>{evTotal.toFixed(2)} u</b>
          </div>
          <div style={pillBox}>
            Prob. implícita (cuota): <b style={{ marginLeft: 6 }}>{pct01(implied)}</b>
          </div>
          <div style={pillBox}>
            Edge (ventaja):{" "}
            <b style={{ marginLeft: 6 }}>
              {edge !== undefined ? `${(edge * 100).toFixed(2)}%` : "—"}
            </b>
          </div>
          <div style={pillBox}>
            Riesgo: <b style={{ marginLeft: 6 }}>{risk}</b>
          </div>
        </div>

        {/* Ayuda corta */}
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8, lineHeight: 1.4 }}>
          * <b>Stake</b> se calcula con Kelly (según la fracción seleccionada).{" "}
          <b>EV por unidad</b> es la ganancia esperada si apuestas 1u.{" "}
          <b>EV con tu stake</b> es la ganancia esperada con el stake sugerido.{" "}
          <b>Edge</b> es la diferencia entre tu probabilidad y la probabilidad implícita de la cuota.
          El indicador de <b>Riesgo</b> es orientativo.
        </div>

        {/* Acciones */}
        <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={pill}>Cancelar</button>
          <button
            onClick={save}
            disabled={!canSave}
            style={{
              ...pill,
              borderColor: canSave ? "#22c55e" : "rgba(255,255,255,.1)",
              background: canSave
                ? "linear-gradient(135deg,#22c55e55,#16a34a55)"
                : "rgba(255,255,255,.06)",
              fontWeight: 900,
              cursor: canSave ? "pointer" : "not-allowed",
              opacity: canSave ? 1 : 0.6,
            }}
            title={!canSave ? "Ingresa una cuota válida (>1) y verifica el stake sugerido" : "Guardar apuesta"}
          >
            Guardar apuesta
          </button>
        </div>
      </div>
    </div>
  );
}
